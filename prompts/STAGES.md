# Поэтапный запуск Electro Tutor

Этот файл — операционный протокол, а не источник требований. SPEC отвечает на
вопрос «что должна делать система», ROADMAP — «в каком порядке», AI_PLAN — «что
делаем сейчас».

## TUTOR-00 — Полная инвентаризация и reconciliation

Статус: `completed` (`validated locally`, 2026-08-27)

Dependencies: отсутствуют. Entry precondition: brownfield repository доступен
read-only, package manager и baseline commands определимы.

Runnable slice: классифицировать production/legacy/experimental contours,
routes, content, tests, CI/deploy и known risks без product mutations. Concrete
end-to-end evidence: pinned project toolchain выполняет check, lint, unit,
production build, lesson audit и Chromium E2E; findings имеют ID, severity,
reproduction и target stage.

PASS evidence и acceptance artifact: `docs/notes/stage-0-baseline.md`.
Temporary implementation не требуется. Deferred scope: все исправления findings.
Rollback: удалить только audit/status documentation commit; product artifact не
менялся.

## TUTOR-01 — Канонический локальный контекст

Статус: `completed` (`validated locally`, 2026-08-27)

Dependency DAG: `TUTOR-00` completed. Entry preconditions: baseline findings
`T0-CTX-001` и brownfield reconciliation доступны локально.

Runnable vertical slice: команда `Продолжай Electro Tutor` разрешается только
через существующий `prompts/STAGES.md` и актуальные repository status/plan/SPEC,
без удалённого или machine-local `STAGED_PROMPTS.md`.

Concrete end-to-end scenario: новый session на clean clone читает `AGENTS.md`,
находит `TUTOR-02` как следующий допустимый stage, не выбирает blocked ET-stage
и получает воспроизводимые команды проверки.

Scope: semantic/link reconciliation, source-of-truth matrix, cross-device
continuation, context/overlay validation. Non-goals: product fixes
`T0-APP-001..T0-DEP-001`, новые hooks/MCP/agents/runtime services. Допустимая
temporary implementation: отсутствует — local route должна быть полностью
рабочей. Deferred scope: production boundary и остальные findings.

PASS: active links не указывают на отсутствующий stage file; selector и relative
links однозначны; `pnpm check:context`, SessionStart hook, overlay/context checks
и `git diff --check` проходят. Rollback: один context-only commit.

Acceptance evidence: `AGENTS.md`, `README.md`,
`specs/features/context-automation.spec.md`, `docs/project-context.md`, ADR-011
`scripts/validate-context-route.mjs`, SessionStart output и project overlay
validation. Product behavior/runtime code не изменялись.

## TUTOR-02 — Production boundary и судьба Vite SPA

Статус: `completed` (`validated locally`, 2026-08-27)

Dependency DAG: `TUTOR-01` completed. Entry preconditions: findings
`T0-APP-001`, production Astro build и transitional
`MeshLessonIsland → legacy-pages/MeshLesson` подтверждены локально.

Runnable vertical slice: один очевидный production frontend command и один
deployment build path. Неиспользуемый Vite SPA либо безопасно удалён после
import/script/history audit, либо изолирован как самостоятельный
archive/experimental contour с доказанной ответственностью и отдельным
build/test contract.

Concrete end-to-end scenario: clean frozen install запускает канонический build,
генерирует Astro RU/UK artifact и проходит существующие unit/integration,
component/static и Chromium E2E; repository не содержит orphan scripts/imports
или второго неописанного production entrypoint.

Scope: evidence-based ADR, `index.html`, `src/main.tsx`, `src/App.tsx`,
`src/legacy-pages/**`, Vite/TypeScript configs, package scripts, README,
architecture/decisions/status и затронутые tests. Сначала отделить используемый
`MeshLesson` seam от мёртвого SPA shell.

Non-goals: Next.js, переписывание Astro, новый framework, исправления
URL-state/RU-UK/base-path/CI следующих stages. Допустимая temporary
implementation: явно изолированный и самостоятельно проверяемый legacy contour;
не допускается скрытый второй production path. Deferred scope: findings
`T0-URL-001`, `T0-LOC-001`, `T0-BASE-001`, `T0-REL-001`, `T0-SEO-001`.

PASS: ADR фиксирует решение и альтернативы; один production command и deployment
path; clean restore, check, lint, unit/integration, build, lesson audit и E2E
проходят; orphan references отсутствуют. Rollback: вернуть единый Stage 2 commit
без изменения пользовательского контента.

Acceptance evidence: ADR-012, `docs/ARCHITECTURE.md`, удалённый orphan SPA shell
и отдельные configs; frozen install, Astro check, ESLint, 38 tests, 15-page
build, lesson audit и 21 Chromium E2E прошли. Production seam
`MeshLessonIsland → legacy-pages/MeshLesson` сохранён.

## TUTOR-03 — Версионированный URL/state круговой диаграммы

