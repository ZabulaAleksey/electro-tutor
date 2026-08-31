# Архитектура Electro Tutor

Документ описывает фактическое устройство проекта «Потенциал». Требования
находятся в `../specs/`, а известные расхождения реализации — в
`AI_STATUS.md`.

## Общая модель

```text
Source: Astro pages/layouts, MDX lessons, CSS and React islands
        ↓
      Astro
        ↓
  pnpm run build
        ↓
      dist/
        ↓
GitHub Actions (`.github/workflows/pages.yml`)
        ↓
GitHub Pages (`/electro-tutor/`)

Browser ─> Jitsi public API (только кабинет)
        └> Cal.com URL (только если задан PUBLIC_CALCOM_URL)
        └> Google Fonts CSS/font files (неблокирующий progressive enhancement)
```

Astro генерирует индексируемый HTML. React используется для состояния и
интерактива, а не как основной маршрутизатор production-сайта.

## Технологии и границы

| Задача | Реализация |
|---|---|
| Маршруты и статическая сборка | Astro 7 |
| Интерактивные острова | React 19 |
| Учебные материалы | Astro Content Collections + MDX |
| Формулы | KaTeX |
| SEO | canonical, hreflang, sitemap, статический HTML |
| PWA | manifest, service worker, offline page |
| Онлайн-занятие | публичный Jitsi IFrame API и его whiteboard |
| Package manager / build | pnpm 11.23.0 / `pnpm run build` |
| CI/CD | GitHub Actions, `.github/workflows/pages.yml` |
| Production assets | GitHub Pages, project base `/electro-tutor/` |

Минимальная версия Node.js определяется `package.json`: `>=22.12.0`.

## Карта репозитория

```text
src/
├─ pages/                    Astro-маршруты
├─ layouts/BaseLayout.astro  head, навигация, тема, язык, PWA
├─ content/lessons/          парные RU/UK MDX-уроки
├─ components/               React islands и локальные CSS
├─ legacy-pages/MeshLesson.tsx  переходная реализация island урока
├─ content.config.ts         схема frontmatter
├─ site-path.ts              base-aware route/asset helpers
├─ curriculum.ts             разделы и карточки каталога
├─ data.ts                   первые карточки и общие переводы
├─ types.ts                  общие TypeScript-типы
├─ styles.css                глобальный UI
└─ pwa.css                   UI установки PWA

public/                      статические файлы и service worker
specs/                       канонические требования
docs/                        архитектура, решения и состояние
prompts/                     протокол поэтапного продолжения
.github/workflows/           GitHub Actions
```

Сгенерированные `dist/`, `.astro/`, `*.tsbuildinfo` и зависимости не являются
исходным кодом и вручную не редактируются.

## Маршруты

| Файл | URL |
|---|---|
| `src/pages/index.astro` | `<BASE_PATH>` → `<BASE_PATH>ru/` |
| `src/pages/[lang]/index.astro` | `/ru/`, `/uk/` |
| `src/pages/[lang]/topics/index.astro` | каталог |
| `src/pages/[lang]/topics/[section]/[slug].astro` | опубликованный урок |
| `src/pages/[lang]/interactive.astro` | круговая диаграмма |
| `src/pages/[lang]/classroom.astro` | кабинет занятия |
| `src/pages/[lang]/services.astro` | услуги и расписание |
| `src/pages/[lang]/contacts.astro` | контакты |

`getStaticPaths()` создаёт локали во время сборки. Код локали украинского языка
— `uk`; надпись в переключателе — `UA`.

Корневой route реализует redirect через `Astro.redirect(...)` с
`import.meta.env.BASE_URL`. Поэтому production path
`/electro-tutor/` переходит на `/electro-tutor/ru/` внутри static site build;
отдельный Cloudflare edge redirect не нужен.

`astro.config.mjs` нормализует независимые параметры `SITE_URL` (origin для
canonical/sitemap) и `BASE_PATH` (deployment prefix). Runtime-код формирует
внутренние URL только через `site-path.ts` и `import.meta.env.BASE_URL`, поэтому
один artifact contract работает в `/` и, например, `/electro-tutor/`.

