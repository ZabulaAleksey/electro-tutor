# Дорожная карта Electro Tutor

Roadmap задаёт порядок развития, но не заменяет SPEC. Детали ближайшей работы
находятся в `AI_PLAN.md`, фактическое состояние — в `AI_STATUS.md`.

Статусы: `DONE`, `CURRENT`, `PLANNED`, `BLOCKED`, `OPTIONAL`.

## Tutor stabilization track — 2026

Этот track принят поверх существующей ET-карты для доказательной стабилизации
нынешнего production-контура. Он не разблокирует старые product stages без их
входных решений.

### TUTOR-00 — Инвентаризация и reconciliation

Статус: `DONE` (validated locally, 2026-08-27)

- brownfield repository, приложения, routes, content, tests и deployment
  entrypoints классифицированы;
- baseline checks выполнены;
- findings `T0-APP-001..T0-DEP-001` сохранены в
  `notes/stage-0-baseline.md`;
- product defects намеренно не исправлялись.

### TUTOR-01 — Канонический локальный контекст

Статус: `DONE` (validated locally, 2026-08-27)

- устранить зависимость продолжения от отсутствующего `STAGED_PROMPTS.md`;
- согласовать локальные status/plan/roadmap/SPEC/decisions/compatibility links;
- зафиксировать portable continuation contract и проверить overlay.

Зависимость: `TUTOR-00`.

### TUTOR-02 — Production boundary и Vite SPA

Статус: `DONE` (validated locally, 2026-08-27)

- оформить evidence-based ADR для Astro production и legacy Vite contour;
- удалить доказанно мёртвый SPA либо изолировать его с отдельной ролью;
- сохранить используемый `MeshLesson` seam до отдельной миграции;
- привести scripts/docs/config к одному production build path.

Зависимость: `TUTOR-01`.

### TUTOR-03 — Версионированный URL/state круговой диаграммы

Статус: `DONE` (validated locally, 2026-08-27)

- определить типизированную версионированную схему URL-state и единые domain limits;
- реализовать pure parse/validate/normalize/canonicalize pipeline;
- синхронизировать UI, URL и browser history без обхода инвариантов;
- покрыть boundary/property, component и живые browser-сценарии.

Зависимость: `TUTOR-02`.

### TUTOR-04 — Реальный production-контракт RU/UK

Статус: `DONE` (validated locally, 2026-08-27)

- определить locale source of truth, fallback и production route/SEO contract;
- инвентаризировать UI, metadata, ошибки, aria-labels и CircularDiagram;
- зафиксировать предметный glossary для терминов, обозначений и единиц;
- добавить build-time parity validation, fallback tests и RU/UK E2E.

Зависимость: `TUTOR-03`.

### TUTOR-05 — Base-path portability и project-site artifact

Статус: `DONE` (validated locally, 2026-08-27)

- инвентаризировать root-absolute routes/assets/redirects и service worker paths;
- ввести один build-time base/site URL contract и route/asset helpers;
- проверить root и непустой project base, deep links, locale/share URLs и 404;
- добавить artifact smoke и broken internal link/asset audit.

Зависимость: `TUTOR-04`.

### TUTOR-06 — Обязательные quality gates перед публикацией

Статус: `DONE` (validated locally, 2026-08-31)

- свести локальную full-verify command и CI к одному существенному порядку gates;
- блокировать upload/deploy при ошибке static, unit/integration/component, build
  или live E2E проверки;
- передавать deploy job именно проверенный artifact без повторной сборки;
- проверить frozen install, cache, concurrency cancellation, permissions и
  доступные dependency/security checks.

Результат: `pnpm run verify:full` объединяет frozen install, hygiene, static,
lint, unit/integration/component, полный root-artifact Chromium E2E, production
build, project-base smoke и dependency audit. Verify передаёт deploy только
проверенный `dist/`; job permissions разделены, manual path ограничен `main`,
Actions закреплены full SHA. Push/merge/deploy не выполнялись.

Зависимость: `TUTOR-05`.

