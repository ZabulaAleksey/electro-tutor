# Поэтапный запуск Electro Tutor

Этот файл — операционный протокол, а не источник требований. SPEC отвечает на
вопрос «что должна делать система», ROADMAP — «в каком порядке», AI_PLAN — «что
делаем сейчас».

## TUTOR-00 — Полная инвентаризация и reconciliation

Статус: `completed` (`validated locally`, 2026-08-27)

Dependencies: отсутствуют. Entry precondition: brownfield repository доступен
read-only, package manager и baseline commands определимы.

Runnable slice: классифицировать production/legacy/experimental contours,
routes, content, tests, CI/deploy и known risks без product mutations. Concrete
end-to-end evidence: pinned project toolchain выполняет check, lint, unit,
production build, lesson audit и Chromium E2E; findings имеют ID, severity,
reproduction и target stage.

PASS evidence и acceptance artifact: `docs/notes/stage-0-baseline.md`.
Temporary implementation не требуется. Deferred scope: все исправления findings.
Rollback: удалить только audit/status documentation commit; product artifact не
менялся.

## TUTOR-01 — Канонический локальный контекст

Статус: `completed` (`validated locally`, 2026-08-27)

Dependency DAG: `TUTOR-00` completed. Entry preconditions: baseline findings
`T0-CTX-001` и brownfield reconciliation доступны локально.

Runnable vertical slice: команда `Продолжай Electro Tutor` разрешается только
через существующий `prompts/STAGES.md` и актуальные repository status/plan/SPEC,
без удалённого или machine-local `STAGED_PROMPTS.md`.

Concrete end-to-end scenario: новый session на clean clone читает `AGENTS.md`,
находит `TUTOR-02` как следующий допустимый stage, не выбирает blocked ET-stage
и получает воспроизводимые команды проверки.

Scope: semantic/link reconciliation, source-of-truth matrix, cross-device
continuation, context/overlay validation. Non-goals: product fixes
`T0-APP-001..T0-DEP-001`, новые hooks/MCP/agents/runtime services. Допустимая
temporary implementation: отсутствует — local route должна быть полностью
рабочей. Deferred scope: production boundary и остальные findings.

PASS: active links не указывают на отсутствующий stage file; selector и relative
links однозначны; `pnpm check:context`, SessionStart hook, overlay/context checks
и `git diff --check` проходят. Rollback: один context-only commit.

Acceptance evidence: `AGENTS.md`, `README.md`,
`specs/features/context-automation.spec.md`, `docs/project-context.md`, ADR-011
`scripts/validate-context-route.mjs`, SessionStart output и project overlay
validation. Product behavior/runtime code не изменялись.

## TUTOR-02 — Production boundary и судьба Vite SPA

Статус: `completed` (`validated locally`, 2026-08-27)

Dependency DAG: `TUTOR-01` completed. Entry preconditions: findings
`T0-APP-001`, production Astro build и transitional
`MeshLessonIsland → legacy-pages/MeshLesson` подтверждены локально.

Runnable vertical slice: один очевидный production frontend command и один
deployment build path. Неиспользуемый Vite SPA либо безопасно удалён после
import/script/history audit, либо изолирован как самостоятельный
archive/experimental contour с доказанной ответственностью и отдельным
build/test contract.

Concrete end-to-end scenario: clean frozen install запускает канонический build,
генерирует Astro RU/UK artifact и проходит существующие unit/integration,
component/static и Chromium E2E; repository не содержит orphan scripts/imports
или второго неописанного production entrypoint.

Scope: evidence-based ADR, `index.html`, `src/main.tsx`, `src/App.tsx`,
`src/legacy-pages/**`, Vite/TypeScript configs, package scripts, README,
architecture/decisions/status и затронутые tests. Сначала отделить используемый
`MeshLesson` seam от мёртвого SPA shell.

Non-goals: Next.js, переписывание Astro, новый framework, исправления
URL-state/RU-UK/base-path/CI следующих stages. Допустимая temporary
implementation: явно изолированный и самостоятельно проверяемый legacy contour;
не допускается скрытый второй production path. Deferred scope: findings
`T0-URL-001`, `T0-LOC-001`, `T0-BASE-001`, `T0-REL-001`, `T0-SEO-001`.

PASS: ADR фиксирует решение и альтернативы; один production command и deployment
path; clean restore, check, lint, unit/integration, build, lesson audit и E2E
проходят; orphan references отсутствуют. Rollback: вернуть единый Stage 2 commit
без изменения пользовательского контента.

Acceptance evidence: ADR-012, `docs/ARCHITECTURE.md`, удалённый orphan SPA shell
и отдельные configs; frozen install, Astro check, ESLint, 38 tests, 15-page
build, lesson audit и 21 Chromium E2E прошли. Production seam
`MeshLessonIsland → legacy-pages/MeshLesson` сохранён.

## TUTOR-03 — Версионированный URL/state круговой диаграммы

Статус: `completed` (`validated locally`, 2026-08-27)

Dependency DAG: `TUTOR-02` completed. Entry preconditions: finding
`T0-URL-001`, текущая математическая модель и browser query-state tests доступны.

Runnable vertical slice: одна типизированная версия URL/state schema управляет
чтением, валидацией, нормализацией и канонической сериализацией состояния
круговой диаграммы. UI, URL, history, saved/imported state используют одинаковые
domain limits; недоверенный URL не обходит инварианты.

Concrete end-to-end scenario: пользователь открывает допустимую share-ссылку,
видит соответствующее состояние, меняет параметры, проходит back/forward и
reload без расхождения UI/URL. Невалидная или неизвестная версия безопасно
переходит к defaults/понятному сообщению и каноническому URL.

Scope: поля, типы, ranges, enums, defaults, version, unknown-version policy,
duplicate/unknown keys, canonical ordering/encoding и maximum size; pure
`parse → validate → normalize → canonicalize`; `replaceState` для частых и
`pushState` для смысловых переходов; unit/property/boundary, component и E2E.

Non-goals: новый backend, аккаунты/saved presets, исправление RU/UK/base-path/CI,
редизайн диаграммы. Допустимая temporary implementation: только полностью
рабочий локальный adapter над существующим UI; нельзя доверять значениям
`URLSearchParams` напрямую. Deferred scope: остальные Stage 0 findings.

PASS: NaN/Infinity, огромные/отрицательные числа, duplicate/unknown keys,
encoded payload и unknown version не нарушают limits; канонизация стабильна и
идемпотентна; старые допустимые ссылки продолжают работать либо детерминированно
мигрируют; back/forward/reload и share-link проходят живой E2E. Rollback: один
Stage 3 commit без изменения content contract.

Acceptance evidence: feature-SPEC, ADR-013, pure state module, 18 новых
boundary/property tests и 4 новых browser scenarios. Полный pipeline: Astro
check 49 файлов, ESLint, 56 unit/integration tests, 15-page build, lesson audit
и 25 Chromium E2E — PASS.

## TUTOR-04 — Реальный production-контракт RU/UK

Статус: `completed` (validated locally, 2026-08-27)

Dependency DAG: `TUTOR-03` completed. Entry preconditions: production Astro
routes обеих локалей, system locale contract, парный lesson manifest и
канонический URL-state доступны.

Runnable vertical slice: один locale source of truth управляет production Astro
routes, UI strings, metadata, errors и aria-labels. Build-time validation ловит
missing/extra keys, а RU/UK artifact и share URL проходят живой browser path.

Concrete end-to-end scenario: пользователь открывает одинаковый смысловой route
на RU и UK, переключает локаль с сохранением валидного versioned query/hash и
видит локализованные metadata, controls, errors и accessibility names без
fallback в чужой язык.

Scope: locale source, route strategy/fallback, canonical/hreflang, форматирование
чисел/единиц/дат, полный inventory пользовательского текста и CircularDiagram,
предметный glossary, build-time parity validation, fallback tests и RU/UK E2E.

Non-goals: машинный перевод без предметной проверки, новые локали, base-path
portability, deploy gates и новый content model. Допустимая temporary
implementation: существующие Astro routes при условии единого проверяемого
locale contract; нельзя оставлять production strings в мёртвом legacy contour.

PASS: production artifact содержит обе локали; locale switch сохраняет
смысловой route и canonical interactive state; metadata/canonical/hreflang
корректны; missing/extra/untranslated contract keys блокируют build/tests;
full static/unit/component/E2E pipeline проходит. Rollback: один Stage 4 commit.

Acceptance evidence: `features/localization.spec.md`, ADR-014, 156 paired locale
keys, formatter/fallback tests, 14-route artifact audit и full Chromium RU/UK
matrix. Pipeline: Astro check 56 files, ESLint, 62 unit/integration tests,
15-page build, lesson audit и 42 Chromium E2E — PASS.

## TUTOR-05 — Base-path portability и GitHub Pages project-site

Статус: `completed` (validated locally, 2026-08-27)

Dependency DAG: `TUTOR-04` completed. Entry preconditions: единый Astro artifact,
versioned share URL, RU/UK semantic routes и locale SEO contract подтверждены.

Runnable vertical slice: один base/site URL contract управляет build config,
routes и assets; root и non-empty-base artifacts проходят автоматический audit.

Concrete end-to-end scenario: пользователь открывает RU/UK interactive deep
link под project base, получает assets, переключает язык с сохранением query/hash
и обновляет страницу без 404.

Scope: inventory root-absolute links/assets/canonical/redirects/fetch/router и
service-worker paths; config/helpers для base/site; deep links, locale routes,
share URLs, 404 behavior; non-empty-base smoke и broken link/asset audit.

Non-goals: deploy, production domain/DNS, CI quality gates `TUTOR-06`, изменение
locale/content/URL-state schemas. Допустимы текущие hosting adapters при
доказанной работе обоих artifact modes; future domain не хардкодится.

PASS: root и project-base artifact открывают home/nested/interactive direct
links; locale/share/reload сохраняют path/query/hash; internal assets и service
worker scope не дают 404; localhost/machine-local URL не протекают. Rollback:
один Stage 5 commit без deploy.

Acceptance evidence: `features/base-path-portability.spec.md`, ADR-015,
base/site validators и helpers, root artifact audit 91 files, project-base
artifact audit 91 files, 4 project-base Chromium E2E и полный root Chromium
набор. Static, unit/integration/component и оба production builds — PASS.

## TUTOR-06 — Обязательные quality gates перед публикацией

Статус: `completed` (`deployed`, 2026-08-31)

Dependency DAG: `TUTOR-05` completed. Entry preconditions: единый Astro artifact,
root/non-empty-base contracts и frozen pnpm install подтверждены.

Runnable vertical slice: одна локальная full-verify command и эквивалентный CI
job выполняют format/diff hygiene, static checks, lint, unit/integration/component,
build, live E2E smoke и configured dependency/security checks; deploy получает
проверенный artifact только после всех обязательных gates.

Concrete end-to-end scenario: broken type, unit test или E2E smoke останавливает
deploy DAG; исправленная версия проходит тот же pipeline и публикует artifact,
созданный verify job.

Scope: CI/local parity, порядок gates, deploy dependency, artifact hand-off,
frozen install, cache, concurrency cancellation, minimal permissions и README
full-verify command.

Non-goals: фактический deploy, production domain/DNS, product behavior changes,
скрытие flaky tests через retry или skip, новый scanner без отдельной оценки.

PASS: negative gate probes блокируют deploy; green pipeline передаёт ровно один
checked artifact; local/CI gates совпадают; permissions/cache/concurrency
проверены. Rollback: один Stage 6 commit без deploy.

Acceptance evidence: `pnpm run verify:full` и GitHub Actions run `33387890612`
на commit `d22b597` с production `SITE_URL`/`BASE_PATH` прошли; 82
unit/integration/component tests, 46 Chromium E2E на транзитном root-artifact
в `dist/`, 4 project-base smoke по production `dist/`, artifact audits и
dependency audit — PASS. Workflow contract tests
проверяют удаление обязательных gates, bypass full verify, deploy dependency и
deploy-side rebuild. Verify и Pages deploy завершились успешно:
`https://github.com/ZabulaAleksey/electro-tutor/actions/runs/33387890612`.

