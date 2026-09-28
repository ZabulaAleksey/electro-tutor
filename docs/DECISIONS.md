# Журнал решений

Здесь фиксируются только существенные технические и продуктовые решения. Новое
решение дополняет журнал; исторические записи не переписываются задним числом.

## ADR-030 — Jitsi локализован за system-owned meeting port

Дата: 2026-09-13

Статус: принято

Коррекция идентификатора от 2026-09-22: исходный heading этой записи использовал
`ADR-024` и конфликтовал с более поздним принятым `ADR-024` про session-bound DB
principal. Исторические ссылки на Jitsi `ADR-024` в immutable stage snapshot означают
эту запись `ADR-030`; содержание и дата решения не менялись.

Решение: сохранить публичный Jitsi как MVP implementation из ADR-004, но вынести его SDK/script,
domain, options и command translation из React UI в один adapter. `Classroom.tsx` потребляет только
`MeetingProvider`/`MeetingSession`; provider выбирается одним composition root.

Причина: текущий прямой SDK lifecycle в UI делал замену provider переписыванием consumer и нарушал
global Replaceable Module Contract. Локальная граница сохраняет пользовательское поведение и не
создаёт ложной собственной RTC/auth implementation.

Последствия: adapter и fake проходят общий contract suite, UI показывает whiteboard только по
capability, failures нормализованы. Смена provider, доступ, privacy/SLA и production deploy остаются
отдельными решениями.

## ADR-000 — pnpm и shared dependency stores

Дата: 2026-08-24

Статус: заменено ADR-016 после Cloudflare/Linux failure

Решение: использовать `pnpm@11.23.0`, project-local `pnpm-lock.yaml`,
machine-level content-addressable store и `virtualStoreType: global`.

Причина: воспроизводимый единый Node workflow и устранение дублирования
dependency payload между независимыми репозиториями.

Последствия: CI и operational commands используют только pnpm. При
несовместимости global virtual store возвращается project-local virtual store,
но сохраняются pnpm и общий content store; возврат к npm требует отдельного
доказанного исключения.

## ADR-016 — Project-local virtual store для переносимой Astro-сборки

Дата: 2026-08-27

Статус: принято

Решение: сохранить общий pnpm content-addressable store, но удалить
`virtualStoreType: global`. Dependency graph материализуется в стандартном
project-local virtual store; pnpm, frozen lockfile и `allowBuilds` не меняются.

Причина: fresh Linux install в Cloudflare и чистом Node 22 container связывал
Astro/MDX/Rolldown через внешний global links tree. Сначала не разрешался bare
package `satteri`, а после прямого workaround следующий virtual module искал
`ClientRouter.astro` через ошибочный `/work/root/...` path. Это доказало общий
дефект materialization, а не отсутствие одной production dependency.

Рассмотренная альтернатива: добавить `satteri` как прямую dependency отклонена,
потому что она устраняет только первый symptom и оставляет следующий сбой
Astro virtual-module metadata. Смена package manager также не требуется.

Последствия: `node_modules` остаётся disposable и project-local, payload
по-прежнему дедуплицируется общим pnpm content store. Clean Linux frozen install
и production build являются обязательным regression evidence.

## ADR-001 — Astro/MDX как основной слой, React как islands

Дата: 2026-07, подтверждено аудитом 2026-08-13

Статус: принято

Решение: индексируемые страницы и учебный текст генерируются Astro из MDX,
React используется только для интерактивного состояния.

Причина: статический HTML нужен для скорости и SEO, а расчёты и кабинет требуют
клиентского состояния.

Последствия: новый контент не строится на старом SPA-роутинге; legacy lesson
должен постепенно заменяться универсальными islands.

## ADR-002 — Языковые URL `ru` и `uk`

Дата: 2026-07

Статус: принято

Решение: каждая публичная страница имеет отдельный URL с кодом `ru` или `uk`.
Надпись `UA` допустима только в интерфейсе переключателя.

Причина: однозначные маршруты, hreflang и сохранение общего slug.

Последствия: контент публикуется парами; query/hash сохраняются при смене языка.

## ADR-003 — Два настроенных канала статической публикации

Дата: 2026-07

Статус: заменено ADR-017

Решение: хранить конфигурацию Cloudflare Static Assets и GitHub Pages workflow.

Причина: Cloudflare поддерживает проектную конфигурацию и edge redirect, а
GitHub Pages остаётся готовым дополнительным каналом.

Последствия: до релиза нужно выбрать основной публичный URL и передавать его в
`SITE_URL`; публикация не выполняется агентом без явного запроса.

Последующее решение: ADR-017 сохранило эту запись как исторический факт и
закрепило GitHub Pages единственным production deployment path.

## ADR-004 — Публичный Jitsi только как MVP кабинета

Дата: 2026-07-28

Статус: принято с ограничением

Решение: кабинет использует `meet.jit.si` и встроенную whiteboard без backend
Electro Tutor.

Причина: быстро предоставить видео, голос, чат, экран и доску.

Рассмотренная альтернатива: собственный realtime/backend — отложена из-за
существенно большей сложности.

Последствия: нет собственной авторизации, контроля хранения или гарантий SLA;
production-модель доступа должна быть решена на этапе `ET-05`.

## ADR-005 — Платежи только через hosted checkout после внешних решений

Дата: 2026-08-13

Статус: принято

Решение: не хранить карточные реквизиты и не выбирать провайдера до подтверждения
юридической модели, стран, валют, возвратов и типа услуги.

Последствия: платежи остаются заблокированным этапом; server endpoint и webhook
проектируются только после заполнения предусловий feature-SPEC.

## ADR-006 — Канонический project overlay

Дата: 2026-08-13

Статус: принято

Решение: требования хранятся в `specs/`, инженерный контекст — в `docs/`, один
операционный протокол — в `prompts/STAGES.md`. Корневые дубли
`PROJECT_CONTEXT.md`, `ARCHITECTURE.md` и тематические планы удаляются после
переноса уникальной информации.