Статус: `completed` (`validated locally`, 2026-08-27)

Dependency DAG: `TUTOR-02` completed. Entry preconditions: finding
`T0-URL-001`, текущая математическая модель и browser query-state tests доступны.

Runnable vertical slice: одна типизированная версия URL/state schema управляет
чтением, валидацией, нормализацией и канонической сериализацией состояния
круговой диаграммы. UI, URL, history, saved/imported state используют одинаковые
domain limits; недоверенный URL не обходит инварианты.

Concrete end-to-end scenario: пользователь открывает допустимую share-ссылку,
видит соответствующее состояние, меняет параметры, проходит back/forward и
reload без расхождения UI/URL. Невалидная или неизвестная версия безопасно
переходит к defaults/понятному сообщению и каноническому URL.

Scope: поля, типы, ranges, enums, defaults, version, unknown-version policy,
duplicate/unknown keys, canonical ordering/encoding и maximum size; pure
`parse → validate → normalize → canonicalize`; `replaceState` для частых и
`pushState` для смысловых переходов; unit/property/boundary, component и E2E.

Non-goals: новый backend, аккаунты/saved presets, исправление RU/UK/base-path/CI,
редизайн диаграммы. Допустимая temporary implementation: только полностью
рабочий локальный adapter над существующим UI; нельзя доверять значениям
`URLSearchParams` напрямую. Deferred scope: остальные Stage 0 findings.

PASS: NaN/Infinity, огромные/отрицательные числа, duplicate/unknown keys,
encoded payload и unknown version не нарушают limits; канонизация стабильна и
идемпотентна; старые допустимые ссылки продолжают работать либо детерминированно
мигрируют; back/forward/reload и share-link проходят живой E2E. Rollback: один
Stage 3 commit без изменения content contract.

Acceptance evidence: feature-SPEC, ADR-013, pure state module, 18 новых
boundary/property tests и 4 новых browser scenarios. Полный pipeline: Astro
check 49 файлов, ESLint, 56 unit/integration tests, 15-page build, lesson audit
и 25 Chromium E2E — PASS.

## TUTOR-04 — Реальный production-контракт RU/UK

Статус: `completed` (validated locally, 2026-08-27)

Dependency DAG: `TUTOR-03` completed. Entry preconditions: production Astro
routes обеих локалей, system locale contract, парный lesson manifest и
канонический URL-state доступны.

Runnable vertical slice: один locale source of truth управляет production Astro
routes, UI strings, metadata, errors и aria-labels. Build-time validation ловит
missing/extra keys, а RU/UK artifact и share URL проходят живой browser path.

Concrete end-to-end scenario: пользователь открывает одинаковый смысловой route
на RU и UK, переключает локаль с сохранением валидного versioned query/hash и
видит локализованные metadata, controls, errors и accessibility names без
fallback в чужой язык.

Scope: locale source, route strategy/fallback, canonical/hreflang, форматирование
чисел/единиц/дат, полный inventory пользовательского текста и CircularDiagram,
предметный glossary, build-time parity validation, fallback tests и RU/UK E2E.

Non-goals: машинный перевод без предметной проверки, новые локали, base-path
portability, deploy gates и новый content model. Допустимая temporary
implementation: существующие Astro routes при условии единого проверяемого
locale contract; нельзя оставлять production strings в мёртвом legacy contour.

PASS: production artifact содержит обе локали; locale switch сохраняет
смысловой route и canonical interactive state; metadata/canonical/hreflang
корректны; missing/extra/untranslated contract keys блокируют build/tests;
full static/unit/component/E2E pipeline проходит. Rollback: один Stage 4 commit.

Acceptance evidence: `features/localization.spec.md`, ADR-014, 156 paired locale
keys, formatter/fallback tests, 14-route artifact audit и full Chromium RU/UK
matrix. Pipeline: Astro check 56 files, ESLint, 62 unit/integration tests,
15-page build, lesson audit и 42 Chromium E2E — PASS.

## TUTOR-05 — Base-path portability и GitHub Pages project-site

Статус: `planned`

Dependency DAG: `TUTOR-04` completed. Entry preconditions: единый Astro artifact,
versioned share URL, RU/UK semantic routes и locale SEO contract подтверждены.

Runnable vertical slice: один base/site URL contract управляет build config,
routes и assets; root и non-empty-base artifacts проходят автоматический audit.

Concrete end-to-end scenario: пользователь открывает RU/UK interactive deep
link под project base, получает assets, переключает язык с сохранением query/hash
и обновляет страницу без 404.

Scope: inventory root-absolute links/assets/canonical/redirects/fetch/router и
service-worker paths; config/helpers для base/site; deep links, locale routes,
share URLs, 404 behavior; non-empty-base smoke и broken link/asset audit.

Non-goals: deploy, production domain/DNS, CI quality gates `TUTOR-06`, изменение
locale/content/URL-state schemas. Допустимы текущие hosting adapters при
доказанной работе обоих artifact modes; future domain не хардкодится.