## Контракт будущего AI-native platform track

Records `ET-08` и `ET-09.1+` дополняют, а не обходят текущий stabilization
track. Перед запуском любого record исполнитель обязан подтвердить terminal
status всех listed dependencies, развернуть диапазоны Behavior IDs в точные
acceptance criteria затрагиваемой SPEC и заменить все ещё открытые architectural
choices утверждёнными ADR. Наличие record со статусом `planned` не является
разрешением начать его до prerequisites.

Общий terminal DoD для каждого stage: implementation/documentation complete;
format/lint/typecheck и релевантные unit/integration/component/real E2E PASS;
negative security cases и migration lifecycle PASS; rollback/recovery известны;
observability не раскрывает secrets/private content; RU/UK и accessibility
проверены для user-facing surface; Completion Documentation Synchronization Gate,
diff/status/secret review выполнены. Недоступный primary provider/backend/browser
gate оставляет `blocked`, `partial` или `implemented_unverified`.

## ET-08 — Завершение public release hardening

Статус: `completed` (`deployed`, 2026-08-31).

- **Goal / why now:** после `TUTOR-06` подтвердить единый GitHub Pages release
  contour и закрыть public static release до начала backend platform track.
- **Dependencies / entry:** `TUTOR-06` completed; production inputs и Pages URL
  подтверждены; operator явно разрешил push `main` и Pages deploy.
- **Runnable slice / E2E:** source change → full local/CI verify → checked Pages
  artifact → RU/UK/PWA/responsive/security live checklist с наблюдаемым PASS.
- **Scope / non-goals:** release checklist, installed service-worker update,
  evidence reconciliation; без backend, auth, native media, payments или AI.
- **Modules / expected files:** current Astro/CI/PWA/tests и существующие
  SPEC/README/architecture/security/state docs; новые runtime services не нужны.
- **DB / migration:** отсутствуют.
- **Security / fallback / risks:** deploy только по явному разрешению; красный
  gate не обходится smoke или retry; риск — ложный release claim без run/commit evidence.
- **Behavior IDs:** текущие `FR-001..010`, `NFR-001..006`, `AC-001..009`.
- **Tests / manual:** unit/integration, component/static, full Chromium E2E,
  production-like build и artifact audits; manual live Pages/PWA только если
  разрешены. DB/provider tests неприменимы.
- **Observability / docs:** сохранить workflow URL/SHA, artifact scope и caveats;
  синхронизировать README, SPEC/state/roadmap/stage source при изменившихся фактах.
- **Temporary / rollback / risks:** temporary implementation `none`; rollback —
  revert одного hardening commit без production mutation; future backend не
  может впервые сделать этот static release проверяемым.
- **DoD / deferred:** общий DoD + closed `T0-REL-001`; все AI-native capabilities
  deferred to `ET-09.1+`.

Completion evidence: local `pnpm run verify:full`, GitHub Actions verify/deploy
run `33387890612` на SHA `d22b597`, checked Pages artifact и live Chromium
checklist — PASS. Live подтверждены RU/UK state-preserving switch, PWA assets,
active controller/scope `/electro-tutor/`, cache `potential-pwa-v2`, mobile
390x844 без horizontal overflow и отсутствие console errors. Смена активного
worker и offline policy доказаны accepted versioned Playwright E2E; live
`registration.update()` подтвердил актуальный activated production controller.

## ET-09.1 — Architecture/reuse audit и platform contract

Статус: `completed (validated locally, 2026-08-31)`.

- **Goal / why now:** превратить future vision в проверенный target contract до
  выбора backend/provider и code scaffolding.
- **Dependencies / entry:** `ET-08` completed; Electro Tutor и MathMorph доступны
  read-only; draft platform SPEC и current repository evidence доступны.
- **Runnable slice / E2E:** repository + user vision → audit/reuse classifier →
  approved SPEC/architecture/ADR/DAG/traceability → context validator однозначно
  выбирает `ET-09.2`.
- **Scope / non-goals:** current/target maps, gap and conflict audit, domain/data/
  provider/security/privacy/integration boundaries, feature classification,
  first release slice; без product/backend/provider implementation и без mutation
  MathMorph.
- **Modules / expected files:** existing `specs/`, `docs/ARCHITECTURE.md`,
  `DECISIONS.md`, `SECURITY.md`, optional justified `TRACEABILITY.md`, roadmap,
  stage source и state docs; не создавать параллельные architecture files.
- **DB / migration:** data model and migration policy only; no schema mutation.
- **Security / fallback / risks:** threat/privacy/cost atlas и fail-closed choices;
  unavailable cross-project evidence маркируется `NOT VERIFIED`, не угадывается.
- **Behavior IDs:** `PLAT-001`, `AUTH-004`, `INT-002`.
- **Tests / manual:** structural/spec/link/context validators; human semantic DAG,
  source ownership, MathMorph conflict and provider-alternative review; unit/UI/DB
  tests неприменимы к docs-only slice.
- **Observability / docs:** decision status, evidence provenance и open questions;
  update all changed canonical planning/architecture sources.
- **Temporary / rollback / risks:** temporary `none`; rollback — один docs commit;
  риск — принять vendor example за решение без ADR/evidence.
- **DoD / deferred:** общий docs-stage DoD + approved executable `ET-09.2` contract;
  all implementations remain deferred.
- **Completion evidence:** current/target architecture, ADR-019/020/021,
  threat/privacy/cost atlas, `TRACEABILITY.md` и SPEC v0.2 синхронизированы;
  read-only MathMorph audit выполнен по immutable commit `0fa90c7`; `pnpm.cmd run
  check:context`, project overlay validator и `git diff --check` — PASS. Новых
  Markdown links нет, поэтому link gate — N/A. Unit/UI/DB tests неприменимы к
  docs-only slice. Независимые architecture, security и final review gates — PASS.

## ET-09.2 — Backend/API/DB walking skeleton

Статус: `planned`.

- **Goal / why now:** создать минимальный modular-monolith runtime, на котором
  следующие domain stages получают real API/database path.
- **Dependencies / entry:** `ET-09.1` completed; backend stack/workspace, API
  version, database, local services, DX and deployment boundaries approved by ADR.
- **Runnable slice / E2E:** canonical command → running API → versioned health/
  diagnostic endpoint → real PostgreSQL `SELECT 1`/schema metadata → stable response.
- **Scope / non-goals:** app factory, config validation, stable error/request ID,
  migration/runtime roles, one repository/service path, diagnostics, local/CI
  parity; без auth, profiles, booking, queue, Redis or microservices.
- **Modules / expected files:** `services/api/`, service-local `pyproject.toml`/
  `uv.lock`, root `package.json` scripts и `compose.yaml`, migrations, local
  orchestration, CI/scripts, API/data/security/
  Backend DX delta docs and tests.
- **Approved foundation:** Python `>=3.12`, FastAPI, Pydantic Settings, async
  SQLAlchemy + asyncpg, Alembic, PostgreSQL 17; modular monolith; `/api/v1`;
  root pnpm orchestration + service-local uv; local/CI only.
- **Canonical commands/ports:** `backend:bootstrap/build/check/dev/stop/logs/
  status/doctor/smoke/test:fast/test:integration/db:status/db:migrate/
  db:reset-local`; API `127.0.0.1:8000`, PostgreSQL host-only
  `127.0.0.1:55432`; CI reuses root scripts.
- **DB / migration:** initial reversible schema lineage; separate migration and
  least-privilege runtime roles; disposable upgrade/downgrade lifecycle evidence.
- **Security / fallback / risks:** bounded config/body/errors; DB outage returns
  stable redacted `503`, never in-memory success; exact CORS allowlist, API
  `no-store`; loopback/no-LAN safe defaults; strict request ID; sentinel-secret
  redaction; destructive DB actions deny by default; secrets only environment/
  secret store.
- **Behavior IDs:** `PLAT-002`, `OPS-001`, `DB-001`.
- **Tests / manual:** unit config/error tests; real PostgreSQL integration and
  migration lifecycle; API component tests; E2E canonical command → HTTP → DB;
  negative network/config/redaction/destructive-action tests; Python lock-drift
  and vulnerability gate; manual diagnostics/readiness inspection.
- **Observability / docs:** request ID, safe DB readiness latency/error class;
  README setup, architecture, API/data/security, project-context and state.
- **Temporary / rollback / risks:** fully working local PostgreSQL composition is
  allowed; no SQLite/mock primary. Rollback removes new runtime and reverses only
  disposable migration; risk — overbuilding infrastructure before domain value.
- **DoD / deferred:** common DoD + clean-clone restore and client/command→API→DB
  PASS; identity/jobs/providers deferred.

## ET-09.3 — Identity/OIDC vertical slice

Статус: `planned`.

- **Goal / why now:** establish provider-neutral identity before profiles,
  permissions and private lessons.
- **Dependencies / entry:** `ET-09.2` completed; Identity Strategy and MathMorph
  Integration Boundary ADRs approved; separate Electro Tutor IdP client/config
  and approved test account are available.
- **Runnable slice / E2E:** browser → OIDC Authorization Code + PKCE → callback/
  server session → protected `/api/v1/me` → logout; anonymous/expired token denied.
- **Scope / non-goals:** stable `(issuer, subject)`, exact redirects, session/token
  boundary, provider-neutral principal and logout; без MFA/shared realm migration,
  tutor profile, lesson capability or MathMorph changes.
- **Modules / expected files:** web auth routes/session UI, backend auth adapter,
  identity model/migration, IdP config/fixtures, feature SPEC, ADR, security/API tests.
- **DB / migration:** opaque application identity/session binding with uniqueness,
  expiry and least privilege; reversible migration and no raw provider token storage.
- **Security / fallback / risks:** state/nonce/PKCE, exact issuer/audience/redirect,
  CSRF/session fixation negatives; IdP/session-store outage fails closed.
- **Behavior IDs:** `AUTH-001..004`.
- **Tests / manual:** unit claims/config; integration callback/session/token and
  real DB; component signed-out/in/error; live E2E browser→IdP→API→logout;
  manual secret/CSP/cookie review.
- **Observability / docs:** auth outcome/error category without token/claims;
  identity SPEC, architecture/decisions/security/API/data/state.
- **Temporary / rollback / risks:** isolated development realm/client allowed;
  mock IdP not terminal. Rollback removes only Electro Tutor client/schema safely;
  risk — accidental coupling to MathMorph realm or email as primary ID.
- **DoD / deferred:** common DoD + real IdP and protected API evidence; profiles,
  MFA/passkeys and shared identity deferred.

## ET-09.4 — Profiles, capabilities и audit baseline

Статус: `planned`.

- **Goal / why now:** separate application profiles from identity and make server
  authorization/audit reusable by Booking and LessonSession.
- **Dependencies / entry:** `ET-09.3` completed; profile/capability/audit SPEC and
  role-policy decision approved.
- **Runnable slice / E2E:** authenticated student/tutor creates or reads own
  profile → server computes allowed application capability → forbidden role/
  foreign profile mutation returns deny → critical change creates AuditEvent.
- **Scope / non-goals:** StudentProfile, TutorProfile minimum, typed capabilities,
  policy service and audit event; without verification marketplace, booking,
  lesson capabilities, admin console or IdP role mutation.
- **Modules / expected files:** profile/authz/audit domain/application/repository,
  API/UI slices, migrations, specs/security/data/traceability and tests.
- **DB / migration:** profile ownership, unique identity relation, audit append
  fields/indexes; reversible migration and no mutable tutor business fields in IdP.
- **Security / fallback / risks:** AuthN/AuthZ independent, deny-by-default and
  IDOR/role escalation negatives; audit failure for critical mutation fails closed.
- **Behavior IDs:** `AUTHZ-001..003`.
- **Tests / manual:** unit policy matrix; real DB ownership/audit integration;
  RU/UK profile/permission component states; E2E own profile + forbidden foreign
  mutation; manual audit redaction/accessibility review.
- **Observability / docs:** authorization denial category and audit correlation,
  no private payload; update profile/capability SPEC, architecture/security/API/data/state.