Причина: старые файлы смешивали требования, состояние, планы и архитектуру; в
них расходились версия Node и степень готовности функций.

Последствия: `README.md` остаётся человеческой точкой входа, `AGENTS.md` —
тонким маршрутизатором, а команда `Продолжай Electro Tutor` выполняет один
следующий подэтап.

Путь протокола уточнён ADR-011 после governance migration; роль источника и
one-stage semantics ADR-006 не изменились.

## ADR-007 — Каноническая версия Node из `package.json`

Дата: 2026-08-13

Статус: принято

Решение: минимальная поддерживаемая версия — `>=22.12.0`; deployment-среда может
использовать более новую совместимую Node 22.

Причина: прежние документы одновременно называли 22.12 и 22.16.

Последствия: изменение минимума начинается с `package.json`, затем синхронно
обновляются документация и CI.

## ADR-008 — Manifest публикаций и закрытый registry интерактивов

Дата: 2026-08-14

Статус: принято

Решение: публичные lesson routes и доступность curriculum выводятся из manifest
недрафтовых парных RU/UK Content Collection entries. Optional React island
задаётся проверяемым frontmatter key из закрытого статического registry.

Причина: ручные `available` и fallback-ссылки расходились с фактическим MDX, а
безусловный `MeshLessonIsland` делал динамический route зависимым от одного slug.

Рассмотренные альтернативы: произвольный `import()` из frontmatter отклонён как
непроверяемый контракт; полностью ручной manifest отклонён как второй источник
истины. Из-за требования Astro видеть конкретный import для `client:load` route
явно отображает зарегистрированный тип island после выбора descriptor.

Последствия: новый урок публикуется только парой RU/UK; обычный MDX не получает
клиентский bundle, а новый тип интерактива требует расширить schema, registry и
явную ветвь route с contract/build-проверкой.

## ADR-009 — Web-font как неблокирующее улучшение

Дата: 2026-08-14

Статус: принято

Решение: не импортировать Google Fonts из критического глобального CSS. DM Sans
и Manrope запрашиваются в `BaseLayout` через preload и stylesheet с
первоначальным media `print`; после загрузки self-hosted script
`/scripts/web-font.js` применяет stylesheet ко всем media. Inline `onload` не
используется, поэтому этот переход не требует `unsafe-inline` в будущей CSP. До
этого интерфейс использует системные fallback-шрифты.

Причина: внешний CSS `@import` задерживал `DOMContentLoaded` и первый рендер при
зависшем или недоступном `fonts.googleapis.com`.

Рассмотренные альтернативы: оставить `@import` отклонено из-за внешней
блокирующей зависимости; полностью удалить брендовые шрифты отклонено как
ненужное изменение визуального стандарта; self-hosting отложен как более широкая
задача лицензирования, доставки и обновления font assets.

Последствия: содержимое появляется независимо от Google Fonts, но при успешной
загрузке возможна обычная смена метрик fallback на web-font. Внешний запрос и
его privacy-граница сохраняются. Полная строгая CSP остаётся отдельной задачей:
в layout пока есть другие inline-скрипты.

## ADR-010 — Изолированный и безопасный PWA-кэш

Дата: 2026-08-14

Статус: принято

Решение: service worker использует namespace `potential-pwa-v2`, network-first
только для публичных навигаций и cache-first для явных типов статических
ресурсов. В кэш попадают только успешные `basic`-ответы без `private`/`no-store`;
API/auth/checkout/payment paths исключены. При обновлении безопасные публичные
ответы мигрируют из старых `potential-pwa-*`, query удаляется из navigation
cache key, а чужие namespaces сохраняются.

Причина: прежняя стратегия могла сохранять 404/ошибки и будущие приватные GET,
а activate удалял все Cache Storage namespaces общего origin. Это создавало риск
устаревших offline-ответов и потери данных другой подсистемы.

Рассмотренные альтернативы: оставить широкий same-origin cache отклонено из-за
будущих auth/payment-границ; полностью очищать старый PWA-кэш отклонено, потому
что установленный клиент потеряет уже открытые публичные материалы при обновлении.

Последствия: изменение стратегии требует следующего cache key; новые приватные
route prefixes должны оставаться вне PWA-кэша и сопровождаться негативным тестом.

## ADR-011 — Локальный stage source и переносимое продолжение

Дата: 2026-08-27

Статус: принято

Решение: единственный операционный stage source — `prompts/STAGES.md`. Команда
`Продолжай Electro Tutor` использует repository-local status/plan/SPEC и
dependency-aware selector; внешний или machine-local prompt не является
обязательной зависимостью. Между компьютерами перед continuation проверяются
Git state, выбранная ветка, frozen dependency restore и project overlay.

Причина: governance migration перенесла stage protocol, но active ссылки на
прежний путь остались в router, README, SPEC и compatibility matrix. Новый
session не мог выполнить documented continuation contract из clean clone.

Рассмотренная альтернатива: восстановить legacy-файл как alias отклонена, потому
что создала бы второй stage source и позволила их содержимому разойтись.

Последствия: все active operational ссылки указывают на `prompts/STAGES.md`;
historical audit может упоминать прежний путь только как evidence миграции.
Hooks, MCP, agents и product runtime не добавляются.

## ADR-012 — Astro как единственная production frontend boundary

Дата: 2026-08-27

Статус: принято

Решение: production-приложение собирается только командой `astro build` и
публикует `dist/`. Неиспользуемый React/Vite SPA shell, его страницы и отдельные
Vite/TypeScript configs удалены после import/script/history audit. Используемый
путь `MeshLessonIsland → legacy-pages/MeshLesson` сохранён как переходный React
island. `vitest.config.ts`, `vite` и `@vitejs/plugin-react` остаются частью
тестового и Astro toolchain, но не определяют второй application entrypoint.

