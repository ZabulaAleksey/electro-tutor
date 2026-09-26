# Спецификация LessonSession lifecycle и reload

Статус: **утверждённый implementation contract** ET-10.3. Владелец продукта
явно подтвердил правила v1 в текущей задаче 2026-09-15. Local Session code,
real-PostgreSQL/HTTP and frontend non-secret evidence прошли; security
findings закрыты. Isolated disposable PostgreSQL Alembic/catalog gate и
обязательный live Keycloak→API→PostgreSQL Session E2E прошли; literal human
RU/UK screen-reader UX-проверка остаётся открытой. Original DB repair
отдельно требует external SQL caller compatibility decision.

Версия: 0.1

Связи: `PLAT-005`, `SESSION-001`, `ACCESS-004`, `ET-10.3`,
`lesson-access-grants.spec.md`, ADR-025/026/027.

## 1. Назначение и самостоятельный slice

LessonSession — server-authoritative, media-less состояние одного accepted
Booking. Участник с действующей application session и active
LessonAccessGrant открывает защищённый RU/UK shell; PostgreSQL создаёт одну
Session на Booking; tutor запускает и завершает её; reload в пределах
действующего grant восстанавливает ID, lifecycle, роль, capabilities и пустой
слот текущей темы. Jitsi, payment provider, browser tab и будущие media/AI
modules не создают Session truth.

Этот этап реализует только `SESSION-001` в части lifecycle/reload. Chat,
whiteboard, timeline, actual LessonTopic, native media, booking completion,
recording и replay остаются отдельными stages; `SESSION-002..004` не
объявляются выполненными.

## 2. Утверждённые правила v1

Владелец продукта утвердил:

1. Первый вход любого из двух участников создаёт `READY`; только tutor
   начинает урок, не ранее `Booking.starts_at`. Student-first join видит
   ожидание tutor, а не автоматически запущенную Session.
2. Отмена accepted Booking до `starts_at` атомарно закрывает уже созданную
   `READY` Session как `CANCELLED` вместе с revoke grant. Нельзя оставлять
   доступную либо только browser-closed Session.
3. После `Booking.ends_at` действующий grant истекает: новые reads/mutations
   закрыты, persisted `READY`/`ACTIVE` получают derived
   `WINDOW_CLOSED`, но не ложный persisted `ENDED`/AuditEvent. Просмотр
   terminal/history после expiry требует отдельного будущего contract.

Эти правила разрешают реализацию после переключения main task reasoning
на `medium` по инструкции владельца; approval не подтверждает runtime.

## 3. Actors, authority и роли

- Только текущий `Principal`, повторно разрешённый из active server session
  внутри PostgreSQL, может обращаться к private Session API.
- `Booking` остаётся владельцем immutable tutor/student Account IDs, времени
  и статуса; role определяется из Booking, не из URL, OIDC claim, profile,
  browser storage или client field. V1 не копирует участников в Session
  table; participant binding — проверяемая связь с Booking.
- Active `LESSON_SHELL_V1` grant является необходимым entitlement для каждого
  private Session read/mutation. Его единственная capability
  `LESSON_SHELL_ENTER` не становится разрешением start/end: отдельная
  server-owned Session policy v1 вычисляет `SESSION_VIEW` для обоих,
  `SESSION_CREATE` для обоих при отсутствии Session,
  `SESSION_START` только для tutor в `READY` и после scheduled start,
  `SESSION_END` только для tutor в `ACTIVE`. Клиент не задаёт capability.
- Foreign/nonexistent Booking или Session не раскрывается: masked 404 до
  participant-only grant/state details. Opaque UUID не является authority.
- Student не может start/end, tutor не может менять Booking participants,
  Session owner, role, status, timestamps или capabilities через DTO.

## 4. Lifecycle и clock

Persisted states: `READY | ACTIVE | ENDED | CANCELLED`. PostgreSQL clock
определяет grant window, start boundary и effective availability. `ENDED` и
`CANCELLED` terminal; обратных переходов и browser-local lifecycle нет.

| From → to | Вызов/actor | Preconditions и durable effect |
|---|---|---|
| absent → `READY` | create-or-return, tutor или student | accepted Booking, active grant; ровно одна Session на Booking, server ID/version=1 и creation audit |
| `READY` → `ACTIVE` | tutor start | active grant, `starts_at <= DB now < ends_at`, expected version; `started_at`, version+1, audit |
| `ACTIVE` → `ENDED` | tutor end | active grant и expected version; `ended_at`, version+1, audit |
| `READY` → `CANCELLED` | authorized Booking cancel before start | в той же transaction с Booking cancel/grant revoke; `cancelled_at`, version+1, audit |
| `READY`/`ACTIVE` → effective `WINDOW_CLOSED` | DB now >= `ends_at` | derived unavailability only, no write, no worker and no fabricated end audit |

