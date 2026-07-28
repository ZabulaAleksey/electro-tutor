# Архитектура проекта «Потенциал»

Этот документ — карта проекта для ручных изменений, нового разработчика или
нового сеанса Codex.

## Общая модель

```text
MDX-контент ───────────────┐
curriculum.ts / data.ts ───┼─> Astro pages ─> статический HTML ─> dist/
                           │          │
BaseLayout + CSS ──────────┘          └─> React islands для интерактива

dist/ ─> Cloudflare Static Assets
      └> GitHub Pages (отдельный workflow)
```

- Astro генерирует быстрые индексируемые страницы.
- React загружается только для состояния и интерактива.
- MDX хранит учебный текст и SEO-метаданные.
- KaTeX отображает формулы.
- Все публичные страницы имеют отдельные `/ru/` и `/uk/` адреса.
- `ClientRouter` Astro меняет страницы без полной перезагрузки браузера.

## Технологии

| Задача | Технология |
|---|---|
| Каркас и маршруты | Astro 7 |
| Интерактив | React 19 |
| Учебные материалы | Content Collections + MDX |
| Формулы | KaTeX |
| SEO | HTML, canonical, hreflang, sitemap |
| PWA | manifest + service worker |
| Кабинет и доска | Jitsi Meet + Excalidraw |
| Production | Cloudflare Workers Static Assets |

Node.js: `>=22.12.0`.

## Карта каталогов

```text
src/
├─ pages/                 Файловые маршруты Astro
├─ layouts/               Общий каркас страниц
├─ content/lessons/       Учебные материалы RU/UA
├─ components/            React-компоненты и локальные стили
├─ legacy-pages/          Временный старый слой React
├─ content.config.ts      Схема метаданных уроков
├─ curriculum.ts          Разделы и шаблонные темы
├─ data.ts                Первые темы и общие переводы
├─ types.ts               Общие TypeScript-типы
├─ styles.css             Глобальные стили
└─ pwa.css                Стили установки PWA

public/                   Файлы, копируемые в dist без обработки
.github/workflows/        GitHub Actions
astro.config.mjs          Конфигурация Astro
wrangler.jsonc            Конфигурация Cloudflare
```

## Маршруты

| Файл | URL |
|---|---|
| `src/pages/index.astro` | `/` |
| `src/pages/[lang]/index.astro` | `/ru/`, `/uk/` |
| `src/pages/[lang]/topics/index.astro` | каталог |
| `src/pages/[lang]/topics/[section]/[slug].astro` | урок |
| `src/pages/[lang]/interactive.astro` | интерактив |
| `src/pages/[lang]/classroom.astro` | кабинет |
| `src/pages/[lang]/services.astro` | услуги |
| `src/pages/[lang]/contacts.astro` | контакты |

`getStaticPaths()` создаёт языковые версии во время сборки. Корень `/`
перенаправляется на `/ru/` через `public/_redirects`.

## Общий макет

`src/layouts/BaseLayout.astro` отвечает за:

- SEO head, canonical и hreflang;
- главное и мобильное меню;
- логотип, язык и footer;
- светлую/тёмную тему;
- установку PWA;
- service worker;
- переходы без полной перезагрузки.

При добавлении пункта меню нужно расширить тип `active`, добавить элемент в
массив `nav`, создать RU/UA маршрут и передать одинаковый `alternatePath`.

## Языки

Основной тип в `src/types.ts`:

```ts
type Language = "ru" | "uk";
```

Короткие переводы хранятся как `{ ru: "...", uk: "..." }`, большие уроки —
двумя MDX-файлами. Языковой переключатель сохраняет query и hash, поэтому
настройки интерактивных инструментов не теряются.

## Учебный контент

```text
src/content/lessons/
├─ ru/<slug>.mdx
└─ uk/<slug>.mdx
```

`src/content.config.ts` проверяет frontmatter:

```yaml
title:
description:
language: ru | uk
section:
slug:
order:
duration:
keywords:
draft: false
```

`src/curriculum.ts` содержит разделы и карточки:

- `dc` — постоянный ток;
- `ac` — переменный ток;
- `transients` — переходные процессы;
- `magnetic` — магнитные цепи.

Карточка сама не создаёт урок. Для публикации нужны RU/UA MDX-файлы с
одинаковыми `section` и `slug`. Подробный шаблон — в `CONTENT_GUIDE.md`.

## Три уровня объяснения

`DetailLevel` в `src/types.ts`:

- 1 — полный исследовательский вывод;
- 2 — методика с объяснениями;
- 3 — только решение.