Причина: root `index.html → src/main.tsx → src/App.tsx` не вызывался ни одним
package script, Astro route или deployment workflow. Его наличие создавало
ложную production boundary и поддерживало мёртвые страницы и generated configs.

Рассмотренные альтернативы: оставить shell как archive отклонено, потому что у
него нет самостоятельной роли, build/test contract или пользователя; перенести
его в отдельный experimental contour отклонено по той же причине; переписать
`MeshLesson` отложено как отдельная миграция без пользы для текущего stage.

Последствия: один production frontend и один deployment artifact становятся
однозначными. Изменение откатывается возвратом единого commit `TUTOR-02`.
Инструментальное упоминание Vite в выводе Astro/Vitest не означает возврат SPA.

## ADR-013 — Единая версия и граница доверия URL-state

Дата: 2026-08-27

Статус: принято

Решение: круговая диаграмма использует pure state-модуль со схемой `v=1`,
defaults и domain limits из feature-SPEC. Невалидный known state восстанавливает
весь набор defaults, а legacy-ссылки без версии мигрируют. Частые изменения
range заменяют текущую history entry; завершённый числовой ввод создаёт новую.

Причина: прежний компонент напрямую преобразовывал `URLSearchParams` через
`Number()` и пропускал любые finite values в математическую модель. UI limits,
URL и browser history имели разные контракты, а back/forward не обрабатывались.

Рассмотренные альтернативы: clamp каждого недоверенного поля отклонён, потому
что создаёт правдоподобное, но не запрошенное пользователем состояние; частичный
fallback отклонён из-за смешения доверенных defaults и повреждённой ссылки;
JSON/base64 payload отклонён как менее читаемый и хуже совместимый share-format.

Последствия: все consumers должны использовать один typed contract. Добавление
поля или изменение семантики требует новой версии либо явной миграции; unknown
version никогда не интерпретируется как текущая.

## ADR-014 — Проверяемый locale catalog и authored content boundary

Дата: 2026-08-27

Статус: принято

Решение: общая production-копия RU/UK хранится в парных `src/i18n/*.json` и
читается через typed runtime API. Build сначала проверяет одинаковую структуру,
непустые значения и явно одобренные совпадающие термины, а после Astro build
аудирует locale routes и SEO links. Lesson MDX, формулы и математические
обозначения остаются в предметных источниках; их парность проверяет отдельный
lesson publication contract.

Причина: inline ternaries не давали доказать полноту UI/metadata/errors/ARIA, а
слепой перенос authored lesson content в UI-словарь смешал бы разные источники
истины. Явный список одинаковых терминов отличает корректный инвариант или
межъязыковое совпадение от пропущенного перевода.

Рассмотренные альтернативы: один каталог с optional fallback отклонён из-за
риска скрытого русского текста на UK-route; перенос всего MDX в translation
keys отклонён как ухудшение authoring и content schema; runtime-only validation
отклонена, потому что дефект должен блокировать production artifact.

Последствия: новая общая строка требует пары RU/UK; технические совпадения
одобряются явно. `/` остаётся русским default, а каждый semantic route получает
`ru`, `uk` и `x-default`. Engineering share/readout сохраняет десятичную точку
по уже принятому URL/state-контракту.

## ADR-015 — Раздельные site origin и deployment base path

Дата: 2026-08-27

Статус: принято

Решение: `SITE_URL` задаёт только публичный origin для canonical/sitemap, а
нормализованный `BASE_PATH` — prefix внутренних routes/assets. Astro config,
`site-path.ts`, scope-relative manifest и service worker, выводящий paths из
собственного registration scope, образуют единый contract. Root и project-base
artifacts проходят одинаковые post-build и live Chromium проверки.

Причина: root-absolute ссылки работали локально и на apex-domain, но ломали
GitHub Pages project-site. Смешение origin и path также позволяло случайно
встроить machine-local или будущий production URL в artifact.

Рассмотренные альтернативы: ручная конкатенация prefix в каждом компоненте
отклонена как источник расхождений; относительные URL повсюду отклонены из-за
неоднозначности на nested routes; отдельная сборка для каждого host отклонена,
потому что дублирует контракт вместо параметризации.

Последствия на момент принятия: новые внутренние URL должны использовать
base-aware helper либо scope-relative web-platform semantics. Для GitHub Pages
планировалось получать `origin` и `base_path` от `actions/configure-pages`, а
production domain и deploy оставались отдельным release-решением. Эта
outputs-based схема не стала действующим production workflow.

Последующее решение: ADR-017 закрепило конкретные production inputs в
`.github/workflows/pages.yml` и выбрало GitHub Pages как production provider;
base/site portability contract ADR-015 не изменён.

## ADR-017 — GitHub Pages как production deployment provider

Дата: 2026-08-28

Статус: принято; заменяет ADR-003 в части текущего deployment

Решение: использовать единственный production path
`GitHub repository → GitHub Actions → Astro build → dist/ → GitHub Pages`.
Активный workflow — `.github/workflows/pages.yml`; он запускает автоматическую
публикацию при push в `main`, использует Node `22.23.1`, `pnpm@11.23.0`,
`SITE_URL=https://zabulaaleksey.github.io` и
`BASE_PATH=/electro-tutor/`. Production URL —
`https://zabulaaleksey.github.io/electro-tutor/`.

Причина: после migration проекта на pnpm Cloudflare deployment path оказался
ненадёжным или нецелесообразным в текущей конфигурации. Точная первопричина
Cloudflare-side initialization issue окончательно не доказана. GitHub Pages
pipeline и автоматический deploy из `main` прошли ручную live-проверку, а
production-like project-base build прошёл locale, lesson и site artifact
audits. Live evidence получено от оператора; URL workflow run и commit SHA в
repository не зафиксированы.

