# Спецификация LessonAccessGrant

Статус: approved implementation contract для `ET-10.2`; `ACCESS-001`
(`PLATFORM`) остаётся deferred до `ET-15.2`

Версия: 0.1

Связи: `PLAT-004`, `ACCESS-001..004`, `AUTHZ-001..003`, `ET-10.2`,
ADR-026.

## 1. Назначение и границы

`ET-10.2` преобразует server-authoritative accepted `FREE`/`EXTERNAL` Booking
в отдельный time-bounded `LessonAccessGrant`. Grant позволяет обоим участникам
Booking открыть защищённый lesson shell, не доверяя browser state, OIDC claim,
TutorProfile, payment provider либо opaque identifier как authority.

В scope входят:

- grant sources `BOOKING_FREE` и `BOOKING_EXTERNAL`;
- один grant на один accepted Booking;
- versioned validity/capability policy;
- atomic issue при accept и revoke при cancellation ранее accepted Booking;
- participant-only server authorization check;
- RU/UK protected shell без media room;
- exact third-account authorization negative.

Не входят: `PLATFORM`/`WAIVED`, Payment/webhook/settlement, LessonSession
lifecycle, media token/Jitsi authorization, invite sharing, public directory,
admin/operator revoke UI, chat/board/recording permissions и provider SDK.

## 2. Actors, ownership и trust boundary

- Все Access HTTP surfaces требуют active application session.
- `Principal.account_id` и Booking participants разрешаются server-side из
  session-bound PostgreSQL path. Client не передаёт Account ID или participant
  role.
- Tutor и student из accepted Booking являются единственными subjects текущего
  grant. TutorProfile/StudentProfile и account capability grants не выдают
  lesson access.
- Opaque `booking_id`/`grant_id`, URL fragment, browser storage, OIDC role,
  payment statement или Jitsi room code не являются authority.
- Foreign Account получает non-disclosing `404 booking_not_found` до проверки
  grant state.
- Public issue/revoke endpoint отсутствует. Issue/revoke являются следствиями
  уже авторизованной Booking transition внутри одного unit-of-work.

## 3. Grant model

### 3.1 Source и cardinality

Один `LessonAccessGrant` соответствует ровно одному Booking:

- `BOOKING_FREE` — accepted Booking snapshot с `payment_mode = FREE`;
- `BOOKING_EXTERNAL` — accepted Booking snapshot с
  `payment_mode = EXTERNAL`.

`booking_id` одновременно является source/scope и имеет `UNIQUE`. Participants,
price, title и timezone не копируются в grant: их authoritative immutable
значения остаются в Booking. `PLATFORM` value не принимается schema/domain
allowlist до отдельного paid-grant contract.

### 3.2 Persisted и derived state

Persisted fields:

- immutable UUID `id`;
- `booking_id` FK `ON DELETE RESTRICT`;
- `source`, `policy_version = 1`,
  `capability_set_code = LESSON_SHELL_V1`;
- `valid_from`, `valid_until` as UTC `timestamptz`;
- DB-controlled `issued_at`, unique `issue_operation_id`;
- nullable all-or-none revoke tuple: `revoked_at`, actor type/id,
  random server-generated `revoke_operation_id`, fixed
  `revoke_reason = BOOKING_CANCELLED`.

Mutable status column запрещён. Status вычисляется по DB
`CURRENT_TIMESTAMP` в таком порядке:

1. `REVOKED`, если revoke tuple присутствует;
2. `EXPIRED`, если `now >= valid_until`;
3. `NOT_YET_VALID`, если `now < valid_from`;
4. `ACTIVE`.

Grant lifecycle one-way: `issued → revoked`; expired state не создаёт write,
worker или cleanup job.

### 3.3 Versioned validity policy

Approved `booking_window_v1`:

```text
valid_from  = Booking.starts_at - 15 minutes
valid_until = Booking.ends_at
active      = [valid_from, valid_until)
```

Exact `valid_from` разрешён; exact `valid_until` уже expired. Значения выводятся
только из immutable Booking snapshot. Client clock, local-only datetime и
browser timezone не участвуют. Изменение окна требует новой policy version и не
переписывает существующие grants.

### 3.4 Capability

`LESSON_SHELL_V1` содержит только `LESSON_SHELL_ENTER`. Authorization response
также сообщает server-derived `participant_role = tutor | student`.

Эта capability не разрешает LessonSession create/start/end, media token, Jitsi
room, moderation, chat/board write, recording, billing или foreign Booking.
Future stages расширяют capability set новой version, а не меняют смысл v1.

## 4. Application и repository interfaces

