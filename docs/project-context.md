# Контекст проекта

Electro Tutor — Astro 7 static site с React 19 islands, TypeScript и Content
Collections/MDX. Поддерживаются маршруты `ru` и `uk`.

## Источники истины

| Тип информации | Канонический источник |
|---|---|
| Product/system requirements | `../specs/` |
| Фактическая реализация | код repository и результаты проверок |
| Архитектура и существенные решения | `ARCHITECTURE.md`, `DECISIONS.md` |
| Порядок развития | `ROADMAP.md` |
| Current selector, stage status, `NEXT`, blockers и routing progression | `STAGES.md` |
| Retained migration evidence | `notes/legacy-ai-state-evidence.md` и Git parent — исторические SHA/facts, не active routing inputs |
| Глобальная методика | `~/.codex/AGENTS.md` и глобальный ДЕВ |
| Идеи и vision | Notion; не является evidence реализации |

Project overlay хранит только project-specific delta. Hooks, MCP, generic
agents, Skills и Git workflow наследуются; локальные копии без подтверждённого
пробела не создаются.

## Backend DX Delta

- Applicability level: `BDX-L2` — stateful FastAPI + PostgreSQL local/CI slice.
- Supported local environments: Windows 11 PowerShell и CI Linux; Docker engine
  обязателен для integration/full gates.
- Canonical working directory: repository root `${PROJECTS_ROOT}/electro-tutor`.
- Toolchain/runtime versions: Node `>=22.12.0` (validated `22.23.1`), Python
  `3.12` (image `3.12.5`), uv `0.12.3`, Docker `29.7.2`, Compose `5.4.0`,
  PostgreSQL `17.6`.
- Package manager and lockfile: root `pnpm@11.23.0` + `pnpm-lock.yaml`; backend
  `uv` + `services/api/uv.lock`; competing lockfiles запрещены.
- Canonical commands:
  - bootstrap: `pnpm backend:bootstrap`.
  - doctor: `pnpm backend:doctor`.
  - dev: `pnpm backend:dev`.
  - isolated browser-E2E runtime: `pnpm backend:e2e` (non-destructive migrate/start
    against `electro_tutor_test`).
  - stop: `pnpm backend:stop`.
  - check: `pnpm backend:check`.
  - test-fast: `pnpm backend:test:fast`.
  - test-integration: `pnpm backend:test:integration`.
  - build: `pnpm backend:build`.
  - logs: `pnpm backend:logs`.
  - IdP dev/provision: `pnpm backend:idp:dev`, `pnpm backend:idp:provision`.
  - auth/booking browser E2E: `pnpm test:e2e:auth`; runner always stops its
    test-profile Compose services without deleting named volumes.
- Required local services: Docker Compose `api` и `postgres`; ET-09.3 auth gate
  дополнительно поднимает isolated `keycloak` и выполняет idempotent provision.
- Readiness/status command: `pnpm backend:status`, `pnpm backend:doctor`,
  `pnpm backend:smoke`; API `/live` отделён от DB/schema `/ready`.
- Ports and collision policy: API `127.0.0.1:8000`, PostgreSQL
  `127.0.0.1:55432`, Tutor DEV Keycloak `127.0.0.1:58081`; non-loopback bind отклоняется preflight, occupied port
  приводит к visible Compose failure без fallback.
- Config source, profiles and required variables: safe local defaults закреплены
  в `scripts/backend.mjs`/`compose.yaml`; `.env.example` перечисляет names как
  reference, а не поддерживаемый override surface;
  profiles `local`, `test`, `ci`; API получает раздельные обязательные
  `electro_tutor_runtime` и `electro_tutor_auth_runtime` DB URLs и non-secret
  exact OIDC contract; one-shot cluster-admin role reconciliation precedes migration and
  получает только local bootstrap/auth/provisioner credentials; one-shot migrator —
  migration DB credential; Keycloak/test passwords
  передаются только через local environment; unknown `ET_*` forbidden.
- Secret redaction/effective-config diagnostics: `pnpm backend:doctor` печатает
  profile/host/port и DB host/path без user/password; responses/log tests
  проверяют sentinel redaction.
- API docs/spec and generated-contract drift command: check via `pnpm backend:test:fast`
  проверяет generated OpenAPI component shape; versioned generated artifact
  `N/A — schema генерируется FastAPI и не хранится вторым source`; owner — `docs/API.md`.
  отдельный generated artifact не versioned.
- DB migration/status/seed/reset-local commands: `pnpm backend:db:migrate`,
  `pnpm backend:db:status`, seed `N/A — supported canonical seed command is
  not defined`, `pnpm backend:db:reset-local`; ADR-028 adds
  `pnpm backend:db:catalog:baseline test` on an owned disposable scratch DB
  and read-only `pnpm backend:db:catalog:diagnose` for a target DB.