Рассмотренные альтернативы: оставить Cloudflare вторым production channel
отклонено, потому что это сохраняло две конкурирующие deployment definitions и
не давало одному current source of truth. Возврат к npm не рассматривался как
исправление deployment: pnpm остаётся каноническим и воспроизводимым
dependency contract.

Последствия: `wrangler.jsonc`, `public/_redirects`, дублирующий
`.github/workflows/deploy.yml`, Wrangler dependency и `.wrangler/` удалены.
Base-aware locale redirect выполняет `src/pages/index.astro`, поэтому edge
redirect не требуется. Исторические Cloudflare ADR и baseline evidence
сохраняются, но current architecture/security/status больше не описывают
Cloudflare как действующий provider.

## ADR-018 — Проверенный artifact как единственный deploy input

Дата: 2026-08-31

Статус: принято

Решение: локальный и CI entrypoint качества — `pnpm run verify:full`. Полный
Chromium suite проверяет транзитный root-artifact в каноническом `dist/` без
изменения принятых тестов и удаляет его в `finally`; после него production
`dist/` собирается ровно один раз с действующими
`SITE_URL`/`BASE_PATH` и проходит project-base smoke. Verify job загружает этот
artifact только после всех gates, а deploy job зависит от verify и не содержит
checkout/install/build. Actions закреплены полными SHA, permissions разделены
по job, credentials checkout не сохраняются, manual deploy ограничен `main`.

Причина: прежний workflow проверял только build и давал build job избыточные
deployment permissions. Простое включение полного root-oriented E2E при
`BASE_PATH=/electro-tutor/` не проверяло бы корректный route contract;
транзитный root-artifact в ожидаемом тестами `dist/` сохраняет существующий
suite, а cleanup и production-base smoke подтверждают именно заново собранный
публикуемый `dist/`.

Последствия: падение hygiene/static/lint/unit/full E2E/build/production smoke или
dependency audit блокирует upload и deploy. Локальный PASS не является
разрешением на merge, push или production deployment.

## ADR-019 — Platform runtime, workspace и walking-skeleton boundary

Дата: 2026-08-31

Статус: принято для реализации начиная с `ET-09.2`

Решение: развивать backend в том же product repository как modular monolith в
`services/api/`: Python `>=3.12`, FastAPI, Pydantic Settings, async SQLAlchemy,
asyncpg, Alembic и PostgreSQL 17. Service владеет `pyproject.toml`, `uv.lock` и
локальной `.venv`; root pnpm сохраняет frontend ownership и предоставляет
канонические orchestration commands. API начинается с `/api/v1`; первый slice —
local/CI-only health/readiness path с real PostgreSQL и schema-head check.

Причина: MathMorph подтвердил жизнеспособность этих patterns в соседнем продукте,
но Electro Tutor нуждается в собственных domain, schema, config и lifecycle.
Один modular monolith создаёт минимальный реальный API→DB seam без преждевременной
распределённой инфраструктуры.

Альтернативы: TypeScript backend сократил бы polyglot surface, но в доступных
repositories нет проверенного ORM/migration/backend contract; отдельный repository
усложнил бы atomic product changes и CI; копирование MathMorph смешало бы product
ownership; microservices, Redis, RabbitMQ и workers не имеют нагрузки, которая
оправдывает их в foundation slice.

Последствия: проект получает второй язык/toolchain и обязан обеспечить clean
restore и root command parity. Alembic — единственный schema owner; migration и
runtime roles разделены. Production backend host/ingress/CORS-cookie topology не
выбраны, поэтому Pages остаётся единственным production runtime. Решение и будущий
walking skeleton откатываются одним bounded docs/code change до появления domain
dependents; production data rollback выполняется forward-fix/restore, а не
destructive downgrade.

Local/CI не означает network exposure: API по умолчанию слушает loopback,
PostgreSQL доступен host-only на loopback, а docs/debug требуют explicit local
profile. Destructive DB commands deny by default без доказанного disposable
target; Python lock drift и vulnerability audit входят в обязательный gate.
Root pnpm scripts являются единым command surface и переиспользуются CI.

## ADR-020 — Provider-neutral identity boundary

Дата: 2026-08-31

Статус: принято как contract; реализация отложена до `ET-09.3`

Решение: Electro Tutor владеет собственными IdP client/config, sessions, schema и
profiles. Стабильный внешний identity key — точная пара `(issuer, subject)`;
provider выбирается отдельным решением. `ET-09.2` не добавляет auth/Keycloak.

Причина: issuer-local subject недостаточен для нескольких providers, а
переиспользование MathMorph realm/client/session создало бы скрытую cross-product
зависимость и смешало authorization domains.

Последствия: Keycloak остаётся кандидатом, не утверждённым vendor. Login/logout,
session hardening, account linking и deletion/retention требуют отдельного
security-reviewed vertical slice.

## ADR-021 — MathMorph integration boundary

Дата: 2026-08-31

Статус: принято

Решение: Electro Tutor не читает и не пишет MathMorph DB, не импортирует его
runtime packages/config и не изменяет realm, sessions или migrations. Возможная
интеграция создаётся только в отдельном stage через versioned HTTP/export contract
и изолированный adapter; shared package сейчас не извлекается.

Причина: read-only audit подтвердил полезные engineering patterns, но не общий
product owner или стабильное дублирование. MathMorph evidence и operational
статусы нельзя переносить в Electro Tutor.

Последствия: сбой MathMorph не должен ломать primary learning path. Formula/
document interchange и identity correlation остаются future integration, а не
prerequisite `ET-09.2`.

## ADR-022 — Isolated Keycloak contract for ET-09.3 DEV evidence

Дата: 2026-09-08

Статус: принято для local DEV и automated acceptance; production IAM не выбран

