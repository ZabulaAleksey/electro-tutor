## Micro Labs / ET-MICRO-001 — local acceptance2026-10-29

Existing checkout clean main@e2e0497 → feature/micro-labs, без worktree/dependency/auth/backend changes. `pnpm test`:213PASS/29files, включая14новых invariant/catalog tests. `pnpm lint`:PASS. `pnpm check`:158files,0errors/0warnings/2pre-existing generated WASM hints. `SITE_URL=https://electrotutor.pages.dev BASE_PATH=/ pnpm build`:25pages/24localized routes/126artifacts PASS; WASM/locales/lesson/site audits PASS.
`E2E_EXTERNAL_SERVER=1 pnpm exec playwright test tests/e2e/micro-labs.spec.ts tests/e2e/engineering-showcase.spec.ts --workers=2`:17PASS/37.4s. После последней корректировки формул/локального CSS:7Micro Labs tests PASS/17.6s, включая новый390px formula-width assertion.18уникальных browser scenarios:14models real controls/reset, retained state/search/category keyboard, RC physical time/τ/cursor, permalink/reload/RU-UK, light/dark390/1440, existing8scene carousel/autoplay/swipe/reduced-motion. Accepted prior tests untouched.
Physics: DC power/KVL/KCL; maximum load power; exact RLC resonance; independent RMS integral; balanced phase-current sum/power; RC initial conditions/derivative/energy; diode off/on load line; low-pass cutoff/phase; first-order ODE; drive torque/back-EMF/power; matched/shorted/resistive line boundary. All control corners/time limits finite and selected points fit axes.105topic source roadmap checked:14real bindings/91planned, not client-loaded.
Browser inspection: neutral schematics/polarities/axes/legend and desktop/mobile reviewed;390px document375px, KaTeX errors0, final production browser errors0. Motor t=4s givesω39.730rad/s under declared reduced model. Actual screenshots in chat outputs/micro-labs-desktop.jpg and micro-labs-mobile.jpg. Long formula rows split and2px italic-glyph scrollbar fixed by scoped formula width. SVG title uses a single string child (React hydration fix); only pixel coordinates rounded to0.001SVG units for deterministic SSR, physical values unchanged. Footer global style isolated within micro cards.
Existing preview4322belongs to this checkout and was reused read-only after port discovery; no unrelated process stopped. Own diagnostic dev4326 stopped; own review preview4325 stopped after public acceptance. Public Micro Labs PASS below.

## Micro Labs / public acceptance —2026-10-29

Owner explicitly approved merge/push/publication. Main fast-forward e2e0497→9cacf22fd932ff8e3e65660112094a44468e2514; exact-SHA remote read-back PASS, post-merge213unit PASS. Cloudflare production deployment76b3eaf7-f68e-48f6-b734-31698b68da31/source9cacf22 SUCCESS,1m26s; build1m8s/deploy12s, Node22.23.1/pnpm11.23.0. Primary https://electrotutor.pages.dev/ru/, immutable https://76b3eaf7.electrotutor.pages.dev/.
Actual Chrome primary URL:14cards, all14parameter changes/reset PASS (keyboard, avoiding viewport-dependent click timing). Ohm0.4→0.8A; divider9.6→4V; current divider0.4→0.167A; max power3.6→1.176W; RLC4.545→1.261A; RMS14.142→35.355V; star5→5.435A; RC charge7.585→4.722V/discharge4.415→7.278V; diode4.257→9.208mA; filter0.847→0.079; control0.632→1.896; drive28.54→62.788rad/s; lineΓ0.333→0.6. All reset to baseline.
RC timeline0→5s gives0→11.919V; changingC1000→2000µF preserves t5s, givesτ2s/uC11.015V. Drive category1card; RC search1card; hash reload and ordinary RU→UK preserve selected card. Fresh ordinary navigation errors0; KaTeX errors0;390px document375px/formula overflow0; actual diagrams/plots/formulas visually checked. One rapid forced navigation during an earlier pending Astro transition emitted a transition abort; fresh normal language navigation with updated heading/selected-card wait did not reproduce it, no product fix required. Public desktop/mobile screenshots in chat outputs/published-micro-labs-*.jpg. No backend/auth/payments/dependency change or retest claim.

## Engineering showcase / local acceptance —2026-10-28

Stage ET-SHOWCASE-001; initial clean dc480b3, same checkout/feature branch; code under src/showcase.
`pnpm test`:199PASS/28files, including10physics/catalog tests. `pnpm lint`:PASS.
`pnpm check`:151files,0errors/0warnings,2pre-existing generated WASM hints.
`SITE_URL=https://electrotutor.pages.dev BASE_PATH=/ pnpm build`:25pages/126artifacts PASS,
WASM integrity + locale/lesson/site audits PASS. No dependency or lockfile change.
`pnpm exec playwright test tests/e2e/engineering-showcase.spec.ts --workers=2`:11PASS/16.2s;
8scenes RU/UK light/dark390/1440px + short1440×768, no page overflow or clipped plots/footer,
DC/RLC controls, RC pause/time, retained scene state, search/filter, hash/reload/locale,
swipe,7.5s autoplay, hidden/offscreen/reduced-motion. Earlier bounded14test run also passed
4existing guest learner/completion/resume/level scenarios; accepted tests unchanged.
Model invariants: DC KVL/power, AC instantaneous KVL and S²=P²+Q², RC initial/derivative/limit,
stars KCL/phase voltages, diode PWL/load intersection, magnetic MMF/flux and line reflection/load.
Static examples are not presented as simulators; software figures are own task illustrations.
Final normalized AC phasors/short viewport checks2PASS/4.1s. Context route PASS with registered
SHOW namespace and canonical Status/NEXT. Artifact SHA256697feca01df6a7ce3cc238f83fc35e33bc65c649a45aac4bb0a29370f9b16d7f.
Post-merge 2026-10-29: main fast-forward7d63a28→06a1802,199tests/28files PASS, build25pages/126artifacts PASS, context/diff PASS. Local feature branch deleted after ancestry check. Public acceptance PASS below; backend/OIDC/booking are outside this UI delta.
## Engineering showcase / public acceptance —2026-10-29

Cloudflare Git production main@bbe6c0210b72ca55fc6de0400ae2ea4016d0fe7c; deployment bb3428b1-8dc9-48b5-923c-c822bc4ce346 SUCCESS. Primary https://electrotutor.pages.dev/ru/; immutable https://bb3428b1.electrotutor.pages.dev/. Actual Node22.23.1/pnpm11.23.0 installed; build36s/deploy7s. Correct dist output replaces initial raw-repository deployment09b61d1. Old retry was rejected and not performed; new Git build used current merged source.
Fresh Chrome public consumer path PASS: DC48V→0.48A; AC50→51Hz gives4.545→4.442A; RC2000µF→τ2s, clock advances, pause stable0.58s. Hash rc-charge survives reload and RU→UK; Python search1card; SVG/KaTeX/plots visually checked in dark/light, mobile390px document375px no overflow; KaTeX errors0, console errors0. Desktop/mobile public screenshots are user-facing chat outputs. Local199tests and build re-run after fast-forward merge; all passed. No assertion that private backend/OIDC was retested.
Owner merge, push main and branch cleanup approvals completed; local and remote temporary feature absent, all feature commits retained in main ancestry. Existing GitHub Pages workflow/source config untouched; [skip actions] keeps that deployment independent. User action:none.

## Public address electrotutor.pages.dev — 2026-10-28

Owner approved creating a free second Pages project; display rename alone preserves hostnames.
Source `e62a7cc`, product code unchanged. Exact pnpm11.23 build with new SITE_URL PASS:
25pages/24localized routes/121artifacts; WASM/locales/site audits PASS.
Pages Direct Upload121/121files; production deployment `14ca5990-5285-40db-bb01-6e8bd481c060`.
Chrome https://electrotutor.pages.dev/: home→mesh lesson→2.18A correct feedback→direct reload PASS;
completion retained, SVG visible,9KaTeX/no parse errors, zero captured browser errors.
Lesson canonical URL matches new origin. Old https://electrotutor-mvp.pages.dev/ru/ remains live.
Create failed once with provider unknown error; no project in inventory, one successful retry.
## Static MVP / Cloudflare Pages public acceptance — 2026-10-28

Source `0d4061e`, existing `feature/return-local-dev-consumer`; product code/tests unchanged.
`pnpm@11.23.0 run build` with `SITE_URL=https://electrotutor-mvp.pages.dev`, `BASE_PATH=/`,
empty `PUBLIC_API_ORIGIN`: PASS,25pages/24localized routes/121artifacts, shipped WASM integrity
and394paired locale keys PASS. Global pnpm11.20 conflicted with nested script; exact already
installed11.23 used via process-local PATH shim, no global config or dependency change.
`pnpm exec playwright test tests/e2e/learning-journey.spec.ts --grep 'public learner|explanation levels' --workers=1`:
4PASS/29.0s (RU/UK guest feedback/completion/resume and3levels/reload), no mocked backend.
Chrome `127.0.0.1:4325`: root→RU home→mesh lesson, correct2.18A feedback, direct reload,
SVG circuit and KaTeX visually PASS; zero `.katex-error` and captured browser errors.
Expected current I3=(54−30)/11=24/11A; no backend required.
Owner explicitly approved resource+publication; Pages Direct Upload121/121files, deployment
`c0bbe0d0-280e-45dc-8dac-8d20d96782cf`, https://electrotutor-mvp.pages.dev/.
Public Chrome PASS: HTTPS root→RU home→lesson, wrong1.2A/correct2.18A feedback,
completion retained after direct-route reload; RU→UK retains completion. SVG circuit and9KaTeX
visually PASS, zero `.katex-error`, zero captured browser errors. No login/developer setup.
This evidence covers the public lesson; hosted API/OIDC/booking were not deployed or retested.
## Fresh disposable PostgreSQL —2026-10-23

Post-merge main `7d63a28`: repeated `pnpm test`189 PASS, `pnpm check`, `pnpm build`,
`pnpm backend:test:fast`208 PASS/92deselected (Ruff92/mypy52), `check:context`,
`check:ci-workflow`, `check:hygiene` PASS. This is fresh local main validation. Existing genuine
DB/browser/voice acceptance stays scoped to its recorded runs; hosted rollout was not run.
Receipt: `docs/evidence/night-consolidation-20261023.json`.

