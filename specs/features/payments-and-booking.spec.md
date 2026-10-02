# Спецификация TutorOffer, Booking и будущих платежей

Статус: `ET-10.1` approved implementation contract для `FREE`/`EXTERNAL`;
`PLATFORM` payments остаются blocked внешними legal/provider decisions

Версия: 0.2

Связи: `PLAT-004`, `BOOK-001..004`, `PAY-004`, `ET-10.1`, ADR-025.

## 1. Назначение и границы

`ET-10.1` даёт двум authenticated Accounts самостоятельный booking-flow без
платёжного или календарного provider: tutor публикует конкретное предложение
времени, student запрашивает его, tutor принимает, а обе стороны видят один
неизменяемый snapshot согласованных условий.

Поддерживаются только:

- `FREE`: `amount_minor = 0`, currency отсутствует;
- `EXTERNAL`: цена информационная, расчёт происходит вне Electro Tutor;
- internal authoritative TutorOffer/Booking state в PostgreSQL;
- RU/UK user flow и exact two-user live E2E.

Не входят: `PLATFORM`/`WAIVED`, Payment/ledger/provider transaction, hosted
checkout, webhook, refund, receipt, tax, payout, Cal.com sync, recurrence,
waitlist, reschedule-in-place, LessonAccessGrant и LessonSession. Для
`EXTERNAL` система не утверждает, что деньги уплачены, возвращены или
гарантированы платформой.

## 2. Actors и authorization

- Все surfaces требуют active application session.
- Любой authenticated Account может читать `ACTIVE` offer по opaque UUID и
  запросить его как student; StudentProfile не является authority prerequisite.
- Tutor-side operation требует active account-scoped capability
  `TUTOR_BOOKING_MANAGE_OWN`, issued/revoked только existing trusted provisioner.
- TutorProfile не является prerequisite или authority input; его наличие и
  поля никогда не выдают capability.
- Offer owner и booking participant IDs выводятся server-side из session/resource;
  client не передаёт account IDs.
- Self-booking запрещён.
- Booking читают только student и owning tutor; foreign Account получает
  non-disclosing `404 booking_not_found`.
- Draft/retired offer читает только owner; для остальных это
  `404 tutor_offer_not_found`.
- Responses не возвращают internal Account IDs и не создают public TutorProfile
  projection или tutor directory.

Capability не даёт profile, payment, lesson, grant, admin либо foreign-resource
authority. Она требуется для offer create/revise/publish/retire и Booking
accept/decline. Revoke блокирует эти новые tutor mutations, но participant read
и cancellation уже ACCEPTED commitment остаются доступны owning tutor по
ownership и не меняют durable rows молча.

## 3. TutorOffer contract

`TutorOffer` — один concrete bookable time interval, а не recurrence/calendar:

- server UUID `id` и session-derived `tutor_account_id`;
- `status`: `DRAFT | ACTIVE | RETIRED`;
- optimistic `version`, начиная с `1`;
- normalized `title`: 1..120 Unicode code points, NFC, collapsed whitespace,
  без control characters;
- `starts_at` и `ends_at`: UTC instants, half-open interval `[start, end)`;
- `time_zone`: validated IANA identifier, в котором tutor создал offer;
- `duration_minutes`: derived from interval, 15..480 и кратно 15;
- `minimum_notice_minutes`: 0..10080;
- `payment_mode`: `FREE | EXTERNAL`;
- `amount_minor`, nullable `currency`, nullable `currency_exponent`;
- UTC `created_at`, `updated_at`, nullable `published_at`, `retired_at`.

Money v1:

- `FREE`: amount `0`, currency/exponent `null`;
- `EXTERNAL`: amount `1..100000000`, currency allowlist
  `UAH | EUR | USD`, exponent `2`, заданный server-side;
- float/decimal и client-supplied exponent запрещены.

Lifecycle:

```text
create → DRAFT
DRAFT --publish--> ACTIVE
DRAFT/ACTIVE --revise--> same status, version + 1
DRAFT/ACTIVE --retire--> RETIRED (terminal)
```

Only `ACTIVE` accepts a new request. `offer_unavailable` применяется только к
видимому ACTIVE offer, чей interval/notice window уже не bookable. Draft/retired
для non-owner остаётся `404`. Reactivation/delete deferred: tutor creates new
offer. Revision/retirement never mutates existing Booking snapshots и retirement
не блокирует accept/decline уже существующего REQUESTED snapshot.

## 4. Booking и agreed snapshot

`Booking` содержит:

