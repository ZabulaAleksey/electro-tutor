# Контекст проекта

Electro Tutor — Astro 7 static site с React 19 islands, TypeScript и Content
Collections/MDX. Поддерживаются маршруты `ru` и `uk`.

## Источники истины

| Тип информации | Канонический источник |
|---|---|
| Product/system requirements | `../specs/` |
| Фактическая реализация | код repository и результаты проверок |
| Архитектура и существенные решения | `ARCHITECTURE.md`, `DECISIONS.md` |
| Порядок развития | `ROADMAP.md` |
| Текущий ограниченный stage | `AI_PLAN.md` |
| Подтверждённое состояние | `AI_STATUS.md` |
| Операционный stage protocol | `../prompts/STAGES.md` |
| Глобальная методика | `~/.codex/AGENTS.md` и глобальный ДЕВ |
| Идеи и vision | Notion; не является evidence реализации |

Project overlay хранит только project-specific delta. Hooks, MCP, generic
agents, Skills и Git workflow наследуются; локальные копии без подтверждённого
пробела не создаются.

## Планируемая backend developer workflow applicability

Backend DX policy пока неприменима к фактическому static runtime: backend и его
команды ещё не реализованы. Утверждённая цель `ET-09.2` — минимум `BDX-L2`:
discoverable root
commands `backend:bootstrap/build/check/dev/stop/logs/status/doctor/smoke`,
`backend:test:fast`, `backend:test:integration` и guarded `backend:db:*`,
service-local reproducible `uv`
restore, реальный PostgreSQL в local/CI и одинаковые diagnostics. Фактические
команды и полный `Backend DX Delta` добавляются только вместе с working slice;
этот docs-stage не выдаёт target за реализованный workflow.

## Переносимое продолжение

Critical context восстанавливается из Git clone/branch и глобального ДЕВ. Перед
командой `Продолжай Electro Tutor` исполнитель проверяет dirty/untracked work,
явно переключается на выбранную ветку, получает её через fast-forward без
destructive reset, выполняет `pnpm install --frozen-lockfile`, запускает
`pnpm check:context`, валидирует project overlay и читает `AI_STATUS.md` →
`AI_PLAN.md` → выбранный record в `prompts/STAGES.md`.
