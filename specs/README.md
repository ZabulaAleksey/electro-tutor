# Индекс спецификаций

Спецификации — канонический источник требований проекта. Фактическое состояние
реализации фиксируется в `docs/AI_STATUS.md`, а порядок работ — в
`docs/ROADMAP.md`.

| SPEC | Статус | Назначение |
|---|---|---|
| `system.spec.md` | Действует | Границы и требования платформы «Потенциал» |
| `features/context-automation.spec.md` | Действует | Project overlay и запуск следующего этапа одной командой |
| `features/lesson-publishing.spec.md` | Действует | Единый manifest уроков, derived availability, универсальный MDX route и optional island |
| `features/circular-diagram-state.spec.md` | Действует | Версионированная схема URL/state, domain limits и browser history круговой диаграммы |
| `features/localization.spec.md` | Действует | Проверяемый production-контракт RU/UK для routes, UI, metadata и accessibility |
| `features/base-path-portability.spec.md` | Действует | Единый site/base URL contract для root и project-site artifacts |
| `features/payments-and-booking.spec.md` | Черновик, заблокирован решениями | Расписание, hosted checkout и обработка подтверждений |

Перед существенным изменением поведения сначала обнови затрагиваемую SPEC,
затем архитектуру/план и только после этого код и тесты.
