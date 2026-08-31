# Спецификация AI-native tutoring platform

Статус: Действует как architecture baseline для `ET-09.1+`; feature-specific
contracts требуют уточнения перед реализацией соответствующего этапа.

Версия: 0.2

## 1. Назначение и граница применения

После завершения текущих stabilization/public-release этапов Electro Tutor
должен развиваться из статического образовательного сайта с публичным Jitsi MVP
в расширяемую платформу индивидуального и группового онлайн-обучения.

Центральная runtime-сущность будущего product track — `LessonSession`, которая
связывает booking, доступ, участников, realtime media, совместную учебную среду,
timeline, запись, transcript, AI и post-lesson результаты.

Этот документ:

- сохраняет переносимый product intent из Master Prompt 2026-08-29;
- задаёт границы для будущих stages `ET-09.1+`;
- не утверждает, что backend, аккаунты, native realtime, платежи или AI уже
  реализованы;
- не изменяет действующий contract текущей статической версии из
  `../system.spec.md`, пока соответствующий vertical slice не спроектирован,
  реализован и подтверждён evidence.

Перед code change каждый stage обязан уточнить затрагиваемые требования в
действующей feature-SPEC и пройти строгий contract
`requirement → architecture → implementation → tests → evidence`.

## 2. Подтверждённое исходное состояние

- Production-контур — Astro static site с React islands, RU/UK content, PWA и
  GitHub Pages deployment.
- Публичный Jitsi является только MVP без собственного access control,
  retention и SLA.
- Backend, database, accounts, authoritative booking, payments, persistent
  lesson state и native media infrastructure отсутствуют.
- `TUTOR-06`, `ET-08` и docs-only `ET-09.1` завершены; текущий исполнимый
  этап — local/CI foundation `ET-09.2`.
  Platform track не снимает blockers `ET-03`, `ET-05`, `ET-06` и `ET-07`
  предположениями.

Read-only reuse audit MathMorph, повторно проверенный 2026-08-31, подтвердил
применимые паттерны, но не
разрешил межпроектное копирование или mutation:

| Классификация | Кандидат | Граница |
|---|---|---|
| `ADAPT_PATTERN` | Keycloak/OIDC, Authorization Code + PKCE, stable `(issuer, subject)` identity | отдельные Electro Tutor realm/client/config и собственная проверка contracts |
| `ADAPT_PATTERN` | FastAPI, PostgreSQL/Alembic, request ID, stable errors, least-privilege runtime roles | stack принят ADR-019; Electro Tutor владеет собственными modules/schema, migrations не копируются |
| `ADAPT_PATTERN` | background jobs, idempotency, retry/reconciliation и object-storage boundaries | только после подтверждения конкретной нагрузки и stage-specific failure contract |
| `KEEP_INDEPENDENT` | MathMorph auth sessions, realm, clients, migrations, API/database | не изменять и не использовать напрямую из Electro Tutor |
| `FUTURE_INTEGRATION` | formula interchange и shared identity | только versioned API/export contract и отдельный integration stage |
| `EXTRACT_SHARED` | отсутствует | общий package допустим только после доказанного стабильного дублирования |

Evidence provenance: immutable MathMorph commit `0fa90c7`, прочитанный через Git
object snapshot независимо от текущего worktree; фактические
границы проверены по `services/api/pyproject.toml`, `services/api/uv.lock`,
`docs/ARCHITECTURE.md`, `docs/DECISIONS.md` и `docs/AI_STATUS.md`. Статусы
`NOT_RUN_DOCKER` и `implemented_unverified` MathMorph не повышены и не переносятся
в evidence Electro Tutor.

## 3. Обязательные архитектурные инварианты

1. Foundation создаётся раньше зависимых features; один stage не смешивает
   identity, realtime, payments, notifications и timeline.
2. Собственные домены начинают как modular monolith с чёткими boundaries;
   microservices допустимы только по подтверждённой operational причине.
3. Domain не зависит напрямую от SDK Stripe, LiveKit, Telegram, S3,
   transcription или AI provider; vendor code находится в adapters.
4. Server является authority для ролей, capabilities, цены, booking state,
   access grants, recording permissions, payment state, fee и payout.
5. Identity отделена от application profile; глобальный ключ использует
   стабильный OIDC subject в паре с issuer, а не email.
