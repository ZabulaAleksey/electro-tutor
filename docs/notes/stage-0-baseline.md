# Tutor Stage 0 — baseline репозитория

Дата аудита: 2026-08-27

Stage ID: `TUTOR-00`

Repository: `electro-tutor`

Evidence level: `validated locally`

Product mutations: отсутствуют

## Назначение и границы

Документ фиксирует проверяемое brownfield-состояние перед дальнейшим развитием
Tutor. Он не является SPEC, архитектурным решением или разрешением исправлять
найденные дефекты. Требования принадлежат `specs/`, фактический статус —
`docs/AI_STATUS.md`, порядок устранения разрывов — `docs/ROADMAP.md`.

В scope вошли приложения и entrypoints, маршруты, package/workspace boundary,
deployment, тесты, локализация, assets, content, интерактивы и project overlay.
Backend, database, queue, WebSocket/WebRTC server, auth и payment runtime в
репозитории отсутствуют.

## Классификация repository

- Brownfield reconciliation: `BROWNFIELD`.
- Git root: самостоятельный repository `electro-tutor`.
- Production application: Astro 7 static site с React 19 islands.
- Package boundary: один корневой `package.json`; вложенных workspace packages
  нет. `pnpm-workspace.yaml` задаёт только `allowBuilds` и global virtual store.
- Dependency contract: `pnpm@11.23.0`, `pnpm-lock.yaml`, Node `>=22.12.0`;
  competing lockfiles и tracked generated dependency paths не найдены.
- Deployment definitions: GitHub Pages workflow и Cloudflare Static Assets
  configuration. Основной production provider/domain ещё не выбран.

## Карта приложений и entrypoints

| Контур | Evidence | Классификация |
|---|---|---|
| Astro static site | `astro.config.mjs`, `src/pages/**`, script `pnpm build` | production boundary |
| React islands | `src/components/**`, `src/content/interactive-registry.ts` | production, внутри Astro |
| MDX lessons | `src/content/lessons/{ru,uk}`, published lesson manifest | production content |
| Vite SPA | `index.html` → `src/main.tsx` → `src/App.tsx` → `src/legacy-pages/**` | legacy/неиспользуемый production build entrypoint |
| Transitional lesson island | `MeshLessonIsland` → `legacy-pages/MeshLesson` | используемый legacy seam внутри production Astro |
| PWA assets | `public/sw.js`, `offline.html`, manifest, icons, font loader | production static assets |

Astro генерирует 15 страниц: корневой redirect и по семь маршрутов для `ru` и
`uk` — home, topics, published lesson, interactive, classroom, services и
contacts.

## Baseline-проверки

| Команда / проверка | Результат | Scope и caveat |
|---|---|---|
| `py -3 -B "$HOME/.codex/tools/reconcile_project_framework.py" --json .` | PASS | Windows PowerShell, read-only; POSIX equivalent uses `python ~/.codex/tools/...`; `BROWNFIELD`, product files protected |
| `pnpm.cmd check` | PASS | 52 Astro/TypeScript files, 0 errors/warnings/hints |
| `pnpm.cmd lint` | PASS | весь tracked project surface |
| `pnpm.cmd test` | PASS | 4 files, 38 unit/integration contract tests |
| `pnpm.cmd build` | PASS | 15 static pages + sitemap |
| `node scripts/audit-built-lessons.mjs` | PASS | RU/UK MDX publication и hydration contract |
| `pnpm.cmd test:e2e` | PASS | 21 Chromium E2E |
| `git diff --check` до документации | PASS | baseline branch не содержал diff |

В managed sandbox pnpm не смог открыть database настроенного внешнего global
store. Тот же pinned toolchain прошёл при разрешённом доступе к пользовательскому
pnpm store; это ограничение среды запуска, а не failure проекта.

## Findings

Severity: `P1` — security/release blocker; `P2` — существенный correctness или
governance defect; `P3` — ограниченный gap/неопределённость.

