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
| `features/reactive-two-port.spec.md` | Действует | Реактивный LC-двухполюсник, резонансы и шаги эквивалентного преобразования |
| `features/star-neutral-phasors.spec.md` | Действует | Локальный трёхфазный интерактив: комплексные сопротивления, три режима нейтрали, векторные диаграммы и численная защита |
| `features/transmission-line-transient.spec.md` | Действует | Расчёт переходных процессов, редактор, рукописный ввод и экспорт |
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

| `features/engineering-showcase.spec.md` | Approved user contracts2026-10-28/29 | SHOW-001..020: interactive showcases, shared engineering plots and localized numerical display |

| `features/fourier-laboratory.spec.md` | Approved user contract2026-10-29 | FOUR-001..007: local contour/spectrum/epicycle and verified source basis adaptation |

| `features/student-workspaces.spec.md` | Approved user master2026-10-29 | UX-001..010: student navigation/cards/gestures/Fourier/boards/services and bounded Android packaging |

| `features/beam-laboratory.spec.md` | Approved user master2026-10-29 | BEAM-001..009 / SYMBOL-001..004: Euler–Bernoulli beam lab and canonical engineering SVG geometry |

| `features/panoramic-visual-system.spec.md` | Approved user master2026-10-30 | PAN-001..010: panoramic covers, shared catalogue/navigation, partial eraser and independent video gate |

| `features/mesh-lesson-visual-repair.spec.md` | Approved RUN3A 2026-11-04 | FR-301..306: typography, polarity/readability, six-width visual regression; no kernel/backend/deploy |

| `features/mesh-textbook.spec.md` | Утверждённый contract | ET-MESH-003B: единый подробный RU учебник, FR-311..318 |

| `features/mesh-worked-examples.spec.md` | Утверждённый contract | ET-MESH-003C, FR-321..329:4RU worked examples/static graphics/independent math |

| `features/mesh-laboratory.spec.md` | Approved RUN3D owner contract | ET-MESH-003D FR-331..339:4preset live DC mesh/supermesh lab, independent math/browser evidence |

| `features/public-mvp-run4.spec.md` | Approved RUN4 owner contract | ET-MVP-004,FR-341..353: safe public RU graph/journey/PWA, full dev retained |

| `features/release-readiness-run5.spec.md` | Approved RUN5 owner contract | ET-REL-005, FR-361..373: release/hosting/security/SEO/readiness and bounded owner-authorized cache404 delivery correction; actual evidence in STAGES |

| `features/unified-navigation-run6.spec.md` | Approved RUN6 owner contract2026-11-05 | NAV-001..007 / RTC6-001..003: unified derived contents/menu/full access, unchanged public graph, bounded real RTC diagnosis |

| `features/reference-ui.spec.md` | Утверждён запросом владельца 2026-11-09 | FR-391..395: общая главная и UI оболочка по electrotutor-ui.zip |

| `features/language-switcher-ui.spec.md` | Approved START2026-11-09 | ET-UI-008: RU/UK icon menu/persistence, EN type reservation, honest worker status |
| `features/content-first-navigation.spec.md` | Утверждено запросом владельца | FR-401..406: навигация по доступным материалам и временный светлый режим |
| `features/editorial-learning-sections.spec.md` | Утверждено запросом владельца | FR-407..411: презентационная главная, разделы и инвентаризация full preview |
