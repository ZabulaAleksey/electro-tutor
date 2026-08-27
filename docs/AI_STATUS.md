# Статус проекта для AI-сессии

## Production deployment — 2026-08-28

- Production provider: GitHub Pages; URL:
  `https://zabulaaleksey.github.io/electro-tutor/`.
- CI/CD: единственный активный workflow `.github/workflows/pages.yml`; push в
  `main` запускает GitHub Actions и автоматическую публикацию Pages.
- Toolchain: Node `22.23.1`, `pnpm@11.23.0`, frozen install и Astro static
  output `dist/`.
- Production inputs: `SITE_URL=https://zabulaaleksey.github.io` и
  `BASE_PATH=/electro-tutor/`; root redirect на `ru/` выполняет Astro.
- GitHub Pages deployment и автоматический deploy из `main` проверены вручную
  на live-сайте. Production-like local build и artifact audits — PASS: 14
  localized routes, lesson publication audit, 90 files с base
  `/electro-tutor/`. Live evidence предоставлено оператором; URL workflow run и
  commit SHA в repository не зафиксированы.
- Cloudflare deployment выведен из эксплуатации. `wrangler`, `wrangler.jsonc`,
  `public/_redirects`, дублирующий `.github/workflows/deploy.yml` и правило
  `.wrangler/` удалены; исторические записи сохранены как history/evidence.

## Tutor Stage 0 baseline — 2026-08-27

- `TUTOR-00` завершён и validated locally; product code/config не изменялись.
- Brownfield reconciliation подтвердил Astro static production boundary,
  единственный pnpm lockfile и существующий полный project overlay.
- Baseline PASS: Astro check 52 files; ESLint; 38 unit/integration tests;
  production build 15 pages; lesson publication audit; 21 Chromium E2E.
- Канонический evidence и findings: `notes/stage-0-baseline.md`.
- Release blockers: root-absolute project-site paths, placeholder production
  canonical и deploy без обязательных quality gates.
- Governance finding `T0-CTX-001` закрыт в `TUTOR-01`: active operational
  ссылки указывают на `prompts/STAGES.md`, переносимый workflow находится в README.
- `T0-APP-001` закрыт в `TUTOR-02`: Astro — единственный application build;
  orphan Vite SPA удалён, рабочий `MeshLesson` island сохранён.
- `T0-URL-001` закрыт в `TUTOR-03`: URL-state использует schema `v=1`, единые
  limits, canonical migration/fallback и browser history contract.
- `T0-LOC-001` закрыт в `TUTOR-04`: единый RU/UK catalog, locale-aware helpers,
  build validator и artifact/Chromium route matrix подтверждают production contract.
- `T0-BASE-001` закрыт в `TUTOR-05`: единый base/site contract, route/asset
  helpers и root/project-base artifact/Chromium проверки подтверждают переносимость.
- Следующий разрешённый этап: `TUTOR-06` — обязательные pre-deploy quality gates.

## Governance migration — 2026-08-24

- Единственный источник этапов: `prompts/STAGES.md`; старый `STAGED_PROMPTS.md` перенесён без потери содержания.
- Project overlay, 38 unit/integration tests, ESLint, Astro check и production build — PASS.
- Репозиторий находится в `~/codex-workspace/electro-tutor`; dependency-manager migration локально интегрирована в `main`, push не выполнялся.

## Dependency manager migration — 2026-08-24

- Канонический менеджер зависимостей: `pnpm@11.23.0`; единственный lock-файл — `pnpm-lock.yaml`.
- Content store остаётся общим, virtual store возвращён в project-local mode
  после воспроизведённой несовместимости Astro/Rolldown в clean Linux build;
  build-скрипты разрешены только для `esbuild` и `workerd`.