## ET-00 — Канонический контекст

Статус: `DONE` (2026-08-13)

- разделить требования, архитектуру, решения, дизайн, безопасность, план и
  фактический статус;
- удалить корневые документы-дубли после переноса уникальной информации;
- добавить одну команду продолжения и протокол одного подэтапа;
- зафиксировать аудит совместимости project overlay.

Критерий: `features/context-automation.spec.md` выполнена.

## ET-01 — Надёжная инженерная база

Статус: `DONE` (2026-08-14)

### ET-01.1 — Восстановить штатные проверки

Статус: `DONE` (2026-08-14)

- добавить отсутствующую зависимость для `astro check`;
- добавить совместимую конфигурацию ESLint 9;
- добиться успешных `check`, `lint`, `build` без интерактивной установки.

### ET-01.2 — Минимальная тестовая стратегия

Статус: `DONE` (2026-08-14)

- выбрать минимальный test runner без дублирования возможностей стека;
- покрыть чистую математическую модель круговой диаграммы;
- добавить проверку парности локалей и уникальности опубликованных уроков;
- зафиксировать команды и связь тестов с требованиями.

Зависимость: `ET-01.1`.

### ET-01.3 — Обновить уязвимые зависимости

Статус: `DONE` (2026-08-14)

- обновить транзитивный `js-yaml` до исправленной версии без нарушения
  совместимости Astro/MDX;
- обновить dev/tooling chains `brace-expansion` и
  `wrangler`/`miniflare`/`undici`;
- сравнить lockfile, повторить полный quality pipeline и `pnpm audit`;
- не применять принудительные dependency fixes без анализа breaking changes.

Зависимость: `ET-01.2`. Обнаруженные уязвимости относятся к build/tooling
цепочкам и не являются удалённо вызываемыми endpoint статического сайта, но
должны быть устранены до production-релиза.

Историческая запись `wrangler`/`miniflare`/`undici` сохранена как evidence
выполненного на тот момент dependency remediation. Позднее Cloudflare deployment
был выведен из эксплуатации, а Wrangler и связанные deployment dependencies
удалены; текущий production provider — GitHub Pages.

## ET-02 — Единая модель публикации уроков

Статус: `DONE` (2026-08-14)

- вывести доступность каталога из опубликованного Content Collection либо
  ввести один явно проверяемый manifest;
- прекратить жёсткую отправку нескольких карточек на `mesh-current-method`;
- заменить обязательный `MeshLessonIsland` универсальной границей урока;
- сохранить существующий урок и три уровня без регрессии;
- добавить contract-тесты соответствия каталога опубликованным урокам и
  маршрутам RU/UK.

Зависимости: `ET-01`.

Критерий: требования FR-002 и FR-003 системной SPEC проверяются автоматически.

## ET-03 — Расширение учебного контента

Статус: `BLOCKED`

- пользователь выбирает следующую тему и предоставляет/подтверждает исходный
  материал;
- тема публикуется парой RU/UK по `CONTENT_GUIDE.md`;
- формулы, схема, SEO и три уровня проверяются отдельно;
- каждая тема выполняется отдельным ограниченным подэтапом.

Зависимость: `ET-02`.

Не выбирать тему и не достраивать учебные исходные данные без пользователя.

Блокер: выбранная пользователем следующая тема и подтверждённые исходные материалы.

## ET-04 — Browser-проверка интерактива

Статус: `DONE` (2026-08-14)

- добавить browser/integration проверки восстановления query state;
- проверить клавиатуру, accessibility, мобильный layout и обе темы;
- проверить согласованность UI с unit-tested математической моделью;
- только после этого добавлять новые инструменты по отдельным feature-SPEC.

Результат: добавлены воспроизводимые Chromium-проверки RU/UK-маршрутов, query/hash,
темы, клавиатуры, accessible names, live region и mobile layout 390×844. Скриншоты
прикладываются к test-results и не хранятся в Git.

### ET-04.2 — Неблокирующая загрузка web-font

Статус: `DONE` (2026-08-14)