New PostgreSQL17.6 with512MiB tmpfs/384MiB memory and original readonly init SQL;
loopback55438. Alembic0→0014/check,83integrationPASS/217deselected, catalog current PASS.
Original personal DB was not started/migrated, container state equal before/after; own
helper removed and all77persistent volume names unchanged. No IdP/voice/manual replay.
Evidence: evidence/docker-hygiene-20261023.json; raw logs retained in local recovery archive.

## Ограничение Docker storage —2026-10-23

Native Compose config всех изменённых profiles PASS. Реальный изолированный psql-helper
запущен только с sleep/network none: image VOLUME покрыт16MiB tmpfs, json-file10m×3,
имена томов PRE/during/POST83→83→83. Это allocation/logging proof, SQL не выполнялся.
Accepted tests и DB schemas не менялись. Evidence: docs/evidence/docker-hygiene-20261023.json.

## Night consolidation —2026-10-23

Canonical source baseline1d12899, feature/return-local-dev-consumer. All4 temporary worktrees
removed after reachable-history and SHA retention checks. Verified full refs/dangling backup
retained; root recovery archive namespace ignored as runtime data. Existing application source,
locks, accepted tests, voice/focus behavior and production resources unchanged.

| Check | Result |
|---|---|
| pnpm11.23 frozen restore; uv0.12.3 frozen all-groups | PASS |
| pnpm test |189PASS/27files |
| backend:test:fast |208PASS/92deselected; Ruff92/mypy52 PASS |
| lint/check/build |PASS;144files/0errors/0warnings/2existing hints;25pages/24routes/121files |
| context/CI/whitespace hygiene |PASS; exact per-process Git trust, no global Git config edit |
| built Chromium |128PASS/6dedicated-live-phase skips |
| Git integrity |PASS |

Stale global pnpm storeDir E: caused ENOENT during restore and nested pnpm auto-install.
Native CLI repaired its single config key to selected C: store with original backup; ordinary
commands now work without a store override. This is tool recovery, not a test waiver.
Original DB/auth/notifications/voice acceptance below was not repeated or relabeled current.
Current receipt: evidence/night-consolidation-20261023.json; routing/approvals: selected STAGES.

# Testing contract

## RC1 — terminal local acceptance, 2026-10-02

Current acceptance supersedes historical pending integration/runtime/manual statements below. Historical attempts retain their own dates/results; they are not current blockers. Canonical status: STAGES ET-RC1; receipt: evidence/rc1/readiness.json.

| Gate / command | Actual result |
|---|---|
| `pnpm install --frozen-lockfile`; `uv sync --project services/api --frozen --all-groups` | PASS; existing pinned managers/locks |
| `pnpm test` | 189 PASS / 27 files, Vitest4.1.11 |
| `pnpm lint`; `pnpm check` | PASS; Astro144 files, 0 errors/0 warnings, 2 pre-existing generated WASM hints |
| `pnpm backend:test:fast` | Ruff format92/lint PASS; mypy52 PASS; 208 tests PASS/92 deselected |
| Real PostgreSQL integration, explicit owned DB55437 | 83 PASS/217 deselected, no skips; non-fatal Windows pytest-cache ACL warning |
| `pnpm test:e2e:built`, CI one worker | 128 PASS / 6 expected dedicated-live-phase skips, 134 cases total |
| `scripts/run-registration-e2e-isolated.ps1` | 1 genuine PASS; Keycloak58181/API8000/PG55437, health live/ready200; signup/student-only profile/lesson completion/reload/logout/login/history/settings/empty inbox |
| `pnpm test:e2e:production-smoke` | 4 PASS; production artifact entrypoints |
| `pnpm check:base-path` | 4 base routes + 1 real Worker/WASM browser PASS |
| Production-like `NODE_ENV=production SITE_URL=https://rc1.electrotutor.invalid BASE_PATH=/ pnpm build` | 25 pages, 24 localized routes, 121 audited artifacts; Rust/WASM parity and 394 paired RU/UK keys PASS |
| `pnpm backend:build` | Existing non-root Docker image builds using locked Python runtime; no Compose services/data started |
| `pnpm audit`; runtime `pip-audit` from locked uv export | 0 frontend findings; 0 known applicable Python runtime vulnerabilities |
| context/CI/hygiene/overlay validators | PASS; exactly one ET-RC1 selector, approved bindings and formal DEV bridge |

New automation: all24 routes at1440×900,768×1024,390×844; internal links/real404, no overflow/duplicate IDs/missing ARIA references/unnamed visible controls/pageerrors. RU/UK answer/feedback/idempotent completion/resume/history, all3 depth settings/reload, delayed identity, denied storage; stale/malformed records have unit regression. Error matrix retains timeout, malformed API, failed reminder save/retry, unauthorized/stale/expired/no-data states; mock error tests are explicitly component/error evidence, not live E2E.

Keyboard: focus-visible, install dialog label/trap/Escape/return focus, mobile menu and reduced motion; computed sRGB core text/CTA contrast in both themes meets4.5 (3 for large text). This bounded automation is not a whole-product WCAG certification. PWA: raster192/512/maskable icons, Chromium installability errors empty, service-worker update/migration/offline public navigation and real offline Worker/WASM PASS; no private API/auth cache. OS/Safari/Firefox behavior is not inferred.

Fresh integration reconciliation before RC1: profiles7 PASS/3 unrelated phase skips, inbox1 PASS, reminders1 PASS; existing worker/Booking ownership/quiet-hours/DST/idempotency contracts retained. Runtime remains integrated in local main since19c6ea2, exact account routes `/ru/account/`, `/uk/account/`, `[data-reminder-settings]` and `[data-notifications]`. No reason to repeat the whole unchanged reminders campaign.

Accepted owner facts: Narrator/UA-19 PASS; RU/UK voice PASS; ET-14.2 policy ACCEPTED. Source is owner confirmation, not fabricated speech observation. `REAL_MANUAL_REMAINING: NONE`. Existing protected Session announcements/focus unchanged. Broad first attempts and test-harness failures are historical: initial JSON import, mock timeout teardown, SW cache-name mismatch and computed CSS Color4 parsing fixed; actual dark primary CTA contrast repaired; final current checks supersede failures without deleting tests.

## Historical canonical acceptance synchronization — 2026-10-02 (superseded)

Docs-only checkpoint09b61d1→0801c32 restored accepted policy/manual evidence. Its unmerged runtime and approval blockers were subsequently closed by explicitly approved local integration through19c6ea2 and real consumer verification. Receipt accepted-gates-20261002.json remains a historical immutable input; it does not override current STAGES/evidence.

## ET-14.2-UA-01 — accepted reminders policy restored

ADR-033/booking-reminders SPEC restored fromf750812. Policy ACCEPTED:24h/1h ON,15m OFF; confirmed IANA zone; quiet hours OFF; defer/skip; inclusive15-minute grace; cancel/new immutable Booking; pending-only recalculation. Main integration DONE; no outstanding ET-14.2-UA-02 user action.

## Combined reminders integration checkpoint — 2026-10-02

- Production source parity with feature0500798 PASS; main bridge/security lock/booking race/spec/evidence preserved. Fresh frontend174, backend202/Ruff/mypy, real PostgreSQL83 with no skips, lint/typecheck/build/context/CI/hygiene PASS. Fresh auth/profile7PASS/3 unrelated skips, inbox1PASS, reminder1PASS, isolated runner exit0; new owned disposable55437 with tracked ro init SQL; original DB/MathMorph untouched.
- Historical preview-startup attempts timed out before tests. Managed readiness diagnostics and cold-start allowance fixed during RC1; current full built run PASS. Earlier broad serial110 PASS/5 expected live skips remains a prior checkpoint, separate from fresh live acceptance.
- Exact resource creation/ownership and current checks: evidence/manual-gates-20261002/reconciliation.json.

## Acceptance reconciliation — 2026-10-02

- UA-19 / Windows Narrator manual acceptance: **PASS**; RU/UK voice manual acceptance: **PASS**, по прямому подтверждению пользователя в этой задаче. Это восстановление ранее выполненного acceptance, не новый агентский speech test; дата/версия/произнесённые фразы старого прогона не выдумываются. Существующий Session сценарий: `/ru/lesson/#booking=<id>` и `/uk/lesson/#booking=<id>`, student READY, tutor START/ACTIVE/END, two tabs и speech/focus.
- ET-14.2 reminders product policy: **ACCEPTED**. Утверждённый ADR-033/booking-reminders contract уже существует в `feature/et-14-2-reminders`; 24h/1h ON, 15m OFF, explicit confirmed IANA timezone, quiet hours OFF by default, cancel + new immutable Booking, inclusive 15-minute catch-up grace. Повторного product decision нет.
- Revalidation: повтор только после конкретного нового изменения соответствующего behavior; восстановление документации и интеграция неизменного принятого behavior не открывают ручной gate заново.
- Main UI audit: inbox уже в `main`, route `/ru/account/` и `/uk/account/`, section `[data-notifications]`. Reminders settings `[data-reminder-settings]` на этих же account screens интегрированы в local main@19c6ea2 вместе с migration0014. Owner — `src/pages/[lang]/account.astro`.
- Fresh feature checks: `pnpm test` 174 PASS; `pnpm backend:test:fast` 202 PASS, Ruff format/lint/mypy PASS (non-fatal pytest cache warning); context/CI/hygiene PASS. ESLint PASS; Astro 129 files, 0 errors/0 warnings/2 pre-existing generated WASM hints; production build 25 pages/24 localized routes/115 audited files PASS; root overlay validator no issues. Historical 2026-09-29 real DB/live reminders/inbox acceptance сохранено ниже/в feature TESTING. Fresh live rerun PASS: auth/profile7PASS, inbox1PASS, reminders1PASS; real DB83PASS/no skips on own disposable PostgreSQL55437.
- Local merge отклонён auto-review до исполнения из-за отсутствия принятого reviewer-ом explicit merge approval. Подготовленная feature implementation и её tests остаются проверенными; Historical rejection resolved by explicit «Да, сливай»; local main19c6ea2 integration and fresh live evidence confirmed. Отдельный merge approval не является ручной product acceptance.
- `REAL_MANUAL_REMAINING: none` для UA-19 / RU/UK voice / ET-14.2. Future Telegram/privacy/credentials и original DB compatibility не имеют реализованного экрана в этом scope и не включаются в текущую ручную checklist.
- Machine-readable evidence: `evidence/manual-gates-20261002/reconciliation.json`; current state/NEXT — `STAGES.md`. Production source, accepted tests, locks и DB не менялись.


