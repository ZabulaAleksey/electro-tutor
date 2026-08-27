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

Статус: `planned`

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
links однозначны; overlay/context checks и `git diff --check` проходят. Rollback:
один documentation-only commit.

## Одна команда

В новом или текущем чате Codex напиши:

```text
Продолжай Electro Tutor
```

Команда выполняет ровно один следующий допустимый подэтап. Для явного выбора
можно написать `Начинай этап ET-XX.YY`; зависимости и блокеры всё равно
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
