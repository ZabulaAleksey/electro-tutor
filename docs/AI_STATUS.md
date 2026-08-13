# Статус проекта для AI-сессии

Обновлено: 2026-08-14

## Текущий этап

Этап `ET-01` завершён: инженерные проверки, unit/contract-тесты и зависимости
приведены в воспроизводимое состояние. `npm audit` сообщает 0 известных
уязвимостей. `ET-02` завершён: опубликованные маршруты и доступность каталога
выводятся из единого manifest, MDX видим в статическом HTML, а React island
подключается только по проверенному optional ключу. Текущий этап — `ET-04`,
browser-проверка интерактива.

## Что реализовано

- Astro 7 static site с RU/UK-маршрутами;
- Content Collections/MDX и одна парная опубликованная тема
  `mesh-current-method`;
- React island урока с тремя уровнями объяснения;
- интерактивная круговая диаграмма с состоянием в URL и обработкой сингулярной
  точки;
- светлая/тёмная тема, мобильная навигация и сохранение состояния при смене
  языка;
- PWA manifest, service worker и offline page;
- MVP кабинета через публичный Jitsi;
- страница услуг с условной внешней ссылкой Cal.com;
- конфигурации Cloudflare Static Assets и GitHub Pages.
- воспроизводимые Astro check, ESLint 9 flat config и production build.
- Vitest, unit-тесты математической модели и contract-тест фактической
  RU/UK-коллекции уроков.
- исправленные транзитивные зависимости: `js-yaml 4.3.1`,
  `brace-expansion 1.1.18/5.0.9`, `wrangler 4.123.0`,
  `miniflare 5.20260811.1-alpha` и `undici 7.29.0`.
- feature-SPEC единой публикации уроков с manifest, derived availability,
  универсальным MDX route и optional island.
- единый manifest опубликованных парных RU/UK-уроков и resolver карточек;
- универсальный маршрут урока с видимым MDX и статическим optional island
  registry;
- аудит собранного HTML для локализованных ссылок, MDX и hydration marker.

## Что не реализовано

- аккаунты, backend и база данных;
- собственный контроль доступа/хранения кабинета;
- платёжный checkout, webhook и заказы;
- новые уроки кроме парного `mesh-current-method`;
- автоматические browser/e2e/security tests;
- подтверждённый production-домен.

## Известные проблемы

1. Без `SITE_URL` canonical/sitemap используют `electrotutor.example`.
2. Публичный Jitsi не даёт проекту собственного контроля доступа, retention и
   SLA.
3. Service worker использует первую версию cache key; стратегия обновления на
   реальном установленном клиенте не проверена автоматически.

## Ограничения и внешние решения

- следующий учебный материал и его исходники выбирает пользователь;
- Cal.com требует пользовательский booking URL;
- платежи требуют юридической модели и выбора провайдера;
- production release требует домена и решения о канале публикации;
- merge, push, PR и deploy — только по явному разрешению.

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

- 2026-08-14: `npm audit` — 0 известных уязвимостей после совместимого
  `npm audit fix` без `--force`;
- 2026-08-14: `npm test` — успешно, 4 test files и 38 тестов без skip/disable;
- 2026-08-14: `npm run check` — успешно, 44 файла, 0 errors/warnings/hints;
- 2026-08-14: `npm run lint` — успешно;
- 2026-08-14: `npm run build` — успешно, 15 статических страниц и sitemap;
- 2026-08-14: `node scripts/audit-built-lessons.mjs` — успешно: видимый RU/UK
  MDX, hydration marker и ссылки публикации в собранном HTML;
- 2026-08-14: `npm ci --dry-run --ignore-scripts --offline` — lockfile
  воспроизводим из локального npm cache;
- 2026-08-13: `npm run check` — фактическая проверка не запущена из-за
  отсутствующего `@astrojs/check`;
- 2026-08-13: `npm run lint` — ошибка отсутствующей flat config ESLint 9;
- 2026-08-13: `npm run build` — успешно, создано 15 статических страниц,
  включая парные RU/UK-маршруты и sitemap;
- 2026-08-13: Markdown — UTF-8 без BOM/LF, code fences сбалансированы,
  `git diff --check` проходит.