- Destructive command guard: reset требует exact
  `ET_CONFIRM_RESET_LOCAL=electro-tutor-local` и удаляет весь named local
  volume, potentially shared across checkouts and containing product data;
  it is not an ET-10.3 drift recovery path. The observed dev DB has 2
  account rows. Do not reset without a separately approved backup/recovery
  decision. Migration lifecycle требует exact consent и database
  `electro_tutor_test`. Browser E2E also uses that isolated database through
  `compose.e2e.yaml`; it never resets or treats `electro_tutor` as test data.
- Worker/scheduler commands: `N/A — workers/queues/schedulers не входят в ET-09.2`.
- External sandbox/stub/fallback modes: isolated Keycloak DEV — real provider
  evidence, не mock и не production; IdP/DB outage fail closed без local identity
  fallback.
- Clean-room smoke command or documented manual scenario: `pnpm backend:check`;
  затем `pnpm backend:dev`, `pnpm backend:doctor`, `pnpm backend:smoke`,
  `pnpm backend:stop` для ручного inspection.
- Project-specific quality gates: frozen uv lock, Ruff format/lint, strict mypy,
  fast и real-PostgreSQL tests, pip-audit, Compose config/image, Alembic current/check,
  live HTTP→DB smoke, cleanup; Pages CI вызывает тот же backend gate.
- Known limitations: production backend hosting/ingress/IAM/cookie topology не
  выбраны; exact credentialed CORS действует только для DEV/E2E, jobs отсутствуют.
  ADR-028 now provides independent Core head metadata for 15 tables and a
  committed `pg_catalog` manifest for functions, triggers, CHECKs, indexes
  and private ACL. A newly migrated scratch DB passes Alembic check, catalog
  parity and 9 transactional drift negatives. The existing dev DB at head
  0012 genuinely diverges (10 expected functions missing, 3 changed, 9
  unexpected and 1 CHECK missing), so `backend:db:catalog:diagnose` exits 1.
  A scratch DB left by interrupted execution is never auto-dropped on the next
  run: first inspect exact `electro_tutor_catalog_baseline` existence/owner
  read-only via `docker compose exec -T postgres psql -X -U
  electro_tutor_bootstrap -d postgres -c "SELECT datname, pg_get_userbyid(datdba)
  FROM pg_database WHERE datname = 'electro_tutor_catalog_baseline'"`; resolve
  ownership and recovery before any manual drop. No live DB self-reflection,
  reset or automatic repair is allowed.
- Explicit deviations from global Backend DX Policy: `none`.

### Backend DX gate status

| Gate | Status и evidence |
|---|---|
| `BDX-GATE-01 Context integrity` | `PASS` — context/overlay validators |
| `BDX-GATE-02 Command discoverability` | `PASS` — root catalog contract test |
| `BDX-GATE-03 Clean bootstrap` | `PASS` — frozen pnpm/uv restore и build-on-dev |
| `BDX-GATE-04 Config safety` | `PASS` — exact roles/targets, redaction negatives |
| `BDX-GATE-05 Service readiness` | `PASS` — Compose health + root doctor/ready/stop |
| `BDX-GATE-06 API contract` | `PASS` — OpenAPI/component/error/request tests |
| `BDX-GATE-07 Database lifecycle` | `FAIL` for original DB — UA-15 verified archive and restored a separate clone; exact clone forward/reverse restored full preflight catalog/function inventory, second forward passed catalog and Alembic head. Original volume stayed unattached; external-caller compatibility for original 8→9-column reader remains undecided. |
| `BDX-GATE-08 Test feedback` | `FAIL` composite — direct backend unit 196 and real clone integration 73 PASS/1 port-guard skip; `backend:test:fast` stops at accepted test Ruff format. |
| `BDX-GATE-09 Diagnostics and observability` | `PASS` — request ID, structured logs, redaction |
| `BDX-GATE-10 CI parity` | `FAIL` — clone catalog/Alembic, direct live HTTP, frontend build/browser subgates passed; `backend:check` hardcodes Compose `55432` and is unsafe for preserved source, global lint scans ignored backup-venv, outbound audit and authenticated browser remain open. |
| `BDX-GATE-11 Documentation impact` | `PASS` — README/contracts/state synchronized |
| `BDX-GATE-12 No overengineering` | `PASS` — один monolith + PostgreSQL, future systems deferred |

## Переносимое продолжение

Critical context восстанавливается из Git clone/branch и глобального ДЕВ. Перед
командой `Продолжай Electro Tutor` исполнитель проверяет dirty/untracked work,
явно переключается на выбранную ветку, получает её через fast-forward без
destructive reset, выполняет `pnpm install --frozen-lockfile`, запускает
`pnpm check:context`, валидирует project overlay, затем читает единственный
selector и выбранный record в `docs/STAGES.md`. Его status, `NEXT`, blockers
и dependencies определяют дальнейшее действие; retained legacy artifacts в
normal bootstrap не читаются.