- server UUID `id`, `offer_id`;
- server-derived tutor/student Account FKs;
- `status`: `REQUESTED | ACCEPTED | DECLINED | CANCELLED`;
- optimistic mutable `version`;
- immutable snapshot version `1`:
  - offer version/title;
  - starts/ends UTC;
  - tutor and student IANA time zones;
  - duration/minimum notice;
  - payment mode, amount, currency/exponent;
  - `cancellation_policy_code = participant_before_start_v1`;
- UTC request/accept/decline/cancel timestamps и cancel actor role.

Offer create/revise supplies explicit-offset RFC3339 start and tutor IANA zone;
server validates their consistency and derives end from duration. Student request
получает `offer_id` только из route; body supplies only `observed_offer_version`
и student IANA timezone, header — canonical UUID `Idempotency-Key`. Server locks
offer, checks version/status/time
and copies all authoritative terms. Tutor/student IDs, start/end, price, currency exponent,
payment mode, status и snapshot fields из client payload запрещены.

Snapshot создаётся при `REQUESTED` и становится agreed terms при accept. Offer
change до request даёт `409 offer_changed`; после request изменение offer/profile
не меняет snapshot.

Lifecycle:

```text
REQUESTED --owning tutor accept--> ACCEPTED
REQUESTED --owning tutor decline--> DECLINED
REQUESTED --student cancel--> CANCELLED
ACCEPTED --either participant before starts_at cancel--> CANCELLED
```

`DECLINED`/`CANCELLED` terminal. At/after `starts_at` ET-10.1 не выводит
completed/no-show/refund state. Reschedule — cancel + new Booking. Cancellation
`EXTERNAL` не означает refund; settlement остаётся вне платформы.

Одновременно на offer допускается не более одного `REQUESTED` либо `ACCEPTED`
Booking. После decline/cancel новый request допустим, если offer active и notice
window ещё соблюдается.

## 5. Concurrency, idempotency и audit

Каждая mutation требует canonical UUID `Idempotency-Key`; update/transition
также принимает `expected_version`.

Отдельный append-only `booking_operations` ledger хранит globally unique
operation UUID, actor Account, typed action, target, normalized intent digest и
resulting target/version. Exact retry возвращает тот же result без второй
mutation/audit; любое cross-actor, cross-action либо cross-domain reuse UUID и
changed intent дают `409 idempotency_conflict`. Ledger проверяет global
AuditEvent operation namespace до mutation. Authority-specific
`capability_grant_operations` не переиспользуется.

DB ordering:

1. request locks offer before snapshot;
2. tutor mutation внутри того же UoW проверяет active
   `TUTOR_BOOKING_MANAGE_OWN` через existing grant `FOR UPDATE` path; затем
   transition locks Booking row;
3. accept и cancellation уже ACCEPTED booking берут transaction advisory locks
   для tutor и student в deterministic Account UUID order;
4. accept повторно проверяет status/version/server time и accepted half-open
   overlap для обоих participants;
5. concurrent overlapping accepts дают ровно один success; adjacent intervals
   разрешены;
6. revoke-vs-tutor-mutation сериализуется grant lock: либо revoke выигрывает и
   mutation denied, либо mutation+audit commits before revoke; request cancel и
   decline не резервируют время, но decline всё равно требует capability;
7. все writers используют narrow session-bound functions; runtime direct table
   DML запрещён.

Audit actions, atomic with mutation and operation ledger:

- `tutor_offer.created|revised|published|retired`;
- `booking.requested|accepted|declined|cancelled`.

Audit metadata bounded и не содержит title, display name, session data,
free-text reason или external settlement details. Audit failure rolls back whole
transaction и возвращает `503 audit_unavailable`.

### ET-NIGHT-BOOKING-RACE-01 — same-version accept/cancel evidence

This additive integration criterion verifies the existing optimistic-version/atomic
booking contract; it does not implement reminders, payments or a new transition policy.
Tutor accept and student cancel of the same future REQUESTED Booking, using different
operation IDs and the same observed `expected_version`, run through separate authenticated
PostgreSQL connections. Both must reach a real authoritative lock wait before release;
exercise both launch orders without assuming scheduler/row-lock FIFO priority.
Exactly one transition succeeds at version+1 and the other returns `version_conflict`.
The winner has exactly one operation result and booking audit; the loser has neither.
Final Booking state matches the winner, with one active grant/accepted outbox only for an
accept winner and neither for a cancel winner. Exact winner replay returns its historical
result without duplicate operation/audit/outbox/grant effects. A later cancellation after
re-reading the accepted version is a separate valid transition, not a second success of
the original same-version race. Current notification/reminder semantics stay unchanged.
The test runs only with exact existing disposable-role admission, on a newly owned named
clone-test container/volume with loopback non-55432 port; the preserved original database
and unknown legacy function callers are never accessed. Existing accepted tests, fixtures,
production source and migrations remain unchanged. This database consumer proof cannot
close ET-14.2 policy decisions or ET-10.3 human speech/focus acceptance.

