# Testing contract

## ET-10.3 UA-15 preflight — 2026-09-24

- Git: clean `feature/et-10-3-lesson-session`, HEAD `39fc307c`. Docker Engine 29.7.2 started; `docker ps -a`, `docker volume ls`, and both `desktop-linux`/`default` contexts show no `electro-tutor-et103-clone-20260922` container or volume.
- Original `electro-tutor-local-postgres` volume exists and has no attached container; it was not started, mounted or modified. The prior protected archive directory exists, but its ACL denies the current Windows identity access to `preserved-pgdata.tar`, so fresh size/SHA-256/integrity verification cannot be claimed.
- Per the prompt's fail-closed precondition, no clone catalog inventory, caller probe against DB, migration, reverse or terminal gates ran. Historical UA-13/UA-14 evidence below remains historical; it does not prove the current host has a protected clone. The precise recovery action is in `docs/STAGES.md` UA-15.

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

### ET-10.3-FUNCTION-DRIFT-DECISION — clone-only continuation

- Before: catalog `drift` — 10 missing expected, 3 changed expected, 9
  unexpected public functions; Alembic revision `20260915_0012`, accounts 2,
  booking_operations 0. Все 9 точных `public` signatures перечислены выше.
  Protected full inventory `legacy-before.json` (definitions, exact signatures,
  owner, raw ACL, expanded grants, comments, config and tracked dependents):
  33,080 bytes, SHA-256
  `db208bac294e7e7be59793af5a4742a99fe4b5d69931c1d13c7836eec20829d0`.
  Filesystem ACL ограничен owner/SYSTEM/Administrators; SQL bodies и PII не
  опубликованы в repository.
- Clone `electro-tutor-et103-clone-20260922` на `127.0.0.1:55433`:
  транзакционно перенесены ровно эти 9 signatures в
  `et103_legacy_archive_20260922`. Schema owner `electro_tutor_migrator`, ACL
  только `{electro_tutor_migrator=UC/electro_tutor_migrator}`; function DROP не
  выполнялся. Первый обратный `SET SCHEMA public` для всех 9 прошёл; full
  `legacy-after-rollback.json` побайтово равен before (те же 33,080 bytes и
  SHA-256). Следовательно definitions, owner, ACL/grants, comments и signatures
  восстановлены точно. Отсутствие tracked PostgreSQL dependencies не доказывает
  отсутствие внешних callers.
- После второго переноса 9 функций catalog показывал 10 missing, 3 changed,
  `unexpected_count=0`. Изолированная пустая
  `electro_tutor_catalog_baseline` создана только внутри clone и успешно
  мигрирована штатным Alembic до `20260915_0012`; запрещённое config guard
  произвольное имя `et103_migration_reference_20260922` оставлено пустым и не
  использовалось. До изменения существующих canonical functions сохранён
  `changed-canonical-before.json` (3 definitions/owner/ACL/comments): 11,638
  bytes, SHA-256
  `9e57ab20e8301cf460be52d27b48d3bf600e91f899167df37ce556a948890354`.
- New blocker: у существующей `public.read_booking_operation(uuid)` return
  table заканчивается `result_version integer, completed_at timestamptz`, а
  canonical migration baseline содержит дополнительный
  `result_payload jsonb` перед `completed_at`. Совместимые return types у
  существующих `accept_booking` и `cancel_booking` подтверждены, но для
  `read_booking_operation` PostgreSQL `CREATE OR REPLACE` не может изменить
  return type. Потребовался бы отдельный перенос/удаление десятой функции;
  такое действие не входит в утверждённый список девяти. Canonical repair SQL
  не применялся, функция не DROP и не перемещалась. Это новый human checkpoint
  `ET-10.3-UA-13`.
- Fail-closed rollback: все 9 повторно возвращены в `public`; финальный
  `legacy-after-abort.json` снова побайтово совпадает с before и reverse
  inventory (SHA-256 выше). Archive schema сохранена закрытой и пустой.
  Final catalog `drift`: 10 missing, 3 changed, 9 unexpected; clone
  `alembic check` PASS (`No new upgrade operations detected`), accounts 2,
  booking_operations 0, revision `20260915_0012`. Full `backend:check`,
  ET-10.3 integration/security и live Keycloak/API/browser не запускались:
  catalog prerequisite не восстановлен.
