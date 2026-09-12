# Testing contract

- `pnpm backend:test:fast`: Ruff, strict mypy, unit/component tests без Docker.
- `pnpm backend:test:integration`: real PostgreSQL `electro_tutor_test`,
  readiness, outage/drift redaction, upgrade→downgrade→upgrade и запрет DDL для
  runtime role; identity upsert по `(issuer, subject)`, одноразовая auth
  transaction, session invalidation и запрет runtime-mutation durable identity key
  также проверяются real DB. `ET-09.4a` добавляет exact AuditEvent schema/
  privileges, revision round-trip, append/read/correlation, unique IDs,
  server-controlled columns, append-only denial и shared-transaction rollback
  при exception/audit constraint failure. `ET-09.4b0` добавляет populated
  Account backfill/round-trip, exact FK/index/privileges, atomic first-login,
  repeat и concurrent winner, orphan rollback, no-email-linking, immutable owner
  и controlled two-identities-to-one-account evidence. `ET-09.4c` добавляет
  revisions `20260912_0008/0009` round-trip/schema/function/privilege checks, dual
  Student/Tutor profile cardinality, normalization/idempotency, Tutor grant/revoke
  serialization, direct table denial и atomic create+AuditEvent rollback.
  Session-bound gates дополнительно проверяют separate auth/runtime roles,
  cross-account denial, exact downgrade semantics, same-PID pool cleanup,
  cancellation и logout serialization. Последний evidence: `94` fast и `51`
  real PostgreSQL tests PASS. `ET-09.4d` добавляет transport/error matrix,
  malformed-body auth/owner precedence и live API → Application → PostgreSQL
  component path; последний backend evidence: `110` fast и `52` integration PASS.
- `ET-09.4e`: backend fast `131` и real PostgreSQL `54` PASS; root Vitest `112`,
  Astro check, RU/UK/mobile Chromium support checks, 17-page build и audits PASS.
  `pnpm test:e2e:auth` теперь запускает exact two-user Keycloak flow, trusted
  Tutor grant/audit CLI, foreign UUID и self-escalation negatives. Без
  `ET_KEYCLOAK_ADMIN_PASSWORD` и `ET_DEV_TEST_PASSWORD` command fail fast до
  service mutation; privileged CLI принимает только ровно два canonical subject
  текущих managed identities; такой run не является terminal evidence.
- `pnpm backend:idp:provision`: idempotent live Keycloak reconciliation с safe
  non-secret contract digest; требует credentials только из local environment.
- `pnpm backend:idp:cleanup`: после общего ownership preflight удаляет только
  `et-dev-acceptance` и `et-dev-acceptance-b`; foreign user fail closed без
  partial delete.
- `pnpm test:e2e:auth`: real Chromium → two Keycloak identities → callback →
  Student/Tutor `/profiles/*/me` → foreign/self-escalation denial → durable audit
  → logout; включает invalid redirect и changed-email/same-subject сценарии. Canonical
  command без admin/test password fail closed до Playwright; при прямом запуске
  общего suite auth tests skipped и не являются terminal evidence.
  Для real auth suite trace/screenshot/video отключены, чтобы credential, code и
  session material не сохранялись в Playwright artifacts.
- `pnpm backend:check`: frozen restore, lock drift, `pip-audit`, fast tests,
  effective Compose config, image build, migrations/current/check, integration
  suite и live HTTP smoke; cleanup сохраняет volume.
- `pnpm test`, `pnpm check`, `pnpm lint`, `pnpm verify:full`: неизменённый
  frontend/Pages regression contract.

Migration lifecycle меняет только явно названную disposable database
`electro_tutor_test` и требует exact consent marker. Local PASS не является
production backend deployment evidence.
