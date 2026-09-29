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
| Маршрут одной команды | `docs/STAGES.md` и router в `AGENTS.md` | выбрать и выполнить один dependency-valid stage | `PROJECT_ONLY` | один локальный stage source без alias/remote dependency |

## TUTOR-00 — brownfield reconciliation

Read-only `reconcile_project_framework.py` классифицировал repository как
`BROWNFIELD`: dependency drift отсутствует, канонический manager — pnpm,
существующие project документы сохраняются через `MERGE`, product files имеют
`FORBIDDEN_TO_OVERWRITE` для framework refresh.

| Возможность | Найденное состояние | Статус | Resolution owner / target |
|---|---|---|---|
| Stage source | `prompts/STAGES.md`; active router/docs/SPEC синхронизированы Stage `TUTOR-01` | `CONFLICT` → `EXTEND` | один канон; legacy path остаётся только historical evidence в Stage 0 audit |
| Production boundary | единственный Astro production path; Vite используется только toolchain | `CONFLICT` → `EXTEND` | `T0-APP-001` закрыт Stage `TUTOR-02`, ADR-012 |
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

## Brownfield active ET-10.3 STAGES reconciliation 2026-09-15

Old prompt stage catalog and AI pair — MERGE; `docs/STAGES.md` — ADD. Selected local ET-10.3 implemented_unverified with protected dev DB (2 accounts, drift); remote ET-09.4 partial snapshot at `ac675d4` is retained in Git ancestry and does not overwrite active state. Product code/tests/locks/CI/config/DB/upstream assets — FORBIDDEN_TO_OVERWRITE. Source SHA/facts in `docs/notes/` and Git parent rollback; formal DEV bridge not asserted.

## Structured DEV bridge adoption — 2026-09-29

Read-only `reconcile_project_framework.py` подтвердил `BROWNFIELD`, канонические
pnpm/uv/Cargo locks, отсутствие dependency drift и `FORBIDDEN_TO_OVERWRITE`
для product code/tests/locks/DB assets. До adoption overlay validator сообщал
только `missing-dev-bridge` и `missing-dev-project-marker`; stage route canonical.
Владелец выбрал explicit structured opt-in в GDA-NEW-HOST-001.

| Capability | Владелец | Классификация | Минимальное решение |
|---|---|---|---|
| DEV membership и portable paths | Global DEV contract; project AGENTS | `CONFLICT → INHERITED` | `.codex/dev-project.toml` и exact AGENTS declaration |
| Host tools и doctor | Global DEV | `INHERITED` | Global проверяет host prerequisites; project pins и Backend DX Delta локальны |
| Architecture, auth, DB, sessions и locks | Electro Tutor Git | `FORBIDDEN_TO_OVERWRITE` | Без application, data, migration и feature-branch mutation |
| Selected stage и product blockers | `docs/STAGES.md` | `PROJECT_ONLY` | Сохранить ET-10.3/ET-14.2 lifecycle и независимые gates |

Фраза 2026-09-15 выше о неактивном formal DEV bridge историческая; этот opt-in
заменяет только membership state, не проектные правила.
