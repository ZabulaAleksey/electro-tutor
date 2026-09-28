# Data model и migrations

PostgreSQL 17 — единственный persistence runtime ET-09.2. Alembic — единственный
schema owner; `create_all`, SQLite и mock DB не считаются primary evidence.

Initial reversible revision `20260831_0001` создаёт только Alembic lineage;
hardening revision `20260831_0002` закрепляет least-privilege grants. Additive
revision `20260908_0003` добавляет Tutor-local identity/session boundary:

- `external_identities`: opaque UUID и unique `(issuer, subject)`; email —
  nullable изменяемый атрибут, не identity key;
- `auth_transactions`: одноразовые state digest, PKCE verifier, nonce,
  exact return URL и короткий expiry;
- `application_sessions`: только SHA-256 digest opaque cookie token, identity FK
  и expiry; raw provider/access/ID/refresh tokens не сохраняются.

Hardening revision `20260908_0004` отзывает table-wide `UPDATE` у runtime role:
изменяемыми остаются только attribute-колонки `email` и `updated_at`, тогда как
канонические `issuer`/`subject` нельзя переписать через runtime credential.

`electro_tutor_migrator` применяет DDL в
one-shot container, а долгоживущий API получает только runtime credential.
`electro_tutor_runtime` имеет только точные CRUD grants для auth lifecycle и
`SELECT` Alembic revision, но не может менять revision или schema. Отдельная
`electro_tutor_test` предназначена для разрешённого migration lifecycle и
никогда не подменяет основную local database.

## ET-09.4 verified schema contract

Revision `20260908_0005` реализует первый additive slice:

- `audit_events`: PostgreSQL-generated UUID `event_id`, fixed `schema_version=1`,
  server UTC `occurred_at`, typed actor/subject/action/result, nullable request
  ID, required UUID correlation/operation IDs и bounded allowlisted JSONB
  metadata;
- `operation_id` unique; correlation, occurrence и subject/time indexes поддерживают
  deterministic lookup без public read API;
- actor/subject IDs — bounded soft references без FK на `external_identities`,
  чтобы durable evidence переживало lifecycle subject и не закрепляло
  provider-login identity как future multi-login account aggregate;
- actor создаётся только из current `Principal` либо exact trusted-service
  allowlist; PostgreSQL checks повторно ограничивают actor/service identifiers,
  metadata key count, scalar shape, action-specific keys и typed values;
- runtime получает table `SELECT` и column-level `INSERT` только для server
  payload; `event_id`/`schema_version`/`occurred_at` spoof и
  `UPDATE`/`DELETE`/`TRUNCATE` запрещены PostgreSQL privileges.

Revision `20260909_0006` реализует internal owner boundary:

- `accounts`: только server UUID `id` и UTC `created_at`; role, email, provider,
  capability и entitlement отсутствуют;
- `external_identities.account_id`: required indexed FK на `accounts.id` с
  `ON DELETE RESTRICT`; runtime не может изменять owner после INSERT;
- populated backfill создаёт один Account на existing external identity с тем же
  UUID, сохраняя session FK/identity provenance и historical audit attribution;
- new first-login вызывает узкую `SECURITY DEFINER` function: она генерирует оба
  UUID и создаёт Account + external identity одной transaction; runtime не имеет
  direct table INSERT, а `(issuer, subject)` conflict откатывает candidate
  Account и читает winner;
- public/email linking отсутствует; controlled migrator/test fixture может
  доказать несколько external identities на одном Account.

Revision `20260909_0007` реализует trusted authority baseline:

- `capability_grants`: immutable UUID, `subject_account_id`/account scope,
  exact `TUTOR_PROFILE_MANAGE_OWN`, server timestamps/actor, one-way revoke и
  partial unique active scope;
- оба account references имеют `ON DELETE RESTRICT`; capability/scope/subject
  нельзя менять, а completed revoke защищён DB trigger;
- `capability_grant_operations`: append-only global issue/revoke operation-ID
  namespace с normalized intent digest и deferrable grant reference для exact
  retry/concurrent reconciliation;
- `electro_tutor_provisioner` имеет только column-scoped issue/revoke/audit
  privileges; `electro_tutor_runtime` может только читать grants и вызывать
  narrow active-row lock function;
- issue/revoke и AuditEvent используют один connection-scoped repository set и
  одну transaction existing `PostgresUnitOfWork`.

Revision `20260912_0008` добавляет `student_profiles` и `tutor_profiles`:
`account_id` одновременно PK/FK на `accounts.id`, private normalized
`display_name`, UTC timestamps; один account может иметь обе независимые records.
Runtime не получает прямых table privileges и вызывает fixed-search-path
functions. Tutor functions повторно проверяют/блокируют active grant и первое
create пишут вместе с AuditEvent. Revision `20260912_0009` убирает
caller-selected owner: profile functions выводят `account_id` из active session,
а отдельная auth role изолирует session storage/issuance от profile runtime.

Connection-scoped audit repository не коммитит самостоятельно; one-shot
`PostgresUnitOfWork` владеет одной connection/transaction, коммитит один раз при
success и откатывает при exception/audit constraint failure. Grant/profile
grant и profile repositories подключены к этой же transaction. Active grant read lock
реализован narrow fixed-search-path function и остаётся удержан до завершения
UoW. Profile delete/deactivate/
cascade, tenant/member tables и public projection не входят в реализованный slice.

`backend:db:migrate` выполняет additive upgrade, `backend:db:status` проверяет
head и autogenerate drift. `backend:db:reset-local` — destructive local-only
operation с exact confirmation; production-like target этим stage не поддержан.

## ET-10.1 implemented additive schema

Revision `20260914_0010` adds:

- `tutor_offers`: UUID, session-derived tutor Account FK, DRAFT/ACTIVE/RETIRED,
  optimistic version, normalized title, UTC interval, IANA zone, notice,
  FREE/EXTERNAL integer-minor money contract and lifecycle timestamps;
- `bookings`: UUID, offer/tutor/student FKs, REQUESTED/ACCEPTED/DECLINED/CANCELLED,
  optimistic version, immutable versioned offer/time/money/policy snapshot and
  transition timestamps;
- `booking_operations`: append-only globally unique UUID idempotency namespace,
  actor/action/target/intent digest/result version, reconciled with global
  AuditEvent operation uniqueness;
- expanded exact capability and audit allowlists for
  `TUTOR_BOOKING_MANAGE_OWN`, TutorOffer and Booking actions.

All Account FKs use `ON DELETE RESTRICT`; snapshot fields are protected by DB
trigger. Partial uniqueness prevents more than one REQUESTED/ACCEPTED row per
offer. Accepted participant/time indexes support overlap recheck under
deterministic transaction advisory locks; adjacent `[start,end)` ranges remain
valid. Runtime has no direct table DML and executes only session-bound functions.

FREE requires zero/no currency. EXTERNAL uses positive minor units and v1
allowlist `UAH/EUR/USD` with exponent `2`. No Payment/provider/settlement row is
created. Operational rollback preserves rows; destructive downgrade remains
disposable local/test-only.

## ET-10.2 approved additive schema

Revision `20260914_0011` adds one `lesson_access_grants` row per accepted
Booking. The grant keeps a server UUID, unique restricted `booking_id`, exact
`BOOKING_FREE|BOOKING_EXTERNAL` source, `policy_version=1`, half-open
`[valid_from, valid_until)`, exact `LESSON_SHELL_V1` capability-set code,
issue timestamp/operation and an all-null-or-complete one-way revoke tuple.
Participants remain authoritative in the immutable Booking and are not copied
into the grant.

Policy v1 derives `valid_from = starts_at - 15 minutes` and
`valid_until = ends_at`. Effective `NOT_YET_VALID|ACTIVE|EXPIRED|REVOKED`
status is calculated from PostgreSQL time; mutable status is not stored.
Booking accept atomically issues the grant, and accepted-booking cancellation
atomically revokes it. Random server-generated UUIDv4 issue/revoke operation IDs
are stored on the grant and reused for the corresponding AuditEvents. They are
never accepted or derived from client Booking operation keys; exact replay
returns the persisted result. `revoke_reason` is the fixed server enum
`BOOKING_CANCELLED`.

Exact fixed-search-path functions provide session-bound authorization and
booking-integrated issue/revoke. Runtime receives no direct table DML; auth
runtime receives no Access privileges. Existing accepted FREE/EXTERNAL rows are
backfilled atomically with collision-safe random operation IDs and exact
`service/lesson-access-migration` / `migration_backfill` audit provenance in the
migration transaction. Operational rollback
retains rows; destructive downgrade remains disposable local/test-only.

## ET-10.3 additive LessonSession schema

Revision `20260915_0012` adds `lesson_sessions`: server-generated opaque UUID,
unique restricted Booking FK, persisted `READY|ACTIVE|ENDED|CANCELLED`, positive
version, DB-owned creation/transition timestamps and status/timestamp checks.
There is no copied Account participant or role, media room, event stream or
Topic FK; `current_topic_id: null` is an API placeholder only. One accepted
Booking can create one READY row, regardless of which participant joins first.

`lesson_session_operations` records canonical operation UUID, actor/action,
Booking/Session, intent digest, exact persisted result and independent
server-generated audit operation ID. Session create/start/end and redacted
AuditEvents commit atomically. Booking cancel before start closes any READY
Session in the same Booking/grant/audit transaction. Grant window and
application-session expiry use fresh PostgreSQL clock after authority locks;
`WINDOW_CLOSED` is derived rather than a persisted ENDED transition. Runtime,
auth and public roles have no direct Session/ledger table access; narrow
session-bound functions own authorization and mutation. Operational rollback
preserves these rows; downgrade is destructive and only for explicitly
consented disposable local/test PostgreSQL.

ADR-028 implements a tooling-only **desired head schema** declaration for all 15
product tables, independent of the inspected DB. It is not an ORM or a
runtime replacement for Alembic migrations. A versioned catalog manifest
from a separately freshly migrated disposable database pins PostgreSQL
functions, triggers, `CHECK` expressions, indexes including partial
predicates, and private-table ACL. `backend:check` rejects unexpected drift
without changing live data. Scratch Alembic/catalog parity and 9 rollback
negatives pass. UA-15 restored a fresh isolated clone and proved exact
canonical catalog/Alembic forward and preflight-identical reverse; the
original dev DB at head 0012 still has catalog divergence and 2 account
rows. External-caller compatibility and original-DB reconciliation remain open.

## ET-14.1 additive notification schema — partial source implementation

Revision `20260928_0013` declares `notification_outbox` and `notifications`
with restricted Booking/Account FKs, unique
`(event_type, booking_id, recipient_account_id)`, 30-day expiry check,
pending/owner/unread/expiry indexes and no direct runtime/auth/provisioner
table privileges. An `AFTER UPDATE OF status` trigger records the accepted
Booking event in the transition transaction without changing
`accept_booking` or its return signature. Narrow security-definer functions
process bounded batches, list/count/mark by active session Account and clean
expired rows. No pre-existing Booking is backfilled into the inbox.

This is source design, not a verified 0013 catalog. Offline Alembic forward/
reverse generated SQL only. The committed manifest still pins the genuine
0012 catalog, so startup catalog verification fails closed until an independent
fresh disposable DB snapshot is produced and the clean/upgrade paths pass.
The original data-bearing DB remains at its separately tracked compatibility
gate; this migration has not been applied there.