- `vite@8.2.1` объявлен прямой dev-зависимостью: npm раньше скрывал отсутствие декларации через hoisting.
- Clean restore из lock-файла, Astro check, ESLint, 38 unit/integration tests, production build, 21 Chromium E2E и прямой ESM-import Vite — PASS.
- GitHub Actions переведён на `pnpm/setup@v1`, Node 22 и frozen install.

Обновлено: 2026-08-28

## Текущий этап

Этапы `ET-00`, `ET-01`, `ET-02`, `ET-04`, `ET-04.2`, `ET-04.3` и audit-stage
`TUTOR-00`, `TUTOR-01`, `TUTOR-02`, `TUTOR-03`, `TUTOR-04`, `TUTOR-05` завершены.
Инженерные проверки,
единая модель публикации уроков и browser/e2e-контракты находятся в воспроизводимом
состоянии. Старые product stages `ET-03/05/06/07/08` остаются заблокированными,
но approved stabilization track продолжает работу с `TUTOR-06`.

## Что реализовано

- Astro 7 static site с RU/UK-маршрутами, React 19 islands и Content Collections/MDX;
- один production frontend path `astro build → dist/`; отдельного Vite SPA нет,
  Vite остаётся только частью Astro/Vitest toolchain;
- парный RU/UK-урок `mesh-current-method` с тремя уровнями объяснения;
- единый manifest опубликованных парных уроков, derived availability и resolver карточек;
- универсальный MDX route: индексируемый текст видим в static HTML, optional React island
  подключается только по проверенному статическому registry key;
- интерактивная круговая диаграмма с versioned/canonical URL-state, safe fallback,
  back/forward/reload и обработкой сингулярной точки;
- тема, mobile navigation, PWA manifest/service worker/offline page;
- безопасный `potential-pwa-v2`: update текущего клиента, миграция публичного
  offline-кэша, изоляция namespaces и исключение private/error/query;
- MVP кабинета на публичном Jitsi и условная внешняя ссылка Cal.com;
- GitHub Pages production deployment через GitHub Actions с единственным
  workflow `.github/workflows/pages.yml`;
- единый нормализованный `SITE_URL`/`BASE_PATH` contract, base-aware routes,
  assets, manifest и service worker scope для root и project-site artifact;
- post-build audit внутренних HTML/CSS/manifest targets и запрет machine-local URL;
- Astro check, ESLint 9 и production build проходят; актуальный dependency audit выполняется через pnpm;
- Vitest: unit-тесты математической модели, URL-state schema и RU/UK-публикации;
- единый locale catalog для shell/pages/classroom/diagrams, build-time parity
  validation и artifact audit для canonical и `ru`/`uk`/`x-default` hreflang;
- Playwright/Chromium: RU/UK smoke, query/hash, theme persistence, keyboard,
  accessible names, live region и mobile layout 390×844;
- неблокирующий первый рендер с системными fallback-шрифтами при зависшем или
  недоступном Google Fonts; применение загруженного stylesheet выполняет
  self-hosted script без inline `onload`;
- аудит собранного HTML для MDX, hydration marker и локализованных ссылок.

## Что не реализовано

- новые уроки кроме парного `mesh-current-method`;
- аккаунты, backend, база данных и собственный контроль доступа/хранения кабинета;
- production booking integration;
- checkout, webhook и заказы;
- полный автоматический security suite;
- полный обязательный pre-deploy quality pipeline и итоговый release-hardening.

## Известные проблемы и ограничения

1. Полный реестр подтверждённых Stage 0 findings хранится в
   `notes/stage-0-baseline.md`; оставшийся release finding `T0-REL-001` назначен
   этапу `TUTOR-06`.
2. Без `SITE_URL` локальные/альтернативные сборки используют
   `electrotutor.example`; production Pages workflow задаёт точный origin.
3. Публичный Jitsi не даёт проекту собственного контроля доступа, retention и SLA.
4. Browser plugin недоступен (`No browser is available`); текущая browser-база проверена
   через разрешённый Playwright fallback только в Chromium.
5. Merge, push, PR и deploy выполняются только по явному разрешению пользователя.

