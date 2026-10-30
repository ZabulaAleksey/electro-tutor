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

CI-01 / ET-CI-0012026-10-30: targeted `uv lock --project services/api --upgrade-package certifi==2026.10.23` обновил только certifi2026.7.22→2026.10.23 и его integrity metadata; остальные72package records идентичны. Manifest не расширен, ручного редактирования lockfile нет. Официальный [advisory](https://github.com/certifi/python-certifi/security/advisories/GHSA-6q48-6c7w-9gw2) описывает удаление emSign roots; [PyPI2026.10.23](https://pypi.org/project/certifi/2026.10.23/) подтверждает release/artifact hashes. Frozen restore/lock check и тот же no-dev runtime pip-audit PASS0findings. Audit остаётся обязательным без ignore/skip.

ET-CI-001 additional mandatory Node audit gate2026-10-30: source-map-js1.2.1→1.2.2, sharp0.35.4→0.35.5, Vite8.2.1→8.2.4, Zod4.4.3/4.6.4→4.6.6 scoped to4.x, Undici8.10.2→8.12.2. Existing pnpm overrides hold only same-major compatible patched versions; direct Vite remains exact. Sharp native optional artifacts change with its patch; no new library/stack. Official GHSA references: source-map-js GHSA-68fv-2mgg-jv7q, sharp GHSA-wq5f-xc86-pv6w, Vite GHSA-587h-7wmj-h5pm, Zod GHSA-mrhx-c7xc-m3w5, Undici GHSA-xjj6-f33q-929c/4w7w-5xrc-9h26/2m5v-pch6-74hx/qrxm-fqhp-jwvm. Frozen install PASS. `pnpm audit --audit-level high` exits0;4low/5moderate retained, no suppression or false audit-zero claim.

CI browser-only runtime: mcr.microsoft.com/playwright:v1.62.1-noble@sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e. It matches the reviewed Linux PNG environment; existing locked Playwright core is mounted read-only, no npx install. Browser endpoint is loopback-only and container is always cleaned. Host Ubuntu-latest backend and required host Chromium install gate retained. No production bundle/library addition.

ET-CI-001 hosted confirmation: source `c9a43fbe0149aae5072b02cd04d7268bc743397a`, [GitHub Actions](https://github.com/ZabulaAleksey/electro-tutor/actions/runs/41025558068) verify/deploy SUCCESS; Cloudflare `a1db51d3-6979-4112-a33e-a007055ef99b` SUCCESS. Existing required dependency audits PASS; no runtime Python vulnerabilities reported, Node HIGH threshold passes with4LOW/5MODERATE still visible.
