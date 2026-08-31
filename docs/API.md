# API contract

ET-09.2 предоставляет local/CI FastAPI walking skeleton с prefix `/api/v1`.
Production origin, ingress и browser integration не выбраны.

| Endpoint | Contract |
|---|---|
| `GET /api/v1/health/live` | `200 {"status":"ok"}`; подтверждает процесс |
| `GET /api/v1/health/ready` | `200` только после real `SELECT 1` и совпадения Alembic head; иначе redacted `503` |

Все `/api/*` responses получают `Cache-Control: no-store` и `X-Request-ID`.
Безопасный входной request ID принимается, invalid/control/oversized значение
заменяется server-generated ID. Ошибка имеет стабильную форму
`{"error":{"code","message","request_id","details"}}`; DB URL, SQL и secrets
наружу не выдаются. Request body, включая chunked stream без `Content-Length`,
ограничен `ET_BODY_LIMIT_BYTES`; текущий health API не имеет body-bearing endpoints. CORS middleware отсутствует, то есть
browser cross-origin access default-deny. OpenAPI/docs включаются только explicit
local profile, в `test`/`ci` отключены.
