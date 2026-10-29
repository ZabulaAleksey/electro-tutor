# Индекс спецификаций

Спецификации — канонический источник требований проекта. Фактическое состояние
исполнения фиксируется в выбранном record `../docs/STAGES.md`, а порядок
работ — в `../docs/ROADMAP.md`.

Текущий requirement scope — объединение `system.spec.md` и всех feature-SPEC со
статусом `Действует` или `Утверждённый contract` ниже. Machine-readable ledger
`../docs/requirements-ledger.json` дополнительно учитывает stable IDs из mixed
architecture baseline и классифицирует каждый как уже реализованный architecture
baseline либо non-binding future backlog. Все они входят в full-corpus coverage
denominator, но только binding SPEC создаёт обязательство текущего runtime/stage. Feature-SPEC имеет
приоритет только для своего явно ограниченного slice; historical stage claim не
заменяет evidence.

| SPEC | Статус | Назначение |
|---|---|---|
| `system.spec.md` | Действует | Границы и требования платформы «Потенциал» |
| `features/context-automation.spec.md` | Действует | Project overlay и запуск следующего этапа одной командой |
| `features/lesson-publishing.spec.md` | Действует | Единый manifest уроков, derived availability, универсальный MDX route и optional island |
| `features/circular-diagram-state.spec.md` | Действует | Версионированная схема URL/state, domain limits и browser history круговой диаграммы |
| `features/star-neutral-phasors.spec.md` | Действует | Локальный трёхфазный интерактив: комплексные сопротивления, три режима нейтрали, векторные диаграммы и численная защита |
| `features/transmission-line-transient.spec.md` | Действует | Rust/WASM Worker transient линии, Canvas эпюры и отдельные маршруты интерактивов |
| `features/localization.spec.md` | Действует | Проверяемый production-контракт RU/UK для routes, UI, metadata и accessibility |
| `features/base-path-portability.spec.md` | Действует | Единый site/base URL contract для root и project-site artifacts |
| `features/pre-deploy-quality-gates.spec.md` | Действует | Единый full-verify pipeline и безопасная передача проверенного artifact в GitHub Pages deploy |
| `features/profiles-capabilities-audit.spec.md` | Действует; runtime verified | Реализованный `ET-09.4` contract: private Student/Tutor profiles, stable Account owner, trusted capability grants, authorization matrix и atomic audit |
| `features/rtc-provider-boundary.spec.md` | Действует; runtime verified | Изоляция публичного Jitsi за system-owned meeting port, adapter/fake contract tests и запрет vendor leakage в UI; `ET-RTC-001` completed locally |
| `features/payments-and-booking.spec.md` | Действует для `FREE`/`EXTERNAL`; `PLATFORM` blocked | Утверждённый `ET-10.1` TutorOffer/Booking snapshot contract и отдельно отложенный hosted-payment path |
| `features/lesson-access-grants.spec.md` | Действует для `ET-10.2`; `PLATFORM` source deferred | Утверждённый time-bounded LessonAccessGrant, atomic Booking issue/revoke, participant authorization и protected media-less shell |
| `features/booking-reminders.spec.md` | Утверждённый contract ET-14.2 / ADR-033 (2026-09-28) | REM-001..005: defaults, confirmed IANA timezone, quiet hours, late grace и immutable Booking; runtime integration отдельно в STAGES |
| `features/lesson-sessions.spec.md` | Утверждённый contract `ET-10.3`; isolated backend/live browser gates прошли, ранее принятый manual RU/UK voice gate PASS (TESTING/UA-19) | Booking-bound lifecycle, participant role, active-grant authorization, reload, expiry и terminal acceptance без media |
| `features/booking-reminders.spec.md` | Утверждённый contract ET-14.2; feature terminal acceptance PASS; locally integrated in main7d63a28 | Explicit IANA settings, 24h/1h/15m intents, quiet hours, late grace и cancel + new Booking replacement |
| `features/live-tutoring-session.spec.md` | DRAFT, не входит в binding requirement scope | Repository reconciliation, proposed invite/media/presence boundary, threats, migration и bounded ET-12 plan |
| `features/ai-native-tutoring-platform.spec.md` | Действующий mixed architecture baseline | Реализованные architecture IDs и non-binding future backlog классифицируются per-ID; каждый новый runtime implementation stage требует утверждённой feature-SPEC |

Перед существенным изменением поведения сначала обнови затрагиваемую SPEC,
затем архитектуру/план и только после этого код и тесты.

| `features/productization-rc1.spec.md` | Approved 2026-10-02 user contract; execution in ET-RC1 | Existing Web/PWA product journey, shell, bounded local progress/resume, release automation and RC1 report |

| `features/engineering-showcase.spec.md` | Approved user contracts2026-10-28/29 | SHOW-001..011: home gallery8scenes,14Micro Labs, neutral scientific graphics and source-only105topic roadmap |

| `features/fourier-laboratory.spec.md` | Approved user contract2026-10-29 | FOUR-001..007: local contour/spectrum/epicycle and verified source basis adaptation |