Блокирующий Google Fonts `@import` удалён из критического CSS. DM Sans и Manrope
подключаются из `BaseLayout` как progressive enhancement, а детерминированный
Playwright-тест удерживает запрос Google CSS и подтверждает быстрый первый рендер
на системных fallback-шрифтах.

Зависимость: `ET-01.2`.

### ET-04.3 — Service worker update и offline-контракт

Статус: `DONE` (2026-08-14)

- проверить получение новой версией service worker контроля над открытым клиентом;
- проверить offline-reload ранее открытого маршрута;
- проверить offline fallback для неизвестного маршрута;
- исключить 404/private/API из кэша и сохранить чужие cache namespaces;
- при подтверждённом изменении стратегии обновить cache key.

Зависимость: `ET-04`.

## ET-05 — Production-модель кабинета

Статус: `BLOCKED`

Сначала пользователь выбирает допустимую модель: оставить публичный Jitsi для
несекретных занятий, настроить защищённый Jitsi либо проектировать собственный
backend/доступ. После решения нужны feature-SPEC, privacy/security review и
проверки входа/повторного подключения.

Блокер: требования доступа, хранения и провайдер видеосвязи.

## ET-06 — Расписание консультаций

Статус: `BLOCKED`

- получить рабочий публичный URL Cal.com либо выбрать альтернативу;
- проверить `https` URL, локализованный fallback и мобильный переход;
- OAuth/sync добавлять только при подтверждённой необходимости и минимальных
  scopes.

Блокер: аккаунт и публичный booking URL пользователя.

## ET-07 — Платежи

Статус: `BLOCKED`

Выполняется только по `../specs/features/payments-and-booking.spec.md` после
закрытия всех предусловий: юридическая модель, страны, валюты, возвраты, тип
услуги и провайдер. Реализация включает hosted checkout, idempotent backend,
проверенный webhook, RU/UK состояния и security review.

## ET-08 — Завершение public release hardening

Статус: `PLANNED` после `TUTOR-06`

- GitHub Pages выбран как production provider и live-проверен по адресу
  `https://zabulaaleksey.github.io/electro-tutor/` с base
  `/electro-tutor/`; evidence предоставлено оператором, URL workflow run и
  commit SHA в repository не зафиксированы;
- завершить обязательные pre-deploy quality gates этапа `TUTOR-06`;
- выполнить полный quality/security/responsive/PWA checklist;
- проверить обновление уже установленного service worker;
- любые следующие production changes/deploy выполнять только по явной команде
  пользователя.

Зависимость: `TUTOR-06`; прежний внешний blocker выбора provider/domain снят
миграцией на GitHub Pages 2026-08-28.

## AI-native platform track — после stabilization/public release

Новый track детализирует дальнейшее развитие, но не меняет текущий selector:
сначала выполняются `TUTOR-06` и `ET-08`. `ET-03` остаётся независимым
content-потоком, а внешние решения из `ET-05`, `ET-06` и `ET-07` не считаются закрытыми.
Канонические инварианты и открытые решения находятся в
`../specs/features/ai-native-tutoring-platform.spec.md`; detailed stage
contracts — в `../prompts/STAGES.md`.

### Dependency graph

```text
TUTOR-06 → ET-08 → ET-09.1 → ET-09.2 → ET-09.3 → ET-09.4
                                            ↓
ET-10.1 → ET-10.2 → ET-10.3 → ET-11.1 → ET-11.2
                                            ├→ ET-11.3 → ET-11.4 → ET-11.5
                                            └→ ET-12.1 → ET-12.2 → ET-12.3
                                                               → ET-12.4 → ET-12.5 → ET-12.6

ET-12.2 + ET-11.1 → ET-13.1
ET-13.1 + ET-11.4 + ET-11.5 → ET-13.2 → ET-13.3

ET-10.1 + ET-09.2 → ET-14.1 → ET-14.2 → ET-14.3
                                          └→ ET-14.4

ET-10.1 + external decisions → ET-15.1 → ET-15.2 → ET-15.3 → ET-15.4
                                                         → ET-15.5 → ET-15.6
ET-13.3 + ET-14.1 → ET-16.1 → ET-16.2
ET-13.3 + ET-11.2 + ET-16.1 → ET-16.3

ET-12.6 + ET-10.3 → ET-17.1
ET-13.3 → ET-17.2 → selected integration stages ET-17.3 or ET-17.4
ET-12.6 + ET-13.2 + ET-14.2 → ET-18.1 → ET-18.2
```

