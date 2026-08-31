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
| `features/pre-deploy-quality-gates.spec.md` | Действует | Единый full-verify pipeline и безопасная передача проверенного artifact в GitHub Pages deploy |
| `features/payments-and-booking.spec.md` | Черновик, заблокирован решениями | Расписание, hosted checkout и обработка подтверждений |
| `features/ai-native-tutoring-platform.spec.md` | Черновик будущего track | Инварианты и границы развития к AI-native tutoring platform; каждый implementation stage требует уточнённой feature-SPEC |

Перед существенным изменением поведения сначала обнови затрагиваемую SPEC,
затем архитектуру/план и только после этого код и тесты.
