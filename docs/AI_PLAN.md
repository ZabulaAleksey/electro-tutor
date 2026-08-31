# Текущий AI-план

## ET-09.3 — Identity/OIDC vertical slice

- Stage ID: `ET-09.3`

Статус: `BLOCKED`

Цель после разблокировки: реализовать provider-neutral browser OIDC Authorization
Code + PKCE, server-side session и защищённый `/api/v1/me`.

### Dependencies и входные предпосылки

- `ET-09.2` завершён и validated locally;
- ADR-020 утверждает отдельную Electro Tutor identity boundary;
- отсутствуют отдельный Electro Tutor IdP client/config и approved test account.

### Runnable slice и scenario

Browser проходит Authorization Code + PKCE, callback создаёт server-side session,
а `/api/v1/me` возвращает identity только после валидной сессии. Этот scenario
не запускается до предоставления входных IdP resources.

### Scope и PASS evidence

- exact issuer/client/redirect allowlist и PKCE/state/nonce;
- secure server-side session cookie, rotation/logout и protected `/me`;
- real browser → IdP → callback → API scenario и negative auth tests.

### Non-goals и blocker

- не переиспользовать MathMorph realm/client/session/schema;
- не выбирать provider и не создавать mock-only primary auth evidence;
- до получения IdP client/config/test account этап остаётся `BLOCKED`.
