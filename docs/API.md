# API contract

ET-09.2 предоставляет local/CI FastAPI walking skeleton с prefix `/api/v1`, а
ET-09.3 добавляет DEV-only browser OIDC/session surface. Production origin,
ingress и IAM topology не выбраны.

| Endpoint | Contract |
|---|---|
| `GET /api/v1/health/live` | `200 {"status":"ok"}`; подтверждает процесс |
| `GET /api/v1/health/ready` | `200` только после real `SELECT 1` и совпадения Alembic head; иначе redacted `503` |
| `GET /api/v1/auth/login?return_to=...` | создаёт одноразовую server-side transaction и перенаправляет на Authorization Code + PKCE `S256`; `return_to` exact-allowlisted |
| `GET /api/v1/auth/callback` | требует transaction cookie + valid `state`; проверяет nonce, signature, issuer и audience, затем выдаёт новую opaque Tutor session |
| `GET /api/v1/me` | `200` только для действующей Tutor server-side session; иначе `401` |
| `POST /api/v1/auth/logout?post_logout_redirect_uri=...` | требует exact DEV Origin/redirect, удаляет Tutor session/cookie и переводит на provider logout |

Все `/api/*` responses получают `Cache-Control: no-store` и `X-Request-ID`.
Безопасный входной request ID принимается, invalid/control/oversized значение
заменяется server-generated ID. Ошибка имеет стабильную форму
`{"error":{"code","message","request_id","details"}}`; DB URL, SQL и secrets
наружу не выдаются. Request body, включая chunked stream без `Content-Length`,
ограничен `ET_BODY_LIMIT_BYTES`. Credentialed CORS разрешён только exact origins
`http://127.0.0.1:4321` и `http://127.0.0.1:4322`; остальные origins остаются
default-deny. Session cookie opaque, `HttpOnly`, `SameSite=Lax`, scoped к
`/api/v1`; HTTP-only DEV profile не выдаётся за production cookie topology.
OpenAPI/docs включаются только explicit local profile, в `test`/`ci` отключены.