- Protected evidence directory outside Git:
  `ET-10.3-20260922T204420Z-function-rehearsal` (четыре JSON inventories).
  Original backup по-прежнему 99,788,800 bytes и SHA-256
  `aa5d1fa75a53d94f09181347b3c70e627abefbb53d99f85bbe0265e7a78f8bc1`;
  read-only `tar --compare` подтвердил byte-equal original volume после
  function rehearsal. MathMorph не изменён и остаётся на `55432`.

### ET-10.3-UA-13 — active replay contract, fail-closed before transfer

- Clone ownership verified: `electro-tutor-et103-clone-20260922` mounted only
  its own volume on `127.0.0.1:55433`; preserved container remained `Created`,
  MathMorph stayed healthy on `55432`. Protected evidence directory outside Git:
  `ET-10.3-UA-13-20260923T002526`, ACL owner/SYSTEM/Administrators only.
  `functions-before.json` inventories all 10 exact signatures with complete
  definitions, owners, raw/expanded ACL, comments, OUT arguments, volatility,
  security settings and tracked dependency counts: SHA-256
  `e03cdd1a5cbef1ad6c02e12221125715479316111a1b286f11d68ed6de5b62e5`.
  Full `schema-before.sql` (schema-only `pg_dump` with owner/grants/comments):
  152,937 bytes, SHA-256
  `5f533d00ab3f003f8e76ac055cc756d2f0d7ef0d98c041341bca7e767064370b`.
- Exact current `public.read_booking_operation(uuid)`: owner
  `electro_tutor_migrator`; EXECUTE only for migrator/runtime; `LANGUAGE sql`,
  `STABLE SECURITY DEFINER`, `search_path=pg_catalog`, no comment. Return has
  8 OUT columns ending `result_version integer, completed_at timestamptz`.
  Its protected definition SHA-256 is
  `6bbe2da7f079892950e3ef5b820a5e3342494fc1670761df555bbb825ac78211`.
  Migration-built canonical reference adds `result_payload jsonb` before
  `completed_at` and LEFT JOINs TutorOffer/Booking to rehydrate participant IDs;
  definition SHA-256
  `4bf9db3efce71d225d317d917cacf8fda4af2d1a47c178dee92a773e904d2d55`.
  Reference definition/attributes saved as `read-canonical-reference.json`.
- PostgreSQL `pg_depend` graph: 0 tracked inbound, 1 outbound namespace edge
  to `public`; `dependencies.json` SHA-256
  `e7252b7dd5f82e1b10275e32948acb89f5bfdf34e33b52193cd6a87943575ae6`.
  Clone user-defined SQL/PLpgSQL body scan found no literal target reference
  or simple `EXECUTE`/`format(`/`quote_ident` marker; saved as
  `db-callers.json`. First regex attempt exited 1 on an invalid pattern;
  corrected literal scan exited 0. Neither catalog dependencies nor body search
  proves absence of external/dynamically constructed callers.
- Repository-wide tracked search found one active production call in
  `services/api/src/electro_tutor_api/adapters/booking_repository.py`:
  `_operation_from_row` requires `result_payload` for TutorOffer/Booking
  idempotent replay; `application/bookings.py` invokes this replay path.
  Dynamic transition-name construction targets an explicit different function
  set. Migration `20260914_0010` (introduced by `ce650ea`) defines the
  9-column canonical function and runtime grant; no tracked migration defines
  the clone's 8-column variant. Booking SPEC and integration/HTTP tests require
  exact historical retry. Therefore this function is an active runtime contract,
  not catalog residue. `booking_operations=0` in clone does not remove future
  replay incompatibility; `pg_stat_statements` is absent, so historical external
  SQL callers cannot be established.