Before `starts_at`, tutor может открыть `READY`, но start запрещён.
At exact `ends_at` grant уже expired. Если tutor не завершил `ACTIVE`
до этого instant, persisted status остаётся `ACTIVE`; API не изображает
`ENDED`. Дальнейшее завершение/исторический просмотр — future contract.
Отмена Booking после scheduled start запрещена существующим Booking v1, поэтому
`ACTIVE`→`CANCELLED` в этом stage не существует.

## 5. Persistence, concurrency и idempotency

Additive Alembic revision после `20260914_0011` создаёт
`lesson_sessions`: random server-generated opaque UUID `id`,
`booking_id UNIQUE` FK `ON DELETE RESTRICT`, persisted status, positive
version, DB-controlled `created_at` и nullable transition timestamps с
all-or-none/status checks. Participant IDs и role не копируются из Booking;
`current_topic_id` — transport `null` до будущего LessonTopic contract,
не фиктивный FK/row.

Существующий unit-of-work и fixed-search-path session-bound PostgreSQL
functions остаются trust boundary. Для всех Session и Booking cancellation
paths lock order: Booking → grant → Session. Create получает Booking lock
и проверяет active grant до единственного insert; concurrent tutor/student
join возвращает тот же row, а не второй audit. Start/end проверяют version
и server-derived actor под теми же locks. Границы `starts_at`/`ends_at` и
grant validity проверяются свежим PostgreSQL `clock_timestamp()` **после**
ожидания/получения Booking и grant locks. Текущий Access check использует
transaction-start `CURRENT_TIMESTAMP` после locks; до Session implementation
этот seam требуется исправить и покрыть real-DB lock-wait test через exact
`valid_until`, иначе stale allow нарушает half-open policy. Аналогично
`resolve_active_session_principal()` сейчас сравнивает expiry с
`CURRENT_TIMESTAMP`; после resource locks sensitive read/write/replay
повторно проверяет active application session по свежему DB clock. Initial
session lock сохраняется в transaction, поэтому recheck не вводит обратный
resource→session wait. Tests пересекают оба expiry boundaries под lock wait.

All create/start/end POSTs требуют JSON `Content-Type`, canonical UUID
`Idempotency-Key` и **новую request-side** exact allowed `Origin` check:
для local/CI DEV browser profile `Origin` обязателен и должен точно
совпадать с configured allowed web origins; absent/`null`/foreign denied
до write. Existing `CORSMiddleware` обслуживает preflight/response,
но сам по себе не блокирует simple credentialed POST execution.
Form/simple cross-origin POST без этих условий не создаёт Session.
Real HTTP negative tests проверяют absent/null/foreign Origin,
simple form/text request, missing/invalid key и denied preflight без
durable row/audit. Production ingress/origin contract остаётся отдельным
открытым deployment decision, а не подразумевается DEV allowlist.
Create принимает только пустой JSON object; start/end дополнительно
принимают `expected_version`. Узкий Session operation ledger возвращает
exact retry того же actor/command/resource/body как тот же persisted result;
key reuse с другим actor/command/payload и stale version дают conflict без
side effect. Client key проверяется в общей cross-domain namespace
Booking/capability/Session operation ledgers и AuditEvent **до** mutation
под race-safe key guard; cross-domain reuse даёт 409, не вторую operation.
Новый generic ledger/framework не вводится. Audit operation IDs — отдельные
непредсказуемые server-generated UUIDv4, сохранённые с результатом; они не
выводятся из client key. Create/cancel/start/end и redacted AuditEvent
коммитятся или откатываются как одна transaction. Runtime/auth/public roles
не получают direct `SELECT` или DML на Session и operation-ledger tables;
доступ только через exact session-bound `EXECUTE` functions. Private
cancellation helper не доступен runtime и вызывается только из authorized
Booking cancel path. Любой replay проходит текущую session→masked resource
participant→active grant→actor/key/intent проверку **до** чтения/возврата
persisted result; revoked/expired grant, foreign actor и stale application
session не получают private replay даже если key был ранее успешен.

## 6. Private API и reload

Утверждённые versioned routes:

```text
POST /api/v1/bookings/{booking_id}/lesson-session
GET  /api/v1/lesson-sessions/{session_id}
POST /api/v1/lesson-sessions/{session_id}/start
POST /api/v1/lesson-sessions/{session_id}/end
```