`T0-CTX-001`, `T0-APP-001`, `T0-URL-001`, `T0-LOC-001`, `T0-BASE-001`,
`T0-SEO-001` и `T0-DEP-001` закрыты; `T0-REL-001` остаётся открытым согласно
`notes/stage-0-baseline.md`.

## Входные решения для продолжения

- следующая учебная тема и подтверждённые исходные материалы (`ET-03`);
- модель кабинета/Jitsi и требования контроля доступа (`ET-05`);
- публичный booking URL Cal.com либо выбранная альтернатива (`ET-06`);
- юридическая/платёжная модель, страны, валюты, возвраты и провайдер (`ET-07`);

## Канонический контекст

- требования: `../specs/README.md`;
- архитектура: `ARCHITECTURE.md`;
- решения: `DECISIONS.md`;
- дизайн: `DESIGN.md`;
- безопасность: `SECURITY.md`;
- этапы: `ROADMAP.md`;
- текущая работа: `AI_PLAN.md`;
- протокол запуска: `../prompts/STAGES.md`.

## Последние проверки

- 2026-08-28 (deployment migration): GitHub Pages production URL и
  автоматический deploy из `main` проверены оператором вручную (URL workflow
  run и commit SHA в repository не зафиксированы); production-like build с
  `SITE_URL=https://zabulaaleksey.github.io` и
  `BASE_PATH=/electro-tutor/` — PASS, locale audit 14 routes, lesson audit и
  site artifact audit 90 files — PASS;
- 2026-08-27 (Cloudflare build fix): clean Linux Node 22 container с
  `pnpm install --frozen-lockfile`, project-local `node_modules/.pnpm`,
  15-page production build и все artifact audits — PASS; локально 69 tests,
  Astro check 64 файла, ESLint и production build — PASS;
- 2026-08-27 (`TUTOR-05`): 68 unit/integration tests, Astro check 63 файла,
  ESLint, root и `/electro-tutor/` builds по 15 страниц, locale audit 14 routes,
  lesson/site artifact audits по 91 файлу, 4 project-base и 46 root Chromium
  E2E — PASS;
- 2026-08-27 (`TUTOR-04`): locale validator 156 paired keys, Astro check 56
  файлов, ESLint, 62 unit/integration tests, 15-page build, locale artifact
  audit 14 routes, lesson audit и 42 Chromium E2E — PASS;
- 2026-08-27 (`TUTOR-03`): Astro check 49 файлов, ESLint, 56 unit/integration
  tests, 15-page build, lesson audit и 25 Chromium E2E — PASS;
  valid/legacy/invalid URL, canonicalization и history navigation подтверждены;
- 2026-08-27 (`TUTOR-02`): frozen install, Astro check 46 файлов, ESLint,
  38 unit/integration tests, 15-page build, lesson audit и 21 Chromium E2E — PASS;
  orphan SPA/config references не найдены;
- 2026-08-27: `pnpm.cmd check:context` и фактический SessionStart hook — PASS;
  следующий selector после синхронизации — `TUTOR-06`;
- 2026-08-27: global context validator и project overlay validator — PASS;
- 2026-08-27: `pnpm.cmd test:e2e` — 21 Chromium-тест без skip/disable;
- 2026-08-27: `pnpm.cmd test` — 4 файла, 38 тестов без skip/disable;
- 2026-08-27: `pnpm.cmd check` — 53 файла, 0 errors/warnings/hints;
- 2026-08-27: `pnpm.cmd lint` — успешно;
- 2026-08-27: `pnpm.cmd build` — 15 статических страниц и sitemap;
- 2026-08-27: `node scripts/audit-built-lessons.mjs` — видимый RU/UK MDX,
  hydration marker и корректные публикационные ссылки;
- 2026-08-27: read-only framework reconciliation — `BROWNFIELD`, один
  `pnpm-lock.yaml`, dependency drift не найден.