| ID | Severity | Finding и доказательство | Воспроизведение | Решение / целевой этап |
|---|---|---|---|---|
| `T0-APP-001` | P2 | Astro является production boundary, но root `index.html` запускает отдельный Vite SPA с собственными routing/localization surfaces; Astro его не импортирует. Только `MeshLesson` остаётся transitively используемым через island. | `rg -n -e 'src/main' -e 'legacy-pages' -e 'MeshLessonIsland' index.html src` | ADR и удаление либо явная изоляция доказанно мёртвого контура — Stage 2 |
| `T0-URL-001` | P2 | `CircularDiagram` принимает из `URLSearchParams` любое finite число без UI-доменных диапазонов. URL допускает отрицательные magnitudes/impedance, angles вне `-90..90` и position вне `0..100`; UI-path те же значения ограничивает. Модель отдельно сохраняет finite geometry для протестированных huge-current cases, поэтому crash/overflow этим finding не утверждается. | открыть `/ru/interactive/?i0m=-5&zm=-2&za=270&phi=720&r=-50`; сравнить с `min`/`max` в `CircularDiagram.tsx` | единая versioned parse/validate/normalize/canonicalize граница и adversarial tests — Stage 3 |
| `T0-LOC-001` | P3 | RU/UK route/content pair contract, language switch с query/hash и production artifact подтверждены. Chromium smoke охватывает home/catalog/lesson/interactive, но не полный парный smoke для classroom/services/contacts. | `pnpm.cmd test:e2e`; сопоставить `src/pages/[lang]` с `tests/e2e/smoke-and-state.spec.ts` | полный production locale contract и E2E matrix — Stage 4 |
| `T0-BASE-001` | P1 | Собранный HTML, manifest и service worker используют root-absolute `/_astro`, `/manifest.webmanifest`, `/icons`, `/scripts`, `/sw.js`, `/ru` и `/uk`; Astro `base` не задан. GitHub Pages project-site под непустым base path будет запрашивать ресурсы от корня домена. | `pnpm.cmd build`; `rg -n -e 'href="/' -e 'src="/' -e 'register\("/' dist` | единый site/base contract и artifact smoke под non-root base — Stage 5 |
| `T0-REL-001` | P1 | GitHub Pages job после frozen install выполняет только `pnpm build`; check, lint, unit/integration/component, E2E и security gates не блокируют deploy. | `rg -n -e 'pnpm ' -e 'needs:' -e 'deploy-pages' .github/workflows/deploy.yml` | полный verify pipeline и deploy dependency — Stage 6 |
| `T0-SEO-001` | P1 | Workflow не задаёт `SITE_URL`; production artifact содержит canonical/hreflang/sitemap от `https://electrotutor.example`. | `pnpm.cmd build`; `rg -n 'electrotutor.example' dist` | release configuration gate; base/site contract — Stages 5–6 и release stage |
| `T0-CTX-001` | P2 | Канонический файл — `prompts/STAGES.md`, но `AGENTS.md`, `README.md`, context SPEC, decisions и compatibility matrix ссылаются на отсутствующий `prompts/STAGED_PROMPTS.md`. Команда продолжения не автономна. | `rg -n -e 'STAGED_PROMPTS' -e 'STAGES\.md' AGENTS.md README.md docs prompts specs` | semantic/link reconciliation и portable continuation — Stage 1 |
| `T0-DEP-001` | P2 | Репозиторий содержит GitHub Pages workflow и Cloudflare config, а основной production provider/domain не выбран. Это две deployment definitions, но только одна автоматизированная публикация. | проверить `.github/workflows/deploy.yml`, `wrangler.jsonc`, `README.md` | зафиксировать production boundary/provider decision до release; не deploy в Stage 0 |

## Подтверждённые контракты без finding

- Published lesson manifest формирует оба locale routes из одной пары MDX.
- Query/hash сохраняются при переключении языка.
- Service worker lifecycle, safe cache namespace и offline fallback подтверждены
  текущим Chromium E2E.
- Build не содержит backend runtime; Jitsi и Cal.com остаются внешними seams.
- Existing unit/integration/component/E2E contracts не изменялись.

## Stage 0 PASS и ограничения

PASS подтверждён: приложения и deployment entrypoints классифицированы; известные
риски перепроверены; build и существующие тесты запущены; неизвестные product
решения не названы готовыми. Следующий разрешённый этап — `TUTOR-01`, canonical
local context и автономное продолжение.

Findings намеренно не исправлены в Stage 0. Branch/commit не означают merge,
release или deploy.
