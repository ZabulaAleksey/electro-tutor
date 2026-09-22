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
  `ET-09.4e` accepted an exact two-user Keycloak flow, trusted
  Tutor grant/audit CLI, foreign UUID и self-escalation negatives. Без
  `ET_KEYCLOAK_ADMIN_PASSWORD` и `ET_DEV_TEST_PASSWORD` command fail fast до
  service mutation; privileged profile/Booking CLI принимает только ровно два
  canonical subject участников, не третьего Access-negative аккаунта; такой
  secret-free run не является terminal evidence.
- `pnpm backend:idp:provision`: idempotent live Keycloak reconciliation с safe
  non-secret contract digest; требует credentials только из local environment.
- `pnpm backend:idp:cleanup`: после общего ownership preflight удаляет только
  `et-dev-acceptance`, `et-dev-acceptance-b` и `et-dev-acceptance-c`; foreign user fail closed без
  partial delete.
- `pnpm test:e2e:auth`: real Chromium → three managed Keycloak identities;
  existing two-user phases still cover callback →
  Student/Tutor `/profiles/*/me` → foreign/self-escalation denial → durable audit
  → logout; включает invalid redirect и changed-email/same-subject сценарии. Canonical
  ET-10.2 adds a separate three-identity `lesson-access` phase. Canonical
  command без admin/test password fail closed до Playwright; при прямом запуске
  общего suite auth tests skipped и не являются terminal evidence.
  Initial session loading проверяется детерминированно: Playwright удерживает
  exact `GET /api/v1/me`, подтверждает локализованный `checkingSession`, затем
  явно освобождает запрос. Standalone support gate отвечает контролируемым `401`
  без зависимости от запущенного API; live login продолжает exact request в
  реальный backend. Оба пути проверяют переход без fixed sleep или
  timeout-dependent presentation assertion.
  Terminal acceptance от 2026-09-14 завершён с exit `0`: profiles phase
  `6 passed / 1` expected phase skip, identity-change phase `5 passed / 2`
  expected phase skips; обязательные live-сценарии не пропущены.
  Для real auth suite trace/screenshot/video отключены, чтобы credential, code и
  session material не сохранялись в Playwright artifacts.
- `pnpm backend:check`: frozen restore, lock drift, `pip-audit`, fast tests,
  effective Compose config, image build, migrations/current/check, integration
  suite и live HTTP smoke; cleanup сохраняет volume.
- `pnpm test`, `pnpm check`, `pnpm lint`, `pnpm verify:full`: неизменённый
  frontend/Pages regression contract.
- `src/classroom/meeting.test.ts`: единый lifecycle/capability/error contract для fake и injected
  Jitsi adapter; timeout/retry, bounded stale-session cleanup, display-name bounds и invite URL
  allowlist; structural guard запрещает vendor SDK/domain/commands в `Classroom.tsx`.

## ET-10.3 isolated data-preserving recovery rehearsal — 2026-09-22

- Source ownership: Docker labels связывают `electro-tutor-local-postgres` и
  `electro-tutor-local-postgres-1` с `electro-tutor-local`/`compose.yaml`. Container
  был только `created`; running writer volume не обнаружен. `pg_controldata`
  показывал `in production`, то есть source остановился нештатно. MathMorph
  продолжал работать на `127.0.0.1:55432` и не изменялся.
- Backup до clone/repair: protected external artifact
  `ET-10.3-20260922T202618Z/preserved-pgdata.tar`, 99,788,800 bytes, SHA-256
  `aa5d1fa75a53d94f09181347b3c70e627abefbb53d99f85bbe0265e7a78f8bc1`.
  Archive integrity, независимый host/container digest и ACL только для owner,
  SYSTEM, Administrators проверены. Его восстановление в новый volume
  `electro-tutor-et103-clone-20260922` прошло: PostgreSQL 17.6 завершил WAL
  recovery (`redo done`, ready), прочитал Alembic `20260915_0012` и значимые
  row counts. После всех действий source byte-for-byte совпал с archive по
  `tar --compare`; source DB не запускалась и не менялась. Clone привязан только
  к `127.0.0.1:55433`, после rehearsal container остановлен штатно и volume
  сохранён.
- Redacted inventory: 15 product tables + `alembic_version`, 45 public
  functions. Rows: accounts 2; external_identities 2; student_profiles 2;
  tutor_profiles 1; capability_grants 1; capability_grant_operations 1;
  audit_events 2. В application_sessions, auth_transactions, tutor_offers,
  bookings, booking_operations, lesson_access_grants, lesson_sessions и
  lesson_session_operations — 0. Идентификаторы, emails, token values, SQL
  function bodies и private payload не выводились.
- Reproduced drift: начальный `alembic check` обнаружил отсутствующие
  `booking_operations.result_payload` и
  `ck_booking_operations_result_payload`; redacted catalog diagnose показал
  1 missing CHECK, 10 missing expected functions, 3 changed expected
  functions, 9 unexpected functions. Revision stamp `0012` сам по себе не
  доказывает parity. Источник точного исторического изменения function bodies
  не установлен; по сигнатурам это старые варианты Booking API, а не часть
  текущего migration manifest.