- Fail-closed trigger: legacy function returns metadata only; canonical
  function returns payload and participant rehydration. This is a data-semantic
  difference for an existing consumer, explicitly requiring stop under UA-13.
  The tenth function was **not moved**; none of the first nine was moved in
  this continuation. No canonical repair or rollback mutation occurred. Archive
  schema remains empty, public function count 45, accounts 2, operation rows 0,
  revision `20260915_0012`. Redacted `db-catalog-diagnose` exited 1 with the
  unchanged 10 missing / 3 changed / 9 unexpected function drift.
- Evidence commands/results: `pg_isready`, ten-function inventory, schema-only
  `pg_dump` and corrected dependency/caller scans exited 0; before/after
  ten-function JSON SHA-256 matched exactly. Two `pg_dump` files differ only in
  the generated `\restrict`/`\unrestrict` markers; after excluding these
  two lines, both 2,472-line snapshots have SHA-256
  `9e2b82794bd87e251279887b0bb3b5ff74100fed01582197a0b96d8664fb0279`.
  Exact redacted command/SQL transcript with exit codes is protected beside
  the inventories as `command-transcript.md`, SHA-256
  `86d7b0e74c0e99166f968e4a1f3edb6044eee5ec0ed9a3b7ce4c84aad81019d3`.
  Full `backend:check`, ET-10.3 integration/security, authenticated E2E and
  post-repair catalog/Alembic gates were **NOT RUN**: repair prerequisite was
  deliberately not met. This is not a successful repair/rollback rehearsal.
- Preserved source volume again matched the original protected archive via
  read-only `tar --compare` (exit 0); backup remains 99,788,800 bytes and
  SHA-256 `aa5d1fa75a53d94f09181347b3c70e627abefbb53d99f85bbe0265e7a78f8bc1`.
  Clone volume retained and its container stopped cleanly; MathMorph was not
  stopped/reconfigured. New decision owner: `ET-10.3-UA-14` in `docs/STAGES.md`.

### ET-10.3-UA-14 — replay contract decision, no catalog repair

- Scope/environment: branch `feature/et-10-3-lesson-session`, starting HEAD
  `2af236a`; only the saved clone container/volume on `127.0.0.1:55433` was
  started. The preserved source container remained `Created`; MathMorph stayed
  on `55432`. The runtime clone database `electro_tutor` was queried only in
  read-only transactions; integration tests wrote only to its separate
  disposable `electro_tutor_test` database. No function was moved or replaced.
- Consumer inventory (`git grep` across tracked Python, SQL, tests, scripts,
  E2E support, and docs): the sole direct runtime call is
  `adapters/booking_repository.py:54-60`, `SELECT * FROM
  public.read_booking_operation(CAST(:operation_id AS uuid))`, decoded at
  `:406-424`. The decoder requires `result_payload` and builds a historical
  `TutorOffer` or `Booking` with participant IDs. Indirect callers are
  `_offer_replay` for create/revise/publish/retire, `_booking_replay` for
  request/accept/decline/cancel, and `application/bookings.py` preflight,
  request and reservation-conflict reconciliation. Missing operation returns
  `None`; an existing same-actor/same-intent operation returns the persisted
  result, while mismatched action/target/digest conflicts. HTTP, browser and
  tests reach this path through the service, not direct SQL. Migration `0010`
  is the only tracked function definition; no tracked script, maintenance
  command, documented external SQL interface, or other stored SQL/PLpgSQL
  caller was found. UA-13's `pg_depend`/body scan found no tracked inbound
  dependency, but that does **not** establish absence of external/dynamic SQL
  callers; `pg_stat_statements` is unavailable.

  | Consumer | Call shape and required semantics |
  |---|---|
  | `booking_repository.py:54-60,406-424` | One UUID → zero/one mapping; requires all eight metadata fields plus `result_payload`, reconstructs participant IDs and historical domain result; zero rows → `None`. |
  | `booking_repository.py:71,106,150,170-189` | Offer create/revise/publish/retire `_offer_replay` reads operation first; exact action/digest/target → persisted `TutorOffer`; different intent → conflict; missing → new mutation. |
  | `booking_repository.py:209,272,295-315` | Booking request/transition `_booking_replay` similarly requires persisted `Booking` and its tutor/student IDs, including exact retry. |
  | `application/bookings.py:88,228,380` | Request preflight, request retry and reservation-conflict reconciliation invoke `booking_operations.get`; missing result follows normal rejection/mutation path, exact replay uses original result. |
  | `test_bookings_integration.py`, `test_booking_http_integration.py`, `tests/e2e/auth-flow.spec.ts` | Indirect service/HTTP/browser contract; none calls the SQL function directly. |
