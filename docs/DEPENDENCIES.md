# Dependency contract

Root Node ecosystem остаётся под `pnpm@11.23.0` и `pnpm-lock.yaml`. Backend
имеет отдельный Python ecosystem в `services/api/pyproject.toml` с единственным
`services/api/uv.lock`; npm/Yarn/Bun lockfiles не допускаются.

ET-09.2 runtime: Python 3.12.5 image, FastAPI, Pydantic Settings, async
SQLAlchemy/asyncpg, Alembic, Uvicorn и PostgreSQL 17.6. Tooling: uv 0.12.3,
Ruff, mypy, pytest и pip-audit. `backend:bootstrap` и CI используют frozen lock;
`backend:check` отклоняет lock drift и известные уязвимости runtime export.
