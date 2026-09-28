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

## ET-09.4 private profile HTTP surface

Approved contract находится в
`../specs/features/profiles-capabilities-audit.spec.md`; routes ниже реализованы
и verified locally в `ET-09.4d`:

| Endpoint family | Contract |
|---|---|
| `GET/PUT/PATCH /api/v1/profiles/{student|tutor}/me` | canonical browser own-resource route; owner разрешается server-side из active session, internal `account_id` не требуется client-у |
| `GET /api/v1/profiles/{student|tutor}/{account_id}` | private owner read; foreign/nonexistent resource возвращает non-disclosing `404 profile_not_found` |
| `PUT /api/v1/profiles/{student|tutor}/{account_id}` | idempotent create с owner из session; body не принимает account/identity/role/capability; Tutor требует active `TUTOR_PROFILE_MANAGE_OWN` |
| `PATCH /api/v1/profiles/{student|tutor}/{account_id}` | owner update `display_name`; Tutor требует active grant; authority-like/unknown fields отклоняются |

Anonymous/invalid session получает `401 authentication_required`, missing tutor
grant — `403 capability_required`, invalid body — `422 invalid_request`, different
payload после existing create — `409 profile_already_exists`, audit failure —
`503 audit_unavailable`. Public grant/revoke endpoint не создаётся; trusted
provisioning вызывает Application Core service через internal adapter.

Slice `ET-09.4a` регистрирует reusable redacted `503 audit_unavailable` handler;
`ET-09.4d` переиспользует его для audit-critical Tutor create.
Slice `ET-09.4b0` не добавляет route: existing `/me` сохраняет provider identity
provenance, а internal `account_id` остаётся server-side owner key. Public
account-linking endpoint отсутствует.

Profile literal `/me` responses намеренно не содержат `account_id`; UUID-selector
responses сохраняют owner key только для explicit API consumers и negative
IDOR tests.

Slice `ET-09.4b` также не добавляет route: trusted grant/revoke доступны только
internal provisioning adapter с отдельным DB credential; public/self endpoint
и transport mapping остаются отсутствующими.

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

## ET-10.1 TutorOffer/Booking private surface

Approved routes:

| Route | Contract |
|---|---|
| `POST /api/v1/tutor-offers` | session-derived owner creates DRAFT; exact tutor booking capability, idempotency key and server-owned money/time validation |
| `GET /api/v1/tutor-offers/me` | own offers without exposing Account ID |
| `GET /api/v1/tutor-offers/{offer_id}` | owner or authenticated reader of ACTIVE offer; other private states masked as 404 |
| `PUT /api/v1/tutor-offers/{offer_id}` | owner revision with `expected_version`; existing snapshots unchanged |
| `POST /api/v1/tutor-offers/{offer_id}/publish|retire` | owner-only versioned transitions |
| `POST /api/v1/tutor-offers/{offer_id}/bookings` | distinct authenticated student requests observed offer version; terms copied server-side |
| `GET /api/v1/bookings/me?role=student|tutor` | participant lists without internal Account IDs |
| `GET /api/v1/bookings/{booking_id}` | participant-only immutable snapshot |
| `POST /api/v1/bookings/{booking_id}/accept|decline|cancel` | versioned participant transition under exact action policy |

All mutations require canonical UUID `Idempotency-Key`; transition/update bodies
carry `expected_version`. Transport checks session and resource visibility before
custom body parsing. Client cannot submit owner IDs, price, end time, payment
state or snapshot fields. Add CORS allowlist only for `Idempotency-Key`.

Stable conflicts: `idempotency_conflict`, `offer_changed`, `version_conflict`,
`invalid_booking_transition`, `booking_time_elapsed`, `booking_overlap`,
`self_booking_forbidden`, `offer_unavailable`. Foreign resources use
`tutor_offer_not_found`/`booking_not_found`; audit failure stays
`503 audit_unavailable`. Full schemas and precedence belong to the feature SPEC.

## ET-10.2 LessonAccessGrant private surface

`GET /api/v1/bookings/{booking_id}/lesson-access` is an authorization check,
not a public grant-management endpoint. It returns `200` only for a current
participant whose server-issued grant is `ACTIVE`:

```json
{
  "grant_id": "uuid",
  "booking_id": "uuid",
  "status": "ACTIVE",
  "participant_role": "student",
  "valid_from": "2026-09-14T10:45:00Z",
  "valid_until": "2026-09-14T12:00:00Z",
  "capabilities": ["LESSON_SHELL_ENTER"]
}
```

Precedence is session `401`, malformed UUID `422`, missing/foreign Booking as
non-disclosing `404 booking_not_found`, then participant grant state as `403
lesson_access_not_yet_valid|expired|revoked|unavailable`. An accepted eligible
Booking with a missing or inconsistent mandatory grant fails closed as `503
lesson_access_policy_unavailable`; database/audit failures retain redacted
`503` contracts. All responses are private and `no-store`.

Issue and revoke are policy consequences of Booking accept/cancel inside the
same transaction. No public issue/revoke route, Account ID, arbitrary
capability input, payment claim or media token is exposed in ET-10.2.

## ET-10.3 LessonSession private surface

| Route | Contract |
|---|---|
| `POST /api/v1/bookings/{booking_id}/lesson-session` | Empty JSON `{}` creates or returns the single READY Session for an accepted Booking; tutor or student may join |
| `GET /api/v1/lesson-sessions/{session_id}` | Re-authorized participant read for reload within the active grant window |
| `POST /api/v1/lesson-sessions/{session_id}/start` | Tutor-only READY→ACTIVE at/after Booking `starts_at`; JSON `{"expected_version":1}` |
| `POST /api/v1/lesson-sessions/{session_id}/end` | Tutor-only ACTIVE→ENDED; JSON bounded `expected_version` |

All POSTs require exact allowed `Origin`, `application/json`, canonical UUID
`Idempotency-Key` and no extra body fields. The server derives role and
`SESSION_VIEW|SESSION_START|SESSION_END`; Access `LESSON_SHELL_ENTER` does not
authorize a transition by itself. Responses contain opaque Session/Booking
IDs, persisted/effective status, version, role, capabilities, transition
timestamps and `current_topic_id: null`, with no Account IDs or media token.
Every read/write/replay rechecks the current application session, immutable
Booking participant and active grant. Missing/foreign resource is masked 404,
expired/revoked participant grant is 403, malformed request 422, version/key
conflict 409, and unavailable policy/DB/audit is redacted 503. All private
responses remain `no-store`. After `ends_at`, unfinished Session is not
represented as a persisted ENDED or readable history in v1. Isolated live
Session browser acceptance passed; literal human RU/UK screen-reader gate
remains pending. Routes are local/CI, not deployed.

## ET-14.1 private notification API — source checkpoint

| Route | Contract |
|---|---|
| `GET /api/v1/notifications?limit=20&offset=0` | active session, owner-only list; limit 1..50, offset 0..10000; item contains opaque ID, `booking.accepted`, Booking UUID, created/expiry/read times |
| `GET /api/v1/notifications/unread-count` | active session, own unexpired unread count |
| `POST /api/v1/notifications/{id}/read` | active session plus exact allowed Origin; idempotent 204 for own unexpired item; foreign/unknown/expired masked 404 |

All routes are `no-store`, return no Account ID or arbitrary navigation URL,
and use the established error envelope. The browser constructs only the typed
internal Booking link. Transport/unit and mocked browser checks passed, while
real PostgreSQL ACL/API/worker E2E remains unverified; see `STAGES.md`.