- Safe repair/rollback на clone: транзакционно добавлены ровно отсутствующие
  JSONB NOT NULL column и CHECK из migration `0010`, внутри транзакции column
  виден, после `ROLLBACK` снова отсутствует. Повторное добавление с `COMMIT`
  прошло при `booking_operations=0`; `alembic check` теперь PASS (`No new upgrade
  operations detected`). Catalog diagnose после этого показывает только
  function drift: 10 missing, 3 changed, 9 unexpected.
- Девять unexpected migrator-owned overloads, все без tracked inbound
  PostgreSQL dependencies: `accept_booking(uuid,integer,uuid,text)`,
  `cancel_booking(uuid,integer,uuid,text)`,
  `create_tutor_offer(uuid,text,timestamptz,timestamptz,text,integer,text,bigint,text,smallint,uuid,text)`,
  `decline_booking(uuid,integer,uuid,text)`,
  `publish_tutor_offer(uuid,integer,uuid,text)`,
  `request_booking(uuid,uuid,integer,text,uuid,text)`,
  `reserve_booking_operation(uuid,uuid,text,text,uuid,text,integer)`,
  `retire_tutor_offer(uuid,integer,uuid,text)`,
  `revise_tutor_offer(uuid,integer,text,timestamptz,timestamptz,text,integer,text,bigint,text,smallint,uuid,text)`.
  Нулевые tracked dependencies не исключают вызовы извне или из PL/pgSQL.
- Fail-closed result: вывод этих функций из `public`/удаление и замена
  canonical functions не выполнялись. Поэтому полный clone repair/rollback,
  `backend:check`, ET-10.3 integration/security и live Keycloak/API/browser
  gates не запускались и не засчитаны. Стандартный `backend:check` жёстко
  использует `55432`, поэтому следующий запуск требует отдельной изоляции
  orchestration; использовать его как есть означало бы затронуть source или
  MathMorph. Решение по девяти функциям — `ET-10.3-UA-12` в `docs/STAGES.md`.

## ET-10.1 completed evidence

Completed `ET-10.1d` non-secret evidence: root Vitest `134`, Astro check `86`
files / zero diagnostics, ESLint, build/localization/publication/site audits
(`95` artifacts), focused booking browser matrix `7`, full Chromium
`62 passed / 4` expected live-phase skips, backend fast `171` and real
PostgreSQL `58`; every recorded gate exits `0`. The authenticated runner uses
the isolated `electro_tutor_test`, fails fast when preview port `4322` is
occupied and stops local Compose services after success or failure. Astro
`7.3.2` plus targeted transitive security overrides produce
`pnpm audit --audit-level high` exit `0` with two moderate advisories remaining.
Manual secret-bearing `pnpm test:e2e:auth` then completed the terminal live
acceptance: profiles `7 passed / 2 skipped`, booking `6 passed / 3 skipped`,
identity-change `6 passed / 3 skipped`; cleanup confirmed and terminal exit
`0`. Secret values were neither transferred nor persisted.

- Domain/unit: state transitions, normalization, FREE/EXTERNAL money, IANA
  zone/offset/DST, notice/cancel boundaries, immutable snapshot and exact
  idempotent retry.
- Transport: authentication/resource/capability/body precedence, forbidden
  owner/price/state/snapshot fields, stable errors and OpenAPI/CORS contract.
- Real PostgreSQL: additive `0009 → 0010 → 0009 → 0010`, ACL/function grants,
  session-derived participants, immutable snapshot trigger, audit rollback,
  concurrent duplicate request/overlap accept, adjacent intervals,
  accept-vs-capability-revoke and pool/cancellation cleanup.
- Live API: tutor offer → student request → tutor accept → both retrieve one
  snapshot; foreign/self/stale-version negatives.
- RU/UK/component/browser: FREE/EXTERNAL disclaimer, loading/empty/error/stale/
  lifecycle states, locale-aware time/money and mobile/accessibility audit.
- Terminal completion: exact two managed Keycloak identities execute the real
  browser → API → PostgreSQL path with no skipped booking phase and exit `0`.

Mocks/support routes remain lower-level evidence and did not substitute for the
terminal live acceptance that closed ET-10.1.

Migration lifecycle меняет только явно названную disposable database
`electro_tutor_test` и требует exact consent marker. Local PASS не является
production backend deployment evidence.

## ET-10.2 required evidence

- Domain/unit: exact FREE/EXTERNAL source mapping, fixed policy-v1 window,
  half-open start/end, role/capability derivation and effective statuses.
