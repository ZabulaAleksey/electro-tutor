# Текущий AI-план

## TUTOR-01 — Канонический локальный контекст

Статус: `PLANNED`

Цель: устранить подтверждённый `T0-CTX-001`, чтобы новый Codex-сеанс находил
текущее состояние, следующий этап и команды проверки только из repository и
глобального ДЕВ.

### Dependencies и входные предпосылки

- `TUTOR-00` завершён и подтверждён локально;
- baseline: `notes/stage-0-baseline.md`;
- product findings `T0-APP-001..T0-DEP-001` не исправляются в этом этапе.

### Runnable vertical slice

Команда продолжения из `AGENTS.md` разрешается в существующий
`prompts/STAGES.md`, выбирает один допустимый stage и использует актуальные
`AI_STATUS`, `AI_PLAN`, `ROADMAP`, SPEC и compatibility matrix без внешнего
`STAGED_PROMPTS.md`.

Concrete end-to-end scenario: на чистом clone/session пользователь пишет
`Продолжай Electro Tutor`; агент по локальным относительным ссылкам определяет
`TUTOR-02` как следующий stage, не выбирает `BLOCKED` ET-этап и получает
канонические команды проверки.

### Scope

- semantic/link reconciliation `STAGED_PROMPTS.md` → `STAGES.md`;
- source-of-truth matrix и cross-device continuation contract;
- синхронизация `AGENTS.md`, README, context SPEC, decisions, compatibility,
  status/plan/roadmap и stage protocol;
- deterministic context/overlay validation.

### Non-goals и deferred scope

- не исправлять Vite boundary, URL-state, RU/UK, base path, CI или deploy;
- не добавлять hooks, MCP, agents, framework или runtime services;
- допускается только полностью рабочая локальная документационная route; внешняя
  страница не может быть temporary dependency.

### PASS evidence и rollback

- отсутствуют active references на несуществующий `STAGED_PROMPTS.md`;
- repository links и stage selector однозначны;
- project overlay validator, context-specific tests и `git diff --check` проходят;
- rollback — один documentation-only commit без product/runtime mutations.