- Provenance: `git log --all --follow` shows `0010` introduced in `ce650ea`
  already with the nine-column function. `git log -S/-G`, migration file
  history, reflog and unreachable-commit inspection found no eight-column
  revision or tracked migration deletion/squash. Physical backup and UA-13
  schema dumps prove only observed catalog state. Origin/author/time of the
  clone eight-column body are **UNKNOWN**; out-of-band DDL is an inference,
  not an established fact.
- Semantic diff: both functions take one UUID, return the same seven leading
  metadata fields and `completed_at`, are SQL `STABLE SECURITY DEFINER`,
  owner `electro_tutor_migrator`, `search_path=pg_catalog`, with EXECUTE only
  for migrator/runtime and no comment. Both filter operation UUID and
  `actor_account_id=current_session_account_id()`; absent/foreign operation
  yields no row and no function-specific exception. Clone returns eight
  metadata-only columns with no JOIN. Canonical `0010` returns nine columns,
  inserting `result_payload jsonb` before `completed_at`; it merges the
  stored payload with current `tutor_offers`/`bookings` participant IDs via
  `LEFT JOIN`. A missing target leaves joined IDs null, not an omitted row;
  the adapter requires a decodable object/participant fields. These are
  materially different replay semantics despite identical owner/ACL/security.
  The current Python adapter cannot handle an existing operation on the
  eight-column function: `_operation_from_row` indexes the missing key before
  checking action/intent, producing `KeyError`; only absent-operation calls
  avoid that decoder.
- Test-first evidence: new
  `test_booking_operation_contract_integration.py` asserts the ordered nine
  fields, `result_payload jsonb` return type, absent operation, owner,
  volatility, SECURITY DEFINER and `search_path`. Its second test creates an
  operation in disposable DB, verifies the stored payload excludes participant
  IDs, then verifies the function rehydrates the exact tutor/student IDs,
  returns historical `REQUESTED` after target transition to `ACCEPTED`, and
  returns no row to a foreign actor or for an absent UUID. Against
  `electro_tutor` on clone the read-only projection test **FAILS** (exit 1):
  index 7 is `completed_at`, not `result_payload`. Direct read-only
  `SELECT result_payload FROM public.read_booking_operation(...)` likewise
  fails `column does not exist`; absent-operation count is 0. Both DB tests
  on canonical disposable `electro_tutor_test` passed `2/2` (exit 0). An
  earlier run of projection + existing historical replay integration passed
  `2/2` (exit 0); existing two-account HTTP snapshot/authorization passed
  `1/1` (exit 0), including exact booking retry. Ruff and mypy on the new
  test passed. Final combined run of three new tests (including an offline
  URL query-redirection negative) plus the historical booking and two-account
  HTTP tests passed `5/5` (exit 0): four against the disposable database and
  one offline; the final clone-runtime projection probe still failed exactly at
  missing `result_payload` (pytest exit 1, `1 failed / 2 deselected`).
  A first test run failed only because PostgreSQL `provolatile` is delivered
  as `bytes`; that assertion was corrected before the reported passing run.
  One immediate test attempt after restarting PostgreSQL failed
  `CannotConnectNowError` during startup; rerun after `pg_isready` passed.