- Real PostgreSQL: `0010 → 0011 → 0010 → 0011`, accepted-row backfill,
  constraints/triggers/functions/ACL, atomic accept-issue and cancel-revoke,
  duplicate/concurrent retry and check-vs-revoke linearization. Both live
  issue/revoke and backfill must survive adversarial pre-reservation of a
  client-chosen Booking operation UUID in the global audit namespace; backfill
  asserts exact `service/lesson-access-migration` actor,
  `migration_backfill` reason, null request ID and bounded correlation metadata.
- HTTP: session/UUID/resource/state/invariant precedence, masked third-account
  denial, OpenAPI, no-store and redacted `503` paths.
- RU/UK/component/browser: signed-out/loading/active/not-yet-valid/expired/
  revoked/not-found/dependency states, session-generation invalidation,
  keyboard/mobile/theme/text-expansion checks and no Jitsi/media claim.
- Terminal E2E: tutor and student accept an eligible Booking, both enter the
  protected media-less shell, an unrelated third managed identity is denied,
  and cancellation blocks a new entry. Secret-bearing artifacts remain
  disabled and services must stop on success or failure.

Mocks and direct fixtures cannot replace the real PostgreSQL authorization
negatives or the authenticated three-identity terminal path.

ET-10.2 terminal evidence: manual `pnpm test:e2e:auth` with credentials only in
the local shell executed all four real phases: profiles `7 passed / 3 expected
phase skips`, Booking `6 / 4`, `lesson-access` `6 / 4`, identity-change `6 / 4`.
The required three-identity Access test was not skipped; both Booking
participants entered the protected media-less shell, the unrelated identity
received masked denial, and cancellation blocked a new entry. Build/audits
passed (`18` localized routes, `99` files), runner stopped local services
without deleting volumes, and shell `EXIT_CODE=0`. Prior first-provisioning,
same-document hash re-entry and transient Docker Engine failures were resolved
before this terminal rerun; child output and credentials were never used as
evidence. Accepted RU/UK component states verify exact re-entry requests and
immediate hiding of previous active content.

Fresh closeout: `pnpm test` `142 passed`; `pnpm check`, `pnpm lint`, `pnpm build`
exit `0`; `pnpm test:e2e` and `pnpm test:e2e:root` each `86 passed / 5 expected
phase skips`; production smoke `4 passed`; backend fast `188 passed / 66
deselected`; real PostgreSQL integration `66 passed / 188 deselected`; all
exit `0`, followed by `pnpm backend:stop` exit `0`. Real-DB tests assert grant
issue/revoke audit rows, actor/correlation and rollback on audit failure. A
separate read-only post-integration audit spot-check found no remaining
Booking/grant rows in the isolated test DB and is not claimed as independent
PASS or production evidence.

## ET-10.3 Session gates

The approved `../specs/features/lesson-sessions.spec.md` requires unit state
and DTO/transport checks; real disposable PostgreSQL migration/ACL,
participant/replay/clock-lock/audit-rollback checks; RU/UK component/browser
states; and a mandatory unskipped live `lesson-session` phase in
`pnpm test:e2e:auth`. The live phase must traverse browser → Keycloak → API →
PostgreSQL and observe student-first READY, tutor START at the scheduled DB
boundary, reload, END and foreign-account masking. A static/mock Playwright
pass or root-artifact run is lower-level evidence, not terminal acceptance.

Current local frontend evidence: `pnpm test` 156 passed, `pnpm check` 0
diagnostics, `pnpm lint` and build/audits exit 0; Session mocked browser states
6 passed; `pnpm test:e2e` and `pnpm test:e2e:root` each 92 passed with 5
expected phase-dependent skips, exit 0. The authenticated Session phase and
RU/UK multi-tab/accessibility manual check have not yet been run or confirmed
by the user. Real PostgreSQL `backend:test:integration` passed 72 (189 fast
deselected), including Session HTTP, migration cycle/ACL, post-lock expiry,
audit rollback and lifecycle; `backend:test:fast` passed 189 (72 integration
deselected), both exit 0. `pnpm verify:full` final retry exited 0 with root
browser 92/5, production smoke 4/4 and dependency audit no high findings.
ADR-028 drift tooling is implemented. `pnpm backend:test:fast` passed 194/81
(Ruff/mypy PASS), `pnpm backend:test:integration` passed 72/201, and
`pnpm backend:db:catalog:baseline test` passed independent Alembic parity,
catalog manifest parity and 9 rolled-back column/default/index/predicate,
function body/ACL, trigger, CHECK and table-ACL negatives, all exit 0. The
scratch DB was dropped in the same run. On the existing data-bearing dev DB,
`pnpm backend:db:catalog:diagnose` correctly exits 1 with genuine function
and CHECK drift. Thus repository-wide `backend:check` is not terminal PASS.
`pnpm verify:full` passed restore/code/unit/root-browser/build/smoke phases
but exited 1 at the sandbox-rejected outbound dependency audit; no audit PASS
is claimed for this rerun. Live authenticated Session and manual acceptance
remain NOT RUN. Detailed evidence and user actions are in selected
`STAGES.md`.
