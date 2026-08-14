# Учебный журнал

## 2026-08-14 — Воспроизводимая browser-проверка Electro Tutor

### Что и зачем изменено

- Добавлен Playwright-набор для темизации, клавиатуры, accessibility и mobile layout.
- Проверки защищают пользовательские потоки, которые не подтверждаются одним production build.
- Скриншоты создаются как вложения test-results и не засоряют Git.

### Ключевой поток данных / управления

Playwright запускает статически собранный сайт через локальный Astro preview, открывает реальные
RU/UK-маршруты в Chromium, выполняет клавиатурные действия и сравнивает видимое состояние DOM,
`localStorage`, URL и размеры документа. Runtime collector отклоняет неожиданные browser errors,
игнорируя только недоступные внешние Google Fonts.

### Команды и проверки

```text
npm run test:e2e
npm test
npm run check
npm run lint
npm run build
npm audit
git diff --check
```

### Решения и trade-offs

- Встроенный Browser был предпочтительным, но вернул `No browser is available`; применён
  разрешённый Playwright fallback.
- Полный axe-аудит не добавлялся: текущий этап проверяет минимальные критические accessibility-
  контракты без новой зависимости.
- Chromium является текущей воспроизводимой browser-базой; Safari/Firefox остаются release-risk.

### Проблемы и способы исправления

- Init-script теста сначала повторно задавал светлую тему при каждом reload. Начальное значение
  перенесено в однократную запись `localStorage` перед первой проверяемой перезагрузкой.
- Неоднозначный locator «Все темы» уточнён через exact accessible name.
- Live region принадлежит странице интерактива, поэтому контракт проверяется на её реальном route.

### Как повторить самостоятельно

1. Выполнить `npm run test:e2e` и убедиться, что проходят 19 Chromium-тестов.
2. Открыть Playwright test-results при падении: там будут screenshot и trace.
3. Выполнить `npm test`, чтобы проверить 38 unit/contract-тестов.
4. Выполнить `npm run check` и `npm run lint` для TypeScript/Astro/ESLint.
5. Выполнить `npm run build` и проверить генерацию 15 статических страниц.
6. Выполнить `npm audit` и подтвердить отсутствие известных уязвимостей.
7. Выполнить `git diff --check` перед коммитом.

## 2026-08-14 — Неблокирующий первый рендер при зависшем Google Fonts

### Что и зачем изменено

- Внешний `@import` удалён из `src/styles.css`, потому что он делал первый рендер
  зависимым от ответа Google Fonts.
- `BaseLayout.astro` подключает те же семейства неблокирующе, сохраняя системные
  fallback-шрифты; внешний `/scripts/web-font.js` включает stylesheet после
  загрузки без inline `onload`.
- Playwright-тест удерживает только Google Fonts CSS и требует видимый `main h1`
  до освобождения запроса, а затем проверяет применение stylesheet.

### Как воспроизвести самостоятельно

1. Выполнить `npm run build`.
2. Выполнить `npm run test:e2e` и найти контракт `NFR-006` среди 21 теста.
3. Проверить отсутствие inline handler: `rg "onload=" src/layouts dist/ru/index.html`.
4. Выполнить `npm run check`, `npm run lint` и аудит собранного HTML.

## 2026-08-14 — Безопасное обновление PWA и offline-навигация

### Что и зачем изменено

- Cache key обновлён до `potential-pwa-v2`, потому что изменилась стратегия.
- Service worker кэширует только успешные публичные страницы и статические
  ресурсы, не сохраняет 404/`private`/`no-store`/API и не трогает чужие кэши.
- Playwright моделирует byte-обновление одного `/sw.js`, перенос безопасного
  кэша, offline-reload и offline fallback.

### Как увидеть изменения воочию

1. Выполнить `npm run build`, затем `npm run preview -- --host 127.0.0.1 --port 4322`.
2. Открыть `http://127.0.0.1:4322/ru/topics/` и DevTools → Application →
   Service Workers; `/sw.js` должен иметь статус activated/running.
3. В Cache Storage открыть `potential-pwa-v2` и убедиться, что каталог сохранён.
4. В DevTools → Network включить Offline и перезагрузить каталог: останется
   заголовок «Карта электротехники».
5. Не возвращая сеть, открыть `/ru/not-cached-offline/`: появится экран
   «Нет подключения / Немає з’єднання».
6. Вернуть Network → No throttling и остановить preview сочетанием `Ctrl+C`.
