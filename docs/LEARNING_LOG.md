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