Решение: `ET-09.3` использует отдельные Keycloak realm `electro-tutor-dev` и
public client `electro-tutor-web-dev` без client secret. Issuer —
`http://127.0.0.1:58081/realms/electro-tutor-dev`; flow — Authorization Code с
обязательным PKCE `S256`, scopes `openid profile email`. Единственный callback —
`http://127.0.0.1:8000/api/v1/auth/callback`; exact web/post-logout origins
принадлежат существующим DEV/E2E endpoints `127.0.0.1:4321` и `127.0.0.1:4322`.

Tutor хранит собственные opaque server-side sessions и разрешает identity по
точной паре `(issuer, subject)`. Email остаётся изменяемым атрибутом; raw provider
tokens не становятся долговременным application state. Transient login требует
одноразовые `state`, `nonce` и PKCE data. Synthetic DEV identity provisioning
идемпотентен, а password/bootstrap credential поступают только через ignored
local environment и не выводятся в evidence. Named realm целиком считается
disposable project-owned DEV state; managed test identity отмечена ownership
group, не должна иметь `realm-management` roles и имеет bounded cleanup command.

Причина: stage требует real browser → IdP → callback → API evidence, но не имеет
права зависеть от MathMorph либо преждевременно выбирать production federation.
Единая numeric loopback convention сохраняет существующие ports и позволяет
проверить cookie/CORS semantics без wildcard origins.

Последствия: Keycloak становится обязательной local DEV dependency только для
auth lifecycle; `ET-09.2` health/database foundation сохраняется. MathMorph
realm/client/config/secrets/sessions/tokens/rows/schema не читаются и не
изменяются. Production IAM, MFA/passkeys, profiles/roles и shared identity
остаются отдельными решениями и stages.

## ADR-023 — Application profiles, trusted tutor grants и atomic audit

Дата: 2026-09-08

Статус: принято и validated locally для `ET-09.4`; `ET-09.4a..e`
completed/verified, включая live two-user Keycloak terminal E2E

Решение: application owner key — `accounts.id`; конкретная provider-login запись
остаётся `external_identities.id` и ссылается на Account через immutable required
`account_id`. Один Account может владеть несколькими external identities без
email auto-linking или public linking API. Existing identity rows получают
`account_id = id`: это сохраняет смысл уже записанных immutable AuditEvent actor
IDs без rewrite history, тогда как новые логины получают отдельные random
Account/identity UUID. Account имеет
независимые relations `0..1` StudentProfile и `0..1` TutorProfile, обе personas
могут существовать одновременно. Profile хранит только private product data и
никогда не является role/capability/tenant/admin/entitlement source.

Runtime role не получает direct INSERT в `accounts` или `external_identities`.
First-login использует узкую `SECURITY DEFINER` function с fixed search path:
она генерирует оба UUID и создаёт только новую Account+identity пару. Связывание
additional identity с existing Account остаётся отдельной trusted operation и
не доступно public/runtime path.

StudentProfile create/read/update разрешаются authenticated owner. TutorProfile
create/read/update требуют отдельный active account-scoped grant
`TUTOR_PROFILE_MANAGE_OWN`. Stored authority принадлежит Tutor PostgreSQL;
Application Core вычисляет решение из server-side principal, ownership, typed
operation, active grant и versioned code/config matrix. Profile fields, public
request, client state и mutable OIDC/Keycloak claims authority не выдают.

Issue/revoke grant доступны только trusted internal provisioning adapter через
application service и typed server-created actor; public self-grant endpoint
запрещён. Baseline grant не разрешает lesson, tenant, student, board, billing,
classroom или admin access. Future tenant/membership/scoped permissions остаются
отдельными сущностями и могут дополнять evaluator без изменения account-grant
semantics.

Runtime authority writer использует отдельную least-privilege PostgreSQL role
`electro_tutor_provisioner`; public API role имеет только grant read. Один
append-only operation ledger задаёт общий issue/revoke idempotency namespace и
detects changed/cross-action intent как `409 idempotency_conflict` до audit
mapping. Account transaction lock упорядочивает absence/issue/revoke races;
active grant row lock выдаётся runtime через узкую fixed-search-path function,
не предоставляя table UPDATE.

AuditEvent является append-only redacted product-security stream. Grant/revoke и
первое TutorProfile creation записывают domain mutation и AuditEvent одной
PostgreSQL transaction. Audit failure откатывает mutation; log/in-memory fallback
запрещён. Grant check и TutorProfile mutation сериализуются с concurrent revoke
через общий unit-of-work/connection и row lock. Runtime не получает
`UPDATE`/`DELETE` audit privileges.

Причина: identity authentication из `ET-09.3` не определяет product authority, а
создание TutorProfile без отдельного trusted grant дало бы self-escalation.
Authority mutation без durable audit нарушила бы воспроизводимость sensitive
actions. Audit persistence поэтому предшествует grant/profile runtime slices.

Рассмотренные альтернативы: Keycloak roles/claims как authority, profile row как
role, единая Student/Tutor role, profile как tenant, public self-grant, generic
RBAC/ABAC engine и отдельный audit service отклонены. Они смешивают trust
boundaries либо вводят преждевременную инфраструктуру.

Последствия: `Principal` несёт оба ключа: `account_id` для product ownership и
authority, `identity_id`/issuer/subject для ET-09.3 provider provenance и session
resolution. `/me` не обязан раскрывать internal account key. Detailed requirements принадлежат
`../specs/features/profiles-capabilities-audit.spec.md`. Runtime выполняется
последовательно: audit persistence/unit-of-work → internal Account boundary →
trusted grant/evaluator → profiles → HTTP/application paths → RU/UK E2E.
Session-bound extension ET-09.3 для profile persistence зафиксирован ADR-024;
stable `(issuer, subject)`, provider isolation и будущие tenant semantics не
меняются.

## ADR-024 — Session-bound DB principal и разделение auth/profile runtime

Дата: 2026-09-12

Статус: принято и validated locally для `ET-09.4c`