6. `Booking`, `Payment`, `LessonAccessGrant` и `LessonSession` являются разными
   сущностями и имеют независимые lifecycle.
7. Платформа поддерживает `PLATFORM`, `EXTERNAL`, `FREE` и `WAIVED` payment
   modes; external/free/waived paths не создают фиктивные provider transactions.
8. Critical state переживает reload/reconnect; browser tab, data channel или
   media room не являются единственным источником истины.
9. Realtime data transport обеспечивает доставку, а backend/state store —
   восстановление; тяжёлые post-processing jobs не выполняются в HTTP request.
10. Timeline time, event schema/versioning, topic и anchor contracts определяются
    до replay/AI; старые события не меняются silently.
11. AuthN не заменяет AuthZ; capability вычисляется из identity role, lesson
    role, booking/access grant и lesson policy.
12. Деньги хранятся в integer minor units; platform-managed funds отражаются
    append-oriented ledger и reconciled с provider events.
13. Значимые external side effects idempotent; unknown outcome сначала
    reconciled, затем допускает retry.
14. AI, Telegram, recording и payment provider failures не превращают
    независимый завершённый lesson в ложный failure; degraded mode явен.
15. Public indexable content остаётся отделённым от authenticated application;
    private/auth/API/payment responses не попадают в публичный PWA cache.
16. RU/UK user-facing surfaces, notifications, locale-dependent date/time/money
    и accessibility следуют действующему project i18n contract.
17. Cross-project integration не читает internal database другого продукта и
    не меняет MathMorph без отдельного согласованного integration stage.

## 4. Целевые domain boundaries

| Domain | Ответственность | Не владеет |
|---|---|---|
| Identity | verified issuer/subject и provider-neutral principal | tutor business fields, lesson permissions |
| Profiles | student/tutor profiles, verification, offers, availability | credentials и provider tokens |
| Booking | agreed terms snapshot, schedule, cancellation/payment mode | provider payment или media room |
| Access | time-bounded `LessonAccessGrant` и lesson capabilities | raw Stripe/IdP checks на каждом join |
| Lesson | `LessonSession`, participants, lifecycle и current topic | vendor room semantics |
| Collaboration | persistent chat, whiteboard, circuit/formula objects, presence | media recording и financial truth |
| Timeline | canonical time, versioned events, topics, anchors, bookmarks | provider-specific payloads |
| Media | provider port, tokens, device/screen policies, quality/reconnect | booking/payment decisions |
| Recording | consent, provider jobs, metadata, retention и authorized access | PostgreSQL blobs |
| Notifications | domain-event policy, inbox, preferences, scheduler, adapters | booking business truth |
| Finance | payment, allocation, ledger, payout, refund и dispute | client-authoritative price/state |
| AI/Post-lesson | bounded context, transcript/summary/homework/search processors | authoritative silent edits |
| Integrations | versioned API/export/adapters | direct cross-project database access |

## 5. Provider boundaries

Следующие технологии являются кандидатами, а не принятыми реализациями до ADR
и real integration evidence:

- `IdentityProvider`: Keycloak/OIDC;
- `RealtimeMediaProvider`: LiveKit;
- `RecordingProvider`: LiveKit Egress или эквивалент;
- `ObjectStorageProvider`: MinIO в development, S3-compatible в production;
- `PaymentProvider`: Stripe; marketplace path — Stripe Connect;
- `TranscriptProvider` и `AIProvider`: provider-neutral ports с bounded context;
- `NotificationChannelAdapter`: in-app первым обязательным каналом, Telegram,
  email, Web Push и calendar — отдельными stages.

Redis, message broker, CRDT, event bus и microservice extraction не являются
defaults: каждый требует доказанного gap, ADR и bounded fallback.

### 5.1 Принятый foundation contract для `ET-09.2`

- Repository остаётся одним product monorepo: текущий Astro frontend сохраняется,
  новый backend root — `services/api/`.
- Backend stack: Python `>=3.12`, FastAPI, Pydantic Settings, SQLAlchemy async,
  asyncpg, Alembic; Python dependency contract — `uv` + service-local `uv.lock`
  и `.venv`, Node contract остаётся `pnpm@11.23.0`.
- Persistence: PostgreSQL 17; Alembic — единственный schema owner. Migration и
  runtime roles разделены, runtime не получает DDL и production credentials.
