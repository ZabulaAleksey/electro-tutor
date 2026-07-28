# Потенциал

Двуязычная RU/UA образовательная платформа по электротехнике на Astro.

## Перед началом работы

Прочитайте:

- `PROJECT_CONTEXT.md` — цели, архитектура и принятые решения;
- `ARCHITECTURE.md` — подробная карта каталогов, маршрутов и мест для правок;
- `CONTENT_GUIDE.md` — правила добавления уроков;
- `PAYMENTS_AND_BOOKING.md` — план расписания и оплаты.

## Требования

- Node.js 22.12 или новее;
- npm 10 или новее.

## Локальный запуск

```bash
npm install
npm run dev
```

Сайт откроется на `http://localhost:4321`.

## Production-сборка

```bash
npm run build
```

Результат находится в `dist/`.

## Переменные

Скопируйте `.env.example` в `.env` и заполните:

```env
SITE_URL=https://ваш-домен
PUBLIC_CALCOM_URL=https://cal.com/ваш-профиль/консультация
```

`SITE_URL` обязателен перед публичным SEO-запуском: он используется для
canonical URL и sitemap.

## Cloudflare

```text
Node version: 22.16.0 или новее
Build command: npm run build
Output directory: dist
Deploy command: npx wrangler deploy --assets ./dist --name electrotutor --compatibility-date 2026-07-25
```

## Добавление уроков

Материалы находятся в `src/content/lessons/<language>/`. Один урок имеет RU и
UA версии с одинаковыми `section` и `slug`. Страницы генерируются маршрутом
`src/pages/[lang]/topics/[section]/[slug].astro`.

React используется только для интерактивных островов. Основной учебный текст
генерируется как статический HTML для скорости и SEO.