Решение: private profile operation получает отдельный redacted
`SessionCredential`, а не доверяет caller-selected `account_id`. Profile
unit-of-work устанавливает только SHA-256 digest opaque application session через
transaction-local `set_config(..., true)`. Fixed-search-path PostgreSQL resolver
повторно проверяет session expiry, блокирует session row `FOR KEY SHARE` и выводит
Account owner, grant scope и AuditEvent actor из session → identity → Account.
Произвольный account GUC не является authority input.

PostgreSQL roles разделены: `electro_tutor_auth_runtime` владеет только
auth transaction, external identity и application session path, а
`electro_tutor_runtime` не может читать или выпускать session и выполняет только
session-bound profile functions. Auth role не имеет profile/grant/audit access;
обе роли `NOINHERIT`, membership/`SET ROLE` escalation запрещены. Database URLs
обязательны раздельно, fallback между credentials отсутствует, bind-параметры
скрыты.

Причина: application-derived Principal достаточен для обычного ownership check,
но shared runtime function с переданным `account_id` оставляла прямой DB IDOR
путь. Одна GUC с account ID или session digest при доступной runtime session
таблице оставалась бы подделываемой. Role split и DB re-resolution дают узкую,
проверяемую границу без нового HMAC secret/rotation contract.

Последствия: logout сериализуется с profile transaction session-row lock;
malformed, random, expired и logged-out digest fail closed. Transaction cleanup
проверяется для commit, rollback и cancellation на повторно используемом pooled
backend. Revision `20260912_0009` сохраняет exact disposable downgrade semantics
`0009 → 0008 → 0009`; production downgrade по-прежнему запрещён. Полный process
RCE остаётся отдельной trust boundary и не решается PostgreSQL ACL.

## ADR-025 — Provider-independent TutorOffer/Booking snapshot

Дата: 2026-09-14

Статус: принято как implementation contract для `ET-10.1`

Решение: `FREE`/`EXTERNAL` Booking реализуется внутри existing modular monolith
без payment/calendar provider. `TutorOffer` представляет один concrete future
half-open interval, имеет `DRAFT → ACTIVE → RETIRED` lifecycle и optimistic
version. Student request атомарно копирует server-owned offer terms в immutable
Booking snapshot; tutor принимает именно этот snapshot. Offer revision/profile
change не переписывает Booking.

Offer mutation и Booking accept/decline требуют нового exact account capability
`TUTOR_BOOKING_MANAGE_OWN`, issued/revoked existing trusted provisioner.
StudentProfile/TutorProfile не являются prerequisite или authority. Any
authenticated distinct Account может request active offer; participant read и
accepted-booking cancel остаются ownership operations после revoke.
Participant/resource ownership server-derived из active session и opaque IDs.

Для concurrency все accept writers lock Booking и берут transaction advisory
locks для tutor/student Accounts в deterministic UUID order, затем проверяют
accepted half-open overlap. Accepted cancellation использует те же participant
locks. Tutor mutation сначала сериализуется existing active-grant `FOR UPDATE`
path; revoke либо выигрывает и denies mutation, либо следует после committed
mutation+audit. Domain-specific append-only operation ledger даёт
exact idempotent retry; audit event использует тот же operation UUID и коммитится
в одной transaction. Operation UUID проверяется в global audit namespace;
cross-actor/action/domain reuse conflicts. `capability_grant_operations` не переиспользуется, потому
что его semantics принадлежат authority lifecycle.

Time contract: explicit-offset RFC3339 + validated IANA zone, UTC `timestamptz`,
server/DB time для notice/cancellation. Money v1: FREE = zero/no currency;
EXTERNAL = informational positive minor units с server-owned exponent `2` и
allowlist `UAH/EUR/USD`. EXTERNAL не создаёт Payment/paid/refund/provider state
и UI прямо сообщает, что платформа не подтверждает расчёт.

Cancellation v1: student отменяет REQUESTED; owning tutor declines REQUESTED;
любой participant отменяет ACCEPTED только до `starts_at`. Reschedule — cancel +
new Booking. Advanced policy/refund остаётся future stage.

Альтернативы: recurrence/AvailabilitySlot и Cal.com sync отклонены как лишние
для runnable slice; PostgreSQL exclusion extension отклонена в пользу bounded
advisory locks без нового extension; public tutor directory отклонён из-за
private profile boundary; generic operation ledger отложен до третьего consumer.

Последствия: required migration additive и session-bound, runtime direct DML
остаётся запрещён. Operational rollback отключает routes и сохраняет rows;
destructive downgrade разрешён только disposable local/test DB. Detailed
requirements и HTTP/data contracts принадлежат
`../specs/features/payments-and-booking.spec.md`.

## ADR-026 — Booking-derived LessonAccessGrant boundary

Дата: 2026-09-14

Статус: принято как implementation contract для `ET-10.2`

Решение: Access остаётся отдельным domain aggregate, а не account CapabilityGrant
и не LessonSession. Один accepted `FREE`/`EXTERNAL` Booking атомарно создаёт
один grant с source `BOOKING_FREE|BOOKING_EXTERNAL`, policy/capability set v1 и
half-open window от `starts_at - 15 minutes` до `ends_at`. Status выводится по
PostgreSQL time; client не передаёт Account, role, source, window или capability.

Capability set v1 разрешает только `LESSON_SHELL_ENTER`; participant role
выводится из immutable Booking. Accepted Booking cancellation atomically revokes
grant. Public issue/revoke, admin grant authority, bearer invite, PLATFORM,
payment/provider state, LessonSession и media token отсутствуют.

Booking accept/cancel, grant issue/revoke and exact redacted AuditEvents share
one transaction. Separate random server-generated UUIDv4 operation IDs are
persisted on the grant and used by AuditEvents; client Booking idempotency keys
cannot predict or reserve them. Exact replay returns the persisted result. Lock order
is Booking then grant; check uses shared locks, revoke uses update locks. Missing
or inconsistent eligible grant fails closed and is never rebuilt from client,
IdP, provider or cache.