## ET-14.2 — terminal isolated reminder verification, 2026-09-29

- Exact disposable PostgreSQL 17.6 container electro-tutor-et142-test-20260928 used its own named volume and 127.0.0.1:55437; ephemeral Keycloak 26.7.2 used 58081 and no persistent volume. The original Electro Tutor and MathMorph containers/volumes stayed untouched. The isolated wrapper stopped its own services after acceptance. Failed-run test DBs were preserved by exact rename, then clean replacements migrated; no original data was reset.
- Clean electro_tutor_test and independently clean electro_tutor_catalog_baseline migrated base→0014 with Alembic check. The manifest was captured from the independent baseline and matched the test catalog. Separate empty electro_tutor rehearsal passed 0013→0014, final 0014→0013→0014, Alembic check and db-status/catalog parity. An earlier disposable DB containing an intermediate 0014 body was preserved by rename rather than treating it as a canonical upgrade target. The original data-bearing 8-column read_booking_operation(uuid) DB was never modified.
- Backend: 202 DB-free PASS; 64 real PostgreSQL integration PASS, 17 existing environment skips and 211 deselected. Tests cover owner-scoped defaults/settings, each offset, quiet-hours/overnight/DST gap and fold, cancellation, queued invalidation, +5/+15/>15-minute grace, expired Booking, two concurrent workers and runtime ACL. Ruff check/format (91 files), strict mypy (52 files), migration and catalog tests PASS.
- Frontend: 174 Vitest PASS, lint PASS, Astro check 129 files/0 errors/0 warnings (2 generated WASM hints), RU/UK locale pairing 369 keys, production build 25 pages/115 audited files PASS. Built Chromium 110 PASS/5 expected live-auth skips, including two mocked reminder UI/keyboard/accessibility cases; production smoke 4 PASS. Full project verify with skip-install exited 0; dependency audit 3 moderate/0 high.
- Live acceptance: pnpm test:e2e:reminders:isolated exited 0 after exact stopped-container/mount/port/image preflight, Keycloak provision, real API health, worker start and browser phases. Auth/profile 7 PASS/3 expected phase skips; ET-14.1 live Booking/outbox/inbox 1 PASS; ET-14.2 real RU/UK settings, keyboard save/reload, 15m opt-in, Booking acceptance, due worker, localized student inbox and foreign/anonymous denial 1 PASS. The ET-14.1 fixture Booking is cancelled after its assertions to avoid overlap with the next phase. Initial harness failures exposed a missing exact 55437 allowlist and cross-phase Booking/selector collisions; these were fixed, with a complete final rerun.
- Automated UI/accessibility checks passed. No manual speech observation was performed by that automated run. Previously completed human UA-19 / Narrator / RU/UK voice acceptance is now owner-confirmed PASS (2026-10-02); ET-10.3 verified. At this historical verification checkpoint ET-14.2 was on feature; later local main integration DONE at19c6ea2. Push/deploy not performed by this reconciliation/RC1 task.

## ET-10.3 UA-19 — manual RU/UK voice acceptance: PASS

- Evidence ID: `ET-10.3-UA-19`; canonical record: эта секция; stage/status owner: `docs/STAGES.md`, record `ET-10.3`.
- Status: **PASS**; human action **DONE**. Ручная RU/UK voice/screen-reader speech/focus acceptance выполнена ранее и принята пользователем.
- Основание: прямое подтверждение владельца продукта в чате от **2026-10-02**: «считать manual RU/UK voice acceptance уже выполненным ранее и принятым пользователем»; «статус: PASS». Это дата восстановления canonical evidence, а не выдуманная дата старого прогона.
- Scope: существующий gate UA-19 для RU и UK — signed-out CTA, student READY, tutor START/ACTIVE/END, two-tab state announcement, keyboard speech/focus. Принятие относится к gate целиком; отдельные spoken phrases, screen-reader version, timestamp и source SHA старой ручной сессии в текущем подтверждении не сообщены и не реконструируются.
- Evidence type: ранее выполненная ручная проверка, подтверждённая пользователем; не новый автоматический прогон. Историческая попытка automation 2026-09-27 ниже остаётся NOT_RUN/BLOCKED_BY_OBSERVABILITY именно для той попытки и не отменяет человеческий PASS.
- Revalidation trigger: только новое изменение, реально затрагивающее voice behavior, объявления screen reader или focus проверенного flow. Отсутствие прежней canonical записи, смена чата/ветки, documentation-only edits и невозможность агента слышать речь не открывают принятый gate заново.
- Связанные isolated backend/live browser PASS сохранены; этот documentation-only checkpoint не меняет product/test/runner source и не запускает runtime. Original DB legacy SQL compatibility и ET-14.2 policy остаются отдельными решениями.

Общее правило сохранения ручного acceptance: уже выполненная и принятая пользователем ручная проверка сохраняет PASS при восстановлении evidence. Сначала оформить подтверждение в canonical record; повторную проверку запрашивать только при новом изменении затронутого поведения.

## ET-NIGHT-BOOKING-RACE-01 — same-version contention, 2026-10-02

- Два отдельных authenticated PostgreSQL connections действительно ожидают authoritative Booking row lock до release; обе launch orders проверены без FIFO assumption. Один winner/version+1, loser version_conflict, один winner operation/audit, grant/outbox только при accept, exact replay без новых effects. Новые2cases PASS1.41s. Existing Booking/Access/Session/Outbox suite15PASS/1skip17.02s; skip требует отдельный migration-lifecycle consent и не является race skip.
- Fresh owned PostgreSQL17.6: base→0013 и AlembiccheckPASS; exact image/nonce/mounts, loopback non55432. Original data-bearing DB/volumes не подключались. После checks exact-owned container clean stop exit0 и synthetic volume removalPASS, nonce matches0.
- Locked uv0.12.3/Python3.12.5 offline restore восстановил отсутствующий venv interpreter без lock/dependency changes. Ruff format85files/checkPASS, mypy48source filesPASS, DB-free199PASS/86deselected5.35s. Commands: `uv run --locked --offline --no-sync ruff format --check --no-cache src tests`, `ruff check --no-cache src tests`, `mypy src`; `pytest -q -m "not integration and not catalog_baseline"` с очищенными inherited ET variables; named race/related pytest files с exact disposable-role URLs only. Registry credentials/URLs и raw private captures в Git не записаны.
- Initial lock-wait instrumentation2FAIL сохранён. Отдельный read-only probe доказал, что migrator видит application_name; первоначальная причина не установлена. Own-PID pg_locks observation прошла; permissions не расширялись. Первый fast-run2FAIL/197PASS вызван обвязкой, передавшей integration URLs unit tests; clean unit environment199PASS без изменения tests. Receipt: docs/evidence/night-20261002-booking-race/verification.json.
- Scope: test-only DB consumer evidence; no API/runtime/source behavior, accepted tests, fixtures, migration, dependency, payment or reminder policy changes. ET-14.2 policy/ET-10.3 speech-focus/original legacy SQL compatibility остаются независимыми gates. No HTTP/browser/production/hosted claim.


## ET-STAR-001 — historical recovery acceptance, 2026-10-01

- Human PASS получен для c19882e: left impedance plane, Re≥0, единые voltage/current vectors справа и синхронный пересчёт. Source уже совпадает с актуальным main/ET-14.2; reimplementation не требовалась.
- Verification branch согласована с main без product changes: frozen offline install, 171 unit/integration tests (21 files), lint, Astro check (124 files, 0 errors/0 warnings, 2 pre-existing unused-variable hints в generated WASM JS), build (25 pages, 24 localized routes, 115 audited files), context/diff checks PASS.
- Target built-browser consumer path: E2E_SPEC=tests/e2e/star-neutral.spec.ts pnpm test:e2e:built — 5/5 PASS; RU/UK navigation, rectangular/polar state, drag/neutral/preset, mobile layout и plot extent. Независимые backend gates не запускались, поскольку runtime/backend source задачи не меняется. Final publication/cleanup evidence — docs/STAGES.md.

## ET-14.1 — terminal isolated notification verification, 2026-09-28

- Historical acceptance snapshot: feature implementation was then local. Current Git recovery proves implementation9762797 is reachable from published main; this historical run establishes local acceptance only, with no production deploy claim. Docker context desktop-linux returned Engine 29.8.0. Read-only preflight captured every container restart policy/mount; preserved Electro Tutor and MathMorph data-bearing containers were stopped/Created before and after. New PostgreSQL 17.6 electro-tutor-et141-test-20260928 used only its identically named volume, read-only repository init SQL and 127.0.0.1:55436. Ephemeral Keycloak 26.7.2 used no persistent volume at 127.0.0.1:58081 and was removed. Disposable PostgreSQL stopped cleanly after acceptance; its volume retained for evidence. No original DB/volume was mounted or mutated.
- Fresh electro_tutor_test and independently fresh electro_tutor_catalog_baseline migrated from base through 0013; Alembic check PASS. The 0013 manifest was captured from the latter real catalog, then matched by test DB db-status. Separate fresh electro_tutor DB reached 0012 with 9-column read_booking_operation(uuid), no notification tables, then upgraded 0012→0013 with Alembic/catalog parity PASS. Empty baseline real downgrade 0013→0012→0013 plus full manifest parity PASS. This does not prove the preserved original 8-column DB migrated.
- Backend 199 DB-free PASS/84 deselected; 75 real PostgreSQL integration PASS/208 deselected with explicit named disposable DB lifecycle consent; 9 transactional catalog drift tests PASS/274 deselected. Notification booking→outbox→worker→owner inbox, duplicate replay, retention, ACL and foreign read regression PASS. Strict mypy 48 source files PASS; Ruff format 84 src/tests files and Ruff check PASS. Actual notification worker --once startup/catalog/delivery/cleanup PASS. Earlier test SQL ambiguous timestamp parameter was corrected and targeted integration rerun PASS.
- Frontend Vitest 171/171 PASS, ESLint PASS, Astro check 124 files/0 errors/0 warnings (2 generated WASM hints), locale/context/workflow/hygiene validators PASS, Rust/WASM artifact match PASS. Static build 25 pages/115-file audit PASS; full built static Chromium 108 PASS/5 expected live-auth skips, including 2 mock API notification component cases.
- Dedicated pnpm test:e2e:notifications:isolated exit 0 after exact mount/image/port preflight, production build, ephemeral Keycloak provision and API live/ready 200. Existing live profile phase 7 PASS/3 expected unrelated phase skips. Dedicated browser notification phase 1 PASS, unskipped: real Booking acceptance → outbox worker → student RU inbox/unread count → keyboard mark-read/reload persistence; foreign UK inbox empty and mark-read 404, anonymous count 401, safe internal Booking link. No manual screen-reader claim. Initial attempts found a too-short PostgreSQL crash-recovery readiness window and missing first-login prerequisite before tutor grant; harness fixed, then complete run passed.
- API/worker error logs expose counts and failure class, not private payload. Separate transactions prevent cleanup failure from rolling back committed delivery. Historical statement superseded: reminder policy ACCEPTED (ADR-033; owner reconfirmed 2026-10-02); integration state is in docs/STAGES.md.
## ET-LINE-001 — численный интерактив длинной линии