- **Temporary / rollback / risks:** minimal STUDENT/TUTOR policy allowed if fully
  working and extensible; rollback migration/data export plan; risk — hardcoded
  role checks scattered in handlers.
- **DoD / deferred:** common DoD + server policy/audit E2E; verification/offers,
  lesson roles and moderation deferred.

## ET-10.1 — TutorOffer и Booking для FREE/EXTERNAL

Статус: `planned`.

- **Goal / why now:** deliver booking value without blocking on Stripe/legal
  platform-payment decisions.
- **Dependencies / entry:** `ET-09.4` completed; Booking/TutorOffer state,
  timezone/currency/policy snapshot and cancellation minimum approved in SPEC.
- **Runnable slice / E2E:** tutor publishes active offer → student requests
  `FREE` or `EXTERNAL` booking → tutor accepts → immutable agreed terms snapshot
  is visible to both; offer change does not mutate booking.
- **Scope / non-goals:** offer, availability minimum, booking lifecycle and
  snapshot; without hosted checkout, fake settlement, grants, media or calendar sync.
- **Modules / expected files:** booking/offer domain, repository/API, RU/UK UI,
  migrations, specs/security/data/traceability and tests.
- **DB / migration:** UTC instants + explicit user timezone, integer minor units,
  ISO currency, status constraints, optimistic/concurrency control and indexes.
- **Security / fallback / risks:** server owns price/participants/state; IDOR,
  overlapping/double-accept and client price/state manipulation denied; provider
  outage irrelevant to FREE/EXTERNAL.
- **Behavior IDs:** `BOOK-001..004`, `PAY-004`.
- **Tests / manual:** unit transitions/snapshot/time; real DB concurrency and
  constraints; RU/UK offer/booking states; E2E student request→tutor accept→snapshot;
  manual timezone/accessibility audit.
- **Observability / docs:** booking transition/audit IDs without lesson content;
  update Booking SPEC, architecture/API/data/security/state.
- **Temporary / rollback / risks:** exact FREE/EXTERNAL implementation is a
  permanent supported slice, not payment stub; rollback preserves/export bookings;
  risk — confusing external settlement with platform guarantee.
- **DoD / deferred:** common DoD + real two-user booking E2E; grants, reminders,
  platform payment and advanced cancellation deferred.

## ET-10.2 — LessonAccessGrant

Статус: `planned`.

- **Goal / why now:** turn accepted booking policy into explicit, auditable
  lesson access without querying Stripe or trusting client state on every join.
- **Dependencies / entry:** `ET-10.1` completed; grant source/status/validity and
  capability derivation contract approved.
- **Runnable slice / E2E:** accepted FREE/EXTERNAL booking creates policy-valid
  grant → owner joins protected lesson shell → unrelated third identity receives
  denial; revoked/expired grant stops new join.
- **Scope / non-goals:** grant lifecycle/sources, issue/revoke/check service and
  join authorization; without paid source, media token, session lifecycle or invite sharing.
- **Modules / expected files:** access domain/repository/API/UI guard, migration,
  specs/security/data/traceability and tests.
- **DB / migration:** unique grant idempotency key, validity interval, source,
  capabilities, revocation/audit indexes and reversible migration.
- **Security / fallback / risks:** grant checks fail closed on DB/time ambiguity;
  no raw booking/payment/provider claim accepted from client; clock policy explicit.
- **Behavior IDs:** `ACCESS-002..004`; `ACCESS-001` deferred to `ET-15.2`.
- **Tests / manual:** unit policy/time boundaries; real DB duplicate/revoke/expiry;
  component denied/expired states; E2E valid owner vs third user; manual audit log review.
- **Observability / docs:** grant source/status decision and denial reason code,
  no sensitive token; update access SPEC, architecture/API/data/security/state.
- **Temporary / rollback / risks:** FREE/EXTERNAL grant sources are complete;
  no fake paid source. Rollback revokes/export grants before schema reversal;
  risk — long-lived or over-broad capabilities.
- **DoD / deferred:** common DoD + real authorization negatives; PLATFORM grant
  and native media token deferred.

## ET-10.3 — LessonSession lifecycle и reload

Статус: `planned`.

- **Goal / why now:** establish central recoverable lesson runtime before media,
  whiteboard and timeline enrichments.
- **Dependencies / entry:** `ET-10.2` completed; LessonSession states,
  participant roles, transition ownership and recovery rules approved.
- **Runnable slice / E2E:** granted user opens protected lesson shell → session is
  created/started server-side → reload restores session ID/status/role/capabilities
  and current empty topic slot → tutor ends session.
- **Scope / non-goals:** lifecycle, participant binding, current topic reference,
  resume endpoint and minimal shell; without native media, timeline events, chat,
  board, booking completion or AI.
- **Modules / expected files:** lesson domain/repository/API, session shell/state,
  migration, specs/security/data/traceability and tests.
- **DB / migration:** opaque public ID, booking relation, timestamps/status,
  participants and concurrency/version guard; reversible migration.
- **Security / fallback / risks:** active grant required; client cannot set owner,
  status or capabilities; DB unavailable shows explicit unavailable/retry state,
  never creates browser-only session truth.
- **Behavior IDs:** `SESSION-001`, `ACCESS-004`.
- **Tests / manual:** unit state machine; real DB concurrent start/end and resume;
  RU/UK shell states; E2E booking/grant→start→reload→end; manual multi-tab/accessibility.
- **Observability / docs:** transition latency/error/recovery count with session
  correlation ID; update lesson SPEC, architecture/API/data/security/state.
- **Temporary / rollback / risks:** media-less lesson shell is fully working for
  declared lifecycle; rollback preserves session history; risk — tying session
  existence to browser tab or provider room.
- **DoD / deferred:** common DoD + reload lifecycle E2E; timeline/media/collaboration deferred.

## ET-11.1 — Canonical time и versioned LessonEvent

Статус: `planned`.

- **Goal / why now:** create replay-compatible event/time foundation before
  topics, collaboration, recording and AI emit incompatible clocks/payloads.
- **Dependencies / entry:** `ET-10.3` completed; canonical timeline clock,
  ordering/idempotency and event compatibility policy approved.
- **Runnable slice / E2E:** start session → server records versioned
  `LESSON_STARTED`/participant/end events with monotonic timeline positions →
  history API reload returns stable ordered events.
- **Scope / non-goals:** event envelope, registry/schema versions, ordering,
  compatibility/upcaster policy and initial lifecycle events; without event
  sourcing whole domain, broker, replay UI or AI payloads.
- **Modules / expected files:** timeline/event domain/repository/API, schema
  registry/migration, specs/decisions/data/traceability and tests.
- **DB / migration:** append-oriented event table, unique idempotency/order keys,
  UTC created time + canonical relative position and indexes; reversible addition.
- **Security / fallback / risks:** actor/capability server-derived, bounded typed
  payload; invalid/unknown event fails explicitly, no silent reinterpretation.
- **Behavior IDs:** `TIME-001`, `TIME-004` foundation.
- **Tests / manual:** unit clock/order/schema/upcast; real DB duplicate/concurrency;
  API history component; E2E session lifecycle→persisted ordered events; manual
  old-schema fixture review.
- **Observability / docs:** append failures/lag/version without payload logging;
  update timeline SPEC, ADR, architecture/API/data/security/state.
- **Temporary / rollback / risks:** initial event registry may be small but real;
  rollback preserves/export versioned history; risk — mixing wall/media/timeline time.
- **DoD / deferred:** common DoD + old/current schema read PASS; topics, media,
  collaboration and replay events deferred.

## ET-11.2 — LessonTopic, LessonAnchor и Navigator

Статус: `planned`.

- **Goal / why now:** make lesson process semantically navigable before adding
  board/media-specific anchors and AI search.
- **Dependencies / entry:** `ET-11.1` completed; Topic/Anchor/Navigator contracts
  and extensible anchor registry approved.
- **Runnable slice / E2E:** tutor selects “переходим к теме” → topic + timeline
  event + timeline anchor persist → student sees active topic → Navigator moves
  to it and returns to live after reload.
- **Scope / non-goals:** topic lifecycle/hierarchy minimum, generic timeline
  anchors, bookmarks and live navigator history; without AI detection, board/
  formula anchors, video seek or full replay.
- **Modules / expected files:** topic/anchor/navigator domain/API, RU/UK UI,
  migrations, specs/design/data/traceability and tests.
- **DB / migration:** topic ordering/timeline bounds, typed anchor target/version,
  bookmark ownership and indexes; reversible migration.
- **Security / fallback / risks:** manage-topic capability; anchor target
  authorization and bounded metadata; unresolved future anchor is explicit,
  not redirected to arbitrary URL.
- **Behavior IDs:** `TIME-001..003`.
- **Tests / manual:** unit topic/anchor/navigation; real DB ordering/ownership;
  accessible RU/UK navigator component; E2E topic change→reload→navigate/return live;
  manual keyboard/mobile review.
- **Observability / docs:** navigation target/type/resolution result without
  private content; update timeline/navigation SPEC, architecture/design/API/data/state.
- **Temporary / rollback / risks:** timeline-only anchor is fully functional;
  rollback retains exportable topic history; risk — coupling anchor to one tool.
- **DoD / deferred:** common DoD + live topic/navigation E2E; board/formula/
  transcript/video anchors deferred.

## ET-11.3 — Persistent lesson chat

Статус: `planned`.

- **Goal / why now:** provide the first recoverable collaboration module and
  prove realtime delivery is not the sole storage.
- **Dependencies / entry:** `ET-11.2` completed; chat ordering, retention,
  edit/delete and moderation minimum approved.
- **Runnable slice / E2E:** authorized participant sends message → server
  persists and delivers it → second participant receives it → reload restores
  ordered history → message can be anchored/bookmarked.
- **Scope / non-goals:** text/system/reply minimum, idempotent send, history and
  topic/anchor link; without attachment, reactions, E2EE or external channels.
- **Modules / expected files:** chat domain/repository/API/realtime adapter,
  RU/UK UI, migration, specs/security/privacy/design/data/tests.
- **DB / migration:** lesson/actor/idempotency/order, bounded text, retention/
  tombstone policy and indexes; reversible migration preserving export.
- **Security / fallback / risks:** grant + CHAT permissions, rate/size limits,
  HTML/script safety; delivery outage leaves persisted message and explicit reconnect.
- **Behavior IDs:** `CHAT-001..002`, `SESSION-002`.
- **Tests / manual:** unit ordering/dedup/limits; real DB/realtime integration;
  accessible component loading/error/reconnect; E2E two users→send→reload;
  manual abuse/mobile review.
- **Observability / docs:** counts/latency/error, never message body; update chat
  SPEC, architecture/security/privacy/design/API/data/state.
- **Temporary / rollback / risks:** polling or existing app transport allowed if
  fully working/recoverable and declared; rollback keeps export; risk — double send on reconnect.
- **DoD / deferred:** common DoD + real two-client persistence E2E; reactions/files deferred.

## ET-11.4 — Recoverable whiteboard collaboration

Статус: `planned`.

- **Goal / why now:** own a persistent lesson whiteboard boundary independent of
  public Jitsi and ready for anchors/replay.
- **Dependencies / entry:** `ET-11.3` completed; collaborative state, object ID,
  snapshot/delta, conflict and viewport ADR approved from measured prototype.
- **Runnable slice / E2E:** authorized tutor creates/updates board object → student
  receives semantic change → both reload/reconnect → same board and viewport
  restore; unauthorized editor is denied.
- **Scope / non-goals:** minimal object/layer/viewport model, persistence,
  delivery and restore; without million-event optimization, full drawing suite,
  recording replay, CRDT by default or Jitsi whiteboard dependency.
- **Modules / expected files:** whiteboard domain/state/storage/realtime/UI,
  migrations, specs/ADR/design/security/data/tests.
- **DB / migration:** board/object versions or approved document model, snapshot/
  delta provenance and indexes; migration/recovery with bounded payloads.
- **Security / fallback / risks:** WHITEBOARD permissions, size/count/rate limits,
  conflict policy; transport failure queues/reconciles or exposes read-only degraded state.