The Python connection-scoped Access repository exposes only the participant
authorization check. Issue/revoke remain DB-private helpers invoked exclusively
inside the authorized Booking transition functions in the same UoW; runtime has
no direct `EXECUTE` on them. This least-privilege boundary prevents a separate
grant mutation path while preserving atomic Booking/access/audit writes.

Private `GET /api/v1/bookings/{booking_id}/lesson-access` returns only active
participant access. Foreign/nonexistent Booking is masked as the existing 404;
not-yet-valid/expired/revoked are participant-only 403 states. A new static
RU/UK media-less shell consumes this check. Existing public Jitsi `/classroom`
remains unchanged and is not presented as protected.

Альтернативы: reuse account capability grants rejected because their scope and
lifecycle differ; one grant per participant rejected because Booking already
owns immutable participants; arbitrary capability JSON rejected fail-closed;
lazy issue on GET rejected because acceptance must be atomic; generic operation
ledger/cache/policy engine rejected as premature; extending the accepted
two-user runner in place rejected in favour of a separate access-specific
three-identity terminal path.

Последствия: additive revision `20260914_0011` owns grant schema, collision-safe
eligible backfill with allowlisted `service/lesson-access-migration` actor and
`migration_backfill` provenance, audit allowlist and function-only runtime ACL. Operational
rollback preserves rows and removes the consumer; destructive downgrade remains
disposable-test only. Future policy/window or PLATFORM support requires a new
versioned contract. Detailed requirements belong to
`../specs/features/lesson-access-grants.spec.md`.

## ADR-027 — Booking-bound LessonSession lifecycle and reload

Дата: 2026-09-15

Статус: **принято как implementation contract** для `ET-10.3`;
владелец продукта явно утвердил v1 rules в текущей задаче 2026-09-15.
Локальная реализация и non-secret tests существуют; terminal live/manual
acceptance и repository-wide `backend:check` пока не закрыты.

Контекст: approved Booking v1 допускает accepted cancellation только до
`starts_at`; grant v1 позволяет открыть shell в
`[starts_at - 15 minutes, ends_at)`, но `LESSON_SHELL_ENTER` не даёт Session
mutations. Нынешний static shell удаляет `#booking`, поэтому обычный reload
теряет join context. Media/timeline/chat не должны быть prerequisite lifecycle.

Решение: ровно одна Session на Booking, первый tutor или student
join создаёт `READY`; только tutor после scheduled start делает
`READY→ACTIVE→ENDED`. Booking cancellation до start атомарно закрывает
существующую `READY` как `CANCELLED` вместе с grant revoke и audit.
PostgreSQL time после `ends_at` даёт derived `WINDOW_CLOSED`, а не ложный
persisted `ENDED`. Все private reads/mutations требуют текущей server
session, exact Booking participant и active grant; отдельная Session policy
вычисляет role-specific operation capabilities, не меняя смысл grant v1.

Session ID — opaque server UUID; immutable participants остаются в Booking, а
transport возвращает `current_topic_id: null` до реального Topic contract.
Transaction/ACL boundary переиспользует session-bound PostgreSQL functions,
lock order Booking→grant→Session, narrow runtime `EXECUTE` and no direct
Session/operation-ledger `SELECT` or DML for runtime/auth/public, optimistic version,
exact idempotency ledger и server-generated independent audit operation IDs.
Session client operation keys сохраняют Booking cross-domain namespace и
race-safe 409 для чужого ledger; exact replay вновь проходит текущую
session/participant/active-grant policy до persisted response.
Create/start/end POST сохраняют JSON + canonical `Idempotency-Key` и
новую request-side exact configured DEV `Origin` check (absent/null/foreign
denied): simple form/cross-origin POST не создаёт Session/audit.
Existing CORS filtering не считается CSRF-защитой, production topology
не выбирается этим ADR.
Grant/start/end time policy и active application session используют fresh
PostgreSQL `clock_timestamp()` после lock wait; transaction-start
`CURRENT_TIMESTAMP` в текущих Access/session authorization functions
требует исправления и real-DB regression evidence до Session implementation.
После одноразового `#booking` join shell держит `#session` fragment для
reload, но fragment никогда не является authority. Operational rollback
убирает consumers, не удаляя Session history и cancellation integrity.

Отклоняемые альтернативы: auto-start при student join (client/role confusion);
browser storage или Jitsi room как Session truth; изменение значения
`LESSON_SHELL_V1` задним числом; copied Booking participants как конкурирующая
authority; lazy worker/end при grant expiry, который создаёт фиктивный audit;
запуск media/topic/chat framework ради пустого lifecycle.

Подтверждены: student-first `READY` и tutor-only start после
`starts_at`; atomic `READY→CANCELLED`; отсутствие terminal/history read после
grant expiry в v1. Последствия, ошибки, миграция и exact acceptance описаны
в `../specs/features/lesson-sessions.spec.md`. Approval разрешает
implementation entry, но не закрывает stage.

## ADR-028 — Canonical database drift contract for ET-10.3 gate

Дата: 2026-09-15

Статус: **принято; independent schema/catalog tooling реализованы и проверены
на disposable DB**. Existing data-bearing dev DB has genuine drift, поэтому
repository-wide `backend:check` остаётся FAIL до recovery verification.

Дополнение 2026-09-22: data-preserving recovery decision утверждён, физический
backup восстановлен в отдельный clone с WAL recovery; исходный volume проверен
побайтово и не изменён. Schema repair на clone и транзакционный rollback
подтвердили Alembic parity, но девять legacy function overloads остаются вне
manifest. Решение об их выводе из `public` — новый fail-closed checkpoint в
выбранном `docs/STAGES.md`; подробное redacted evidence — `docs/TESTING.md`.

