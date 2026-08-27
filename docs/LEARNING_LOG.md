# Учебный журнал

## 2026-08-27 — Как отличить toolchain от второго приложения

### Что изменено

- Import/script/deployment graph подтвердил Astro как единственный production path.
- Удалены orphan entrypoint, страницы и отдельные Vite/TypeScript configs; рабочий
  `MeshLesson` island и Vitest Vite integration сохранены.

### Повторяемый вывод

Наличие Vite dependency или строки `[vite]` в Astro build не доказывает наличие
Vite-приложения. Application boundary определяется достижимым entrypoint,
package scripts, deployment artifact и живым E2E-путём.

### Как повторить самостоятельно

1. Проследить package script до build tool и публикуемого каталога.
2. Найти входной HTML/JS и проверить обратные imports из production routes.
3. Отделить runtime entrypoint от test/build plugins.
4. После удаления выполнить frozen install, static checks, unit, build и E2E.

## 2026-08-27 — Переносимый context route без второго prompt source

### Что изменено

- Router, README, context SPEC, decisions и compatibility matrix сведены к
  одному `prompts/STAGES.md`.
- Source-of-truth matrix отделяет requirements, implementation evidence,
  architecture, current plan/status, operational stages и Notion ideas.
- ПК ↔ ноутбук workflow начинается с Git-state и frozen restore, а не с
  destructive cleanup или предположения, что dirty work уже перенесён.

### Повторяемый вывод

Alias для переименованного stage-файла создаёт второй источник и скрывает stale
links. Безопаснее синхронно обновить active consumers, сохранить migration как
historical evidence и доказать clean-session selector через существующий
repository file.

### Как повторить самостоятельно

1. Проверить `Test-Path prompts/STAGES.md` в PowerShell или `test -f prompts/STAGES.md`.
2. Выполнить `pnpm check:context`: script проверит active references, ровно один
   `Stage ID` в `AI_PLAN.md` и уникальный heading в `prompts/STAGES.md`.
3. Запустить `python ~/.codex/tools/validate_project_overlay.py .` в POSIX-shell
   либо `py -3 -B "$HOME/.codex/tools/validate_project_overlay.py" .` в Windows
   PowerShell.
4. Прочитать `docs/AI_STATUS.md` → `docs/AI_PLAN.md` → выбранный heading в
   `prompts/STAGES.md`; следующим должен быть `TUTOR-02`, blocked ET-stages не
   должны выбираться.

## 2026-08-27 — Evidence-first baseline перед стабилизацией Tutor

### Что проверено

- Brownfield reconciliation выполнен до mutations.
- Production Astro отделён от legacy Vite entrypoint по imports, scripts и
  build artifact, а не по названию каталога.
- Известные URL/base-path/CI/context риски воспроизведены точечными `rg`, build
  и test commands и получили стабильные finding IDs.
- Полный baseline повторён pinned pnpm toolchain: check, lint, 38 unit/integration,
  15-page build, lesson audit и 21 Chromium E2E.

### Повторяемый вывод

Успешный build доказывает сборку текущего root deployment contract, но не
доказывает non-root base portability, безопасность недоверенного URL-state или
наличие pre-deploy quality gates. Эти свойства требуют отдельных artifact,
adversarial и pipeline checks.

### Как повторить самостоятельно

1. Выполнить `pnpm check`, `pnpm lint` и `pnpm test`.
2. Выполнить `pnpm build` и `node scripts/audit-built-lessons.mjs`.
3. Выполнить `pnpm test:e2e` и подтвердить 21 Chromium test. На Windows при
   блокировке PowerShell shim использовать эквивалентный `pnpm.cmd`.
4. Найти root-absolute paths: `rg -n 'href="/|src="/' dist`.
5. Сверить stage references: `rg -n -e 'STAGED_PROMPTS' -e 'STAGES\.md' AGENTS.md README.md docs prompts specs`.
6. Проверить findings и reproduction в `docs/notes/stage-0-baseline.md`.

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