- **Behavior IDs:** `BOARD-001..003`, `SESSION-004`.
- **Tests / manual:** unit merge/version/limits; real DB + transport integration;
  component tools/error/read-only/accessibility; E2E two clients edit→disconnect→reload;
  manual latency/volume baseline.
- **Observability / docs:** object/delta volume, conflict/reconnect and snapshot
  duration without content; update whiteboard SPEC/ADR, architecture/design/security/data/state.
- **Temporary / rollback / risks:** simple serialized update model allowed within
  measured limits; rollback preserves latest snapshot; risk — premature CRDT/event-sourcing complexity.
- **DoD / deferred:** common DoD + recoverable two-client E2E and baseline;
  replay checkpoints and semantic circuit/formula objects deferred.

## ET-11.5 — Circuit/formula semantic anchors

Статус: `planned`.

- **Goal / why now:** add Electro Tutor’s domain-specific value by linking stable
  circuit/formula objects to topics, anchors and navigator.
- **Dependencies / entry:** `ET-11.4` completed; semantic object schema and
  compatibility boundary with existing circular diagram approved.
- **Runnable slice / E2E:** tutor selects a circuit/formula object → creates
  generic anchor/topic/bookmark → student Navigator focuses same object after
  reload with no MathMorph runtime dependency.
- **Scope / non-goals:** stable object IDs, anchor adapters, spotlight/focus and
  import from current local interactive state; without MathMorph integration,
  full circuit editor, simulation or AI explanation.
- **Modules / expected files:** circuit/formula object adapters, current React
  interactive seam, anchor/navigator UI, schemas/specs/design/tests; DB changes
  only for typed target metadata/version if existing anchor schema requires.
- **DB / migration:** backward-compatible anchor target extension; old targets
  remain readable; no formula document blob in event table.
- **Security / fallback / risks:** bounded object payload, owner/lesson checks;
  missing/incompatible object gives unresolved anchor, never arbitrary execution.
- **Behavior IDs:** `TIME-002..003`, `LEARN-001`, `INT-002`.
- **Tests / manual:** unit adapter/version/focus; real storage integration;
  RU/UK component/keyboard; E2E create anchor→reload→focus; manual both themes/mobile.
- **Observability / docs:** target type/version/resolution outcome only; update
  domain SPEC, architecture/design/data/integration candidates/state.
- **Temporary / rollback / risks:** current circular-diagram object subset is
  acceptable if complete; rollback keeps generic anchor unresolved; risk —
  compile-time coupling to MathMorph or UI-specific coordinates.
- **DoD / deferred:** common DoD + semantic navigation E2E; MathMorph adapter,
  simulation and advanced editor deferred.

## ET-12.1 — Realtime provider POC и ADR

Статус: `planned`.

- **Goal / why now:** prove provider, token, network and cost assumptions before
  production media integration.
- **Dependencies / entry:** `ET-11.1` and `ET-10.3` completed; provider
  evaluation criteria, approved isolated environment and test credentials available.
- **Runnable slice / E2E:** diagnostic client → backend provider port → isolated
  real provider room/token → two-browser audio connection/leave → resource cleanup,
  with measurements and ADR.
- **Scope / non-goals:** compare LiveKit/equivalent, provider port, token TTL,
  room lifecycle, baseline WebRTC/ICE/cost/telemetry; without product join UI,
  production TURN, recording, moderation or custom SFU.
- **Modules / expected files:** experimental adapter behind approved boundary,
  diagnostic route/client, provider config, ADR/realtime SPEC/security/fallback/tests.
- **DB / migration:** no authoritative room schema beyond optional bounded POC
  operation metadata; disposable migration only if approved.
- **Security / fallback / risks:** server-only credentials, short-lived scoped
  tokens, no token logs; provider unavailable produces explicit unavailable,
  not public Jitsi masquerading as equivalent.
- **Behavior IDs:** `RTC-001..002` scaffold/proof scope, `OPS-RTC-001`.
- **Tests / manual:** unit adapter/config/token claims; integration real provider
  create/join/cleanup; diagnostic component; live two-browser E2E and network/cost
  manual inspection. Mock alone non-terminal.
- **Observability / docs:** connection setup, transport/region, cleanup and
  estimated cost without media/token content; update ADR, architecture/security/fallback/state.
- **Temporary / rollback / risks:** isolated POC adapter may be removed; rollback
  revokes credentials/rooms and reverts POC commit; risk — treating happy LAN as production proof.
- **DoD / deferred:** common DoD + real provider evidence and accepted/rejected
  ADR; product access/media UI, TURN and recovery deferred.

## ET-12.2 — Authorized media room

Статус: `planned`.

- **Goal / why now:** replace public-room MVP for private native lessons with a
  real grant-authorized media vertical slice.
- **Dependencies / entry:** `ET-12.1` completed with selected provider;
  `ET-10.2`, `ET-10.3` and `ET-11.1` completed; provider environment and
  media/privacy SPEC approved.
- **Runnable slice / E2E:** authorized participant opens LessonSession → backend
  checks grant/capability and issues scoped token → browser joins provider room →
  lifecycle/timeline records join/leave; third user cannot mint/use token.
- **Scope / non-goals:** room adapter, token endpoint, pre-join basic controls,
  participant mapping and cleanup; without reconnect, screen share, TURN hardening,
  waiting room, recording or large rooms.
- **Modules / expected files:** media provider/application/API, lesson join UI,
  timeline adapter, config, specs/security/privacy/design/tests.
- **DB / migration:** provider room reference and participant join metadata only;
  provider tokens never stored; reversible compatible migration.
- **Security / fallback / risks:** grant/capability/TTL/audience enforced server-side;
  provider failure leaves lesson shell/timeline available and media unavailable.
- **Behavior IDs:** `RTC-001..002`, `ACCESS-004`.
- **Tests / manual:** unit token/policy; real API/provider integration; RU/UK
  prejoin/error component; live E2E authorized vs third user; manual permission/privacy review.
- **Observability / docs:** room operation/connection duration/error without token
  or media; update realtime SPEC, architecture/security/privacy/API/state.
- **Temporary / rollback / risks:** selected provider sandbox is allowed, public
  Jitsi is not equivalent fallback; rollback disables native adapter without
  reviving false private-room claim; risk — client-authoritative permissions.
- **DoD / deferred:** common DoD + real authorized/denied media E2E; device,
  reconnect, TURN, moderation and recording deferred.

## ET-12.3 — Device management и screen share

Статус: `planned`.

- **Goal / why now:** make native one-to-one lesson usable across common devices
  without destroying LessonSession.
- **Dependencies / entry:** `ET-12.2` completed; device/screen capability and
  browser support matrix approved.
- **Runnable slice / E2E:** user previews/selects mic/camera → joins → switches
  available device and starts/stops screen share → session/media continue and
  timeline records share events.
- **Scope / non-goals:** enumeration/permissions diagnostics, preferred/fallback
  device, mobile facing mode where supported, screen/window/tab source and share
  policy; without enhancement AI, recording or quality adaptation.
- **Modules / expected files:** media device adapters/hooks/UI, capability policy,
  timeline events, i18n/design/security/tests; DB only optional non-sensitive
  preference, not raw device identifiers.
- **DB / migration:** no server device inventory; preference schema only after
  privacy decision and reversible migration.
- **Security / fallback / risks:** explicit user gesture/permission, SCREEN_SHARE
  capability, no silent capture; unavailable device falls back to audio/lesson shell explicitly.
- **Behavior IDs:** `RTC-005`, `MEDIA-001..002`.
- **Tests / manual:** unit device state machine; provider integration with mocked
  browser edges plus real browser media; component permission/error/accessibility;
  E2E switch/share without session loss; manual desktop/mobile matrix.
- **Observability / docs:** error classes/source kind, never labels before consent
  or media; update realtime SPEC/design/security/privacy/state.
- **Temporary / rollback / risks:** provider-native device API allowed behind
  browser adapter; rollback preserves authorized basic media; risk — flaky virtual-device evidence.
- **DoD / deferred:** common DoD + real device/share browser evidence; reconnect,
  adaptive media and enhancement deferred.

## ET-12.4 — Reconnect и full session restoration

Статус: `planned`.

- **Goal / why now:** recover lesson after transient network loss/reload without
  treating page refresh as owner or primary recovery.
- **Dependencies / entry:** `ET-12.3`, `ET-11.3`, `ET-11.4` completed; reconnect
  states, retry budget and reconciliation policy approved.
- **Runnable slice / E2E:** active participant loses network → presence becomes
  suspected/reconnecting → media reconnect or new scoped token → lesson/session,
  chat, board and topic restore → user returns active without duplicate joins/events.
- **Scope / non-goals:** media reconnect/ICE restart/full reconnect, grace period,
  state rehydrate/reconcile and visible degraded states; without multi-device
  simultaneous policy, geo failover or offline lesson.
- **Modules / expected files:** reconnect coordinator, media/collaboration/session
  adapters, UI states, timeline/telemetry, specs/fallback/security/tests.
- **DB / migration:** connection attempt/presence metadata only if required;
  no ephemeral packet stats as permanent private events by default.
- **Security / fallback / risks:** revalidate identity/grant and mint fresh token;
  auth failure never falls back anonymous; bounded backoff then explicit unavailable.
- **Behavior IDs:** `RTC-003..004`, `SESSION-001..004`.
- **Tests / manual:** unit state/retry/reconcile; real provider/DB integration;
  component degraded/retry/accessibility; E2E network cut/reload/recovery with
  chat/board/topic parity; manual duplicate/resource cleanup review.
- **Observability / docs:** reconnect count/duration/path/outcome, no content or
  token; update recovery SPEC, architecture/fallback/security/testing/state.
- **Temporary / rollback / risks:** full reconnect after bounded attempt is valid
  fallback; reload-only is not. Rollback keeps basic media but marks recovery unavailable;
  risk — duplicate side effects or zombie participants.
- **DoD / deferred:** common DoD + real network interruption recovery E2E; quality
  adaptation and cross-device continuity deferred.

## ET-12.5 — TURN, adaptive media и quality telemetry

Статус: `planned`.

- **Goal / why now:** make media resilient on restrictive/poor networks and
  measure quality/cost before scale claims.
- **Dependencies / entry:** `ET-12.4` completed; STUN/TURN, data region,
  observability/privacy and cost budgets approved; real restrictive-network test available.
- **Runnable slice / E2E:** direct/UDP path is impaired → ICE selects approved
  TURN TCP/TLS path → quality state degrades video before audio/signaling →
  recovers with observable state and uninterrupted LessonSession.
- **Scope / non-goals:** TURN topology, simulcast/SVC/adaptive subscriptions,
  quality state machine and safe telemetry; without custom SFU, global autoscale,
  noise-suppression vendor or performance claims without benchmark.
- **Modules / expected files:** provider/network config, quality service/UI,
  telemetry dashboards/tests, ADR/realtime/fallback/security/privacy docs.
- **DB / migration:** aggregate bounded quality incidents/cost metadata only after
  retention decision; reversible addition, not raw continuous media stats forever.
- **Security / fallback / risks:** TURN credentials short-lived; telemetry
  redacted; priority audio→signaling→collaboration→video; exhausted paths explicit fail.
- **Behavior IDs:** `RTC-003..004`, `QUALITY-001..003`.
- **Tests / manual:** unit quality transitions; real provider/TURN integration;
  component quality/degraded states; E2E forced UDP failure/loss/recovery; manual
  RTT/jitter/loss/cost baseline.
- **Observability / docs:** RTT/jitter/loss/bitrate/freeze/transport/reconnect and
  cost estimate without identifiers/tokens; update ADR, architecture/fallback/privacy/state.
- **Temporary / rollback / risks:** provider-managed TURN/adaptive features are
  allowed; rollback disables new policy while preserving basic media; risk —
  unbounded TURN spend or sensitive IP/network telemetry.
- **DoD / deferred:** common DoD + restrictive-network real evidence and budgets;
  large rooms/multi-region deferred.

## ET-12.6 — Waiting room, presence и moderation

Статус: `planned`.

- **Goal / why now:** enforce lesson participation policy beyond possession of a
  media token and support safe tutor control.
