# Electro Tutor — Productization / Release Candidate 1

Статус: approved bounded contract по прямому запросу product owner 2026-10-02.
Scope: связать существующий Web + PWA, один опубликованный RU/UK урок, три
инженерные лаборатории, существующие OIDC/Account/Booking/Session/inbox/reminders.
Не вводить Electron/Tauri, новые курсы, AI/платежи/recording/Telegram/media.
Stage/evidence/status owner — ../../docs/STAGES.md, ET-RC1.

## Requirements

- RC1-001: public landing/catalog -> authored lesson -> meaningful practice,
  feedback, completion, leave/return/resume -> account/history/inbox/settings
  образуют связный consumer path. Account доступен из общей навигации; next/
  back actions ведут на реальный published route. Future/demo content отмечен
  как недоступный либо practice lab, не выдается за завершённый новый курс.
- RC1-002: на существующем worked example ученик проверяет ток общей ветви
  I3=24/11 A (rounded 2.18 A, tolerance 0.03 A); comma/dot ввод валидируется,
  feedback различает invalid/incorrect/correct; completion idempotent. Источник
  ответа — уже проверенный MeshLesson, новая физическая модель не создаётся.
- RC1-003: reading step (1..5), completion и last visited timestamp сохраняются
  в versioned bounded browser storage и переживают reload/leave/return/login
  на том же устройстве. UI явно сообщает «на этом устройстве», не обещает
  server/cloud/cross-device sync. Guest и authenticated subject имеют разные
  namespaces; identity derives only from successful server /me and stable
  issuer/subject (hashed, no email/token/password in storage). Expired/foreign/
  unavailable auth never reveals another account history. Malformed/quota/
  denied storage does not crash the app; visible unavailable-save state.
- RC1-004: authentication uses existing provider-owned login/session/cookie
  boundary; provide coherent sign-in/profile/logout/return. Inspect whether
  existing provider supports self-registration, enable only a bounded declared
  non-privileged account creation flow if safe; new identities cannot self-
  grant tutor capability. Production-like client uses explicit validated API
  configuration (HTTPS, or exact loopback HTTP for local evidence), not a
  hidden port-only assumption. No secrets in static assets; unconfigured/
  unavailable services have product-level unavailable state, no fake success.
- RC1-005: audit every built localized route and internal link, desktop/tablet/
  mobile (1440x900, 768x1024, 390x844), semantic headings, controls/labels,
  keyboard/focus, focus-visible, reduced motion and dialog/ARIA/live regions.
  Fix deterministic overflow/overlap/navigation defects. Automated DOM/ARIA
  evidence does not re-open or impersonate the accepted UA-19 speech gate.
- RC1-006: loading/empty/no-data/unauthorized/expired/unavailable/slow/timeout/
  failed-save/malformed-response states show understandable localized product
  feedback and recovery. Existing ownership/CSRF/duplicate reminder safeguards
  remain unchanged. UI has no raw exception/JSON/Stage IDs/DEV banners.
- RC1-007: Web + installable PWA remains primary target: valid manifest/icons,
  project-base-aware service worker, offline shell and visited public lesson,
  update behavior and no private API caching. Native packages out of scope.
  Installed-client update must be tested. Retain the accepted v2 cache/key
  contract for additive public assets; cache schema/key format changes require
  a version bump and separately approved acceptance-contract migration.
- RC1-008: inventory feature flags, unused/deprecated/demo surfaces, public JS/
  assets/build bytes and obvious heavy bundles. Remove only proven-unused
  code/flags; no blind cleanup or performance claims without measured evidence.