- Reproduction commands (connection passwords omitted): set
  `ET_BOOKING_OPERATION_CONTRACT_URL=postgresql+asyncpg://<migrator>@127.0.0.1:55433/electro_tutor`,
  then `python -m pytest services/api/tests/test_booking_operation_contract_integration.py -q -k matches_repository_projection --tb=short`
  → expected exit 1, `1 failed / 2 deselected`. The test rejects any override
  except the exact loopback clone host/port/database/migrator role, and rejects
  all URL query parameters: asyncpg can otherwise redirect with `?port=55432`.
  Offline `test_contract_override_rejects_query_redirect` passed (exit 0).
  For the
  positive path, set `ET_TEST_POSTGRES_PORT=55433` and the three existing
  `ET_TEST_DATABASE_URL`, `ET_AUTH_DATABASE_URL`, `ET_MIGRATION_DATABASE_URL`
  variables to their role-specific `electro_tutor_test` URLs; run
  `python -m pytest services/api/tests/test_booking_operation_contract_integration.py -q`
  → exit 0, `3 passed`. Additional exact nodes run with exit 0:
  `test_bookings_integration.py::test_real_booking_snapshot_and_historical_idempotent_result`
  and `test_booking_http_integration.py::test_booking_http_real_two_account_snapshot_and_authorization`.
  The latter requires `ET_CONFIRM_MIGRATION_LIFECYCLE=electro-tutor-local`.
  No test above targets preserved dev DB.
- Compatibility decision: **CASE C / fail closed**. Exact canonical replacement
  fixes the current adapter but PostgreSQL cannot `CREATE OR REPLACE` an
  eight-column `RETURNS TABLE` with nine columns; archiving the old function
  and creating the new one under the same signature changes `SELECT *` row
  shape and may invalidate unknown SQL clients/prepared plans. Moving both
  functions transactionally can be rolled back before commit; post-commit
  reverse is a separate DDL deployment with caller exposure. A wrapper or
  compatibility view cannot simultaneously return both shapes at the same
  name and UUID signature. A versioned `read_booking_operation_v2(uuid)` plus
  application-first switch can retain the old public function for unknown
  callers, but needs a new approved migration/manifest contract and eventual
  deprecation; app rollback to the eight-column path would still break
  persisted replay. Coexistence deliberately leaves ADR-028 catalog parity
  FAIL until a separately approved retirement/replacement of the original
  signature. DB-first exact replacement risks legacy SQL callers;
  application-first fallback cannot reconstruct an immutable persisted result
  from metadata alone. Dual-compatible rollout is possible only with two
  explicit names and coordinated app/DB deployment, not transparent for an
  unknown one-argument SQL consumer. None is proven safe for existing external
  callers, so no tenth-function transfer, canonical repair or catalog gate
  rerun occurred. Prior catalog result remains FAIL: 10 missing / 3 changed /
  9 unexpected. Full `backend:check`, ET-10.3 security suite and authenticated
  live E2E were **NOT RUN** after repair because no repair occurred.
- NEXT human checkpoint: choose an external-caller compatibility policy with
  evidence (inventory of runtime-role SQL clients/logged calls or explicit
  acceptance of their potential breakage), then approve an exact clone-only
  versioned/dual-compatible or replacement rehearsal with pre/post inventory,
  transactional reverse and full tests. This does not authorize any action on
  the preserved dev DB.
- Final safety check: `docker inspect` confirmed the saved clone mounts only
  `electro-tutor-et103-clone-20260922` at `127.0.0.1:55433`; original
  `electro-tutor-local-postgres-1` remained `Created`, MathMorph `api-postgres-1`
  remained healthy on `127.0.0.1:55432`. After tests, only the clone was
  stopped. Read-only `tar -C /source -dpf /backup/preserved-pgdata.tar` with
  source volume and protected backup mounted read-only returned exit 0
  (`source_unchanged=yes`); original backup remains 99,788,800 bytes, SHA-256
  `aa5d1fa75a53d94f09181347b3c70e627abefbb53d99f85bbe0265e7a78f8bc1`.
  Clone runtime DB still had accounts 2, booking operations 0, empty archive,
  and the original eight-column signature. The clone volume itself changed
  during PostgreSQL startup and disposable test-DB writes; no claim of
  byte-equal clone volume is made.

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