### Terminal physics and browser verification — 2026-09-28

- User approvals `ET-LINE-001-UA-01` and `UA-03` cover exactly three numerical assertions. Independent physics, units, initial conditions, topology, CFL/grid sensitivity, old/new expectations and tolerances: `docs/notes/et-line-physics-reconciliation.md`. Classified first-wave single-point oracle `MODEL/DISCRETIZATION_LIMITATION`, series and parallel late-RLC oracles `TEST_CONTRACT_BUG`. Solver code and shipped WASM unchanged; no assertion merely widened around a measured solver value.
- `cargo fmt --check` PASS; `cargo test --locked --offline` PASS: reference 8/8, source-reflection 2/2; `cargo clippy --locked --offline --all-targets -- -D warnings` PASS. Cargo target redirected to isolated Codex work directory because sandbox denied writes to worktree target. `pnpm wasm:check` PASS: source/artifact hash still matches.
- `pnpm test` 168 PASS/20 files, `pnpm lint` PASS, `pnpm check` 119 files/0 errors/0 warnings (2 generated WASM glue hints), `pnpm build` 25 pages, 24 localized routes/115 audited files PASS. `pnpm test:e2e:built` built Chromium 106 PASS/5 expected live-auth phase skips, including line Worker/WASM/Canvas and both locales. `pnpm check:base-path` static build/audits and Chromium 4+1 PASS, including real Worker/WASM under `/electro-tutor/`.
- Native release microbenchmark N=1000/5000/10000 below predates test-only corrections; it remains applicable because solver and artifact are unchanged. No Keycloak, backend DB, original volume or external service is required for this static simulator acceptance. `ET-10.3` manual screen-reader gate remains separate.
- Final committed checkpoint `19b1a27`: `pnpm verify:full -- --skip-install` exit 0 with hygiene/CI, Astro check 119 files/0 errors/0 warnings, lint, Vitest 168 PASS, root built Chromium 106 PASS/5 expected live-auth skips, 25-page build/115 artifact audit, production smoke 4 PASS and dependency audit 3 moderate/0 high/critical. This script does not include Cargo; full Rust evidence is recorded above.

### Historical implementation and original failures

- Изолированный `feature/line-transient-mvp` worktree на local `main` `c19882e`.
  `pnpm install --frozen-lockfile --offline` PASS. `wasm-bindgen-cli 0.2.129`
  установлен локально в ignored `.tools`; `cargo build --target wasm32-unknown-unknown
  --release --locked` и генерация `public/transient-core/` PASS. `pnpm
  wasm:check` подтвердил source/artifact SHA-256. Rust target и Cargo cache
  локальны для worktree, не изменяют общие runtime credentials.
- Rust `cargo test --offline --locked`: 6/8 PASS. `propagation_speed_and_characteristic_relation`
  ожидает `50±1 В` в `x=500 км,t=3 мс`, фактически `52.014588 В` при конечной
  сетке/дисперсии. `series_and_parallel_rlc_remain_finite` требует
  `|I_L|>0.01 А` в `t=20 мс` для обоих соединений, тогда как у последовательной
  RLC при DC конденсатор в установившемся состоянии разрывает путь и `I_L→0`.
  Тогда изменение двух accepted assertions ожидало разрешения и auto-review
  его отклонил; это исторический failed baseline, теперь разрешённый и
  исправленный в terminal verification выше.
  `cargo fmt --check` и `cargo clippy --all-targets -- -D warnings` PASS;
  rustfmt добавил только пробелы, переносы и завершающие запятые, численные
  assertions не менялись. После форматирования Rust suite повторён: те же
  6 PASS/2 FAIL, затем WASM пересобран и hash/build проверены.
- Отдельный `cargo test --offline --locked --test source_reflection`: 2/2 PASS.
  При `Rs=0`, open load и `τ=5 ms` нагрузка проходит примерно `200→0→200 В`
  на последовательных оборотах, а левый порт удерживает `100 В`; при `Rs=Z0`
  вернувшаяся волна поглощается. Это целевой regression test, не закрытие двух
  спорных assertions выше. Новый test отформатирован; Clippy PASS.
- Frontend `pnpm test`: 168 PASS, 20 files; `pnpm lint`, `pnpm check` (118 files,
  0 diagnostics), `pnpm build` (25 pages/24 RU/UK routes/115 audited files),
  `pnpm check:context` PASS после регистрации `LINE` prefix и ADR-031.
  Полный built Chromium: 102 PASS/5 expected unrelated live-auth skips; 3
  первоначальных target cases проверили страницу годографа, RU/UK маршрут
  линии, реальный Worker/WASM/Canvas, `Play/Pause/Reset/Step/seek` и 5000-cell
  reconfigure. После добавления C/L, диагностики и отдельного share-state
  годографа целевой suite: 5 PASS, включая изменение физического `uC/iL`
  после прихода волны и query/hash после RU→UK. После смены default `Rs=0`
  целевой built Chromium 6/6 PASS: реальный Worker/WASM показывает возвратное
  отражение и продолжение колебаний; при ручном выборе `Rs=50 Ω` возвращённая
  волна поглощается. После смены default `pnpm test` 168 PASS,
  `pnpm check` 119 files/0 diagnostics, lint/build/context PASS; ранее полный
  built Chromium 102 PASS на тот момент не повторялся после смены default;
  полный повтор 106 PASS/5 expected skips указан выше.
- `pnpm check:base-path`: `/electro-tutor/` static build/audits PASS,
  существующий base-path Chromium 4 PASS и дополнительный реальный
  `uk/interactive/transmission-line/` → Worker → ES module → WASM путь 1 PASS.
- Reproducible native release microbenchmark (`cargo run --offline --example
  benchmark --release --locked`, 1000 steps; machine-local, single run):

  | N | steps/s | simulated s / wall s | snapshot copy, µs | stored grid/state, KiB |
  |---:|---:|---:|---:|---:|
  | 1000 | 374195 | 1.683880 | 1.14 | 54.7 |
  | 5000 | 76224 | 0.068601 | 43.38 | 273.5 |
  | 10000 | 29734 | 0.013380 | 77.89 | 546.9 |

  Browser DEV overlay отдельно показывает Worker→UI transfer/queue latency,
  copy, frame и steps/s; эти machine-local измерения не служат SLA.


## ET-STAR-001 — несимметричная звезда с нейтралью

- Среда: изолированный `feature/star-phasor-interactive` worktree от чистого local `main` `dc38ee6`; pnpm 11.23.0, frozen offline restore. Сервер, DB, Keycloak и внешние запросы для нового интерактива не нужны.
- Математика: `src/models/star-neutral.test.ts` — 7 PASS: balanced/unbalanced с ideal neutral, balanced/unbalanced с open neutral, finite neutral KCL и `I_N = U_nN/Z_N`, rectangular↔polar, фазный short/singular и `Z_N=0`. В составе `pnpm test`: 168 PASS, 20 files.
- Статика: `pnpm lint` PASS; `pnpm check` 106 files/0 diagnostics; `pnpm build` 21 pages, 20 localized routes и 104 audited files PASS; `pnpm check:context` PASS для `ET-STAR-001` и `INT-004..008`.
- Built Chromium: `pnpm test:e2e:built` 99 PASS/5 expected live-auth phase skips. Пять новых browser cases проверяют маршрут и RU→UK, R/X↔|Z|/φ, drag через fixed header, open neutral, preset, совпадающие точки, mobile без горизонтального overflow и масштабы 0.001/1,000,000 Ω. Финальный целевой прогон 5 PASS. Эти static/browser checks не заменяют отдельную ET-10.3 manual screen-reader acceptance.
- Дополнение 2026-09-28: плоскость Z стоит слева от общей топографической диаграммы, числовые настройки идут после таблицы. В локальном браузере проверены N→A, n→A, N→n, B→A и начало тока в n по координатам SVG, раздельные масштабы В/А и вычисленные цвета тёмной схемы; светлая схема проверена по исходным токенам CSS. После изменения UI повторены unit, lint, type check, build и built Chromium; прежние принятые тесты не изменялись.
- Desktop/mobile layout: при широкой ширине две диаграммы видны рядом; на mobile используются последовательные блоки без горизонтального overflow. Скриншоты предыдущего варианта заменены визуальной проверкой нового локального preview, не используются как evidence новой раскладки.
- Ограничение v1: короткое замыкание фазы, несимметричный источник и URL-state звезды не моделируются по SPEC. Для этого локального consumer path backend gate не применяется.

## ET-10.3 UA-19 historical automation attempt — 2026-09-27

Historical attempt only; current human acceptance is PASS in the canonical UA-19 record above. The old operator template below is retained for provenance, not a pending user request.

