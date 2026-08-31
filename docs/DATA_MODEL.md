# Data model и migrations

PostgreSQL 17 — единственный persistence runtime ET-09.2. Alembic — единственный
schema owner; `create_all`, SQLite и mock DB не считаются primary evidence.

Initial reversible revision `20260831_0001` создаёт только Alembic lineage;
hardening revision `20260831_0002` закрепляет least-privilege grants. Product
tables на этом этапе отсутствуют. `electro_tutor_migrator` применяет DDL в
one-shot container, а долгоживущий API получает только runtime credential.
`electro_tutor_runtime` имеет connect/usage и `SELECT` Alembic revision, но не
может менять revision или schema. Отдельная
`electro_tutor_test` предназначена для разрешённого migration lifecycle и
никогда не подменяет основную local database.

`backend:db:migrate` выполняет additive upgrade, `backend:db:status` проверяет
head и autogenerate drift. `backend:db:reset-local` — destructive local-only
operation с exact confirmation; production-like target этим stage не поддержан.
