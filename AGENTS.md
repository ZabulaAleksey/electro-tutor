# Electro Tutor — project overlay

Сначала применяй `~/.codex/AGENTS.md`. Этот файл содержит только
локальные инварианты и маршрутизацию; общие agents, Skills, hooks, MCP, Git
workflow и правила качества наследуются и здесь не дублируются.

## Границы проекта

- Название продукта: «Потенциал» / «Потенціал»; репозиторий: `electro-tutor`.
- Astro 7 static site, React 19 islands, TypeScript, Content Collections/MDX.
- Поддерживаемые языки: русский и украинский; route/data codes — `ru` и `uk`,
  UI-метка украинского языка может быть `UA`.
- Не редактируй вручную `dist/`, `.astro/`, `node_modules/` и `*.tsbuildinfo`.
- Учебный материал публикуется парой RU/UK; не достраивай сомнительные формулы,
  схемы или исходные данные без подтверждения пользователя.

## Маршрутизация контекста

1. Начни с единственного selector в `docs/STAGES.md` и прочитай только
   соответствующий ему stage record. Его status, `NEXT`, blockers и dependency
   DAG определяют допустимость продолжения; `blocked` stage не запускается.
2. Прочитай `specs/README.md` и затрагиваемую SPEC.
3. Подключай только релевантные разделы:
   - устройство и потоки — `docs/ARCHITECTURE.md`;
   - существенные решения — `docs/DECISIONS.md`;
   - UI — `docs/DESIGN.md`;
   - уроки — `docs/CONTENT_GUIDE.md`;
   - внешние сервисы, недоверенный ввод, PWA и платежи — `docs/SECURITY.md`;
   - backend workflow, API, database и migrations — `docs/project-context.md`,
     `docs/API.md`, `docs/DATA_MODEL.md`, `docs/TESTING.md`;
   - порядок этапов — `docs/ROADMAP.md`.
4. Не загружай весь roadmap, prompts, legacy-код и все SPEC, если задача их не
   затрагивает.

## Команда продолжения

Если пользователь пишет `Продолжай Electro Tutor`, открой
`docs/STAGES.md` и выполни его протокол целиком для ровно одного
следующего допустимого подэтапа.

Если пользователь пишет `Начинай этап TUTOR-XX` или `Начинай этап ET-XX.YY`,
используй тот же протокол, но
сначала проверь зависимости, SPEC и блокеры выбранного этапа. Не обходи
`BLOCKED` статус предположениями.

## Проектные инварианты

- SPEC — единственный источник требований; stage record и roadmap её не заменяют.
- Большой индексируемый текст остаётся в Astro/MDX, а не только в React.
- Карточка каталога не считается опубликованным уроком без парного MDX.
- Query/hash поддерживаемого интерактива сохраняются при смене языка.
- Изменение service worker cache strategy сопровождается новой версией cache
  key и проверкой обновления установленного клиента.
- Публичный Jitsi — только MVP без собственного контроля доступа.
- Платежи не реализуются до закрытия предусловий feature-SPEC и security review.
- Production URL, merge, push, PR и deploy требуют явного решения пользователя.
- Backend workflow наследует `~/.codex/rules/backend-dx.md`; project-specific
  commands, profiles и evidence находятся в `docs/project-context.md`.

## Команды

```bash
pnpm dev
pnpm check
pnpm lint
pnpm build
pnpm backend:check
```

Канонический package manager — `pnpm@11.23.0`; используй `pnpm install
--frozen-lockfile` и не создавай npm/Yarn/Bun lockfiles. В Windows PowerShell
при блокировке `pnpm.ps1` используй `pnpm.cmd` с теми же аргументами.


## Локальные правила тестирования

### Тестовый контракт
- После принятия тестов/fixtures/golden-сценариев они считаются контрактом и в этом же цикле не меняются. Разрешены только запуски для проверки.
- Изменение тестов без отдельного требования по их переопределению запрещено.

### Unit / integration / component
- unit + integration: `pnpm test`
- component/sanity: `pnpm lint`, `pnpm check`, `pnpm build`

### E2E (критические)
1. Подгрузка основных страниц и переключения RU/UK с корректным рендерингом контента.
2. Жизненный цикл PWA и доступность в офлайн-режиме.
3. Загрузка шрифтов/ресурсов и устойчивость навигации между ключевыми маршрутами.

- Запуск E2E: `pnpm test:e2e`
- Если API/контентные зависимости для сценариев отсутствуют: `BLOCKED_BY_BACKEND_ELECTRO_TUTOR`.
