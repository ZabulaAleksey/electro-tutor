# Traceability

Этот файл связывает требования с architecture decisions, stages и evidence, но
не заменяет SPEC и не является вторым status source.

| Behavior ID | Канонический contract | Architecture / decision | Stage и required evidence | Состояние |
|---|---|---|---|---|
| `PLAT-001` | current/target map, выбранный walking-skeleton stack и executable DAG определены до кода | `ARCHITECTURE.md`, ADR-019 | `ET-09.1`: spec/link/context/overlay validators и semantic DAG review | contracted; validated locally |
| `AUTH-004` | Electro Tutor не использует MathMorph realm/client/session/schema/migrations; identity key `(issuer, subject)` | ADR-020, `SECURITY.md` | `ET-09.1`: read-only ownership audit; runtime proof — `ET-09.3` | contracted; not implemented |
| `INT-002` | нет прямого доступа к MathMorph DB; только будущий versioned API/export adapter | ADR-021, integration boundary в architecture | `ET-09.1`: dependency/import/config audit; real contract — отдельный future stage | contracted; not implemented |
| `PLAT-002` | root command → `/api/v1` → real PostgreSQL и schema head | ADR-019 | `ET-09.2`: clean restore, component + PostgreSQL integration + E2E | planned |
| `OPS-001` | root setup/run/test/migrate/doctor; loopback/no-LAN defaults; Python lock/security gates | ADR-019, planned developer-workflow applicability | `ET-09.2`: clean-clone local/CI parity, network/config/redaction negatives и diagnostics | planned |
| `DB-001` | Alembic lineage, separate roles, no `create_all`, destructive deny-by-default | ADR-019, target security atlas | `ET-09.2`: upgrade/current/check, disposable downgrade, grants, outage/drift `503` | planned |

`ET-09.1` не предоставляет backend runtime evidence. Статус `planned` для
`ET-09.2` сохраняется до реального client/command → API → PostgreSQL PASS.
