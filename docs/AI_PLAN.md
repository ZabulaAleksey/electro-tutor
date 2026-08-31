# Текущий AI-план

## ET-09.2 — Backend/API/DB walking skeleton

- Stage ID: `ET-09.2`

Статус: `PLANNED`

Цель: реализовать минимальный modular-monolith runtime с реальным
client/command → versioned API → PostgreSQL path.

### Dependencies и входные предпосылки

- `ET-09.1` завершён и validated locally;
- ADR-019/020/021 утверждают runtime, identity и MathMorph boundaries;
- production backend host/provider не требуется для local/CI slice.

### Runnable slice и scenario

Каноническая root command поднимает API и PostgreSQL; `/api/v1/health/live`
подтверждает процесс, `/api/v1/health/ready` выполняет `SELECT 1` и проверяет
Alembic head. DB outage/schema drift дают redacted stable `503`.

### Scope и PASS evidence

- `services/api/`: Python `>=3.12`, FastAPI, async SQLAlchemy, Alembic;
- отдельные migration/runtime PostgreSQL roles и reversible initial lineage;
- reproducible root setup/run/test/migrate/doctor surface, local/CI parity;
- loopback/no-LAN defaults, destructive DB deny-by-default, strict request ID;
- sentinel redaction, Python lock/vulnerability gates и required tests/evidence.

### Non-goals и blocker

- без auth/profiles/booking, Keycloak, Redis, RabbitMQ, workers и microservices;
- без production backend deployment/ingress/provider choice;
- SQLite/mock не считается primary DB evidence; MathMorph не изменяется.
