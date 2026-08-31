# Traceability

Этот файл связывает требования с architecture decisions, stages и evidence, но
не заменяет SPEC и не является вторым status source.

| Behavior ID | Канонический contract | Architecture / decision | Stage и required evidence | Состояние |
|---|---|---|---|---|
| `PLAT-001` | current/target map, выбранный walking-skeleton stack и executable DAG определены до кода | `ARCHITECTURE.md`, ADR-019 | `ET-09.1`: spec/link/context/overlay validators и semantic DAG review | contracted; validated locally |
| `AUTH-004` | Electro Tutor не использует MathMorph realm/client/session/schema/migrations; identity key `(issuer, subject)` | ADR-020, `SECURITY.md` | `ET-09.1`: read-only ownership audit; runtime proof — `ET-09.3` | contracted; not implemented |
| `INT-002` | нет прямого доступа к MathMorph DB; только будущий versioned API/export adapter | ADR-021, integration boundary в architecture | `ET-09.1`: dependency/import/config audit; real contract — отдельный future stage | contracted; not implemented |
| `PLAT-002` | root command → `/api/v1` → real PostgreSQL и schema head | ADR-019 | `ET-09.2`: 19 fast + 6 PostgreSQL integration tests, live/ready smoke | implemented; validated locally |
| `OPS-001` | root setup/run/test/migrate/doctor; loopback/no-LAN defaults; Python lock/security gates | ADR-019, `project-context.md` Backend DX Delta | `ET-09.2`: root CI-equivalent gate, network/config/redaction negatives и diagnostics | implemented; validated locally |
| `DB-001` | Alembic lineage, separate roles, no `create_all`, destructive deny-by-default | ADR-019, `DATA_MODEL.md`, security atlas | `ET-09.2`: current/check, disposable upgrade→downgrade→upgrade, grants, outage/drift `503` | implemented; validated locally |

`ET-09.2` подтверждён local/CI evidence; production backend deployment не
выполнялся и не следует из этого статуса.
