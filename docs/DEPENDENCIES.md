# Dependency contract

Root Node ecosystem остаётся под `pnpm@11.23.0` и `pnpm-lock.yaml`. Backend
имеет отдельный Python ecosystem в `services/api/pyproject.toml` с единственным
`services/api/uv.lock`; npm/Yarn/Bun lockfiles не допускаются.

ET-09.2 runtime: Python 3.12.5 image, FastAPI, Pydantic Settings, async
SQLAlchemy/asyncpg, Alembic, Uvicorn и PostgreSQL 17.6. Tooling: uv 0.12.3,
Ruff, mypy, pytest и pip-audit. `backend:bootstrap` и CI используют frozen lock;
`backend:check` отклоняет lock drift и известные уязвимости runtime export.

Node security baseline фиксирует Astro `^7.3.2` (исправление AVIF RCE) и
временные exact transitive overrides `fast-uri@3.1.6`, `js-yaml@4.3.2`,
`svgo@4.1.0`, пока их direct parents не поднимут безопасные диапазоны.
`pnpm audit --audit-level high` обязан завершаться с exit `0`; overrides следует
удалять только после lockfile-проверки, что безопасные версии приходят нативно.