## 6. Time и localization

- API принимает RFC3339 instant с numeric offset + IANA zone.
- Backend `zoneinfo` проверяет соответствие offset указанной zone этому instant;
  ambiguous/nonexistent local-only timestamps не принимаются.
- PostgreSQL хранит `timestamptz`; server/DB time решает future/notice/cancel
  boundaries; later timezone-rule changes не двигают absolute instant.
- UI форматирует snapshot через browser `Intl` в выбранной RU/UK locale и явно
  показывает zone; новая JS date library не требуется.
- Если системная zone database недоступна, time mutation fail closed; fallback
  на неподтверждённую zone/offset запрещён.

## 7. HTTP contract

- `POST /api/v1/tutor-offers`
- `GET /api/v1/tutor-offers/me`
- `GET /api/v1/tutor-offers/{offer_id}`
- `PUT /api/v1/tutor-offers/{offer_id}`
- `POST /api/v1/tutor-offers/{offer_id}/publish`
- `POST /api/v1/tutor-offers/{offer_id}/retire`
- `POST /api/v1/tutor-offers/{offer_id}/bookings`
- `GET /api/v1/bookings/me?role=student|tutor`
- `GET /api/v1/bookings/{booking_id}`
- `POST /api/v1/bookings/{booking_id}/accept`
- `POST /api/v1/bookings/{booking_id}/decline`
- `POST /api/v1/bookings/{booking_id}/cancel`

Mutation bodies forbid unknown fields. `expected_version` lives in request body;
`Idempotency-Key` is the only operation-ID transport. Error precedence:

1. `401 authentication_required`;
2. non-disclosing resource/participant `404`;
3. capability/action `403`;
4. body/time/currency `422 invalid_request`;
5. idempotency/version/transition/time/overlap `409`.

Stable conflict codes: `idempotency_conflict`, `offer_changed`,
`version_conflict`, `invalid_booking_transition`, `booking_time_elapsed`,
`booking_overlap`, `self_booking_forbidden`, `offer_unavailable`.

Transport authenticates and resolves visible resource before custom payload
parsing. Private responses remain `Cache-Control: no-store`.

## 8. Persistence и migration

Следующая additive Alembic revision после `20260912_0009` создаёт:

- expanded capability/audit allowlists without invalidating history;
- `tutor_offers`, `bookings`, `booking_operations`;
- FK `ON DELETE RESTRICT`, checks, unique/indexed lifecycle queries;
- immutable snapshot trigger;
- fixed-search-path, session-bound functions and exact EXECUTE grants;
- no direct runtime table DML.

Downgrade проверяется только на disposable local/test DB. Operational rollback
оставляет additive schema/data и отключает routes; production recovery —
forward-fix/backup restore. Перед destructive downgrade rows экспортируются или
доказывается disposable target.

## 9. Ordered implementation slices

1. `ET-10.1a`: SPEC/ADR/data/API/security/testing contract.
2. `ET-10.1b`: domain, capability/audit expansion, migration, repositories,
   application services and real PostgreSQL concurrency/ACL evidence.
3. `ET-10.1c`: FastAPI transport/error matrix and live API→PostgreSQL tests.
4. `ET-10.1d`: RU/UK account/booking UI and exact two-user browser acceptance.

Каждый slice оставляет whole stage non-terminal до `ET-10.1d`.

## 10. Acceptance criteria

- `BOOK-001`: tutor with exact capability creates/publishes valid FREE and
  EXTERNAL offers; anonymous/foreign/revoked capability paths fail closed.
- `BOOK-002`: authenticated distinct student requests active offer; client
  cannot choose owners, price, state, end or snapshot values.
- `BOOK-003`: owning tutor accepts/declines; participant cancellation follows
  `participant_before_start_v1`; foreign/self/late/invalid transitions denied.
- `BOOK-004`: both participants read identical immutable snapshot after later
  offer revision; concurrent overlap accepts yield one winner.
- `PAY-004`: RU/UK UI distinguishes FREE from EXTERNAL and never represents
  EXTERNAL as platform-paid/refunded/guaranteed.
- Exact operation retry creates one result and one audit transition; changed
  intent conflicts.
- Unit, transport, real PostgreSQL migration/concurrency/ACL, RU/UK component,
  live API and real two-user browser gates PASS.

## 11. Future PLATFORM prerequisites

Hosted checkout implementation remains blocked until owner confirms legal/tax
model, client countries/currencies, product type, refund/receipt rules, provider
and calendar choice. Payment state changes only from verified idempotent
server-side evidence. None of these decisions blocks the complete
FREE/EXTERNAL ET-10.1 slice.
