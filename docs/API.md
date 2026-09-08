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

## ET-09.4 planned profile surface (not implemented)

Approved contract находится в
`../specs/features/profiles-capabilities-audit.spec.md`; routes ниже появятся
только в runtime slice `ET-09.4d`:

| Endpoint family | Contract |
|---|---|
| `GET /api/v1/profiles/{student|tutor}/{account_id}` | private owner read; foreign/nonexistent resource возвращает non-disclosing `404 profile_not_found` |
| `PUT /api/v1/profiles/{student|tutor}/{account_id}` | idempotent create с owner из session; body не принимает account/identity/role/capability; Tutor требует active `TUTOR_PROFILE_MANAGE_OWN` |
| `PATCH /api/v1/profiles/{student|tutor}/{account_id}` | owner update `display_name`; Tutor требует active grant; authority-like/unknown fields отклоняются |

Anonymous/invalid session получает `401 authentication_required`, missing tutor
grant — `403 capability_required`, invalid body — `422 invalid_request`, different
payload после existing create — `409 profile_already_exists`, audit failure —
`503 audit_unavailable`. Public grant/revoke endpoint не создаётся; trusted
provisioning вызывает Application Core service через internal adapter.

Slice `ET-09.4a` уже регистрирует reusable redacted `503 audit_unavailable`
handler для будущих audit-critical commands, но не добавляет profile/grant route.
Slice `ET-09.4b0` не добавляет route: existing `/me` сохраняет provider identity
provenance, а internal `account_id` остаётся server-side owner key. Public
account-linking endpoint отсутствует.

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
