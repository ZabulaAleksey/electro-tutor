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

`backend:db:migrate` выполняет additive upgrade, `backend:db:status` проверяет
head и autogenerate drift. `backend:db:reset-local` — destructive local-only
operation с exact confirmation; production-like target этим stage не поддержан.