- RC1-009: frontend/backend unit+integration, lint/typecheck/build, context/CI/
  hygiene/overlay, built browser, genuine auth/inbox/reminders and genuine
  product lesson persistence consumer path PASS before RC1_READY. Browser/
  runner infrastructure issues are agent work; mocks only cover error matrices,
  not terminal consumer evidence. Build/runtime startup has declared config,
  bounded readiness and safe diagnostics. Original DB/MathMorph never mutated.
  Local Docker logs use json-file max-size10m/max-file3. The PostgreSQL db-role-bootstrap
  client covers its implicit data VOLUME with a16MiB tmpfs and creates no persistent
  anonymous volume; existing roles/schema and database data mounts are unchanged.
- RC1-010: synchronize canonical STAGES/ROADMAP/TESTING/SPEC/architecture/
  API/security/traceability/ledger as facts change; generate detailed
  PRODUCTIZATION_REPORT and content-free readiness evidence. Keep UA-19 /
  Narrator PASS, RU/UK voice PASS, reminders policy ACCEPTED. Only a concrete
  new change to those accepted behaviors can trigger narrow new manual gate.

## Acceptance / journey

Public RU and UK: home -> catalog -> existing lesson -> incorrect/correct I3
practice -> completion -> leave -> home resume -> restored reading/completion
-> account history; all without backend mocking for local learning storage.
Authenticated live: provider login -> own profile -> Booking -> Session shell
(historical unchanged-source live acceptance), own settings -> due reminder
-> inbox -> mark read -> reload -> logout; own/foreign/anonymous checks.
New account self-registration must be genuinely observed at the declared
disposable provider when claimed; otherwise record a precise technical blocker.

## Security / boundaries / rollback

Learning records contain only public lesson identifier, bounded step/completed/
timestamp; hash namespace is isolation for product UI, not encryption or server
authorization. No arbitrary href/object/HTML serialization; routes derive from
published lesson IDs. Server identity unavailable -> isolated guest mode,
never a cached authenticated identity. Private API/cache remains fail-closed.
Browser-only learning persistence is an explicit RC1 scope choice approved by
the request to connect existing features without a new large server subsystem.
Rollback: revert bounded RC1 source changes; existing v1 browser records may be
ignored, never delete original DB/user/runtime/worktree content. New provider
registration/config changes require dedicated own/foreign/default-role tests.

RC1_READY means a locally validated release candidate and production-like Web/
installable artifact, not deployed/published production backend or release.
No push/deploy/tag publication/worktree deletion is included.

## Isolated registration infrastructure

RC1 registration uses its own disposable database/container and provider.
If historical IdP loopback58081 is owned by another project, preserve it.
A dedicated test-only opt-in ET_TEST_OIDC_PORT=58181 may select exactly
http://127.0.0.1:58181/realms/electro-tutor-dev for test profile and the
owned registration runner. Default/local/CI identities and all existing
allowlists remain exact unchanged. Arbitrary ports/hosts/realms or privilege
changes are forbidden. Negative tests must reject test opt-in in local/CI
and every alternate value; accepted tests remain unchanged.

## Bounded dependency security fixes

Current RC1 advisory gate found high transitive findings in fast-uri3.1.6,
brace-expansion1.1.18/5.0.9 and devalue5.8.2. Use existing pnpm overrides,
patched compatible fast-uri3.1.7, brace-expansion1.1.20/5.0.11 and devalue5.9.3;
no package-manager/framework migration or new dependency. Regenerate lockfile
only through pinned pnpm, prove frozen restore and current tests/build/browser
plus high-severity advisory gate. Lower severity residuals remain explicit
bounded debt, never change the release audit threshold to hide a finding.

Backend runtime advisory repair: retain PyJWT 2.x crypto API, raise minimum to
2.14.0 (patched release for 13 current findings), regenerate through uv only.
Verify locked restore, backend checks and genuine OIDC signup/session journey.
Identity loading must disable progress writes until the authoritative namespace
is resolved; a slow /me response must not complete a signed-in lesson as guest.

Compatible moderate patches also available: fast-uri3.1.8,
brace-expansion1.1.21/5.0.12, Vitest4.1.11 (including mocker).
Use the same pinned manager; no framework or runner replacement.