Стрелка показывает prerequisite на момент запуска, а не разрешение начать
несколько будущих stages сейчас. Перед переводом любого record в `in_progress`
его dependencies должны иметь terminal evidence.

### ET-09 — Platform foundations (`FOUNDATION_NOW`)

- **ET-09.1 — Architecture/reuse audit и platform contract.** Статус:
  `PLANNED` после `ET-08`. Полный gap/reuse/conflict audit, target modular
  monolith, data/security/integration boundaries, ADR backlog и traceability.
- **ET-09.2 — Backend/API/DB walking skeleton.** Статус: `PLANNED`. Один
  reproducible client/command → versioned API → PostgreSQL path, migrations,
  diagnostics и local/CI parity.
- **ET-09.3 — Identity/OIDC vertical slice.** Статус: `PLANNED`. Отдельная
  Electro Tutor identity boundary, login/session/logout и protected `/me`
  без mutation MathMorph.
- **ET-09.4 — Profiles, capabilities и audit baseline.** Статус: `PLANNED`.
  Student/Tutor profiles, server-side capability calculation и audit критичных
  permission changes.

### ET-10 — Booking, access и LessonSession (`FOUNDATION_NOW`)

- **ET-10.1 — TutorOffer и Booking для `FREE`/`EXTERNAL`.** Статус:
  `PLANNED`; agreed terms snapshot и real student/tutor flow без Stripe.
- **ET-10.2 — LessonAccessGrant.** Статус: `PLANNED`; time-bounded grant,
  authorization negatives и независимость от payment provider.
- **ET-10.3 — LessonSession lifecycle и reload.** Статус: `PLANNED`; рабочий
  lesson shell с server-authoritative lifecycle/capabilities без native media.

### ET-11 — Timeline и persistent learning surface (`FOUNDATION_NOW/NEXT`)

- **ET-11.1 — Canonical time и versioned LessonEvent.** Статус: `PLANNED`.
- **ET-11.2 — LessonTopic, LessonAnchor и Navigator.** Статус: `PLANNED`.
- **ET-11.3 — Persistent lesson chat.** Статус: `PLANNED`.
- **ET-11.4 — Recoverable whiteboard collaboration.** Статус: `PLANNED`;
  CRDT/checkpoints только после отдельного evidence/ADR.
- **ET-11.5 — Circuit/formula semantic anchors.** Статус: `PLANNED`; текущий
  интерактив связывается с lesson domain без MathMorph compile-time dependency.

### ET-12 — Native realtime (`FEATURE_NEXT`)

- **ET-12.1 — Realtime provider POC и ADR.** Статус: `PLANNED`; LiveKit —
  кандидат, а не заранее объявленный production choice.
- **ET-12.2 — Authorized media room.** Статус: `PLANNED`; backend-issued
  short-lived token и real browser → API → provider path.
- **ET-12.3 — Device management и screen share.** Статус: `PLANNED`.
- **ET-12.4 — Reconnect и full session restoration.** Статус: `PLANNED`.
- **ET-12.5 — TURN, adaptive media и quality telemetry.** Статус: `PLANNED`;
  production topology/cost требует решения.
- **ET-12.6 — Waiting room, presence и moderation.** Статус: `PLANNED`.

### ET-13 — Recording, replay и search (`FEATURE_NEXT/LATER`)

- **ET-13.1 — Recording consent/provider/object storage.** Статус:
  `BLOCKED` до legal/retention/storage decisions.
- **ET-13.2 — Synchronized replay foundation.** Статус: `PLANNED` после real
  recording и recoverable collaboration.