- Source: clean `feature/et-10-3-lesson-session` at `f0041ab`; no product/test/runner source change since UA-18 terminal isolated live-auth PASS. Its backend, built-browser and live-auth evidence remains applicable; no expensive suite or disposable runtime was restarted.
- Screen reader availability: NVDA was absent from installed Windows apps, PATH, standard Program Files locations and uninstall registry entries. Windows Narrator `Narrator.exe` 10.0.19041.4522 was available and launched. Computer Use reported that Narrator's window has higher Windows integrity than its helper, so it could not inspect that window; the available interface also provides no spoken-audio capture. Accessibility-tree/DOM assertions cannot establish actual speech or screen-reader focus experience.
- RU and UK signed-out CTA, student READY, tutor START/ACTIVE/END, two-tab state announcement and keyboard focus/trap acceptance: **NOT_RUN / BLOCKED_BY_OBSERVABILITY**, not product FAIL. No announcement was heard or transcribed, no PASS claimed. The precise human evidence request is `ET-10.3-UA-19` in `docs/STAGES.md`. No ET original/preserved DB or MathMorph resource was touched.
- Operator evidence template (one row per language/scenario; no credentials/private DTO): `date | locale | scenario/state | screen reader + version | PASS/FAIL | spoken key phrase | focus observation | failure element, expected/actual, steps`. Follow the UA-19 runbook in `docs/STAGES.md`; an automated DOM/ARIA dump is not a speech observation.

## ET-10.3 UA-18 access contract and isolated live auth — 2026-09-27

- Baseline: clean `feature/et-10-3-lesson-session` at `3703332`. The five accepted ET-10.2 Access-only browser cases mocked Access 200 but left the new Session join unmocked; its genuine anonymous 401 correctly hid private Access and Session regions. The public lesson heading and login/access CTA remain visible. Their fixture now supplies Session 503, preserving the five Access assertions; separate RU/UK join-401 regressions assert public shell visibility and private-region hiding. No backend authorization or production frontend guard was weakened.
- Focused built Chromium after the fixture correction: `22 passed` (before adding the two explicit 401 cases). Final `pnpm test:e2e:built`: `94 passed / 5 expected live-auth phase skips / 0 failed / 0 unexpected skips`, exit 0. `pnpm test`: `158 passed`; `pnpm lint`: PASS; `pnpm check`: 100 files/0 diagnostics; `pnpm build`: 19 pages/99 audited artifacts, PASS. The expected skips belong to the static built phase; the Session case ran unskipped below.
- `pnpm test:e2e:auth:isolated` uses only verified disposable PostgreSQL 17.6 `electro-tutor-et103-test-20260926` and its same-named volume at `127.0.0.1:55434` (`electro_tutor_test`), temporary Keycloak `electro-tutor-et103-idp-<guid>` at `127.0.0.1:58081`, direct `.venv` API at `127.0.0.1:8000`, and frontend preview at `127.0.0.1:4322`. The wrapper checks exact container image/mount/ports, builds frontend before service start, generates in-process ephemeral credentials, provisions minimum local users, applies Alembic/check to the test DB, verifies `/live` and `/ready` 200, runs Playwright, then checks and stops only its disposable containers. No original-bound Compose command, original ET volume, preserved DB, MathMorph DB, saved credentials, email or payment endpoint was used.
- Live auth result: profile phase `7 passed / 3 expected phase skips`; Session phase `1 passed / 0 skipped`, runner exit 0. Real browser login through isolated Keycloak, identity return, student/tutor Access grant and Session join, anonymous 401, authenticated foreign-account masked 404, scheduled-DB-time tutor START, reload, keyboard END, second-tab ENDED, RU/UK copy, mobile overflow and ARIA-region checks passed. Browser observed only `127.0.0.1:4322`, `127.0.0.1:58081`, `127.0.0.1:8000`, `fonts.googleapis.com`, `fonts.gstatic.com`; the latter two are declared font assets. Browser test credentials and traces/screenshots were not persisted. After cleanup, disposable test PostgreSQL was Exited, temporary IdP removed, original ET container remained Created, and MathMorph containers were untouched.
- Terminal rerun on committed source `723fc3f`, after runner cleanup/env hardening: `pnpm test:e2e:auth:isolated` exit 0. Its fresh build passed 19 pages/99 artifact audit; disposable DB ownership/readiness and local API `/live`/`/ready` passed; profile phase `7 passed / 3 expected skips`, Session phase `1 passed / 0 skipped` (3.9 min), same bounded browser origins. Read-only post-run Docker inspect showed `electro-tutor-et103-test-20260926` exited with only its own volume and read-only init SQL, original `electro-tutor-local-postgres-1` still Created with original volume, and no temporary `electro-tutor-et103-idp-*` container. No source changed after this rerun.
- Earlier harness attempts failed on Docker child-process wait, cold IdP startup timeout, trusted CLI port validation, request-header inspection, and premature START assertion. Those harness issues were corrected before the successful full live run. Subsequent read-only review prompted build-before-start, bounded cleanup, and removal of `KC_*` from API/Playwright child environments; no product/browser source changed after the successful gates. Final runner `node --check` and PowerShell parser PASS, `pnpm lint` PASS, `pnpm check:context` PASS, `pnpm check:hygiene` PASS, `pnpm check` 100 files/0 diagnostics PASS (first sandboxed retry could not write generated `.astro` files; same command passed with repository write permission). Historical manual status superseded by owner-confirmed UA-19 / Narrator and RU/UK voice PASS; objective DOM/ARIA/keyboard/two-tab behavior was automated. External SQL caller compatibility remains a separate original-DB repair decision; no claim of absent external callers or preserved-DB parity is made.

## ET-10.3 UA-18 initial isolated backend attempt (historical, before access reconciliation) — 2026-09-27

- Starting source: clean `feature/et-10-3-lesson-session` at `67dd000`. Docker read-only inventory found original `electro-tutor-local-postgres-1` `Created` with `electro-tutor-local-postgres`; historical clone `electro-tutor-et103-clone-20260922` had only its own volume at `127.0.0.1:55433`. That historical clone still returned the legacy eight-field `read_booking_operation(uuid)` without `result_payload`; its `electro_tutor_test` integration suite passed `74/74` after correcting an initial root-directory pytest invocation that had collected duplicate tests from a registered nested worktree. No original or MathMorph container was started, stopped, queried, or mounted by this run.
- New `node scripts/backend.mjs check clone` mode requires `BACKEND_CLONE_CONTAINER` matching a named ET-10.3 disposable container and `ET_TEST_POSTGRES_PORT` other than 55432. Docker inspect must show a running PostgreSQL 17.6 with one same-named data volume, loopback-only binding on the selected port, and at most the read-only init SQL bind. It constructs exact role-specific `electro_tutor_test` URLs; the original Compose lifecycle and preserved volume are never entered. Negative checks reject the original container/55432 before Docker mutation. The ordinary `backend:check` mode is unchanged and remains unsafe for this preserved local DB.
- The old clone already contained an occupied `electro_tutor_catalog_baseline` scratch DB, so its composite attempt stopped after 196 fast and 74 integration PASS without dropping that database. Fresh empty `electro-tutor-et103-test-20260926` was initialized from repository `init-db.sql` on `127.0.0.1:55434`, with its own new volume and no original/MathMorph mount. Full command: set `BACKEND_CLONE_CONTAINER=electro-tutor-et103-test-20260926`, `ET_TEST_POSTGRES_PORT=55434`, then run `node scripts/backend.mjs check clone` from repository root. Exit 0: frozen `uv` sync/lock, Python `pip-audit` 0 known findings, Ruff format (77 files)/lint, mypy (43 files), fast pytest `196 passed / 83 deselected`, Docker API image build, test DB Alembic upgrade through `20260915_0012` and `alembic check`, real PostgreSQL integration/security `74 passed / 205 deselected` without skip, newly created catalog baseline manifest parity plus `9 passed / 270 deselected` rolled-back drift cases, then exact scratch DB drop. Test DB `db-status` and catalog diagnose returned `status=ok`; loopback API `/live` and `/ready` returned 200. This establishes canonical parity on disposable test DB, not repair or compatibility on preserved dev DB. The earlier first composite attempt failed because `ET_BACKEND_CLONE_CONTAINER` collided with strict Pydantic ET config; the selector was moved outside the `ET_` namespace and 196 fast tests then passed. The old-clone composite attempt failed only at its already occupied scratch baseline name; no existing scratch DB was dropped.
- A subsequent composite correctly refused port 8000 (`EADDRINUSE`): the first smoke had killed the `uv` wrapper but left its exact child uvicorn tree. The two PIDs were identified by start time/executable and stopped; direct `.venv` Python launch and bounded exit wait replaced that wrapper. `node scripts/backend.mjs smoke clone` then returned `/live` and `/ready` 200 and left port 8000 free. Final full `node scripts/backend.mjs check clone` rerun exited 0 with the same 196/74/9 test counts and no API listener left behind.
- Root/frontend at current source after command-surface changes: focused backend command contract `14 passed`; `pnpm test` `158 passed / 19 files`; `pnpm lint` PASS; `pnpm check` 99 files/0 diagnostics; `pnpm build` 19 pages, locale/lesson/site audits 99 artifacts PASS. Fresh built Chromium `pnpm test:e2e:built` exited 1: `88 passed / 4 failed / 5` expected live-auth skips. Focused `lesson-access-ui-states.spec.ts` with one worker exited 1: `17 passed / 5 failed`. All failures require the old access-only mock to remain active after an unmocked ET-10.3 Session join; the join returns 401 and current UI correctly hides the protected shell. Accepted test cases were not edited or skipped. Prior UA-17 `92 passed / 5 skips` is historical, not current terminal browser PASS.
- The 74-test real DB run includes `test_read_booking_operation_matches_repository_projection` against `electro_tutor_test`: it asserts the nine ordered fields and `result_payload jsonb`; the historical replay test also checks persisted payload and participant rehydration. The old runtime clone `electro_tutor` still has eight fields; this run neither replaced it nor changed the preserved DB. External SQL caller history remains unknown.
- Live authenticated Session and manual RU/UK multi-tab keyboard/screen-reader checks NOT_RUN. `ET_KEYCLOAK_ADMIN_PASSWORD` and `ET_DEV_TEST_PASSWORD` were absent (names checked without reading values); the current `test:e2e:auth` runner still calls original-bound Compose on 55432 and is unsafe for this preserved DB. Outbound evidence this run covers Python dependency audit and local Docker image metadata fetch; prior UA-16 static browser probe observed only loopback and declared Google Fonts, with the font request aborted. Authenticated Keycloak/API and other flow destinations remain unobserved. No external SQL caller absence is inferred from repository scan; UA-16 compatibility decision remains open for any original DB repair.

