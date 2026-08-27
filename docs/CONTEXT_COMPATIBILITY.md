# Совместимость проектного контекста

Первичный аудит: 2026-08-13. Reconciliation повторён: 2026-08-27. Статусы соответствуют workspace-политике:
`INHERITED`, `EXTEND`, `PROJECT_ONLY`, `CONFLICT`, `OBSOLETE`.

## Возможности AI-инфраструктуры

| Возможность | Что уже есть | Потребность проекта | Статус | Решение |
|---|---|---|---|---|
| Общие инженерные правила | `~/.codex/AGENTS.md`, `rules/` | локальные инварианты Astro/контента | `EXTEND` | тонкий проектный `AGENTS.md` |
| Git workflow | workspace-правила | обычная feature/chore ветка | `INHERITED` | локальную копию не создавать |
| Skills этапов | `resume-project`, `plan-stage`, `implement-stage`, `review-change`, `explain-change` | продолжение roadmap | `INHERITED` | вызывать по протоколу, не копировать |
| Agents/review | глобальные роли и встроенные agents | специалисты только по сложности | `INHERITED` | локальные agents не создавать без пробела |
| Hooks | workspace/global | специальный hook не нужен | `INHERITED` | новых hooks нет |
| MCP/apps | доступны из активной конфигурации | только по фактической интеграции | `INHERITED` | локальные MCP не добавлять |
| Codex config | глобальная конфигурация | проектных параметров нет | `INHERITED` | второй config не создавать |
| Маршрут одной команды | отсутствовал | выбрать и выполнить один подэтап | `PROJECT_ONLY` | `prompts/STAGED_PROMPTS.md` + router в `AGENTS.md` |

## TUTOR-00 — brownfield reconciliation

Read-only `reconcile_project_framework.py` классифицировал repository как
`BROWNFIELD`: dependency drift отсутствует, канонический manager — pnpm,
существующие project документы сохраняются через `MERGE`, product files имеют
`FORBIDDEN_TO_OVERWRITE` для framework refresh.

| Возможность | Найденное состояние | Статус | Resolution owner / target |
|---|---|---|---|
| Stage source | существует `prompts/STAGES.md`, но active docs/SPEC ссылаются на удалённый `STAGED_PROMPTS.md` | `CONFLICT` | `T0-CTX-001`, Stage `TUTOR-01` |
| Production boundary | Astro production и отдельный Vite SPA entrypoint | `CONFLICT` | `T0-APP-001`, Stage `TUTOR-02` |
| Global framework | локальных generic agents/hooks/MCP/config нет | `INHERITED` | сохранить без новых слоёв |
| Baseline evidence | полный реестр и команды находятся в `notes/stage-0-baseline.md` | `PROJECT_ONLY` | canonical audit record Stage 0 |

## Разрешённые конфликты документов

| Прежний источник | Проблема | Статус | Каноническое решение |
|---|---|---|---|
| `PROJECT_CONTEXT.md` | смешивал цель, архитектуру, дизайн, deploy и будущие решения | `CONFLICT` | разнесено в SPEC, `docs/*`; файл удалён |
| корневой `ARCHITECTURE.md` | нестандартное место и смешение карты с планами | `CONFLICT` | `docs/ARCHITECTURE.md` + `AI_STATUS`/`ROADMAP` |
| `PAYMENTS_AND_BOOKING.md` | план выдавался рядом с фактической документацией, содержал нестабильные юридические утверждения | `CONFLICT` | черновая feature-SPEC и `SECURITY.md`; файл удалён |
| `CONTENT_GUIDE.md` | полезный, но ссылки указывали на разрозненный контекст | `EXTEND` | перенесён в `docs/CONTENT_GUIDE.md`, связан с system SPEC |
| Node 22.12 vs 22.16 | разные минимумы в документах | `CONFLICT` | канон `package.json`: `>=22.12.0` |
| RU/UA vs `ru`/`uk` | UI-метка смешивалась с route code | `CONFLICT` | языки RU/UA, технические коды `ru`/`uk` |
| «доступные» карточки без MDX | документация не отличала карточку от публикации | `CONFLICT` | требование FR-003 и известная проблема в `AI_STATUS` |

## Итог

Проект хранит только собственную delta: SPEC, архитектуру, решения, дизайн,
безопасность, состояние, roadmap и stage protocol. Новые hooks, MCP, config,
Skill или subagent не добавлены: подтверждённого пробела для них нет.
