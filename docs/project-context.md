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
| Current selector, stage status, `NEXT`, blockers и routing progression | `../prompts/STAGES.md` |
| Retained migration evidence | `AI_PLAN.md`, `AI_STATUS.md` — hash-bound legacy artifacts, не active routing inputs |
| Глобальная методика | `~/.codex/AGENTS.md` и глобальный ДЕВ |
| Идеи и vision | Notion; не является evidence реализации |

Project overlay хранит только project-specific delta. Hooks, MCP, generic
agents, Skills и Git workflow наследуются; локальные копии без подтверждённого
пробела не создаются.

## Backend DX Delta

- Applicability level: `BDX-L2` — stateful FastAPI + PostgreSQL local/CI slice.
- Supported local environments: Windows 11 PowerShell и CI Linux; Docker engine
  обязателен для integration/full gates.
- Canonical working directory: repository root `~/codex-workspace/electro-tutor`.
- Toolchain/runtime versions: Node `>=22.12.0` (validated `22.23.1`), Python
  `3.12` (image `3.12.5`), uv `0.12.3`, Docker `29.7.2`, Compose `5.4.0`,
  PostgreSQL `17.6`.
- Package manager and lockfile: root `pnpm@11.23.0` + `pnpm-lock.yaml`; backend
  `uv` + `services/api/uv.lock`; competing lockfiles запрещены.
- Canonical commands:
  - bootstrap: `pnpm backend:bootstrap`.
  - doctor: `pnpm backend:doctor`.
  - dev: `pnpm backend:dev`.
  - stop: `pnpm backend:stop`.
  - check: `pnpm backend:check`.
  - test-fast: `pnpm backend:test:fast`.
  - test-integration: `pnpm backend:test:integration`.
  - build: `pnpm backend:build`.
  - logs: `pnpm backend:logs`.
  - IdP dev/provision: `pnpm backend:idp:dev`, `pnpm backend:idp:provision`.
  - auth browser E2E: `pnpm test:e2e:auth`.
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
  profiles `local`, `test`, `ci`; API получает runtime DB и non-secret exact OIDC
  contract, one-shot migrator — migration DB credential; Keycloak/test passwords
  передаются только через local environment; unknown `ET_*` forbidden.
- Secret redaction/effective-config diagnostics: `pnpm backend:doctor` печатает
  profile/host/port и DB host/path без user/password; responses/log tests
  проверяют sentinel redaction.
- API docs/spec and generated-contract drift command: check via `pnpm backend:test:fast`
  проверяет generated OpenAPI component shape; versioned generated artifact
  `N/A — schema генерируется FastAPI и не хранится вторым source`; owner — `docs/API.md`.
  отдельный generated artifact не versioned.
- DB migration/status/seed/reset-local commands: `pnpm backend:db:migrate`,
  `pnpm backend:db:status`, seed `N/A — ET-09.2 не имеет product tables/data`,
  `pnpm backend:db:reset-local`.
- Destructive command guard: reset требует exact
  `ET_CONFIRM_RESET_LOCAL=electro-tutor-local` и удаляет только named local
  volume; migration lifecycle требует exact consent и database
  `electro_tutor_test`.
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
| `BDX-GATE-07 Database lifecycle` | `PASS` — current/check, disposable lifecycle, grants |
| `BDX-GATE-08 Test feedback` | `PASS` — fast/full tiers без hidden skip |
| `BDX-GATE-09 Diagnostics and observability` | `PASS` — request ID, structured logs, redaction |
| `BDX-GATE-10 CI parity` | `PASS` — Pages workflow вызывает `backend:check` |
| `BDX-GATE-11 Documentation impact` | `PASS` — README/contracts/state synchronized |
| `BDX-GATE-12 No overengineering` | `PASS` — один monolith + PostgreSQL, future systems deferred |

## Переносимое продолжение

Critical context восстанавливается из Git clone/branch и глобального ДЕВ. Перед
командой `Продолжай Electro Tutor` исполнитель проверяет dirty/untracked work,
явно переключается на выбранную ветку, получает её через fast-forward без
destructive reset, выполняет `pnpm install --frozen-lockfile`, запускает
`pnpm check:context`, валидирует project overlay, затем читает единственный
selector и выбранный record в `prompts/STAGES.md`. Его status, `NEXT`, blockers
и dependencies определяют дальнейшее действие; retained legacy artifacts в
normal bootstrap не читаются.