## ET-10.3 UA-17 canonical finalization attempt — 2026-09-25

- `git fetch --all --prune` PASS. Clean starting feature HEAD `b6a9558`; local `main` is 31 commits ahead/3 behind `origin/main`, and feature is 15 commits ahead of local `main`. A detached registered worktree at `72212d5` and four other local branches were retained. No merge, push, branch/worktree deletion, or stash mutation occurred.
- Fresh safe gates on canonical checkout: `pnpm check:context` PASS; `pnpm backend:test:fast` 196 PASS/83 deselected with Ruff format/lint and mypy PASS; `pnpm test` 156 PASS; `pnpm lint` PASS; `pnpm check` 98 files/0 diagnostics; `pnpm build` 19 pages/99 artifacts and locale/lesson/site audits PASS; `pnpm test:e2e:built` 92 PASS/5 expected live-auth skips; `pnpm audit --audit-level high` exit 0, 3 moderate/0 high; `pnpm check:ci-workflow` and `pnpm check:hygiene` PASS. Pytest emitted only a local cache-write ACL warning.
- `pnpm check:base-path` initially failed on Windows `EXDEV` because its temporary build output was on `C:` while Astro prerender output was on `E:`. A same-volume ignored `.astro/base-path-*` scratch directory resolved this. The then-reachable artifact audit exposed one RU/UK lesson→account link outside `/electro-tutor/`; it now uses the existing `localePath` helper. Repeated `pnpm check:base-path` passed: 19 pages, 99 audited files and 4 Chromium base-path tests. Temporary scratch output was removed by the script.
- After both code fixes and the canonical state update, final `pnpm check:context`, `pnpm lint`, `pnpm check`, `pnpm build`, and `pnpm test:e2e:built` passed again; the last static browser run was 92 PASS/5 expected live-auth skips. Read-only code review of the two code changes found no actionable defect.
- Docker API was unavailable (`npipe:////./pipe/dockerDesktopLinuxEngine` missing). This turn did not start Docker Desktop, any PostgreSQL container, or the original data-bearing volume. Retained clone and archive integrity could not be freshly inspected; UA-15/UA-16 provenance and hashes remain historical repository evidence. No database migration/reverse/integration was attempted. No ET Keycloak ephemeral password variables were present (names checked without printing values). `backend:check`, authenticated Session browser, outbound audit of authenticated flows, and manual RU/UK multi-tab keyboard/screen-reader acceptance are NOT_RUN/BLOCKED. ET-10.3 remains `implemented_unverified`; no integration or cleanup is permitted.

## ET-10.3 UA-16 isolated terminal verification — 2026-09-25

- Baseline: clean `feature/et-10-3-lesson-session` at `0112c9d`. At preflight, `electro-tutor-local-postgres-1` was already Up on `127.0.0.1:55432` with the original `electro-tutor-local-postgres` volume mounted `rw`; this differs from UA-15 evidence. This run did not start, mount, query, stop, or mutate that original volume/container. The retained disposable `electro-tutor-et103-clone-20260924` alone was started on `127.0.0.1:55433` for real tests, then stopped; its volume remains. No migration SQL or restore mechanism changed, so the UA-15 forward/reverse/archive evidence remains applicable without repeating the heavy rehearsal.
- Port portability: `test_e2e_support_resolves_issues_idempotently_and_verifies_redacted_audit` uses the existing `ET_TEST_POSTGRES_PORT` and four exact role-specific test URLs. The local-only E2E support boundary remains pinned to `55432`; test profile accepts the configured port with range validation and still rejects non-loopback, cross-role/database, URL query/fragment, and issuer changes. Targeted clone test `1 passed`, no skip. Direct `pytest -m integration` on clone `electro_tutor_test`: `74 passed, 205 deselected`, no skip. PostgreSQL absence would fail the executing test.
- Formatting/quality: Ruff formatted only accepted `test_booking_operation_contract_integration.py`; before/after Python ASTs are equal. `pnpm backend:test:fast` exit 0: Ruff format (77 files), Ruff lint, strict mypy (43 files), `196 passed, 83 deselected`. `eslint.config.js` now ignores only `.venv.broken-backup-*` directories in addition to `.venv`; preserved backup was not deleted. General `pnpm lint` exit 0. A pytest cache write warning reflects local ACL, not a test failure.
- Frontend/browser: UA-15 `pnpm test` 156, build 19 pages/99 artifacts, and built Chromium 92/5 expected auth skips remain valid; no frontend source/build inputs changed. This run's 29 existing Chromium lesson-session/localization tests passed on built static output. A temporary Chromium probe checked RU→UK→RU lesson shell, visible text without fallback keys, `html lang`, mobile width 390/390, and zero page errors; `1 passed`, RU/UK screenshots visually reviewed without obvious overflow or language mixing. The normal Astro preview runner timed out after 30 s before readiness, so this bounded probe and focused 29 tests used a temporary loopback static server for the existing `dist`; they are lower-level evidence than authenticated acceptance. The static server was stopped.
- Outbound audit scope: the temporary browser probe covered only unauthenticated RU/UK lesson shell navigation and locale switching. Observed request origins were `http://127.0.0.1:4322` and `https://fonts.googleapis.com`; the latter is declared by `BaseLayout`, `ARCHITECTURE.md`, and `SECURITY.md` and was intercepted/aborted before external delivery. `fonts.gstatic.com` is configured as preconnect but no HTTP request to it was observed in this window. No unexpected third-party HTTP origin was observed in this narrow flow. Authenticated API/Keycloak, classroom/media, other routes, and later time windows were not covered. Separately, after explicit user authorization, `pnpm audit --audit-level high` sent dependency metadata to npm registry and exited 0 with 3 moderate findings, no high/critical.
- SQL caller boundary: static search over tracked application/backend source, migrations, SQL-bearing Python, tests, scripts/jobs and docs/config found one production direct invocation in `adapters/booking_repository.py`; migration `0010` defines the function and direct tests probe it. No additional literal in-repository callers were found. This does not prove absence of dynamic SQL or any external/deployed/historical caller of the old 8-column return type. No original DB replacement or migration was attempted.
- Terminal limits: `backend:check` was not run because its Compose lifecycle targets `55432` and could touch the already running original volume; clone-only constituents above do not establish composite PASS. `pnpm test:e2e:auth` was not run: required ephemeral Keycloak passwords are absent and its `backend:e2e` command invokes the original-bound Compose path. Manual RU/UK multi-tab keyboard/screen-reader acceptance remains open. Current stage stays `implemented_unverified`; selected NEXT is unchanged in `STAGES.md`.

## ET-10.3 UA-15 preflight — 2026-09-24

- Git: clean `feature/et-10-3-lesson-session`, HEAD `39fc307c`. Docker Engine 29.7.2 started; `docker ps -a`, `docker volume ls`, and both `desktop-linux`/`default` contexts show no `electro-tutor-et103-clone-20260922` container or volume.
- Original `electro-tutor-local-postgres` volume exists and has no attached container; it was not started, mounted or modified. The prior protected archive directory exists, but its ACL denies the current Windows identity access to `preserved-pgdata.tar`, so fresh size/SHA-256/integrity verification cannot be claimed.
- Per the prompt's fail-closed precondition, no clone catalog inventory, caller probe against DB, migration, reverse or terminal gates ran. Historical UA-13/UA-14 evidence below remains historical; it does not prove the current host has a protected clone. The precise recovery action is in `docs/STAGES.md` UA-15.

## ET-10.3 UA-15 clone recovery and terminal gate attempt — 2026-09-24

- Source verification: clean `feature/et-10-3-lesson-session` at starting HEAD `03a79dd`; protected `ET-10.3-20260922T202618Z/preserved-pgdata.tar` independently measured 99,788,800 bytes and SHA-256 `aa5d1fa75a53d94f09181347b3c70e627abefbb53d99f85bbe0265e7a78f8bc1`; `tar -tf` and tar extract/compare succeeded. The SHA-256 was checked again after tests. No container attached `electro-tutor-local-postgres`, and that original volume was never mounted or started. The fresh clone `electro-tutor-et103-clone-20260924` mounted only its own volume with a `127.0.0.1:55433` host binding. PostgreSQL 17.6 completed WAL redo and reported ready; runtime DB revision `20260915_0012`, accounts 2, booking operations 0.
- Fresh catalog diagnosis on runtime clone: 10 missing canonical functions, 3 changed, 9 unexpected, and one missing `booking_operations` CHECK. `read_booking_operation(uuid)` still returned eight fields without `result_payload`; owner, runtime EXECUTE ACL, `SECURITY DEFINER`, stable volatility and fixed search path matched the prior UA-13 inventory. Tracked inbound dependencies 0, stored literal function callers 0, active external sessions 0; only `plpgsql` extension was present and `pg_stat_statements` unavailable. This does not prove absence of historical external SQL callers. The repository adapter requires the canonical nine-field replay with participant rehydration. Compatibility decision for this run: test exact replacement only on the disposable clone; no acceptance of potential breakage on the original DB.
- A new empty `electro_tutor_catalog_baseline` database inside the clone migrated through `0012`; `db-status` and catalog diagnosis both exited 0. Closed archive schema on runtime clone preserved 12 existing functions (9 unexpected plus 3 changed), including the old eight-field reader. Transactional forward created 13 canonical functions from the independently migrated reference and added `booking_operations.result_payload` plus its CHECK. Committed catalog diagnosis, `db-status`, and `alembic check` exited 0. Full preflight catalog SHA-256 `de9aba8fd1dde975e9d1b1440ef8bbe8c3b3222362687bdfe1947d5e2352cb0c`; forward catalog SHA-256 `2cd787e31ed5756128575b2d1d309f92b8c4d9f0ee61d4a8b4bb40e6243447d2`. Reverse dropped only those 13 new functions, returned all 12 archived originals, and removed the added CHECK/column; full catalog and original function inventory hashes matched preflight. A second forward restored canonical parity for terminal checks. No original-volume DDL was run. After checks, only the clone container was stopped cleanly and its volume was retained.
- The clone's separate `electro_tutor_test` DB had one unexpected seven-argument `reserve_booking_operation` overload. With zero tracked inbound dependencies and no active clients, it was transactionally moved to a closed test archive schema; both clone runtime and test databases then passed `db-status`/catalog parity. The test database is disposable clone data, not the preserved source.
- Backend gates: repaired runtime clone's read-only `test_read_booking_operation_matches_repository_projection` passed (1/1); direct `pytest -m integration` on clone test DB passed 73, skipped 1, deselected 205. The skip is `test_e2e_support_resolves_issues_idempotently_and_verifies_redacted_audit`, whose accepted guard requires exact port `55432`. Ruff lint passed, strict mypy passed (43 files), and direct non-integration pytest passed 196. Composite `pnpm backend:test:fast` stopped at Ruff format in the pre-existing accepted `test_booking_operation_contract_integration.py`; the test was not edited. Direct clone-only API factory served `/live` and `/ready` with HTTP 200, request IDs and `no-store`, with ready revision `20260915_0012`; the API was shut down after smoke. Full `backend:check` uses Compose and fixed `55432`, so it was not run against the original volume.
- Frontend gates: `pnpm test` 156 passed; `pnpm check` 98 files with zero diagnostics; `pnpm build` 19 pages, locale/lesson/site audits passed (99 files); `pnpm test:e2e:built` 92 passed and 5 expected auth skips. Global `pnpm lint` failed on 51 diagnostics inside pre-existing ignored `.venv.broken-backup-20260924-01`; targeted `eslint . --ignore-pattern 'services/api/.venv.broken-backup-20260924-01/**'` passed without changing the backup. No live authenticated Session browser was run: required local ephemeral passwords were absent. Manual RU/UK and outbound dependency audit remain open.

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