PASS: root и project-base artifact открывают home/nested/interactive direct
links; locale/share/reload сохраняют path/query/hash; internal assets и service
worker scope не дают 404; localhost/machine-local URL не протекают. Rollback:
один Stage 5 commit без deploy.

## Одна команда

В новом или текущем чате Codex напиши:

```text
Продолжай Electro Tutor
```

Команда выполняет ровно один следующий допустимый подэтап. Для явного выбора
можно написать `Начинай этап TUTOR-XX` или `Начинай этап ET-XX.YY`;
зависимости и блокеры всё равно
проверяются.

## P-01 — Возобновление и выбор

1. Найди Git-корень и ближайшие `AGENTS.md`; проверь branch/status и сохрани
   пользовательские изменения.
2. Прочитай `docs/AI_STATUS.md`, `docs/ROADMAP.md`, `docs/AI_PLAN.md` и
   `specs/README.md`.
3. Если `AI_PLAN` имеет статус «готов к запуску» или «в работе», продолжай его.
   Иначе выбери первый `PLANNED` подэтап с выполненными зависимостями и создай
   один ограниченный `AI_PLAN`.
4. Не выбирай `BLOCKED` этап без закрытого внешнего решения. Не считай
   `OPTIONAL` утверждённым требованием.
5. Классифицируй сложность, режим, SDLC, домен и стек; загрузи только
   релевантные workspace-правила и затрагиваемую SPEC.

Результат P-01: один выбранный подэтап, его SPEC-требования, критерии приёмки и
точная область файлов.

## P-02 — План подэтапа

1. Сверь требование пользователя → SPEC → архитектуру/решения/безопасность.
2. Если поведение не определено, сначала обнови SPEC; не придумывай продуктовые
   требования из roadmap или этого prompt-файла.
3. Сформируй минимальный план реализации, проверок и отката.
4. Используй унаследованный `$plan-stage` только когда отдельное планирование
   действительно нужно; для простого подэтапа достаточно `docs/AI_PLAN.md`.
5. Субагенты допустимы только по правилам сложности и с явной пользой. Два
   write-capable агента работают только в разных worktrees и файлах.

Результат P-02: актуальный `AI_PLAN` с конечным объёмом и acceptance criteria.

## P-03 — Реализация

1. Если текущая ветка защищена, создай обычную рабочую ветку.
2. Реализуй только выбранный подэтап; используй `$implement-stage`, когда его
   масштаб соответствует skill.
3. Не расширяй задачу соседним roadmap-этапом.
4. Не меняй внешние сервисы, production, данные или доступы без явного запроса.
5. При конфликте SPEC и кода останови спорное поведение, зафиксируй расхождение
   и обнови источник истины после согласования.

Результат P-03: минимальный diff одного подэтапа.

## P-04 — Проверка и review

1. Выполни проверки из AI_PLAN и затронутой SPEC.
2. Для UI проверь RU/UK, обе темы, keyboard и мобильную ширину; для внешних
   интеграций — негативные сценарии и `docs/SECURITY.md`.
3. Выполни `git diff --check` и проверь, что generated/secret файлы не попали в
   diff.
4. Для STANDARD/COMPLEX используй `$review-change` либо соответствующего
   read-only reviewer по правилам проекта.
5. Не объявляй этап завершённым, если обязательная проверка не выполнялась;
   запиши точную причину и оставшийся риск.

Результат P-04: доказательства по каждому критерию приёмки.

## P-05 — Закрытие и следующий запуск

1. Обнови только документы, факты в которых изменились:
   `AI_STATUS`, `ROADMAP`, `AI_PLAN`, а при необходимости SPEC, architecture,
   decisions, design или security.
2. Пометь завершённый подэтап `DONE`; подготовь один следующий допустимый
   ограниченный `AI_PLAN` либо укажи точный блокер.
3. Создай Conventional Commit. Не выполняй merge, push, PR или deploy без
   прямого разрешения.
4. Сообщи изменённое, проверки и ограничения, затем задай обязательный вопрос о
   merge согласно workspace Git workflow.
5. Добавь раздел «Как увидеть изменения воочию»: команда запуска, точный URL,
   действия пользователя/DevTools и ожидаемый результат. Если diff невизуальный,
   укажи ближайшее наблюдаемое доказательство — тест, log или browser state.

После этого следующая команда `Продолжай Electro Tutor` начнёт уже следующий
подэтап.

## Защита от зацикливания

- Если AI_PLAN уже выполнен по коду, сначала синхронизируй статус, а не повторяй
  реализацию.
- Если один блокер повторяется, не имитируй прогресс и не подставляй фиктивные
  значения.
- Если следующий этап слишком велик для одного commit, выдели первый
  проверяемый подэтап и запиши остальные в ROADMAP.
- Если рабочая копия содержит чужие изменения, не откатывай их; сузь область
  либо запроси решение только при реальном пересечении.