- Architecture: один modular monolith с `transport → application → domain →
  adapters`; provider SDK и MathMorph packages/database не входят в core.
- API prefix — `/api/v1`; generated OpenAPI является projection runtime routes,
  stable error envelope и response header несут request ID без secrets.
- `ET-09.2` запускается только как local/CI walking skeleton. GitHub Pages и
  production frontend не меняются; production backend host, ingress, domain и
  CORS/cookie topology остаются отдельным открытым deployment decision.
- Единственная обязательная local service dependency — PostgreSQL. Keycloak,
  Redis, RabbitMQ, worker, object storage, realtime и AI providers запрещены в
  `ET-09.2` без нового approved stage.

## 6. Требования будущего track

### PLAT-001 Architecture and specification baseline

Target architecture, security/privacy boundaries, integration candidates,
provider decisions, data model и stage dependency DAG должны быть проверены по
фактическому repository state до backend implementation.

### PLAT-002 Backend walking skeleton

Будущий backend обязан предоставить versioned API, stable error envelope,
request/correlation ID, PostgreSQL migration/runtime boundary, health/diagnostic
commands и локально воспроизводимый client → API → database path.

### PLAT-003 Identity, profiles and capabilities

Пользователь аутентифицируется через standards-based provider. Application
профили и lesson capabilities принадлежат Electro Tutor; другой пользователь
не может получить доступ к чужому lesson через guessed ID или client claims.

### PLAT-004 Booking and access

Booking snapshots agreed offer/policy. Accepted `FREE`, `EXTERNAL` или valid
`PLATFORM` booking может создать отдельный time-bounded access grant согласно
policy; failed/absent platform payment не выдаёт paid grant.

### PLAT-005 LessonSession continuity

Authorized user может создать/войти в LessonSession, а reload/reconnect
восстанавливает server-authoritative lifecycle, participant role, capabilities
и current topic без зависимости от future media/AI/payment feature.

### PLAT-006 Timeline, topics, anchors and navigator

Lesson events имеют canonical timeline position и versioned payload. Topic
может ссылаться на несколько generic anchors; navigator работает в live и
replay contexts без привязки только к whiteboard.

### PLAT-007 Persistent collaboration

Chat, whiteboard и domain-specific circuit/formula objects имеют stable IDs и
recoverable state. Ephemeral presence не выдаётся за heavyweight persistent
history; merge/checkpoint strategy вводится только по измеренной необходимости.

### PLAT-008 Native realtime

Только authorized backend может выдавать short-lived media token. Production
path учитывает TURN, reconnect, device switching, screen share, quality
degradation, waiting/presence и moderation без собственного production SFU.

### PLAT-009 Recording and replay

Recording требует capability и явного consent, хранится через object storage и
открывается по authorization + short-lived URL. Replay синхронизирует media с
versioned timeline; checkpoint strategy подтверждается измерениями.

### PLAT-010 Notifications and jobs

Business domain публикует событие один раз. In-app notification остаётся
доступной без внешнего channel; retries, deduplication, scheduling, timezone и
provider failures не меняют booking/lesson truth.

### PLAT-011 Payments and marketplace

Platform payment вводится только после legal/country/currency/refund/funds-flow
решений. Webhook signature и external event ID проверяются server-side; ledger,
fee, payout и refunds idempotent и reconciled.

### PLAT-012 Post-lesson AI and search

AI получает только релевантный structured context и создаёт linked proposals or
derived artifacts. Provider failure оставляет lesson/replay доступными; summary
не становится authoritative без явной policy.

### PLAT-013 Groups, courses and integrations

Core model не должен навсегда встраивать one tutor : one student. Group,
observer, self-study, course, commerce и cross-project use cases запускаются
только отдельными approved stages и versioned contracts.

### PLAT-014 Security, privacy, observability and cost

Каждый новый trust boundary получает threat model, negative tests, retention,
redacted observability, recovery и cost signals. Audit, technical telemetry и
product analytics остаются разными потоками.

### AUTH-004 Cross-project identity isolation

Electro Tutor не меняет MathMorph realm, clients, sessions, migrations, roles
или API. Будущий principal использует собственную пару `(issuer, subject)`;
shared identity требует отдельного versioned integration contract.

### INT-002 No direct foreign database access

