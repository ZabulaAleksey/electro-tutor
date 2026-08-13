# Статус проекта для AI-сессии

Обновлено: 2026-08-14

## Текущий этап

Этапы `ET-00`, `ET-01`, `ET-02` и `ET-04` завершены. Инженерные проверки,
единая модель публикации уроков и browser/e2e-контракты находятся в воспроизводимом
состоянии. Следующего неблокированного продуктового этапа нет; работа приостановлена
до входных решений пользователя.

## Что реализовано

- Astro 7 static site с RU/UK-маршрутами, React 19 islands и Content Collections/MDX;
- парный RU/UK-урок `mesh-current-method` с тремя уровнями объяснения;
- единый manifest опубликованных парных уроков, derived availability и resolver карточек;
- универсальный MDX route: индексируемый текст видим в static HTML, optional React island
  подключается только по проверенному статическому registry key;
- интерактивная круговая диаграмма с URL-state и обработкой сингулярной точки;
- тема, mobile navigation, PWA manifest/service worker/offline page;
- MVP кабинета на публичном Jitsi и условная внешняя ссылка Cal.com;
- Cloudflare Static Assets и GitHub Pages configuration;
- Astro check, ESLint 9, production build и `npm audit` без известных уязвимостей;
- Vitest: unit-тесты математической модели и contract-тесты RU/UK-публикации;
- Playwright/Chromium: RU/UK smoke, query/hash, theme persistence, keyboard,
  accessible names, live region и mobile layout 390×844;
- аудит собранного HTML для MDX, hydration marker и локализованных ссылок.

## Что не реализовано

- новые уроки кроме парного `mesh-current-method`;
- аккаунты, backend, база данных и собственный контроль доступа/хранения кабинета;
- production booking integration;
- checkout, webhook и заказы;
- автоматические security tests;
- подтверждённый production-домен и release.

## Известные проблемы и ограничения

1. Без `SITE_URL` canonical/sitemap используют `electrotutor.example`.
2. Публичный Jitsi не даёт проекту собственного контроля доступа, retention и SLA.
3. Service worker использует первую версию cache key; обновление установленного клиента
   не проверено автоматизированным browser-тестом.
4. Browser plugin недоступен (`No browser is available`); текущая browser-база проверена
   через разрешённый Playwright fallback только в Chromium.
5. Merge, push, PR и deploy выполняются только по явному разрешению пользователя.

## Входные решения для продолжения

- следующая учебная тема и подтверждённые исходные материалы (`ET-03`);
- модель кабинета/Jitsi и требования контроля доступа (`ET-05`);
- публичный booking URL Cal.com либо выбранная альтернатива (`ET-06`);
- юридическая/платёжная модель, страны, валюты, возвраты и провайдер (`ET-07`);
- production-домен и канал публикации (`ET-08`).

## Канонический контекст

- требования: `../specs/README.md`;
- архитектура: `ARCHITECTURE.md`;
- решения: `DECISIONS.md`;
- дизайн: `DESIGN.md`;
- безопасность: `SECURITY.md`;
- этапы: `ROADMAP.md`;
- текущая работа: `AI_PLAN.md`;
- протокол запуска: `../prompts/STAGED_PROMPTS.md`.

## Последние проверки

- 2026-08-14: `npm run test:e2e` — 19 Chromium-тестов без skip/disable;
- 2026-08-14: `npm test` — 4 файла, 38 тестов без skip/disable;
- 2026-08-14: `npm run check` — 49 файлов, 0 errors/warnings/hints;
- 2026-08-14: `npm run lint` — успешно;
- 2026-08-14: `npm run build` — 15 статических страниц и sitemap;
- 2026-08-14: `node scripts/audit-built-lessons.mjs` — видимый RU/UK MDX,
  hydration marker и корректные публикационные ссылки;
- 2026-08-14: `npm audit` — 0 известных уязвимостей;
- 2026-08-14: `npm ci --dry-run --ignore-scripts --offline` — lockfile воспроизводим.