Historical pre-UA-18 local frontend evidence: `pnpm test` 156 passed, `pnpm check` 0
diagnostics, `pnpm lint` and build/audits exit 0; Session mocked browser states
6 passed; `pnpm test:e2e` and `pnpm test:e2e:root` each 92 passed with 5
expected phase-dependent skips, exit 0. At that historical point, authenticated Session and manual checks were NOT_RUN. Superseded by UA-18 live PASS and owner-confirmed UA-19 / Narrator / RU/UK voice PASS (2026-10-02). Real PostgreSQL `backend:test:integration` passed 72 (189 fast
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
were NOT RUN at that earlier point. Current UA-18 live/browser evidence is at
the top of this file; manual acceptance is now PASS per the restored UA-19 record. Detailed
user actions are in selected `STAGES.md`.

## RC1 post-integration readback

Authorized clean local main19c6ea2 -> bee6ddc fast-forward DONE. No source conflict; all feature/docs/bridge ancestors retained. Context/CI/hygiene readback PASS. Source manifest uses canonical LF for UTF-8 text and exact binary bytes; pre/post checkout differences independently proved CRLF-only, not a behavior change. No repeat of unchanged campaign required. Own DB containers stopped/ephemeral IdP exited; important worktrees retained. Final receipt: evidence/rc1/readiness.json. No push/deploy/publication.


DEV-LDC: две исходные `test_same_version_accept_cancel_has_one_atomic_winner`
проверки (`accept`, `cancel`) выполнены отдельно на доказанно новой disposable
БД контейнера/volume `electro-tutor-et103-test-20261008`, loopback `55434`,
исходный readonly init SQL, Alembic `20260928_0014`: **2 passed, 0 skipped,
28.40 s**. Это закрывает два skip-сценария предыдущего native integration
запуска (81 PASS/2 SKIP), сохраняя его исходный результат; повтор полной suite
не выполнялся. Новый контейнер остановлен, данные/volume сохранены; SSH
освобождён, прежние 19 ресурсов и source/config/default/ledger POST неизменны.
Evidence: `ELECTRO_DISPOSABLE_RACES_TERMINAL_V1` в текущей DEV-LDC Task.
V23 потерявшая token BACKUP/session остаётся UNKNOWN_HOLD; GER-15 неизменён.
Frontend/auth/cold acceptance и весь infrastructure MASTER остаются partial.

## ET-PANORAMA-001 — local release candidate,2026-10-29

- Existing checkout/feature/panoramic-redesign, source main1a23a2e. No new dependencies/services/worktrees; OIDC/auth unchanged.216unit/30files PASS; lint PASS; Astro163files/0errors/0warnings/2pre-existing generated-WASM hints. Production25pages/24localized routes/128artifacts PASS, same SITE_URL/BASE_PATH and pinned pnpm11.23.0.
- Unchanged accepted engineering-showcase11 + micro7 and new panoramic3:21built Chromium PASS/43.1s. Final3new PASS after board pointer event snapshot correction; tests include pageerror rejection for board/surface, draw/erase/clear/undo/SVG download contents,4/3/2/1responsive columns, real expansion with retained calculations, line short/matched/load/time boundary and camera/2D. Existing accepted tests untouched. Three new pure line tests verify delay/initial state/return timing/KVL/load power.
- Early test attempt used stale previous-run localhost4322 (connection refused). No foreign process stopped; all actual successful E2E used own built preview127.0.0.1:4328 via chat-work config overriding only baseURL/testDir/webServer. Desktop bounds failures after initial hero reduction were fixed by530px stage and175px plot; repeated full21PASS. Browser found React event.currentTarget lifetime in board updater; fixed by snapshotting point before updater and strengthened new board test. SVG phase coordinates/board screen samples serialized to.001unit; no physics rounding. Exact planar front domains replaced coarse stair-step surface interpolation.
- Identity: visible paired strings/metadata/display use ElectroTutor. Legacy brand.name and potential-* storage/cache URLs retained; accepted compatibility unit tests pass. Paired locale validator explicitly approves invariant brand.display/lesson.brandSeparator. SVG logos have compact/maskable/light/dark variants, PNG installation icons rasterized from own SVG using already installed sharp; no new package.
- Reference checks are separate: original14analytic invariants retained; Ohm/RLC/RC source/symbol polarity/topology visually checked against model, units/initial states and reset. STUD resolved read-only via environment/STUD_STORAGE/registry discovery to catalogued electrical-course material; no specific variant was assumed to validate a generic demo, no student/closed material copied and no STUD runtime dependency. Reference-first applies to reproductions; current examples remain original analytic demos. Rosstandart official bibliographic applicability/status checked for ГОСТ2.701-2008,2.702-2011,2.728-74; full normative certification is NOT_RUN, not inferred from math or bibliography. Sources: https://protect.gost.ru/gost/details/87f1f382-a055-48b7-ae80-f359ff5e1f4e ; https://protect.gost.ru/gost/details/d9c1c334-2a90-45cb-ac00-c31da92d706b ; https://protect.gost.ru/gost/details/ba115ccd-e5aa-4ba1-a672-b17170f1a7f2 .
- Prior public release remains Micro9cacf22; this candidate is not deployed. New public smoke requires exact owner permission and successful Cloudflare deployment.

- Identity/PWA terminal checks: unchanged product-pwa2PASS, actual FR-008 update/offline lifecycle1PASS/5.8s. The latter fixture hardcodes upstream4322; first attempt against4328-only was an environment502/timeout, resolved by an owned loopback static server serving the same dist on4322. Accepted tests/config unchanged;3PWA scenarios cover raster dimensions/installability, actual offline WASM/lesson, safe migration/private guard. Independent scoped reviewer reported no critical blockers; pointer-only drawing is a stated limitation. Manual390px image exposed collapsed hamburger spans and inherited footer stacking; local CSS corrected to a visible44px menu and row footer.

- Final CSS smoke:10micro/panoramic browser checks PASS/14.9s after mobile menu/footer fix; actual Chrome390px document375px, visible44px hamburger and real menu expansion PASS, native PNG saved in chat outputs/panoramic-micro-mobile.png. Desktop4columns and light scientific cards visually compared with attached reference; outputs/panoramic-micro-desktop.png. Clean proof tab errors0. Browser screenshot captureBeyondViewport timed out; native viewport screenshots used, no evidence inferred from timeout. Fresh screenshots are local candidate evidence, not hosted acceptance.


## ET-VIS-001 — проверенные инженерные источники

Read-only router: `${STUD_ROOT}/AGENTS.md` → `.codex/00_SYSTEM/STUD_RULES_INDEX.md`, корень проверен через STUD_STORAGE. Только применимые owners; исходные задания, персональные данные и внутренние каталоги не публикуются. Таблица — provenance применённых требований, не копия правил.

| Owner относительно `${STUD_ROOT}/.codex/` | Scope / IDs | SHA256 |
|---|---|---|
| `05_FORMATTING/FIGURE_POLICY.md` | GLOBAL / contextual; FMT-FIG-030..035; AXIS-001..008; LL-001..006 | `3aeb7915abb352053aeda7fe693a8cec755f816582f1aac63cbbf31bfca71905` |
| `02_GLOBAL/CALCULATION_CORE.md` | GLOBAL; G-CALC-001..009 | `37b36502ec8e664f0ad5326b1053d01b6705ed2016f75d7f2f8f40eb247bdcce` |
| `02_GLOBAL/SYMBOLIC_BEFORE_NUMERIC.md` | GLOBAL; G-SYM-001..018 | `564a40972dff38c271336c47fc1579c577d01d0f0e15b5db09f0fdd7309f8c0a` |
| `02_GLOBAL/UNITS_AND_DIMENSIONS.md` | GLOBAL; G-UNIT-001..014 | `d6563edcc86d95a29801aa6afe98f9526e8bc06b67259ffe74bd252682c2efcd` |
| `04_NOTATION/DECIMAL_LOCALE.md` | GLOBAL; NOT-LOC-001..010 | `d6f63d7f9edc3972391cd8ae6850364c15a14c102402026e8ba37a969d4183f5` |
| `04_NOTATION/UNITS_RENDERING.md` | GLOBAL; NOT-UR | `64c84408b1ed98e48e61d58a574531d0b29435a1ce3a45d3090c2156d0de0805` |
| `02_GLOBAL/BODE_ALGORITHM.md` | CONTEXTUAL; G-BODE-001..006; one-pole adaptation | `e22b49d03383dd0adce385d57603dce2f8ca096db83422e145a7a22d7d2095a4` |
| `07_VISIO/VECTOR_DIAGRAM_SEMANTICS.md` | CONTEXTUAL; VIS-VEC-001..029 | `f421439121582c42c57cdc7cdcae0e38151ffdfbd670afbbc20f88f2692ff0d2` |
| `07_VISIO/COORDINATES_AND_SCALE.md` | CONTEXTUAL; VIS-SCL-001..018 | `c24a5a24c0f9d67befbd463e1566c9b379df3cfab6bf6188f7d10b394b26dd7b` |
| `13_DOMAINS/electrical_engineering/CIRCUIT_VERIFICATION.md` | CONTEXTUAL; EE-CIR-001..015 | `4d9a93112b505c69361541e2f02e6c5e70ac4e0b2848c54a0a9d5acf68dd9536` |
| `${STUD_ROOT}/НИУ МЭИ/AGENTS.md` | UNIVERSITY-SPECIFIC; STUD-MPEI-GRAPH-PAPER-001, academic document only | `5c936198896ee6550621af3372a48102ef544abf586573a69c54482b59ec8a80` |

REFERENCE-SPECIFIC требования номера/точки A/референсного масштаба не обобщаются. STUD Bode T03: один полюс τ=0,1с, ωc=10рад/с, Lc=−3,0102999566дБ, φc=−45° независимо воспроизведён аналитическим комплексным ответом. Общий Python-engine/исполнение учебной работы не переносится. Нормативный документ MPEI/DOCX и полная ГОСТ-сертификация не заявлены.

Локальная приёмка2026-10-29:231unit/32files PASS (15новых предметных:12axis/units/plot/Bode/phasor/sample +3rendered-primary-circuit topology); lint PASS; Astro173files/0errors/0warnings/2pre-existing generated-WASM hints; production25pages/24localized routes/129artifacts PASS. Built Chromium41PASS/51,4с:11showcase +7micro +3panoramic +5engineering-standard +5star +4circular-state +6transmission-line. Accepted tests не изменялись. Ошибка раннего invalid-data Canvas branch (left до объявления) устранена; итоговая type/build проверка PASS. Исходная новая3D-проверка дождалась hash hydration до чтения DOM; числовой контракт не ослаблялся.

Scope evidence: AXIS-001..005; PLOT-001..005; CIRCUIT-001..003 для Ohm/RLC/RC; PHYSICS-001; 3D axes/units/export/shared t/x проверены. Данные не округляются ради оси, tooltip содержит исходные samples; RC τ/initial/final и RLC f0/diode KVL проверены, комплексная геометрия изотропна. Canvas cursor соответствует фактическому sample x. Source equations/solver/worker/auth не переписывались. Это предметные frontend-проверки, не аудит всех STUD работ и не новое full backend E2E.

Final UI: actual Chrome390px/document375px, stacked Bode plots/axes visible, no KaTeX errors/console errors; screenshot chat outputs/engineering-standard-mobile.png. Desktop exact/asymptotic curves, cutoff marks and45° phase ticks visually checked. Scoped reviewer second pass confirms measured Canvas Y margin/right alignment and early invalid-data fallback fixed; no blocking findings.
Completion sync: README/STAGES/ROADMAP/DESIGN/TESTING/ARCHITECTURE/DECISIONS/requirements-ledger and SHOW SPEC updated. SECURITY/API/DATA_MODEL/DEPENDENCIES/FALLBACKS/TRACEABILITY/LEARNING_LOG checked by affected scope, unchanged contracts/no new runtime or learned diagnostic warranting duplicate record.

Public first pass: source158cc9c, Cloudflare05bd5003-4aad-4ca5-b8fd-c95b7f1c5b6f SUCCESS37s/build28s/deploy6s. Same public15checks:13PASS/2FAIL (early fill before React hydration leaves SSR draft while model is initial, Micro category case and star isotropy case). This is not terminal hosted PASS. Narrow correction: native disabled fieldset until mount in existing Micro/star islands, no test/solver change; repeated local/public acceptance required.

Hydration fix final local gates:231unit PASS,0type errors/0warnings (2known hints),lint/build PASS;20built browser PASS/21,3с (5engineering+7micro+5star+3panoramic), identical accepted tests. Native fieldset disabled and hidden from accessibility tree until mount; disabled controls do not advertise readiness or accept first edits. SSR visual/reference content remains, wrapper display:contents preserves geometry. Initial disabled-only attempt revealed keyboard press can target an unavailable accessibility control; readiness visibility corrected in product, no test edit.


## ET-VIS-001 / ET-PANORAMA-001 — public terminal receipt

2026-10-29: authorized main fast-forward1a23a2e→158cc9c→26985b68895d9aad648ba792cfaa2465200b8f52 and ordinary origin/main push, exact-SHA remote readback PASS. Final Cloudflare12ca3006-7c24-41d5-82cd-4e01c2e647ca SUCCESS40s/build30s/deploy7s, Node22.23.1/pnpm11.23.0. Primary https://electrotutor.pages.dev/ru/ ; immutable https://12ca3006.electrotutor.pages.dev/ . Provider success alone was not used as hosted acceptance.

Unchanged15public Chromium checks PASS/24,7с after narrow readiness fix: all14Micro parameter/reset scenarios; categories/search/state/time/direct hash reload/RU-UK/light-dark/mobile/formula widths; Ohm raw sample/units/grid; RC τ/RLC resonance/diode KVL; Bode log ω/exact cutoff/asymptote; advanced complex-plane isotropy;3D axes/export/shared t/x/2D boundary; actual board draw/erase/undo/SVG. Tests/config source not changed; chat config only selects primary HTTPS instead of local preview. Earlier13PASS/2FAIL remains recorded above, resolved rather than hidden.

Ordinary Chrome primary URL independently: Ohm48V/60Ω→0,8A, reset24V/60Ω→0,4A, cursor48V/0,8A; exact Bode units/decades/−3,01dB/−45° visible.390px document375px, KaTeX errors0, console errors0. Public screenshot chat outputs/engineering-standard-public.png. Same UI checked desktop and mobile; no hosted-backend/auth claims. All unrelated hosting/resources/secrets/GitHub Pages preserved. Exact temporary feature ancestry verified; remote feature/panoramic-redesign absent. Final receipt-only commit does not change deployed code and uses [skip ci]; final local temporary branch removed after integration. Own test preview stopped after public verification.


## ET-LABS-002 — первый релиз научных лабораторий,2026-10-29

`pnpm test`:282PASS/37files; wave23independent tests include matched/open/short/source echoes,2/3sections, Kirchhoff, power/energy, RC/RL/RLC convergence, precharged initial states, right-continuous endpoints and exact-surface partition. Fourier21math/config/basis tests include DFT convention, full inverse, signed frequency, endpoint, orthogonal bases and bounded imports. Science12models tested analytically and at supported parameter extremes. `pnpm lint` PASS; Astro check199files/0errors/0warnings/2pre-existing generated WASM hints. Production build31pages/30localized routes/146audited artifacts, WASM hash/locales/lesson/site audits PASS.

Primary line model: lossless serial chain1..6sections, source at chain node, optional shunt resistors, resistive exact characteristic fronts with finite floating-point/tiny-amplitude tolerance. Reactive series/parallel RLC uses delayed characteristics + trapezoidal companion states, explicitly numerical, bounded24ksteps and rejecting unsupported live reactive events. Nonzero states checked for algebraic compatibility. Source/animation/surface use the same stored run. Conservative locked ranges are bounds, not claims of attained extrema. Arbitrary branches/losses/nonlinear networks are not claimed.

Independent physical references: MIT6.013 chapter14.4 https://web.mit.edu/6.013_book/www/chapter14/14.4.html ; MIT traveling waves problem Z2=2Z1 (Gamma1/3,T4/3,power) https://ocw.mit.edu/courses/res-8-005-vibrations-and-waves-problem-solving-fall-2012/pages/problem-solving-videos/traveling-waves-without-damping-1/problems/ . STUD root/index/storage resolved read-only; applicable generic EE-CIR/GLOBAL scale/SI/verification rules retained from ET-VIS. Scoped STUD long-line registry discovery is provenance only: no specific student variant read/copied or claimed verified.

Fourier Sketch source read-only local and GitHub HEAD2bb44a18c53bf1097d27c3c2aaff3f13a3206ffe. Adapted DFT1/N negative exponent, inversepositive, signed Nyquist-N/2, amplitude/interleaved ordering and orthogonal basis features. Source blobs: basis_decomposition.py72d91a5c25ab1564270517ed16677a0cdb1bdba0 (build_basis_timeline444–507), MATHEMATICS.md0ee181dacb4dd8bdfcdb813740709e8478b80645, indexed_basis.pye6a667e562e1dc52a6ffde2ddce41bbe77fac9b, epicycles.py707615fb69ed83d13f9798c714fb50b8d8b420e3, resampling.py676b01c8db9b2217915f53b804e7ff83a71039f9. Product centering/max-radius normalization is explicitly its own bounded convention. Raster/vector import, general multicomponent image extraction and video export are deferred; local config roundtrip and coordinate CSV export are implemented.

Accepted historical tests remain unchanged. V2 explicitly supersedes preset/apply/CFL primary UI contract; the original real Rust/WASM lab is retained at transmission-line-reference. Its route-adjusted compatibility harness is separate from primary V2 acceptance; no legacy UI failure is silently called a PASS. Browser evidence and public receipt follow below after execution.

Local browser receipt:28new/affected PASS after role/export regressions fixed;17unaffected PASS in initial combined run (micro/panorama/star/circular). New primary offline1PASS after corrected probe time4ms (arrival3.75ms). Route-adjusted retained-reference harness7PASS including real WASM load/device/source and offline; original accepted files unchanged. Science2PASS after final card class/style fix. No full auth/backend audit or hosted PASS inferred.

Hosted checkpoint3641aab/15a8bedf:15/16PASS. Offline race: data-ready was true from SSR initial run before Worker fetch/first reply. Fix initializes pending and requires mounted+completed reply; no SW/cache policy change. Line6browser PASS after fix; hosted retry pending.