Electro Tutor не читает и не пишет database/schema другого продукта. Любой
MathMorph exchange проходит только через versioned API/export adapter; outage
оставляет локальный Electro Tutor state доступным в явно degraded режиме.

### OPS-001 Reproducible backend command surface

`ET-09.2` обязан предоставить из repository root discoverable cross-platform
commands для locked bootstrap, config/doctor, start/stop/status, check, fast и
real-PostgreSQL integration tests, migration status/apply, API smoke и safe
local cleanup. Default profile bind-ит API только к loopback, не публикует
PostgreSQL в LAN и включает docs/debug только явным local switch. CI вызывает
те же semantic implementations и проверяет `uv.lock` drift/vulnerabilities.

### DB-001 PostgreSQL migration/runtime boundary

Schema меняется только additive Alembic revisions. Migration и runtime roles
разделены; test DB изолирована, destructive lifecycle разрешён только для
доказанного disposable local/test target. Missing/unknown config и production-like
target fail fast; reset/cleanup deny by default. Required evidence включает
upgrade/downgrade/upgrade, head/drift, runtime grants и реальный readiness query.

## 7. Critical Behavior IDs

| IDs | Проверяемый contract |
|---|---|
| `AUTH-001..004` | valid login; private lesson denies anonymous; expired token fails safely; Electro Tutor не меняет MathMorph auth |
| `AUTHZ-001..003` | server computes capabilities; client role escalation denied; moderation action audited |
| `BOOK-001..004` | create/accept booking; agreed price snapshot; offer change не мутирует booking |
| `ACCESS-001..004` | grants from valid platform/free/external policy; unauthorized third user denied |
| `SESSION-001..004` | reload restores session, chat, current topic and whiteboard state |
| `RTC-001..005` | authorized join; token denial; disconnect grace; reconnect; device switch |
| `TIME-001..004` | topic event; multiple anchors; navigator; old event schema replay |
| `CHAT-001..002` | persistent ordered lesson chat; retry does not duplicate message |
| `BOARD-001..003` | state survives reload; unauthorized edit denied; checkpoint preserves semantic state |
| `REC-001..004` | capability, consent, metadata persistence and authorized recording access |
| `NOTIF-001..005` | schedule, deduplicate, respect preferences, retry, reschedule reminders |
| `PAY-001..004` | authoritative price; webhook idempotency; failed payment no grant; external no Stripe transaction |
| `PAYOUT-001..002` | releasable-state gate and duplicate-worker safety |
| `AI-001..003` | bounded context; linked derived result; provider failure does not fail lesson |
| `INT-001..003` | versioned API/export; no direct foreign DB; integration failure isolated |

Перед implementation stage диапазон IDs разворачивается в точные acceptance
criteria и test levels. Диапазон сам по себе не является evidence.

### 7.1 Критерии приёмки `ET-09.1`

- `AC-ET091-001`: current/target map отделяет действующий static Pages contour
  от ещё не реализованного backend target.
- `AC-ET091-002`: reuse matrix содержит provenance и не копирует/не изменяет
  MathMorph product-owned state.
- `AC-ET091-003`: ADR фиксирует backend root, stack, API, DB/migration roles,
  local/CI boundary, alternatives и rollback.
- `AC-ET091-004`: security document содержит threat/privacy/cost atlas и
  fail-closed boundaries для foundation.
- `AC-ET091-005`: traceability связывает `PLAT-001`, `AUTH-004`, `INT-002` с
  SPEC, architecture/ADR, stage и проверяемым evidence.
- `AC-ET091-006`: context validator однозначно выбирает `ET-09.2`; project
  overlay/DAG review проходит, а audit не создаёт MathMorph diff и читает
  provenance из immutable snapshot.

### 7.2 Исполнимый acceptance contract `ET-09.2`

- `AC-ET092-001`: locked clean bootstrap создаёт service-local Python environment
  без второго Node lockfile и без hidden global dependency.
- `AC-ET092-002`: canonical root command поднимает API и PostgreSQL; readiness
  возвращает stable `200` только после real `SELECT 1` и проверки schema head,
  DB outage/schema drift возвращают redacted `503`.
- `AC-ET092-003`: `/api/v1/health/live` и `/api/v1/health/ready` имеют generated
  OpenAPI, bounded stable responses, error envelope и server-generated либо
  strict charset/length-validated request ID; invalid/control input заменяется.