Application boundary:

```python
LessonAccessGrantService.authorize(
    principal: Principal | None,
    credential: SessionCredential,
    booking_id: UUID,
) -> LessonAccessDecision
```

Connection-scoped Python repository boundary:

```python
authorize_for_current_session(booking_id) -> LessonAccessDecision
```

Issue/revoke не являются Python repository methods. Это DB-private helpers,
которые вызываются исключительно из `accept_booking`/`cancel_booking`
transition function после существующих Booking authorization/locks и внутри той
же transaction/UoW. Runtime role не имеет `EXECUTE` на helpers и не может
вызвать issue/revoke отдельно от Booking transition; публичный HTTP/API contract
для них отсутствует. Такая граница сохраняет atomicity и least privilege.

`LessonAccessDecision` возвращает только grant/booking UUID, derived status,
participant role, validity и exact capability set. Account/identity/provider,
price/title и audit fields отсутствуют.

Repositories подключаются к existing one-shot `PostgresUnitOfWork`; transport
не содержит business authorization. Account-scoped `CapabilityGrant` table и
evaluator остаются отдельными: это authority для tutor account operations, а не
lesson entitlement.

## 5. Atomic issue, revoke и idempotency

### 5.1 Accept → issue

В одной transaction сохраняется существующий lock order:

1. active `TUTOR_BOOKING_MANAGE_OWN` grant `FOR UPDATE`;
2. Booking row `FOR UPDATE`;
3. participant advisory locks в sorted Account UUID order;
4. version/status/time/overlap checks;
5. Booking transition to `ACCEPTED`;
6. grant issue from immutable snapshot;
7. `booking.accepted` и `lesson_access_grant.issued` AuditEvents;
8. commit.

Grant/audit failure откатывает Booking accept. При первом issue server создаёт
непредсказуемый UUIDv4 `issue_operation_id`, сохраняет его в grant и использует
как operation ID AuditEvent в той же transaction. ID не принимается от client и
не выводится из client-controlled Booking operation key. `booking_id UNIQUE`
даёт source idempotency. Existing `booking_operations` ledger остаётся outer
mutation/reconciliation owner; exact retry возвращает прежний persisted result
без второго grant/event и не генерирует новый Access operation ID. Случайная
коллизия unique audit namespace fail closed и повторяется только как вся Booking
mutation с новым server ID до каких-либо durable writes.

### 5.2 Cancel → revoke

Cancellation Booking, который до transition был `ACCEPTED`, в той же transaction
блокирует Booking, затем grant, переводит Booking в `CANCELLED`, записывает
complete revoke tuple и оба audit events. Cancellation `REQUESTED` и decline не
имеют grant side effect.

При первом revoke server создаёт непредсказуемый UUIDv4
`revoke_operation_id`, сохраняет его вместе с fixed
`revoke_reason = BOOKING_CANCELLED` и использует для AuditEvent в той же
transaction. Revoke immutable; exact Booking-operation replay возвращает
persisted result и не создаёт новый ID/event. Ни operation ID, ни revoke reason
не принимаются от client.

Отдельный `lesson_access_grant_operations` ledger в v1 не создаётся: прямой
grant command отсутствует, а issue/revoke уже принадлежат idempotent Booking
operations. Generic объединение existing booking/capability ledgers также не
входит в stage.

## 6. Concurrency и authorization check

Access check использует DB time и выполняется без cache/fallback:

1. resolve current Account из transaction-local session digest;
2. lock Booking `FOR SHARE`;
3. verify participant;
4. lock grant `FOR SHARE`;
5. verify source/policy/capability integrity и derive status.

Cancel/revoke использует тот же порядок `booking → grant` с `FOR UPDATE`.
Если revoke commits раньше check, check denies. Если check linearized раньше
revoke, он может вернуть allow; после revoke commit новый check всегда denies.

Missing/mismatching mandatory grant для eligible accepted Booking является
integrity/dependency failure, а не основанием восстановить authority из client
state.

## 7. HTTP contract

Единственный public application route ET-10.2:

```text
GET /api/v1/bookings/{booking_id}/lesson-access
```

`200` возвращается только active participant grant:

```json
{
  "grant_id": "00000000-0000-4000-8000-000000000000",
  "booking_id": "00000000-0000-4000-8000-000000000000",
  "status": "ACTIVE",
  "participant_role": "student",
  "valid_from": "2026-09-14T09:45:00Z",
  "valid_until": "2026-09-14T11:00:00Z",
  "capabilities": ["LESSON_SHELL_ENTER"]
}
```

Error precedence:

