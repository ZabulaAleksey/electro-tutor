# Dependency contract

Root Node ecosystem остаётся под `pnpm@11.23.0` и `pnpm-lock.yaml`. Backend
имеет отдельный Python ecosystem в `services/api/pyproject.toml` с единственным
`services/api/uv.lock`; npm/Yarn/Bun lockfiles не допускаются.

ET-09.2 runtime: Python 3.12.5 image, FastAPI, Pydantic Settings, async
SQLAlchemy/asyncpg, Alembic, Uvicorn и PostgreSQL 17.6. Tooling: uv 0.12.3,
Ruff, mypy, pytest и pip-audit. `backend:bootstrap` и CI используют frozen lock;
`backend:check` отклоняет lock drift и известные уязвимости runtime export.

Node security baseline фиксирует Astro `^7.3.2` (исправление AVIF RCE) и
временные exact transitive overrides `fast-uri@3.1.8`, `js-yaml@4.3.2`,
`svgo@4.1.0`, пока их direct parents не поднимут безопасные диапазоны.
`pnpm audit --audit-level high` обязан завершаться с exit `0`; overrides следует
удалять только после lockfile-проверки, что безопасные версии приходят нативно.

RC1 scoped security overrides: brace-expansion@1 ->1.1.21,
brace-expansion@>=4 ->5.0.12, devalue ->5.9.3 (current advisory patched ranges).
Source of truth: package.json, pnpm-workspace.yaml, pnpm-lock.yaml; shared
pnpm content-addressable store, project-local node_modules. Clean/CI restore:
`pnpm install --frozen-lockfile`. Rebuildable node_modules/dist are not tracked;
unknown/runtime/user data are preserved. Backend source/lock: pyproject.toml +
uv.lock; `uv sync --project services/api --frozen --all-groups`.

RC1 final graph additionally patches Vitest4.1.11/mocker and PyJWT2.15.1 (minimum2.14). Frozen restores PASS; final pnpm audit0 and locked applicable-runtime pip-audit0. No package-manager/framework migration; audits do not certify host OS or future deployed infrastructure.