Create-or-return не принимает owner/role/status; `booking_id UNIQUE` плюс
operation ledger дают ровно одну Session и безопасный exact retry.
Start/end принимают только bounded `expected_version` body и canonical
`Idempotency-Key`. Response включает opaque Session/Booking IDs,
persisted/effective status, version, server-derived participant role и
operation capabilities, transition timestamps и `current_topic_id: null`.
Internal Account/identity IDs, grant operation IDs, private Booking title/
money и provider tokens отсутствуют. All private responses `no-store` и
existing stable error/request-ID envelope.

Error precedence: missing session 401; malformed canonical UUID/body 422;
missing/foreign resource masked 404; participant-only revoked/not-yet-valid/
expired/unavailable grant 403; missing/inconsistent mandatory grant or DB outage
redacted 503; illegal transition/version/key conflict 409. Authorization
проверяется заново на каждом GET/POST, даже после reload.

Static `/{lang}/lesson/` начинает с существующего `#booking=<UUID>`
join. После server create-or-return заменяет одноразовый Booking fragment
на `#session=<opaque UUID>`; этот fragment сохраняется для reload и не
попадает в HTTP request/referrer. При reload shell вызывает Session GET и
восстанавливает server truth, не `sessionStorage`/cache. Fragment/session ID
не является доступом. New fragment re-entry/logout/401 скрывает старый
private region, меняет generation и игнорирует late responses. DB/network
failure показывает локализованный unavailable/retry без browser-only Session.
Public Jitsi classroom остаётся отдельным MVP и не загружается этим shell.

## 7. Observability, rollback и deferred scope

Durable redacted audit: `lesson_session.created|started|ended|cancelled`;
session subject/server operation ID, allowlisted transition code/status,
без Account IDs в metadata, private title, cookie, token, payment/media
payload. Technical telemetry: request/correlation ID, transition latency,
recovery count, error/deny code и Session correlation ID без content.
Read/reload не создаёт durable AuditEvent.

DB/schema/time ambiguity, revoked grant и conflicting write fail closed;
никакого Jitsi, client clock, cache или mock как fallback. Retry mutation
только после reconciliation через idempotency key/GET, не слепым повтором.
Operational rollback удаляет Session consumer routes/UI, сохраняет additive
schema/history и revised Booking cancellation integrity. Destructive
downgrade допускается только на exact disposable local/test PostgreSQL
с отдельным consent и проверкой upgrade/downgrade/upgrade.

## 8. Acceptance и traceability

| AC | Требования | Terminal PASS evidence |
|---|---|---|
| `ET10.3-AC-01` lifecycle/clock | `SESSION-001` | unit state machine and real PostgreSQL create→start→end, start-before-boundary/end-at-expiry negatives without arbitrary sleep |
| `ET10.3-AC-02` ownership/reload | `SESSION-001`, `ACCESS-004` | real HTTP current session+Booking/grant role; tutor/student reload same ID/status/version/capabilities/topic null; exact third Account masked 404; foreign Origin/simple POST/missing key cannot create row |
| `ET10.3-AC-03` races/audit | `SESSION-001` | real DB concurrent join creates one row/audit; cross-domain key collision and start/end key/version conflicts; replay after revoke/expiry/foreign actor denied; cancel-before-start atomically cancels READY/grant/Booking and audit rollback; Access/Session lock wait crossing grant and application-session expiry fails closed using post-lock DB time |
| `ET10.3-AC-04` migration/ACL | `SESSION-001` | disposable PostgreSQL upgrade/downgrade/upgrade, FK/uniqueness/constraints, runtime/auth/public direct SELECT/DML on Session and ledger plus helper-EXECUTE negatives |
| `ET10.3-AC-05` RU/UK shell | `SESSION-001` | component loading/waiting/active/ended/denied/unavailable/re-entry/logout states and keyboard/screen-reader checks; live browser→Keycloak→API→PostgreSQL booking/grant→join→start→reload→end with no skipped Session phase |
| `ET10.3-AC-06` regression/privacy | `SESSION-001`, `ACCESS-004` | existing `pnpm test`, backend fast/integration, check/lint/build, root/static E2E and redacted diff; public classroom unchanged |

Live auth E2E использует ephemeral secret values только в локальном процессе:
значения нельзя запрашивать у пользователя, выводить, сохранять в файле или commit. Если
terminal browser phase не пройден, stage остаётся `implemented_unverified`,
не `completed`.