- **Dependencies / entry:** `ET-12.5` and `ET-09.4` completed; lesson-role,
  admission, presence grace and moderation policy approved.
- **Runnable slice / E2E:** student enters waiting state → authorized tutor admits
  → capabilities update → temporary disconnect preserves grace → tutor can mute/
  remove/disable allowed tool → action is enforced and audited.
- **Scope / non-goals:** waiting states, durable participant/presence projection,
  admit/reject/remove/mute/tool permissions; without breakout rooms, webinar admin
  console, parental observer or platform-wide bans.
- **Modules / expected files:** participant/presence/moderation domain, provider
  adapter/API/UI, audit/timeline, migrations, specs/security/design/tests.
- **DB / migration:** participant lesson role/status/grace, moderation audit and
  idempotency; reversible migration with history retention policy.
- **Security / fallback / risks:** server capability checks and provider enforcement;
  moderation provider failure reconciles and reports unknown outcome, never claims success.
- **Behavior IDs:** `AUTHZ-002..003`, `RTC-003`, `MOD-001..003`.
- **Tests / manual:** unit policy/state/grace; real DB/provider permission updates;
  RU/UK component/accessibility; E2E wait→admit→disconnect→remove/deny rejoin;
  manual abuse/audit review.
- **Observability / docs:** presence state counts/moderation outcome and correlation,
  no media/content; update moderation/realtime SPEC, architecture/security/design/state.
- **Temporary / rollback / risks:** minimal tutor moderator is complete for one-to-one;
  rollback revokes provider permissions safely; risk — UI success before provider enforcement.
- **DoD / deferred:** common DoD + real admission/moderation E2E; group roles,
  observers and breakout rooms deferred.

## ET-13.1 — Recording consent/provider/object storage

Статус: `blocked` до legal, retention, storage-region и provider decisions.

- **Goal / why now:** add an authorized server-side recording slice only after
  native media and explicit consent can be enforced.
- **Dependencies / entry:** `ET-12.2` and `ET-11.1` completed; Recording,
  Object Storage, consent/legal/retention ADRs approved; real test storage and
  recording provider available.
- **Runnable slice / E2E:** tutor requests recording → every required participant
  sees/records policy-versioned consent → authorized backend starts provider job →
  finalize stores metadata/object → permitted user opens short-lived URL;
  non-consenting/unauthorized user cannot start/read.
- **Scope / non-goals:** consent, recording lifecycle, provider/storage ports,
  checksum/retention state and authorized playback; without synchronized board
  replay, transcript, AI, permanent public URL or unlimited retention.
- **Modules / expected files:** recording/consent/storage domain/application/API,
  provider adapters, UI, migrations, specs/ADR/security/privacy/data/tests.
- **DB / migration:** recording job/status/key/checksum/timeline offset and
  participant consent/policy version; large media stays out of PostgreSQL;
  reversible metadata migration and orphan cleanup contract.
- **Security / fallback / risks:** RECORD/VIEW_RECORDING capabilities, signed URL
  TTL, guessed-key/consent negatives; recording unavailable leaves live lesson
  active and visibly unrecorded, with no browser-only hidden fallback.
- **Behavior IDs:** `REC-001..004`.
- **Tests / manual:** unit consent/state/retention; real DB + provider + object
  storage integration; RU/UK recording indicator/error component; E2E consent→
  record→play + unauthorized denial; manual regional/privacy/accessibility review.
- **Observability / docs:** provider job/duration/size/failure/retention without
  media URL/content; update recording SPEC, ADR, architecture/security/privacy/API/data/state.
- **Temporary / rollback / risks:** development MinIO/provider sandbox allowed;
  fake recording non-terminal. Rollback stops jobs/revokes URLs and reconciles
  orphan objects; risk — recording before consent or unrecoverable storage leak.
- **DoD / deferred:** common DoD + real provider/storage/authorization E2E;
  replay/transcript/chapters deferred.

## ET-13.2 — Synchronized replay foundation

Статус: `planned`.

- **Goal / why now:** make lesson process navigable across recording, topics,
  board and circuit state instead of exposing only a video file.
- **Dependencies / entry:** `ET-13.1`, `ET-11.4` and `ET-11.5` completed;
  replay clock/compatibility/checkpoint and retention contracts approved.
- **Runnable slice / E2E:** user opens authorized completed lesson → seeks a
  topic/chapter → media, timeline, whiteboard/viewport and semantic object restore
  to compatible state → return/navigation works on old/current event fixtures.
- **Scope / non-goals:** replay projection, topic chapters, seek/navigation and
  bounded checkpoint strategy if benchmark proves need; without transcript,
  AI, perfect pixel cursor history or rewriting old events.
- **Modules / expected files:** replay application/projectors/UI, media/timeline/
  board/circuit adapters, optional checkpoints, specs/ADR/design/security/tests.
- **DB / migration:** replay/checkpoint metadata only if needed; versioned state,
  checksum and retention; migration preserves existing event/recording history.
- **Security / fallback / risks:** recording and every referenced asset reauthorize;
  missing optional module is visibly unavailable/degraded, not silently stale.
- **Behavior IDs:** `TIME-003..004`, `BOARD-003`, `REPLAY-001..003`.
- **Tests / manual:** unit projector/seek/version/checkpoint; real storage/DB
  integration; accessible replay component; E2E chapter seek→state sync on
  current and historical fixture; manual correctness/performance baseline.
- **Observability / docs:** seek latency, projection/checkpoint version/failure
  without lesson content; update replay SPEC/ADR, architecture/design/security/data/state.
- **Temporary / rollback / risks:** replay from initial snapshot + bounded events
  is allowed within measured limit; rollback preserves recording/events; risk —
  checkpoint optimization before evidence or incompatible old lesson.
- **DoD / deferred:** common DoD + synchronized real replay E2E and compatibility;
  transcript/search/advanced cursors deferred.

## ET-13.3 — Transcript и searchable lesson

Статус: `blocked` until provider/privacy/cost entry decisions are approved.

- **Goal / why now:** add time-linked text search that returns evidence-backed
  lesson positions and feeds later AI without loading the whole archive.
- **Dependencies / entry:** `ET-13.2` completed; transcript provider, consent,
  language, retention, correction and search-index contracts approved.
- **Runnable slice / E2E:** completed recording → idempotent transcript job →
  timeline-linked segments/index → authorized user searches phrase → result
  opens Navigator/replay at matching transcript/topic/anchor.
- **Scope / non-goals:** provider port, segments, job state, bounded search and
  result navigation; without AI answers, cross-user global search, silent
  transcript authority or unsupported language claims.
- **Modules / expected files:** transcript/search domain/jobs/repository/API/UI,
  provider adapter, migrations/index, specs/privacy/security/design/tests.
- **DB / migration:** segments with timeline bounds/provider/version/language,
  searchable index and retention; reversible schema/index build with resumable backfill.
- **Security / fallback / risks:** lesson authorization on job/result, bounded
  queries and redacted logs; provider/search outage leaves recording/replay usable.
- **Behavior IDs:** `SEARCH-001..003`, `TIME-003`, `INT-001`.
- **Tests / manual:** unit segment/time/query; real provider adapter contract +
  DB/index integration; RU/UK search states; E2E recording→transcript→search→seek;
  manual quality/privacy/cost audit.
- **Observability / docs:** job duration/attempt/language/segment count/search
  latency, no transcript text; update transcript/search SPEC, architecture/privacy/security/API/data/state.
- **Temporary / rollback / risks:** one approved language/provider may be a full
  first slice with explicit unsupported state; rollback disables index and retains
  policy-controlled transcript; risk — treating inaccurate text as authority.
- **DoD / deferred:** common DoD + real provider/search/navigation E2E; AI summary
  and semantic/vector search deferred.

## ET-14.1 — Domain events, jobs/outbox и in-app inbox

Статус: `planned`.

- **Goal / why now:** deliver durable user notifications without coupling
  Booking/Lesson services directly to Telegram or external queues.
- **Dependencies / entry:** `ET-10.1` and `ET-09.2` completed; event delivery,
  job idempotency/retry and notification policy ADR approved.
- **Runnable slice / E2E:** booking accepted in one transaction → durable domain
  event/outbox or approved equivalent → worker creates one in-app notification →
  user reads/marks it read; duplicate/retry does not duplicate message.
- **Scope / non-goals:** selected background job mechanism, durable delivery,
  notification entity/policy, in-app inbox and one booking event; without
  Telegram/email/push, all event types, Kafka/RabbitMQ by default or critical HTTP send.
- **Modules / expected files:** domain event/outbox/jobs/notification modules,
  worker/runtime config, inbox API/UI, migrations, ADR/specs/fallback/security/tests.
- **DB / migration:** event/outbox/job/notification/idempotency/read state and
  indexes; reversible migration, recovery scan and no exactly-once claim.
- **Security / fallback / risks:** owner-scoped inbox/deep links, bounded payload;
  worker outage queues safely, booking remains accepted, retries reconcile first.
- **Behavior IDs:** `NOTIF-001..002`, `JOB-001..003`.
- **Tests / manual:** unit policy/retry/dedup; real DB + worker delivery integration;
  RU/UK inbox component; E2E booking accept→worker→inbox→read; manual outage/
  duplicate recovery and accessibility review.
- **Observability / docs:** event/job/attempt/lag/outcome/correlation without
  notification private body; update jobs/notification SPEC/ADR, architecture/fallback/security/API/data/state.
- **Temporary / rollback / risks:** database-backed worker/outbox is allowed and
  fully operational; in-process fire-and-forget is not. Rollback drains/pauses
  safely; risk — DB commit with lost external side effect.
- **DoD / deferred:** common DoD + real worker/outage/dedup E2E; reminders and
  external channels deferred.

## ET-14.2 — Preferences, timezone и reminders

Статус: `planned`.

- **Goal / why now:** send correct, reschedulable lesson reminders in the user’s
  timezone before adding external channels.
- **Dependencies / entry:** `ET-14.1` completed; scheduling/timezone/quiet-hours
  and reminder policy approved.
- **Runnable slice / E2E:** user configures preference/timezone → accepted booking
  schedules in-app reminder → reschedule cancels/replaces pending job → exactly
  one localized reminder becomes visible at expected instant.
- **Scope / non-goals:** preferences, quiet hours, scheduler, 24h/1h/15m policy
  subset and reschedule/cancel; without Telegram/calendar/email/push or guessed timezone.
- **Modules / expected files:** preference/reminder scheduler/application/API/UI,
  migrations, RU/UK templates, specs/design/fallback/tests.
- **DB / migration:** explicit IANA timezone, channel/event preference,
  scheduled/cancelled/dedup job state; reversible migration.
- **Security / fallback / risks:** ownership and bounded schedules; clock/DST
  deterministic; scheduler outage preserves pending state and catches up per policy.
- **Behavior IDs:** `NOTIF-003`, `NOTIF-005`, `REM-001..002`.
- **Tests / manual:** unit timezone/DST/quiet/reschedule; real DB/scheduler
  integration; RU/UK preference/reminder components; time-controlled E2E
  accept→reschedule→one reminder; manual locale/accessibility.
- **Observability / docs:** due/late/cancel/dedup counts and user timezone code,
  no message/private booking content; update notification SPEC/design/API/data/state.
- **Temporary / rollback / risks:** one in-app channel is complete; rollback
  cancels pending reminder jobs safely; risk — duplicate or wrong-zone reminder.
- **DoD / deferred:** common DoD + reschedule/DST evidence; external channels deferred.

## ET-14.3 — Secure Telegram linking и delivery adapter

Статус: `blocked` until approved bot/test credentials and privacy decision.

- **Goal / why now:** add the first external channel without making Telegram a
  business authority or global identity.
- **Dependencies / entry:** `ET-14.2` completed; Telegram Adapter ADR, bot,
  test chat/account and data retention/deletion contract available.
- **Runnable slice / E2E:** authenticated user requests short-lived single-use
  link → `/start TOKEN` binds verified Telegram ID → enabled reminder delivers
  once → unlink/disabled preference prevents further delivery; replay token denied.
- **Scope / non-goals:** secure link/unlink, adapter/templates, retry/dedup and
  safe deep link; without payout/refund commands, username identity, arbitrary bot
  actions or exposing lesson access token in message.