- **ET-13.3 — Transcript и searchable lesson.** Статус: `BLOCKED`; provider,
  privacy и cost являются незакрытыми входными решениями.

### ET-14 — Notifications и background jobs (`FEATURE_NEXT`)

- **ET-14.1 — Domain events, jobs/outbox и in-app inbox.** Статус: `PLANNED`.
- **ET-14.2 — Preferences, timezone и reminders.** Статус: `PLANNED`.
- **ET-14.3 — Secure Telegram linking и delivery adapter.** Статус:
  `BLOCKED` до bot/test-channel credentials и privacy decision.
- **ET-14.4 — Calendar/email/Web Push adapters.** Статус: `OPTIONAL`; каждый
  channel запускается отдельным bounded slice после выбора provider.

### ET-15 — Platform payments и marketplace (`FEATURE_LATER`)

- **ET-15.1 — Legal/provider/funds-flow decision.** Статус: `BLOCKED`; закрывает
  решения `ET-07`, но не имитирует их наличие.
- **ET-15.2 — Hosted checkout, verified webhook и paid grant.** Статус:
  `PLANNED` после `ET-15.1`.
- **ET-15.3 — Stripe Connect, append-oriented ledger и reconciliation.**
  Статус: `PLANNED` после basic payment evidence.
- **ET-15.4 — Payout policy и idempotent release.** Статус: `PLANNED`.
- **ET-15.5 — Cancellation и refund policies.** Статус: `PLANNED`.
- **ET-15.6 — Dispute hold и resolution.** Статус: `BLOCKED` до отдельного
  compliance/operator policy approval.

### ET-16 — Post-lesson AI (`FEATURE_LATER`)

- **ET-16.1 — Bounded AI context и anchored summary.** Статус: `BLOCKED` до
  provider/privacy/cost decisions.
- **ET-16.2 — Homework/assessment proposals.** Статус: `PLANNED`; AI не
  переписывает authoritative state silently.
- **ET-16.3 — Search Assistant / «покажи где».** Статус: `PLANNED`; ответ
  приводит Navigator к transcript/timeline/anchor evidence.

### ET-17 — Scale и explicit integrations (`FEATURE/INTEGRATION_LATER`)

- **ET-17.1 — Group lesson и observer capabilities.** Статус: `BLOCKED` до
  capacity/cost/moderation decisions.
- **ET-17.2 — Versioned lesson export/Application API.** Статус: `PLANNED`.
- **ET-17.3 — MathMorph formula interchange adapter.** Статус: `OPTIONAL`;
  отдельные repositories/identity/database сохраняются.
- **ET-17.4 — Shared identity integration.** Статус: `OPTIONAL`, сейчас
  `BLOCKED` до межпроектного решения; не изменяет MathMorph realm/client автоматически.

### ET-18 — Production operations (`FEATURE_LATER`)

- **ET-18.1 — Core platform threat/privacy/retention hardening.** Статус:
  `PLANNED` для первого release bundle через `ET-12.6`, `ET-13.2` и
  `ET-14.2`; это не замена security reviews предыдущих slices.
- **ET-18.2 — Core backend/realtime production rollout и recovery.** Статус:
  `BLOCKED` до hosting, backup/restore, SLO, cost budget и operator decisions.

## Candidate directions после planned track

- Course/Module/LessonMaterial, self-study и Personal Learning Memory;
- платные цифровые материалы, subscriptions и content commerce;
- дополнительные интерактивные лаборатории и FieldLab/Multiphysics;
- Chronicle, Evidence Ledger и Coursework Foundry adapters;
- external video fallback, offline/local-first и Wi-Fi/Home Mesh;
- local models, LangGraph/CrewAI и advanced learning orchestration;
- product analytics только с отдельным privacy/consent contract.

Эти направления классифицированы как `INTEGRATION_LATER` или `EXPERIMENTAL` и
не являются launchable stages. Для каждого сначала нужен отдельный refinement,
SPEC/ADR, dependency check и явное одобрение.