Дополнение 2026-09-24: проверенный архив восстановлен в новый disposable clone;
clone-only forward/reverse дал canonical catalog/Alembic PASS и exact preflight
restoration. Это подтверждает техническую обратимость на изолированной копии,
но не принимает несовместимость для неизвестных external SQL callers
восьмиколоночной функции на original DB. Terminal `backend:check` и live
authenticated/manual gates остаются открытыми; детали — `docs/TESTING.md`.

Дополнение 2026-09-27: opt-in `backend:check clone` на отдельной пустой test DB
прошёл весь isolated backend composite, включая fresh catalog baseline и real
PostgreSQL integration. Default Compose `backend:check` по-прежнему направлен
на preserved original volume и не запускался. Ни этот PASS, ни прежний
clone-only repair не решают совместимость original 8-column SQL caller;
отдельное decision для original replacement остаётся обязательным.

Контекст: существующие `0001..0012` Alembic migrations создают 15 product
tables и рукописные PostgreSQL functions, triggers, ACL и `CHECK` constraints.
Ранее `services/api/alembic/env.py` передавал пустой `target_metadata`, поэтому
`alembic check` считал все текущие таблицы удалёнными. Теперь independent
head metadata исправляет этот false positive; catalog gate показывает
реальное расхождение existing dev DB. `backend:check` и Pages CI не могут
быть terminal PASS для ET-10.3 на этой БД. Проверять
live database против metadata, отражённой из неё самой, или отключать gate
нельзя: оба варианта скрывают drift.

Решение: объявить **желаемую head-0012 схему** всех 15 product tables через
SQLAlchemy Core `MetaData` как tooling contract, без введения ORM/runtime
model. `alembic check` остаётся обязательным и сравнивает live database с
этой независимой декларацией; в metadata входят columns/types/nullability,
server defaults, primary/foreign/unique keys, indexes и partial predicates.
Не фильтровать неизвестные product tables; `alembic_version` — служебная
таблица мигратора, не второй product model. Metadata должна обновляться вместе
с каждой следующей migration; незапланированное предложение autogenerate
означает FAIL, а не автоматическое применение или ослабление проверки.

Отдельный обязательный PostgreSQL catalog verifier в том же `db-status` /
`backend:check` gate сверяет критичные handwritten objects, которые сравнение
Alembic не гарантирует: сигнатуру/тело, `SECURITY DEFINER`, `search_path` и
`EXECUTE` ACL функций; definition/enabled state триггеров; expression и
validated state `CHECK`; partial-index predicates и private table ACL.
Ожидаемый versioned
manifest строится из **отдельной disposable database**, заново поднятой
immutable migrations до head, и хранится в репозитории; проверяемая live DB
не используется как источник собственных ожиданий. Regeneration manifest
разрешена только из этой disposable baseline и требует review diff;
`backend:check` только читает и сравнивает, не чинит live schema. Scratch
baseline создаётся/удаляется только в рамках одной операции; уже
существующая DB с тем же точным именем не удаляется автоматически. Verifier
не создаёт второй runtime DB и не выполняет destructive reset product data.

Приёмка: чистая migrated head проходит Alembic/catalog parity; транзакционно
внесённый drift column/default/index, function body/ACL, trigger enabled or
definition и critical `CHECK` expression отвергается с безопасным
diagnostic, после rollback чистый gate снова PASS. Тесты должны подтвердить
manifest generation/parity с независимой baseline, а Pages CI — запуск того
же обязательного gate. Secret-bearing output не сохраняется и не печатается.
Девять rollback negatives и clean scratch parity прошли; полный
repository-wide `backend:check` на existing dev DB не прошёл из-за
настоящего catalog drift, не из-за empty metadata.
Это remediation существующего Backend DX Delta, а не изменение Session
product API или миграционной истории. ET-10.3 остаётся
`implemented_unverified` до gate, live browser и manual acceptance.

Отклонено: live self-reflection (`alembic check` всегда зелёный на скрытом
drift); отключение или игнорирование Alembic result; только Core metadata
без PostgreSQL catalog contract; runtime reflection из второй baseline DB
при каждой проверке (лишний DB lifecycle и concurrency surface).

## ADR-029 — Канонический owner локального execution state

Статус: принято 2026-09-15 по прямому правилу пользователя. Selected ET-10.3 plan/status/evidence/NEXT принадлежат только `docs/STAGES.md`; старый catalog/AI pair сохраняются через SHA/facts в `docs/notes/` и Git parent. Remote main ET-09.4 partial snapshot at `ac675d4` remains in Git ancestry; it does not supersede integrated ET-10.3 state. Protected dev DB recovery остаётся отдельным data-preserving decision gate.

## ADR-031 — Численная граница интерактива длинной линии

Статус: принято для ET-LINE-001, 2026-09-28. По пользовательскому MASTER PROMPT
физику длинной линии реализует Rust `transient-core` с `wasm-bindgen`, запущенный
в одном Web Worker. Staggered leapfrog обновляет распределённые токи и напряжения
с `dt=0.9·dx/v` по умолчанию; конец линии имеет half-cell ёмкость, линейные
реактивные приборы — midpoint companion и собственный state. Нелинейный residual
пока только extension seam, не фиктивная работающая модель. Grid хранит per-cell
коэффициенты для будущих пространственных R′/L′/G′/C′, но MVP задаёт R′=G′=0.
У источника и нагрузки разные порты; идеальные ограничения `Rs=0` и short
задаются прямо. Snapshot только по запросу Worker и через transferable буферы,
без истории или React state массивов. Аналитика допустима в тестовом oracle,
не в production time stepping.

Скомпилированный WASM отслеживается в репозитории вместе с SHA-256 manifest:
так штатный Node-only CI может проверить точное соответствие исходнику без
скачивания Rust toolchain. Локальная регенерация требует закреплённой версии
CLI 0.2.129. Отказ от WebGPU, threads, MNA и полного timeline в MVP сохраняет
детерминированное O(N) состояние и переносимый static browser path.
