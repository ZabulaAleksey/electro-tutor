# Traceability

Этот файл связывает требования с architecture decisions, stages и evidence, но
не заменяет SPEC и не является вторым status source.

| Behavior ID | Канонический contract | Architecture / decision | Stage и required evidence | Состояние |
|---|---|---|---|---|
| `PLAT-001` | current/target map, выбранный walking-skeleton stack и executable DAG определены до кода | `ARCHITECTURE.md`, ADR-019 | `ET-09.1`: spec/link/context/overlay validators и semantic DAG review | contracted; validated locally |
| `AUTH-001..004` | real OIDC login, expired/invalid auth fails closed, identity key `(issuer, subject)`, MathMorph isolation | ADR-020/022, `SECURITY.md`, `API.md` | `ET-09.3`: unit crypto/security negatives, real PostgreSQL lifecycle, live Keycloak provisioning and Chromium login→`/me`→logout | implemented; validated locally |
| `PLAT-003` | application profiles отделены от provider identity/authority; Student и Tutor — composable private personas | `profiles-capabilities-audit.spec.md`, ADR-023, `ARCHITECTURE.md` | `ET-09.4a..e`: ordered audit→Account→grant→profile→HTTP→E2E evidence | contracted; audit + Account boundary validated, profiles planned |
| `AUTHZ-001..003` | server-side matrix вычисляет capabilities; self/client/foreign escalation denied; critical authority/profile create атомарны с durable audit | `profiles-capabilities-audit.spec.md`, ADR-023, `SECURITY.md`, `API.md` | `ET-09.4b..e`: policy matrix, real DB atomicity/ownership, two-user Keycloak/API/browser E2E | contracted; audit foundation merged, policy runtime planned |
| `PCA-ID-001..004`, `PCA-PROFILE-001..002` | `accounts.id` is stable product owner; external identities retain provider provenance; Account owns independent `0..1` Student/Tutor profiles and fields never grant authority | `profiles-capabilities-audit.spec.md`, ADR-023, `DATA_MODEL.md` | `ET-09.4b0`: revision `20260909_0006`, populated/concurrent/no-linking real PostgreSQL evidence; `c..e`: profile gates | Account boundary implemented/validated; profiles planned |
| `PCA-GRANT-001..004` | trusted account grant/internal issuer, evaluator and idempotency | `profiles-capabilities-audit.spec.md`, ADR-023, `SECURITY.md`, `DATA_MODEL.md` | `ET-09.4b..e`: grant constraints, policy matrix, concurrent revoke and complete AUTHZ E2E | contracted; runtime not implemented |
| `PCA-AUDIT-001..004` | append-only redacted envelope, correlation/access boundary and fail-closed shared transaction | `profiles-capabilities-audit.spec.md`, ADR-023, `SECURITY.md`, `DATA_MODEL.md` | `ET-09.4a`: revision `20260908_0005`, 71 fast + 22 real PostgreSQL tests; later critical mutations reuse foundation in `b/c` | foundation implemented; validated locally; merged into local main |
| `INT-002` | нет прямого доступа к MathMorph DB; только будущий versioned API/export adapter | ADR-021, integration boundary в architecture | `ET-09.1`: dependency/import/config audit; real contract — отдельный future stage | contracted; not implemented |
| `PLAT-002` | root command → `/api/v1` → real PostgreSQL и schema head | ADR-019 | `ET-09.2`: 19 fast + 6 PostgreSQL integration tests, live/ready smoke | implemented; validated locally |
| `OPS-001` | root setup/run/test/migrate/doctor; loopback/no-LAN defaults; Python lock/security gates | ADR-019, `project-context.md` Backend DX Delta | `ET-09.2`: root CI-equivalent gate, network/config/redaction negatives и diagnostics | implemented; validated locally |
| `DB-001` | Alembic lineage, separate roles, no `create_all`, destructive deny-by-default | ADR-019, `DATA_MODEL.md`, security atlas | `ET-09.2`: current/check, disposable upgrade→downgrade→upgrade, grants, outage/drift `503` | implemented; validated locally |

`ET-09.2`, ET-09.3 DEV auth, `ET-09.4a` audit foundation и `ET-09.4b0` internal
Account boundary подтверждены local evidence. Whole `ET-09.4` partial:
`ET-09.4b..e` остаются planned. Production
backend/IAM deployment не выполнялся и не следует из этого статуса.