- **Modules / expected files:** Telegram account link/channel adapter/webhook or
  polling boundary, templates/settings UI, migrations, specs/ADR/security/privacy/tests.
- **DB / migration:** encrypted/limited provider IDs, one-time token verifier,
  expiry/use/audit and delivery external ID; reversible unlink/deletion path.
- **Security / fallback / risks:** CSPRNG single-use token, signature/secret
  boundary, rate/replay/account-hijack negatives; Telegram outage keeps in-app truth
  and retries boundedly.
- **Behavior IDs:** `NOTIF-002..004`, `TG-001..003`.
- **Tests / manual:** unit token/template/retry; real Telegram sandbox delivery/
  failure integration; RU/UK linking component; E2E link→deliver→unlink + replay denial;
  manual private-chat/deep-link/privacy review.
- **Observability / docs:** provider outcome/attempt/chat binding ID hash, no token/
  message body; update Telegram/notification SPEC/ADR, security/privacy/API/data/state.
- **Temporary / rollback / risks:** sandbox bot is allowed; fake adapter not
  terminal. Rollback revokes webhook/token and unlinks test data; risk — account hijack.
- **DoD / deferred:** common DoD + real delivery/replay/unlink evidence; bot commands deferred.

## ET-14.4 — Один выбранный calendar/email/Web Push adapter

Статус: `blocked`; optional stage requires explicit provider/channel selection
and approval before execution.

- **Goal / why now:** prove Notification/Application integration extensibility
  with one selected channel, never a bundled “implement all adapters” stage.
- **Dependencies / entry:** `ET-14.2` completed; exactly one provider/channel,
  scopes, consent, credential and sync semantics approved in stage refinement.
- **Runnable slice / E2E:** booking/reminder event → existing notification policy
  → selected real adapter → observable create/update/cancel or delivery; provider
  outage does not change booking/lesson truth.
- **Scope / non-goals:** one channel and one event lifecycle; all other channels,
  broad contact import and excessive OAuth scopes explicitly out of scope.
- **Modules / expected files:** one adapter/config/templates or calendar link,
  integration metadata/migration, provider SPEC/security/privacy/tests/docs.
- **DB / migration:** only required provider link/external event/delivery state,
  encrypted/limited and reversible; no general provider blob.
- **Security / fallback / risks:** minimal scopes, CSRF/state for OAuth, safe deep
  links and bounded retries; in-app notification remains fallback.
- **Behavior IDs:** selected `NOTIF-*` plus `INT-001..003` refined before start.
- **Tests / manual:** unit mapping/retry; real provider integration; selected
  settings component; E2E create→update/cancel/deliver; manual consent/revocation review.
- **Observability / docs:** provider operation/outcome/latency without recipient
  content; update integration manifest, SPEC/security/privacy/state.
- **Temporary / rollback / risks:** provider sandbox allowed; rollback revokes
  credentials and reconciles remote object; risk — duplicate stale calendar event.
- **DoD / deferred:** common DoD + one real adapter lifecycle; other channels get
  new bounded records, not scope expansion.

## ET-15.1 — Legal/provider/funds-flow decision

Статус: `blocked` by legal entity, countries, currencies, tax/refund/dispute and
marketplace funds-flow decisions from `ET-07`.

- **Goal / why now:** establish a compliant, testable finance contract before
  any platform-managed money or Stripe code.
- **Dependencies / entry:** `ET-10.1` completed; decision owners and legal/
  provider information available; no production credential required.
- **Runnable slice / E2E:** explicit business inputs → approved payment/funds/
  fee/payout/refund data model and threat/reconciliation plan → validator/
  traceability selects `ET-15.2` without unresolved critical decision.
- **Scope / non-goals:** provider/Connect model, currencies/minor units, webhook,
  ledger accounts, fee/payout/refund/dispute policies and compliance boundaries;
  without checkout code, credentials, real charge or “escrow” promise.
- **Modules / expected files:** payment/booking feature SPEC, architecture,
  decisions, security/privacy/API/data/traceability/roadmap/stage records.
- **DB / migration:** schema/migration/rollback design only; no production data mutation.
- **Security / fallback / risks:** PCI/provider boundary, webhook/replay, money
  authorization, idempotency and operator override threat model; unknown decision blocks.
- **Behavior IDs:** `PAY-001..004`, `PAYOUT-001..002` acceptance design.
- **Tests / manual:** structural SPEC/ADR/link/context validation, state machine/
  ledger invariant examples and human finance/security/legal review; runtime/UI/DB
  tests not applicable to docs-only stage.
- **Observability / docs:** reconciliation/audit/cost evidence requirements;
  update all affected canonical finance/planning sources.
- **Temporary / rollback / risks:** temporary implementation `none`; rollback one
  docs commit; risk — describing provider hold as regulated escrow or missing tax.
- **DoD / deferred:** common docs-stage DoD + all critical decisions explicit;
  checkout, Connect, ledger and payouts deferred.

## ET-15.2 — Hosted checkout, verified webhook и paid grant

Статус: `planned` after `ET-15.1`.

- **Goal / why now:** add the smallest platform-payment vertical slice without
  changing working FREE/EXTERNAL booking modes.
- **Dependencies / entry:** `ET-15.1` completed; `ET-10.2` completed; approved
  provider sandbox/webhook credentials and feature SPEC available.
- **Runnable slice / E2E:** accepted PLATFORM booking → server creates hosted
  checkout at authoritative snapshot price → provider webhook signature/event ID
  verified → Payment succeeds exactly once → paid access grant created; failed/
  spoofed/duplicate event does not grant access.
- **Scope / non-goals:** one-time payment, state machine, hosted checkout,
  webhook/idempotency/reconciliation and grant source; without Connect, ledger
  payout, subscriptions, refunds or client redirect as proof.
- **Modules / expected files:** payment provider port/adapter, finance domain/API,
  webhook, checkout UI, migrations, specs/security/privacy/tests.
- **DB / migration:** Payment/provider event/idempotency/state/minor units and
  grant link; reversible additive migration, external reconciliation on rollback.
- **Security / fallback / risks:** server price/currency, signature/timestamp,
  replay/IDOR/rate limits; provider unavailable blocks PLATFORM checkout only,
  FREE/EXTERNAL remain independent.
- **Behavior IDs:** `PAY-001..004`, `ACCESS-001`.
- **Tests / manual:** unit states/amount/idempotency; real DB + provider sandbox/
  webhook integration; RU/UK checkout/status components; E2E success/failure/
  spoof/duplicate→grant; manual provider dashboard reconciliation.
- **Observability / docs:** payment operation/event/state/amount currency and
  correlation, no secret/card data; update finance SPEC/ADR, architecture/security/privacy/API/data/state.
- **Temporary / rollback / risks:** provider sandbox is mandatory; fake provider
  non-terminal. Rollback disables new checkout then reconciles pending events;
  risk — unknown provider outcome followed by duplicate create.
- **DoD / deferred:** common DoD + real sandbox/webhook/grant evidence; Connect,
  ledger allocation, payouts/refunds deferred.

## ET-15.3 — Stripe Connect, append-oriented ledger и reconciliation

Статус: `planned`.

- **Goal / why now:** represent marketplace allocation safely before releasing
  tutor funds.
- **Dependencies / entry:** `ET-15.2` completed; Connect onboarding/funds-flow,
  ledger accounts/entries and reconciliation ADR approved with test account.
- **Runnable slice / E2E:** tutor completes provider onboarding → successful
  payment posts balanced immutable ledger entries for tutor pending/platform fee →
  reconciliation matches provider transaction; duplicate worker/event posts none.
- **Scope / non-goals:** connected account reference/status, allocation,
  append-oriented double-entry invariant, fee snapshot and reconciliation;
  without payout release, refund/dispute, wallet UI or float balance.
- **Modules / expected files:** Connect adapter/onboarding UI, ledger/reconciliation
  domain/jobs/API, migrations, specs/ADR/security/data/tests.
- **DB / migration:** LedgerAccount/Transaction/Entry, integer minor units,
  balance constraints/idempotency/provider references; additive migration and
  immutable correction entries, never destructive rewrite.
- **Security / fallback / risks:** provider onboarding/KYC only, no bank/card
  storage; ledger mismatch fails closed for release and raises reconciliation alert.
- **Behavior IDs:** `PAY-002`, `PAYOUT-001..002`, `LEDGER-001..003`.
- **Tests / manual:** property/unit balanced entries; real DB concurrency and
  provider sandbox integration; onboarding/ledger component; E2E payment→allocation→
  reconciliation + duplicate denial; manual finance audit.
- **Observability / docs:** reconciliation delta/status, operation IDs and minor
  units; no bank data; update ledger/payment SPEC/ADR, architecture/security/API/data/state.
- **Temporary / rollback / risks:** no mutable `balance` shortcut; rollback stops
  writes/releases and uses compensating entries/reconciliation; risk — ledger/provider drift.
- **DoD / deferred:** common DoD + balanced real sandbox reconciliation; payout,
  refund and dispute deferred.

## ET-15.4 — Payout policy и idempotent release

Статус: `planned`.

- **Goal / why now:** release tutor funds only from proven releasable state.
- **Dependencies / entry:** `ET-15.3` completed; completion/grace/account/dispute
  payout policy and operator permissions approved.
- **Runnable slice / E2E:** completed eligible lesson → allocation becomes
  releasable after policy → worker creates one provider transfer/payout → ledger
  posts release; duplicate execution or active hold creates no second transfer.
- **Scope / non-goals:** releasable state, payout entity/job/provider operation
  and reconciliation; without refund/cancellation/dispute resolution or instant cashout.
- **Modules / expected files:** payout policy/domain/jobs/provider adapter/API/UI,
  migrations, specs/security/data/tests.
- **DB / migration:** payout operation/idempotency/state/provider ref and ledger
  links; additive migration, compensating recovery and no delete.
- **Security / fallback / risks:** server/operator capabilities, unknown outcome
  reconcile before retry, active dispute/failed account fail closed.
- **Behavior IDs:** `PAYOUT-001..002`.
- **Tests / manual:** unit eligibility; real DB concurrency + provider sandbox;
  payout status component; E2E eligible→one transfer and duplicate/hold denial;
  manual provider/ledger reconciliation.
- **Observability / docs:** payout state/attempt/reconciliation/amount without
  bank details; update payout SPEC, architecture/security/API/data/state.
- **Temporary / rollback / risks:** manual approved release worker may be first
  complete slice; rollback pauses operations and reconciles, never deletes transfer;
  risk — duplicate or premature payout.
- **DoD / deferred:** common DoD + real sandbox transfer/reconciliation; refunds/
  cancellations/disputes deferred.

## ET-15.5 — Cancellation и refund policies

Статус: `planned`.

- **Goal / why now:** make cancellation outcomes and refunds explicit after basic
  payment/payout flows are authoritative.
- **Dependencies / entry:** `ET-15.4` completed; student/tutor/no-show/technical
  cancellation and full/partial/no-refund policies approved and versioned.
- **Runnable slice / E2E:** eligible booking cancellation → snapshot policy
  computes refund/allocation reversal → provider refund executes idempotently →
  ledger/access/booking states reconcile; duplicate request changes nothing.
- **Scope / non-goals:** cancellation reasons/timing, refund entity/provider call,
  access revocation and compensating ledger entries; without dispute adjudication
  or arbitrary admin money edit.
- **Modules / expected files:** cancellation/refund policy/domain/jobs/API/UI,
  migrations, specs/security/data/tests.
- **DB / migration:** policy version/reason/refund/idempotency/provider and ledger
  links; additive immutable history.
- **Security / fallback / risks:** owner/operator permission, server time/amount,
  unknown refund outcome reconciled; provider outage leaves explicit pending state.
- **Behavior IDs:** `REFUND-001..003`, `PAY-002`.
- **Tests / manual:** unit policy boundary/time; real DB/provider/ledger integration;
  RU/UK cancellation/refund states; E2E full/partial/duplicate/failed refund;
  manual finance/legal review.