1. missing/invalid session → `401 authentication_required`;
2. malformed canonical UUID → `422 invalid_request`;
3. missing/foreign Booking → `404 booking_not_found`;
4. participant state → `403 lesson_access_not_yet_valid`,
   `lesson_access_expired`, `lesson_access_revoked` либо
   `lesson_access_unavailable`;
5. expected eligible grant missing/mismatching →
   `503 lesson_access_policy_unavailable`;
6. DB outage → existing redacted dependency `503`.

Response не содержит internal Account IDs. Все `/api/*` responses сохраняют
`Cache-Control: no-store`, stable error envelope и request ID. GET не добавляет
новый CORS header. Issue/revoke HTTP routes отсутствуют.

## 8. Audit и observability

Durable atomic actions:

- `lesson_access_grant.issued`;
- `lesson_access_grant.revoked`.

Subject type — `lesson_access_grant`; metadata exact и bounded: `source`,
`policy_version`, `capability_set_code`, fixed enum `issuance_reason` и optional
fixed enum `revoke_reason`. Live issue uses
`issuance_reason = booking_accept`; migration backfill uses
`issuance_reason = migration_backfill`, exact service actor type/id
`service/lesson-access-migration`, null request ID and a migration-run
correlation ID that contains no Booking or Account identifier. The migration
actor/action/metadata combination is explicitly allowlisted; runtime cannot
impersonate it. Title,
Account IDs, session/token/cookie, time zones, price и provider/payment payload
запрещены. Runtime audit failure откатывает sensitive mutation.

Read checks не создают durable AuditEvent. Structured technical/security
telemetry содержит request/correlation ID, duration, allow/deny/error, internal
reason, source и participant role только после ownership check. Foreign response
остаётся `booking_not_found`; internal reason может быть `not_participant`.
Raw session data и private payload не логируются.

## 9. Persistence и migration

Additive Alembic revision после `20260914_0010`:

- создаёт `lesson_access_grants` с exact checks/FK/immutability triggers;
- расширяет Audit subject/action/metadata allowlists;
- добавляет fixed-search-path, session-bound issue/revoke/check functions;
- выдаёт runtime только exact EXECUTE/required read boundary, без direct table
  DML; auth runtime и public не получают Access privileges;
- backfill-ит existing eligible `ACCEPTED` FREE/EXTERNAL bookings с independent
  random server-generated UUIDv4 issue operation IDs and redacted audit
  provenance: actor `service/lesson-access-migration`,
  `issuance_reason = migration_backfill`, null request ID and one bounded
  migration-run correlation ID. Past grants сразу derive `EXPIRED`; other
  Booking states не получают grant. Backfill must remain atomic and collision
  safe even when an attacker-controlled Booking idempotency UUID has already
  reserved a predictable value in the global audit namespace.

Required indexes: unique `booking_id`, unique issue operation, partial unique
revoke operation и active `valid_until` operational index. Existing Audit
operation/subject-time indexes переиспользуются.

Downgrade проверяется только на exact disposable local/test DB. Operational
rollback оставляет additive rows/schema и отключает new consumer surface;
production recovery — forward fix/backup restore, а не destructive downgrade.

## 10. Protected shell

Static route `/{lang}/lesson/#booking=<opaque UUID>` не содержит private data и
до render protected state читает fragment client-side и вызывает Access API.
Fragment не отправляется server/referrer и очищается из visible address после
bootstrap. Accepted booking card может дать ссылку на этот route. Query-string
Booking identifier не используется.
Same-document `#booking=` re-entry on an already mounted shell is a new join:
it hides the previous active region, clears the new fragment and makes a fresh
server Access check. Invalid/duplicate fragments hide active content without a
request; older responses cannot restore it.

RU/UK states: signed-out, loading, active, not-yet-valid, expired, revoked/
unavailable, foreign/not-found и dependency/network failure. Session-generation
guard игнорирует late private response после logout/401.

Existing `/classroom` и `Classroom.tsx` остаются public Jitsi MVP. Новый shell
не загружает Jitsi, не выдаёт media token/invite и не утверждает, что public room
стал защищённым.

## 11. Security requirements

| ID | Contract |
|---|---|
| `ACCESS-SEC-001` | AuthN не заменяет AuthZ: current Account повторно разрешается из active server session в PostgreSQL |
| `ACCESS-SEC-002` | Client/provider/profile/opaque ID никогда не создаёт source, participant, validity или capability |
| `ACCESS-SEC-003` | Foreign Booking masked as 404; participant denied states не раскрываются third account |
| `ACCESS-SEC-004` | DB/time/integrity ambiguity fail closed; cache, Stripe/IdP lookup и client fallback запрещены |
| `ACCESS-SEC-005` | Issue/revoke, Booking transition и redacted AuditEvent atomic; lock order предотвращает revoke/check race bypass |
| `ACCESS-SEC-006` | Grant response, logs и audit исключают Account IDs, secrets, session/provider/payment/private Booking payload |