`src/i18n/` — единый locale catalog общей оболочки, page metadata, действий,
ошибок и accessible names. Runtime helpers нормализуют поддерживаемые коды и
форматируют пользовательские числа, даты, длительности и plural forms.
`scripts/validate-locales.mjs` блокирует build при missing/extra/empty или
неподтверждённо одинаковых ключах; `scripts/audit-built-locales.mjs` проверяет
парность 14 собранных routes, `html[lang]`, canonical и `ru`/`uk`/`x-default`
hreflang. Авторский lesson MDX и математические обозначения остаются в своих
domain sources и проверяются lesson contract.

## Поток учебного контента

```text
src/content/lessons/<lang>/<slug>.mdx
        ↓ validation by content.config.ts
getPublishedLessonManifest() → pair/uniqueness contracts
        ↓
Astro route + derived curriculum availability
        ↓
visible MDX HTML + optional registered React island
```

Frontmatter содержит `title`, `description`, `language`, `section`, `slug`,
`order`, `duration`, `keywords`, `draft` и optional `interactive`. Правила
автора находятся в `CONTENT_GUIDE.md`.

`lesson-manifest.ts` фильтрует draft, проверяет уникальность и парность RU/UK,
формирует локализованные маршруты и сохраняет ссылку на Content Collection
entry. `curriculum-publication.ts` выводит `available` и `href` карточек из
manifest; `curriculum.ts` остаётся источником порядка и локализованного UI.

Универсальный route получает только записи manifest, рендерит видимый MDX и
по optional ключу выбирает разрешённый React island из статического registry.
Для текущего `mesh-lesson` route использует конкретный статический import,
необходимый Astro для генерации hydration metadata; произвольные dynamic
imports из frontmatter не допускаются.

## Общий макет и клиентское состояние

`BaseLayout.astro` владеет SEO head, навигацией, footer, темой, переключением
языка, установкой PWA и регистрацией service worker. Он сохраняет:

- тему в `localStorage` (`potential-theme`);
- позицию прокрутки при смене языка в `sessionStorage`;
- query/hash при переходе на парную локаль.

`MeshLessonIsland.tsx` сохраняет уровень подробности в `potential-level`.
`circular-diagram-state.ts` владеет схемой `v=1`, defaults, domain limits и pure
pipeline `parse → validate → normalize → canonicalize`. `CircularDiagram.tsx`
получает только типизированное состояние, синхронизирует его с UI и browser
history и не передаёт сырые `URLSearchParams` математической модели. Legacy
share-ссылки без `v` мигрируют; повреждённые ссылки восстанавливают defaults.

## Кабинет занятия

`Classroom.tsx` нормализует код комнаты, создаёт приглашение и по действию
пользователя загружает `https://meet.jit.si/external_api.js`. Имя сохраняется в
`localStorage`; сервер проекта данные кабинета не хранит. Комната не имеет
собственной авторизации или серверной политики доступа. Ограничения описаны в
`SECURITY.md`.

## Расписание и платежи

`services.astro` читает только публичный `PUBLIC_CALCOM_URL`. При его отсутствии
выводится fallback. Платёжного backend, checkout и webhook нет; будущий контракт
находится в `../specs/features/payments-and-booking.spec.md`.

`BaseLayout` запускает неблокирующую загрузку DM Sans и Manrope из Google Fonts
через preload и stylesheet с первоначальным media `print`. После загрузки
self-hosted script `/scripts/web-font.js` переключает stylesheet на media `all`;
inline event handler для этого не используется. Критический CSS не содержит
внешнего `@import`, поэтому первый рендер использует системные fallback-шрифты и
не зависит от ответа внешнего сервиса.

## PWA и кэш

- `public/manifest.webmanifest` задаёт установку и shortcuts;
- `public/sw.js` использует network-first для публичной навигации и cache-first
  только для статических `font/image/manifest/script/style` текущего origin;
- `public/offline.html` — резерв для навигации без сети.

Текущий namespace — `potential-pwa-v2`. При активации безопасные публичные
ответы мигрируют из прежних `potential-pwa-*`, после чего удаляются только
собственные старые namespaces. 404/5xx, `private`/`no-store` и пути
`/api`, `/auth`, `/checkout`, `/payments` не кэшируются. Чужие Cache Storage
namespaces не читаются и не удаляются; navigation cache key хранится без query.
При следующем изменении стратегии cache key снова должен измениться.