- **Observability / docs:** refund state/reason code/amount/reconciliation without
  sensitive narrative; update booking/payment/refund SPEC/security/API/data/state.
- **Temporary / rollback / risks:** bounded manual-resolution queue allowed for
  unsupported case, not silent success; rollback pauses new refunds and reconciles;
  risk — access/payment/ledger divergence.
- **DoD / deferred:** common DoD + real sandbox refund/reversal evidence; disputes deferred.

## ET-15.6 — Dispute hold и resolution

Статус: `blocked` until dispute/compliance/operator policy approval.

- **Goal / why now:** prevent payout during an active dispute and preserve an
  auditable resolution path.
- **Dependencies / entry:** `ET-15.5` completed; dispute evidence/privacy,
  operator role, hold/release/refund outcomes and retention approved.
- **Runnable slice / E2E:** eligible participant opens dispute → allocation/payout
  hold enforced → authorized operator resolves student/tutor/partial outcome →
  ledger/refund/payout state reconciles and audit trail persists.
- **Scope / non-goals:** dispute state/hold/operator resolution and notifications;
  without automated legal adjudication, chargeback replacement or unrestricted admin edit.
- **Modules / expected files:** dispute domain/repository/API/operator UI,
  payout/refund/notification integration, migrations, specs/security/privacy/tests.
- **DB / migration:** immutable dispute status/evidence references/decision/audit
  and hold links; no sensitive evidence body in general logs.
- **Security / fallback / risks:** strict operator capability, IDOR/audit/retention;
  unresolved/error state keeps funds held fail closed.
- **Behavior IDs:** `DISPUTE-001..003`, `PAYOUT-001`.
- **Tests / manual:** unit transitions/hold; real DB concurrency + ledger/payout/
  notification integration; accessible operator/user states; E2E open→hold→resolve;
  manual abuse/privacy/legal review.
- **Observability / docs:** dispute state/age/outcome code and correlation, no
  evidence content; update dispute/security/privacy/API/data/state docs.
- **Temporary / rollback / risks:** manual operator resolution is the primary
  declared slice; rollback keeps holds/data and disables new resolution; risk —
  overprivileged operator or accidental payout.
- **DoD / deferred:** common DoD + hold/resolution/reconciliation evidence;
  chargeback automation and advanced fraud tooling deferred.

## ET-16.1 — Bounded AI context и anchored summary

Статус: `blocked` until AI provider/privacy/cost decision.

- **Goal / why now:** add one useful post-lesson AI artifact grounded in timeline
  evidence without making AI critical to lesson completion.
- **Dependencies / entry:** `ET-13.3` and `ET-14.1` completed; AI provider,
  consent/retention, context selection, prompt/version and evaluation contract approved.
- **Runnable slice / E2E:** completed lesson → idempotent job selects bounded
  topics/transcript/anchors → real provider creates localized summary proposal
  with source references → authorized user opens links; provider failure leaves
  lesson/replay completed and shows retryable summary failure.
- **Scope / non-goals:** provider port, context selector, one summary type,
  provenance/evaluation and job retry; without giant chat, autonomous authoritative
  topic rewrite, full archive context, local model routing or homework generation.
- **Modules / expected files:** AI context/summary domain/jobs/provider adapter,
  artifact storage/API/UI, migrations, SPEC/privacy/security/fallback/tests.
- **DB / migration:** derived artifact/provider/model/prompt version/status/source
  anchors and retention; no raw provider secret, bounded copied context.
- **Security / fallback / risks:** lesson authorization, injection/content limits,
  consent and data-region policy; AI unavailable yields explicit optional failure.
- **Behavior IDs:** `AI-001..003`.
- **Tests / manual:** unit selector/provenance/limits; real provider contract +
  job/DB integration; RU/UK summary/error component; E2E lesson→summary→anchor;
  manual groundedness/privacy/cost evaluation.
- **Observability / docs:** token/cost/latency/model/prompt/evaluation outcome,
  no transcript/prompt content in general logs; update AI SPEC, architecture/privacy/security/fallback/state.
- **Temporary / rollback / risks:** one remote provider/model is complete behind
  port; mock non-terminal. Rollback disables jobs and retains/deletes artifacts per policy;
  risk — hallucination or excess context disclosure.
- **DoD / deferred:** common DoD + real provider grounded summary evidence;
  homework/assessment/search assistant/local models deferred.

## ET-16.2 — Homework/assessment proposals

Статус: `planned`.

- **Goal / why now:** turn lesson evidence into tutor-reviewed follow-up actions
  without AI silently publishing assignments.
- **Dependencies / entry:** `ET-16.1` completed; Homework/Assessment ownership,
  review/publish/status and source-anchor contracts approved.
- **Runnable slice / E2E:** tutor selects lesson topics/anchors → manually creates
  or requests AI proposal → reviews/edits/publishes homework → student sees linked
  task and submits low-friction understood/unclear/question feedback.
- **Scope / non-goals:** homework entity, anchored prompt/manual path, tutor review,
  minimal assessment/feedback; without automated grading, course gradebook,
  generative authority or broad quiz engine.
- **Modules / expected files:** homework/assessment domain/API/UI, AI proposal
  adapter, notification event, migrations, specs/design/security/tests.
- **DB / migration:** assignment/source anchors/status/author/review version and
  student feedback; ownership/retention constraints and reversible migration.
- **Security / fallback / risks:** tutor publish capability, student ownership,
  prompt/content limits; AI failure keeps manual creation fully working.
- **Behavior IDs:** `HOME-001..003`, `AI-002..003`.
- **Tests / manual:** unit status/policy/provenance; real DB + AI optional path;
  RU/UK tutor/student components; E2E manual publish→student view/feedback and
  AI proposal review; manual accessibility/quality.
- **Observability / docs:** proposal/publish/feedback counts and source resolution,
  no answer content; update homework/assessment SPEC/design/security/API/data/state.
- **Temporary / rollback / risks:** manual homework is the complete primary path;
  AI optional. Rollback preserves published assignments; risk — AI content bypassing review.
- **DoD / deferred:** common DoD + manual and approved AI-proposal path evidence;
  grading/course analytics deferred.

## ET-16.3 — Search Assistant / «покажи где»

Статус: `planned`.

- **Goal / why now:** combine searchable transcript, semantic anchors and
  Navigator into a grounded answer that moves the user to lesson evidence.
- **Dependencies / entry:** `ET-13.3`, `ET-11.2` and `ET-16.1` completed;
  retrieval/ranking/citation and no-answer contract approved.
- **Runnable slice / E2E:** authorized user asks lesson-scoped question → bounded
  retrieval selects transcript/topic/anchor evidence → assistant returns answer/
  no-answer with sources → Navigator opens exact replay position/object.
- **Scope / non-goals:** one lesson-scoped query, grounded result/no-answer,
  source navigation and evaluation set; without global personal memory, autonomous
  orchestration, unbounded RAG or claims without evidence.
- **Modules / expected files:** search assistant/retrieval service, AI adapter,
  Navigator/UI, evaluation fixtures, optional index migration, specs/privacy/tests.
- **DB / migration:** only approved retrieval index/provenance metadata with
  authorization/retention; resumable/rebuildable index migration.
- **Security / fallback / risks:** lesson ownership, prompt injection boundaries,
  source filtering and rate/cost limits; AI unavailable can return deterministic
  search results without pretending equivalent answer.
- **Behavior IDs:** `AI-001..003`, `SEARCH-001..003`, `TIME-003`.
- **Tests / manual:** unit retrieval/citation/no-answer; real DB/index/provider
  integration; RU/UK question/result component; E2E ask→grounded source→navigate;
  manual quality/privacy/token budget.
- **Observability / docs:** retrieval/result/citation resolution, latency/tokens,
  no query/transcript text in general logs; update AI/search SPEC, architecture/privacy/state.
- **Temporary / rollback / risks:** lexical retrieval fallback is allowed only
  as visibly different search result; rollback disables assistant, keeps search/replay;
  risk — cross-lesson leakage or fabricated citation.
- **DoD / deferred:** common DoD + grounded/no-answer evaluation and navigation;
  personal memory/local models deferred.

## ET-17.1 — Group lesson и observer capabilities

Статус: `blocked` until capacity/cost/moderation decision.

- **Goal / why now:** extend proven one-to-one contracts without embedding a
  permanent 1:1 assumption in Booking/LessonSession.
- **Dependencies / entry:** `ET-12.6` and `ET-10.3` completed; group limit,
  participant roles, observer privacy/media policy and load budget approved.
- **Runnable slice / E2E:** tutor creates small-group booking/session → multiple
  granted students join selected SFU room → read-only observer joins with no
  publish/edit capabilities → moderation/presence/reconnect remain correct.
- **Scope / non-goals:** N-student booking/access/session roles, selective
  subscription and observer capability; without breakout rooms, webinars,
  subscriptions or large-scale autoscaling.
- **Modules / expected files:** booking/access/session participant cardinality,
  capability policy, media/UI, migrations, specs/security/performance/tests.
- **DB / migration:** booking participants/grants/role uniqueness/group limit;
  backward-compatible migration from one-to-one data.
- **Security / fallback / risks:** per-role capabilities, no observer publish/
  private chat leakage; over-capacity fails before provider join.
- **Behavior IDs:** `GROUP-001..003`, `AUTHZ-001..003`, `RTC-001`.
- **Tests / manual:** unit role/capacity; real DB/provider multi-client integration;
  group roster/observer component; E2E tutor+N students+observer/moderation;
  manual load/cost/accessibility baseline.
- **Observability / docs:** participant/track/subscription/reconnect/cost aggregates,
  no identities/content; update group SPEC, architecture/security/data/state.
- **Temporary / rollback / risks:** bounded small-group maximum is complete;
  rollback blocks new group bookings but preserves records; risk — hidden 1:1 constraints.
- **DoD / deferred:** common DoD + real multi-client/capability/load evidence;
  breakout/webinar/large room deferred.

## ET-17.2 — Versioned lesson export/Application API

Статус: `planned`.

- **Goal / why now:** create the explicit integration boundary before any
  cross-project adapter or direct database temptation.
- **Dependencies / entry:** `ET-13.3` completed; export ownership/redaction,
  versioning, retention and API compatibility contract approved.
- **Runnable slice / E2E:** authorized user requests bounded lesson export →
  background job assembles versioned metadata/topics/bookmarks/transcript links
  and authorized attachment references → downloadable artifact validates against
  schema; unauthorized user denied.
- **Scope / non-goals:** one export version, job/status/download and external
  Application API contract; without cross-project write, full media copy,
  permanent public URL or direct foreign DB access.
- **Modules / expected files:** export domain/jobs/API/schema, storage adapter/UI,
  migrations, specs/API/security/privacy/tests.
- **DB / migration:** export job/artifact/version/checksum/expiry; reversible
  metadata migration and object cleanup.
- **Security / fallback / risks:** ownership, short-lived signed URL, redaction/
  size/rate limits; partial asset failure produces explicit manifest status.
- **Behavior IDs:** `INT-001..002`, `EXPORT-001..002`.
- **Tests / manual:** unit schema/redaction; real DB/job/storage integration;
  export status component; E2E request→job→validate/download + denial; manual
  compatibility/privacy review.
- **Observability / docs:** export version/size/duration/failure without content;
  update integration manifest, API/export SPEC, architecture/security/privacy/state.
- **Temporary / rollback / risks:** metadata-first export is complete if declared;
  rollback expires artifacts and keeps jobs auditable; risk — leaking private links.
- **DoD / deferred:** common DoD + validated versioned export E2E; selected adapters deferred.

## ET-17.3 — MathMorph formula interchange adapter

Статус: `blocked`; optional stage requires explicit cross-project approval and
compatibility evidence.

- **Goal / why now:** exchange semantic formula artifacts through versioned
  boundaries without repository/database/auth coupling.
- **Dependencies / entry:** `ET-11.5` and `ET-17.2` completed; MathMorph active
  stage/worktree clean for read-only contract audit; interchange format/direction/
  ownership approved by both projects.
- **Runnable slice / E2E:** authorized Electro Tutor formula export → versioned
  adapter/API/import in selected direction → MathMorph returns/opens compatible
  artifact → Electro Tutor retains source provenance; incompatible version fails explicitly.