## 12. Behavior requirements

### ACCESS-001 — Valid PLATFORM source

Deferred to `ET-15.2`. ET-10.2 schema/domain/API обязаны отклонять PLATFORM,
payment redirect, webhook-like payload и client paid claim как source.

### ACCESS-002 — Eligible FREE/EXTERNAL grant

Accepted FREE или EXTERNAL Booking атомарно создаёт ровно один grant с source,
`booking_window_v1` и `LESSON_SHELL_V1`. Other Booking states и invalid source
grant не создают. Exact retry/concurrent accept не дублирует row/audit.

### ACCESS-003 — Participant-only lesson shell

Внутри active window owning tutor и student получают server-derived role и
`LESSON_SHELL_ENTER`. Anonymous denied 401; unrelated third Account получает
masked 404; no Account ID или broader capability раскрывается.

### ACCESS-004 — Revocation и expiry

Cancellation ранее accepted Booking атомарно revokes grant. Revoked, not-yet-
valid и expired grants deny every new shell check. Exact end boundary expired;
concurrent check/revoke имеет linearized outcome и после revoke commit fail
closed.

## 13. Acceptance и test mapping

| AC | Requirements | PASS evidence |
|---|---|---|
| `ET10.2-AC-01` eligible source/issuance | `ACCESS-002`, `ACCESS-SEC-002/005` | domain table tests + real PostgreSQL FREE/EXTERNAL accept produce one exact grant/audit; REQUESTED/DECLINED/CANCELLED/forged PLATFORM produce none; attacker pre-reservation of a Booking operation UUID cannot collide with Access audit identity |
| `ET10.2-AC-02` validity/capability | `ACCESS-002..004` | unit + real DB exact `valid_from`, one tick before/at `valid_until`, immutable policy/capability checks without wall-clock sleep |
| `ET10.2-AC-03` ownership/errors | `ACCESS-003`, `ACCESS-SEC-001/003/004` | transport/live HTTP authentication→UUID→resource→state precedence; third Account masked 404; missing eligible grant returns redacted 503 |
| `ET10.2-AC-04` revoke/races | `ACCESS-004`, `ACCESS-SEC-005` | real DB accepted-cancel atomicity, audit rollback, duplicate retry, check-vs-revoke and cancellation concurrency |
| `ET10.2-AC-05` migration/ACL | `ACCESS-002..004`, `ACCESS-SEC-004..006` | disposable `0010→0011→0010→0011`, populated backfill with exact service actor/provenance and adversarial pre-reserved audit UUID, constraints/indexes/functions, runtime/auth/public privilege negatives |
| `ET10.2-AC-06` UI/E2E | `ACCESS-003..004`, `ACCESS-SEC-003/006` | RU/UK component states + live tutor/student accepted booking → both enter shell → exact third Keycloak identity denied → cancellation blocks new enter |
| `ET10.2-AC-07` regression/privacy | all | existing backend/root gates PASS; OpenAPI/CORS/no-store; secret/diff/audit review; public Jitsi path not represented as protected |

Mocks/support routes дают только lower-level evidence. Terminal stage evidence
требует real browser → Keycloak → API → PostgreSQL path без skipped Access phase.

## 14. Dependency DAG и ordered slices

```text
ET-10.1 verified
  → ET-10.2a SPEC/ADR/API/data/security/testing contract
    → ET-10.2b domain/UoW/migration/repository + real PostgreSQL evidence
      → ET-10.2c private HTTP check + live API evidence
        → ET-10.2d RU/UK shell + exact third-identity terminal E2E
```

ET-10.2 является самостоятельным runnable vertical slice: accepted Booking →
grant → protected static shell. LessonSession/media/payment future stages могут
расширить его, но не нужны для issuance, authorization или terminal evidence.

## 15. Rollback и deferred scope

Safe operational rollback разворачивает previous app/frontend, сохраняя
additive schema/grants и booking-integrated issue/revoke. Authority не
расширяется, потому что consumer route отсутствует. Полное удаление данных не
является runtime rollback.

Deferred: `ACCESS-001` paid source, direct trusted operator revoke, grant
sharing/invites, group membership, LessonSession capabilities, media tokens и
generic authorization/operation framework.
