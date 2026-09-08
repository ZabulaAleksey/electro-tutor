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

## ET-09.4 partial schema contract

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

Оставшиеся additive tables planned:

- `capability_grants`: immutable subject/capability/account-scope, issue/revoke
  actor/time/operation metadata и partial unique active grant; baseline code
  `TUTOR_PROFILE_MANAGE_OWN`;
- `student_profiles` и `tutor_profiles`: `account_id` одновременно PK/FK на
  `accounts.id`, private normalized `display_name`, UTC timestamps;
  один account может иметь обе независимые records.

Connection-scoped audit repository не коммитит самостоятельно; one-shot
`PostgresUnitOfWork` владеет одной connection/transaction, коммитит один раз при
success и откатывает при exception/audit constraint failure. Grant/profile
repositories подключатся к этой же transaction в `ET-09.4b/c`. Grant read row
lock, profile delete/deactivate/cascade, tenant/member tables и public projection
не входят в реализованный slice.

`backend:db:migrate` выполняет additive upgrade, `backend:db:status` проверяет
head и autogenerate drift. `backend:db:reset-local` — destructive local-only
operation с exact confirmation; production-like target этим stage не поддержан.