- **Scope / non-goals:** one direction and one formula subset; without shared DB,
  compile-time repo dependency, realm mutation, full Mathcad conversion or silent loss.
- **Modules / expected files:** Electro Tutor adapter/API/schema/tests/docs and
  only separately approved MathMorph contract changes in its own branch/worktree.
- **DB / migration:** provenance/external reference/version only if needed;
  independent migrations in each repository, never cross-repo transaction.
- **Security / fallback / risks:** authorization, bounded document/formula input,
  SSRF/file/parser limits; MathMorph unavailable leaves local formula intact.
- **Behavior IDs:** `INT-001..003`, `LEARN-001`.
- **Tests / manual:** unit mapping/version/loss diagnostics; real API/adapter
  integration in both repos; component open/import states; E2E export→import/open;
  manual semantic editability/security review.
- **Observability / docs:** contract version/operation/outcome/provenance without
  formula content; update both approved integration manifests/SPECs/state separately.
- **Temporary / rollback / risks:** one-way explicit export/import is allowed;
  rollback disables adapter without deleting local artifacts; risk — lossy mapping
  presented as exact or accidental MathMorph mutation.
- **DoD / deferred:** common DoD in both authorized repositories + real contract
  E2E; shared identity and broader document conversion deferred.

## ET-17.4 — Shared identity integration

Статус: `blocked` until a separately approved optional cross-product identity decision.

- **Goal / why now:** allow one external identity across products while keeping
  application profiles, roles, clients and migrations independent.
- **Dependencies / entry:** `ET-09.3` completed; MathMorph identity work has no
  conflicting active migration; shared issuer/client/audience/rollback/migration
  ADR approved by every affected product and operator.
- **Runnable slice / E2E:** one disposable identity authenticates to separate
  Electro Tutor and MathMorph clients → each API derives same approved subject
  but isolated profiles/roles/audiences → logout/revocation and cross-audience
  token rejection behave per contract.
- **Scope / non-goals:** shared issuer/subject and isolated clients; without
  shared application DB, global email key, role leakage, forced realm migration
  or changing working product auth without rollback evidence.
- **Modules / expected files:** separate IdP/client config and auth contract tests
  per repository; each repo changed only in its own approved branch/worktree.
- **DB / migration:** optional identity binding migration per product with backup,
  mapping/reconciliation and rollback; never one cross-product schema.
- **Security / fallback / risks:** audience/client/redirect/scope isolation,
  session/recovery/rollback; issuer outage affects auth explicitly, never falls
  back to unverified email identity.
- **Behavior IDs:** `AUTH-004`, `INT-001..003`, `SSO-001..003`.
- **Tests / manual:** unit issuer/audience mapping; real IdP + both APIs integration;
  separate product login UI; E2E one identity/two clients + cross-audience denial;
  manual recovery/operator conflict review.
- **Observability / docs:** issuer/client/auth outcome without token/claims;
  separate ADR/SPEC/security/state sync in every changed repository.
- **Temporary / rollback / risks:** parallel isolated clients are mandatory;
  rollback restores prior client/config/mapping without deleting accounts; risk —
  breaking MathMorph current auth or global role leakage.
- **DoD / deferred:** common DoD across approved repos + real isolation/recovery
  evidence; global profile/permissions remain rejected.

## ET-18.1 — Core platform threat/privacy/retention hardening

Статус: `planned` for the first core platform release bundle.

- **Goal / why now:** perform integrated release review without replacing the
  stage-local security/privacy gates that preceded it.
- **Dependencies / entry:** `ET-12.6`, `ET-13.2` and `ET-14.2` completed;
  production threat model, data inventory, retention/deletion, incident and abuse
  acceptance for this exact core bundle approved.
- **Runnable slice / E2E:** representative private lesson journey → auth/booking/
  access/media/collaboration/recording or selected bundle → retention/export/delete
  and negative abuse suite → no unauthorized data/capability survives.
- **Scope / non-goals:** integrated IDOR/role/token/signed URL/retention/secret/
  dependency review for the core lesson/realtime/replay/in-app reminder bundle;
  without payments, AI, integrations, unbounded
  “secure forever” claim, production deploy or pentest substitution by static scan.
- **Modules / expected files:** changed product modules/tests, SECURITY/PRIVACY/
  FALLBACKS/TESTING/API/data docs and CI gates; no unrelated feature work.
- **DB / migration:** retention/delete/export lifecycle and backup/restore test
  for selected schemas; destructive production cleanup remains separately approved.
- **Security / fallback / risks:** all critical paths fail closed; optional provider
  failures preserve declared degraded semantics; risk register has owner/evidence.
- **Behavior IDs:** all security-relevant IDs through `ET-14.2` plus exact
  `SEC-*` expanded before start.
- **Tests / manual:** unit policy/property; real DB/provider integration; component
  permission/error/privacy states; live E2E abuse/retention/recovery; independent
  security review and optional authorized pentest.
- **Observability / docs:** audit vs technical vs product analytics separation,
  redaction/retention and incident signals; synchronize all affected canonical docs.
- **Temporary / rollback / risks:** no weakened gate as temporary path; rollback
  core hardening change only with equal controls; risk — checklist without
  real negative evidence.
- **DoD / deferred:** common DoD + independent security/privacy approval and
  integrated live evidence; deployment deferred to `ET-18.2`.

## ET-18.2 — Core backend/realtime production rollout и recovery

Статус: `blocked` until hosting, ingress, IdP/provider/storage, backup/restore,
SLO, cost budget and operator approvals are available.

- **Goal / why now:** deploy the validated core lesson/realtime/replay/reminder
  bundle with recoverable operations and honest evidence levels.
- **Dependencies / entry:** `ET-18.1` completed; release artifact,
  migrations, secrets, domains, environments and rollback/incident runbook approved.
- **Runnable slice / E2E:** versioned source/artifacts → gated migration/deploy →
  production client→IdP→API→DB and selected realtime path → health/SLO/alert →
  controlled rollback/restore drill with data integrity.
- **Scope / non-goals:** one environment/provider topology, backup/restore,
  rollout/rollback, telemetry/alerts/cost and post-deploy smoke; without merging,
  push or deploy absent explicit user approval, multi-region scale or unrelated features.
- **Modules / expected files:** approved deployment/IaC/config/templates, CI/CD,
  migrations/runbooks/monitoring and state docs; active secrets remain external.
- **DB / migration:** backup, preflight, expand/contract if required, restore and
  compatibility window; destructive step separately approved with exact target.
- **Security / fallback / risks:** least privilege, TLS, secret rotation, provider
  outage/degraded behavior, incident stop condition; failed migration/deploy stops
  and restores without force-clean/reset.
- **Behavior IDs:** release bundle IDs plus `OPS-001..004`, `RECOVERY-001..003`.
- **Tests / manual:** all local/CI regression, real staging migration/provider E2E,
  production smoke, backup/restore and rollback drill; manual operator/SLO/cost/security review.
- **Observability / docs:** SLI/SLO, API/media/job/provider/cost/alert/recovery
  signals with privacy redaction; update README, architecture/security/privacy/
  fallback/testing/status/roadmap only to confirmed deployed evidence.
- **Temporary / rollback / risks:** staged/canary rollout allowed if fully
  observable; rollback artifact/config/schema per runbook; risk — irreversible
  migration, hidden provider cost or evidence promoted beyond deployment fact.
- **DoD / deferred:** common DoD + explicit user-authorized deploy and successful
  restore/rollback evidence. Multi-region, breakout, local models and other
  candidates remain separately approved future work.

## Одна команда

В новом или текущем чате Codex напиши:

```text
Продолжай Electro Tutor
```

Команда выполняет ровно один следующий допустимый подэтап. Для явного выбора
можно написать `Начинай этап TUTOR-XX` или `Начинай этап ET-XX.YY`;
зависимости и блокеры всё равно
проверяются.

## P-01 — Возобновление и выбор

1. Найди Git-корень и ближайшие `AGENTS.md`; проверь branch/status и сохрани
   пользовательские изменения.
2. Прочитай `docs/AI_STATUS.md`, `docs/ROADMAP.md`, `docs/AI_PLAN.md` и
   `specs/README.md`.
3. Если `AI_PLAN` имеет статус «готов к запуску» или «в работе», продолжай его.
   Иначе выбери первый `PLANNED` подэтап с выполненными зависимостями и создай
   один ограниченный `AI_PLAN`.
4. Не выбирай `BLOCKED` этап без закрытого внешнего решения. Не считай
   `OPTIONAL` утверждённым требованием.
5. Классифицируй сложность, режим, SDLC, домен и стек; загрузи только
   релевантные workspace-правила и затрагиваемую SPEC.

Результат P-01: один выбранный подэтап, его SPEC-требования, критерии приёмки и
точная область файлов.

## P-02 — План подэтапа

1. Сверь требование пользователя → SPEC → архитектуру/решения/безопасность.
2. Если поведение не определено, сначала обнови SPEC; не придумывай продуктовые
   требования из roadmap или этого prompt-файла.
3. Сформируй минимальный план реализации, проверок и отката.
4. Используй унаследованный `$plan-stage` только когда отдельное планирование
   действительно нужно; для простого подэтапа достаточно `docs/AI_PLAN.md`.
5. Субагенты допустимы только по правилам сложности и с явной пользой. Два
   write-capable агента работают только в разных worktrees и файлах.

Результат P-02: актуальный `AI_PLAN` с конечным объёмом и acceptance criteria.

## P-03 — Реализация

1. Если текущая ветка защищена, создай обычную рабочую ветку.
2. Реализуй только выбранный подэтап; используй `$implement-stage`, когда его
   масштаб соответствует skill.
3. Не расширяй задачу соседним roadmap-этапом.
4. Не меняй внешние сервисы, production, данные или доступы без явного запроса.
5. При конфликте SPEC и кода останови спорное поведение, зафиксируй расхождение
   и обнови источник истины после согласования.

Результат P-03: минимальный diff одного подэтапа.

## P-04 — Проверка и review

1. Выполни проверки из AI_PLAN и затронутой SPEC.
2. Для UI проверь RU/UK, обе темы, keyboard и мобильную ширину; для внешних
   интеграций — негативные сценарии и `docs/SECURITY.md`.
3. Выполни `git diff --check` и проверь, что generated/secret файлы не попали в
   diff.
4. Для STANDARD/COMPLEX используй `$review-change` либо соответствующего
   read-only reviewer по правилам проекта.
5. Не объявляй этап завершённым, если обязательная проверка не выполнялась;
   запиши точную причину и оставшийся риск.

Результат P-04: доказательства по каждому критерию приёмки.

## P-05 — Закрытие и следующий запуск

1. Обнови только документы, факты в которых изменились:
   `AI_STATUS`, `ROADMAP`, `AI_PLAN`, а при необходимости SPEC, architecture,
   decisions, design или security.
2. Пометь завершённый подэтап `DONE`; подготовь один следующий допустимый
   ограниченный `AI_PLAN` либо укажи точный блокер.
3. Создай Conventional Commit. Не выполняй merge, push, PR или deploy без
   прямого разрешения.
4. Сообщи изменённое, проверки и ограничения, затем задай обязательный вопрос о
   merge согласно workspace Git workflow.
5. Добавь раздел «Как увидеть изменения воочию»: команда запуска, точный URL,
   действия пользователя/DevTools и ожидаемый результат. Если diff невизуальный,
   укажи ближайшее наблюдаемое доказательство — тест, log или browser state.

После этого следующая команда `Продолжай Electro Tutor` начнёт уже следующий
подэтап.

## Защита от зацикливания

- Если AI_PLAN уже выполнен по коду, сначала синхронизируй статус, а не повторяй
  реализацию.
- Если один блокер повторяется, не имитируй прогресс и не подставляй фиктивные
  значения.
- Если следующий этап слишком велик для одного commit, выдели первый
  проверяемый подэтап и запиши остальные в ROADMAP.
- Если рабочая копия содержит чужие изменения, не откатывай их; сузь область
  либо запроси решение только при реальном пересечении.