Manifest использует scope-relative URL, а worker выводит offline/static paths
из `self.registration.scope`. Регистрация получает base-aware script URL и
scope из `BaseLayout`, поэтому PWA не выходит за project-site prefix.

## SEO и публикация

`astro.config.mjs` строит canonical и sitemap от `SITE_URL`, а маршруты и assets
— от `BASE_PATH`; резервный origin `https://electrotutor.example` допустим
только локально. Активный workflow `.github/workflows/pages.yml` явно задаёт
`SITE_URL=https://zabulaaleksey.github.io` и `BASE_PATH=/electro-tutor/`.
Build завершается аудитом внутренних HTML/CSS/manifest targets, PWA scope и
запретом localhost/machine-local URL.

Deployment boundary:

```text
GitHub repository
  → push в main
  → GitHub Actions
  → pnpm install --frozen-lockfile
  → pnpm run verify:full
  → full root-artifact E2E
  → production build + project-base smoke
  → checked dist/
  → Pages artifact hand-off
  → GitHub Pages
```

Production URL — `https://zabulaaleksey.github.io/electro-tutor/`. Cloudflare,
Wrangler и edge redirect больше не являются компонентами current architecture.

## Переходный lesson seam

От React/Vite-прототипа сохранён только используемый production-путь
`MeshLessonIsland.tsx → legacy-pages/MeshLesson.tsx`. Он подключается из
статического Astro registry и не является отдельным SPA или маршрутизатором.
Корневые `index.html`, `src/main.tsx`, `src/App.tsx`, неиспользуемые страницы и
отдельный `vite.config.*` удалены в `TUTOR-02`. Новые страницы не должны
расширять этот seam; целевая граница — Astro/MDX плюс малые React islands.

## Где вносить изменения

| Задача | Каноническое место |
|---|---|
| SEO head, меню, footer, тема, язык | `src/layouts/BaseLayout.astro` |
| Глобальные токены и layout | `src/styles.css`, `src/pwa.css` |
| Разделы и карточки каталога | `src/curriculum.ts`, `src/data.ts` |
| Frontmatter и публикация урока | `src/content.config.ts`, `src/content/lessons/` |
| Формулы | `src/components/Formula.tsx` |
| Электрическая схема урока | `src/components/CircuitDiagram.tsx` |
| Математика круговой диаграммы | `src/models/circular-diagram.ts` |
| URL/state schema и limits | `src/models/circular-diagram-state.ts` |
| Browser adapter круговой диаграммы | `src/components/CircularDiagram.tsx` |
| Вид круговой диаграммы | `src/components/CircularDiagram.css`, `src/components/CircularDiagramMath.css` |
| Кабинет | `src/components/Classroom.tsx`, `src/components/Classroom.css` |
| PWA cache/offline | `public/sw.js`, `public/offline.html` |
| GitHub Pages deploy | `.github/workflows/pages.yml` |

## Проверки

Целевой набор:

```bash
pnpm check
pnpm lint
pnpm build
git diff --check
```

Текущее состояние команд отражено в `AI_STATUS.md`.

## Контракт зависимостей

- Источник истины (Source of truth): `package.json`, `pnpm-lock.yaml` и `pnpm-workspace.yaml`; канонический менеджер — `pnpm@11.23.0`.
- Чистое восстановление (Clean restore): удалить только disposable `node_modules`, затем выполнить `pnpm install --frozen-lockfile`.
- Общий pnpm content store разрешён, но virtual store остаётся project-local:
  Astro/Rolldown virtual modules должны разрешаться одинаково в clean Linux CI.
  `allowBuilds` ограничен `esbuild` и `workerd`.
- `node_modules`, `.astro`, `dist` и тестовые/build caches можно пересоздавать; исходники, lesson content и локальные секреты dependency cleanup не затрагивает.
- GitHub Pages verify job использует frozen lockfile и `pnpm run verify:full`:
  Git hygiene, workflow contract, Astro check, ESLint, Vitest, полный Chromium
  E2E на временном root-artifact, единственная production build, project-base
  smoke этого `dist/` и dependency audit. Только после них `dist/` загружается
  как Pages artifact; deploy job зависит от verify и не пересобирает artifact.