`LevelPicker.tsx` переключает уровень, значение хранится в `localStorage` под
ключом `potential-level`.

Сейчас эта модель реализована для контурных токов через:

```text
Astro lesson route
  └─ MeshLessonIsland.tsx
       └─ legacy-pages/MeshLesson.tsx
```

Для новых уроков следует создать универсальный компонент, а не копировать весь
`MeshLesson`.

## Формулы и схемы

`Formula.tsx` рендерит LaTeX через KaTeX:

```tsx
<Formula>{"I = \\frac{U}{R}"}</Formula>
```

`CircuitDiagram.tsx` — текущий SVG-пример. Схемы должны иметь прозрачную
заливку, использовать переменные темы и сохранять смысловые цвета.

## Круговая диаграмма

- `CircularDiagram.tsx` — комплексный расчёт, состояние и SVG;
- `CircularDiagram.css` — панели, сетка страницы, адаптивность;
- `CircularDiagramMath.css` — Times New Roman, оси, векторы и стрелки.

Параметры сохраняются в query-строке, поэтому настроенную диаграмму можно
открыть по ссылке и переключать язык без сброса.

## Кабинет занятия

- маршрут: `src/pages/[lang]/classroom.astro`;
- логика: `src/components/Classroom.tsx`;
- стили: `src/components/Classroom.css`.

Используются Jitsi IFrame API, видео, голос, экран, чат и встроенная
Excalidraw-доска. Сейчас это MVP на публичном `meet.jit.si`; постоянное
хранение и собственный доступ потребуют backend.

## Стили и темы

`src/styles.css` содержит глобальные переменные и основные страницы.
`[data-theme="dark"]` переопределяет цвета тёмной темы. Выбор хранится как
`potential-theme` в `localStorage`.

Большие компоненты должны иметь CSS рядом с TSX. Внешний вид расчётного
инструмента желательно отделять от его математической логики.

## PWA

- `public/manifest.webmanifest` — параметры приложения;
- `public/sw.js` — кэш;
- `public/offline.html` — offline-страница;
- `public/icons/` — иконки.

После изменения стратегии кэша нужно увеличить `potential-pwa-v1` до следующей
версии, иначе установленное приложение может использовать старые файлы.

## SEO

SEO создаётся при сборке: `title`, `description`, canonical, hreflang,
статический MDX и sitemap. Production-домен задаётся переменной `SITE_URL`.
Без неё используется `https://electrotutor.example`.

Важный текст не должен существовать только внутри React: индексируемая версия
должна присутствовать в Astro/MDX HTML.

## Сборка и деплой

```bash
npm run dev
npm run check
npm run build
npm run preview
```

Результат: `dist/`. Редактировать `dist` вручную нельзя.

`wrangler.jsonc` настраивает Cloudflare Static Assets. Connected build
пересобирает сайт после push в `main`.

`.github/workflows/deploy.yml` параллельно публикует `dist` в GitHub Pages.
Основным каналом считается Cloudflare; GitHub Pages можно оставить резервным.

## Legacy-слой

`src/legacy-pages/*`, `src/App.tsx` и `src/main.tsx` пришли из React/Vite
прототипа. Часть используется уроком контурных токов, остальные файлы не
следует применять для новых страниц.

Целевая схема: Astro/MDX для содержания плюс небольшие универсальные React
islands для расчётов и управления.

## Где что менять

| Задача | Место |
|---|---|
| Меню, footer, SEO, тема, язык | `src/layouts/BaseLayout.astro` |
| Глобальные цвета и размеры | `src/styles.css` |
| Разделы и карточки | `src/curriculum.ts` |
| Учебный текст | `src/content/lessons/<lang>/` |
| Схема MDX | `src/content.config.ts` |
| Формулы | `src/components/Formula.tsx` |
| Расчёт диаграммы | `src/components/CircularDiagram.tsx` |
| Вид диаграммы | `src/components/CircularDiagramMath.css` |
| Кабинет | `src/components/Classroom.tsx` |
| PWA-кэш | `public/sw.js` |
| Cloudflare | `wrangler.jsonc` |
| GitHub Actions | `.github/workflows/deploy.yml` |

## Проверка изменений

```bash
git status
npm run check
npm run build
git diff --check
```

Всегда сохраняйте UTF-8 без BOM, одинаковые slug RU/UA, прозрачные SVG,
мобильную вёрстку, обе темы и состояние интерактива при смене языка.

API-ключи нельзя хранить в `src/`, `public/` или GitHub. Используйте Cloudflare
Environment Variables/Secrets.