- `AC-ET092-004`: Alembic upgrade/downgrade/upgrade, head/drift и least-privilege
  runtime grants проходят на disposable PostgreSQL 17.
- `AC-ET092-005`: local/CI-equivalent gate включает static/lint/unit, API
  contract, real PostgreSQL integration, Python lock-drift и vulnerability audit;
  mocks не заменяют DB evidence; исключения имеют owner/reason/expiry.
- `AC-ET092-006`: frontend, Pages deploy, MathMorph, auth, profiles, queues и
  product domain tables не меняются; production deployment остаётся `NOT RUN`.
- `AC-ET092-007`: default profile допускает только loopback API и не публикует
  PostgreSQL в LAN; non-loopback exposure и implicit docs/debug отклоняются тестом.
- `AC-ET092-008`: safe `.env.example`, missing/unknown-config fail-fast,
  sentinel-secret redaction в logs/doctor/errors и deny-by-default destructive
  DB commands проверены автоматизированными negative tests.

## 8. Feature classification

| Класс | Scope |
|---|---|
| `FOUNDATION_NOW` | audit/SPEC/ADR, backend walking skeleton, identity boundary, profiles/capabilities, Booking, AccessGrant, LessonSession, Timeline/Event/Topic/Anchor |
| `FEATURE_NEXT` | persistent chat/whiteboard/circuit, native realtime, reconnect/quality, moderation, recording/replay, notification core |
| `FEATURE_LATER` | platform payments/Connect/ledger, transcript/search/AI, group lessons, courses, subscriptions/content commerce |
| `INTEGRATION_LATER` | MathMorph, Chronicle, Evidence Ledger, Coursework Foundry, FieldLab, Personal Learning Memory, calendars, external video providers |
| `EXPERIMENTAL` | local models, LangGraph/CrewAI workflows, Wi-Fi/Home Mesh, breakout rooms, advanced adaptive orchestration |
| `REJECTED / NOT NEEDED` | premature microservices, custom production SFU, custom password auth, direct cross-project DB access, float balance, fake external payments, silent fallback, giant unversioned event payload |

`FOUNDATION_NOW` означает первый platform track после текущего
stabilization/release-hardening, а не разрешение обходить `TUTOR-06` или начать
несколько stages одновременно.

## 9. Global acceptance and evidence contract

Каждый future stage обязан содержать собственные unit, integration,
component/UI и real E2E requirements либо явное обоснование неприменимости
уровня. Mock/provider fake подтверждает только contract logic, но не заменяет
обязательный real provider/database/browser path.

Terminal status требует:

- completed prerequisites и отсутствие forward dependency для запуска;
- independently runnable vertical slice без future infrastructure;
- lint/format/typecheck и релевантные tests;
- real DB/provider/migration evidence, когда они входят в primary path;
- negative authorization/security checks;
- rollback/recovery и observability evidence;
- RU/UK и accessibility для user-facing states;
- synchronization SPEC, architecture/decisions, security, roadmap, stage source,
  AI plan/status и traceability, если она создана;
- inspected diff/status и отсутствие secrets/unrelated changes.

## 10. Открытые решения

1. Production backend hosting, public ingress/domain, TLS termination и
   browser-to-API CORS/cookie/token topology.
2. Отдельный Electro Tutor Keycloak realm/client или иной approved issuer;
   production ingress/session/token exchange.
3. LiveKit deployment/provider, TURN topology, regions, cost и data processing.
4. Collaborative state transport/storage и необходимость CRDT.
5. Recording consent/legal basis, retention и storage region.
6. Legal entity, countries, currencies, taxes, refunds, dispute and marketplace
   funds flow до `PLATFORM` mode.
7. Transcript/AI providers, privacy, retention, cost budgets и user consent.
8. Production backup/restore, SLO, incident and release model.

Неизвестное решение оставляет затрагиваемый stage `blocked` или `planned`; оно
не заполняется предположением из provider example.

## 11. История изменений

- 2026-08-31, v0.2 — закрыт architecture baseline `ET-09.1`: повторно проверен
  read-only MathMorph reuse, выбран local/CI backend foundation, развёрнуты
  `AUTH-004`, `INT-002`, `OPS-001`, `DB-001` и acceptance `ET-09.1/ET-09.2`;
  production providers/hosting не объявлены выбранными.
