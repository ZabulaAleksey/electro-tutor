# Архитектура Electro Tutor

## Circuit Engine

Независимый граф хранит компоненты и параметры, стабильные выводы, явные узлы и рёбра. Электрические сети вычисляются из графа, включая отдельные неподключённые выводы. Геометрия и история редактора используют те же идентификаторы. Общая библиотека УГО отвечает за представление. Существующий Network остаётся входным контрактом физического Worker. Адаптер преобразует только поддерживаемые графы.

## ET-LAB-020 — Документ схемы и расчётный бюджет

Пустой документ и углы поворота принадлежат редактору. Первая линия материализует существующую модель, а поворот меняет положение выводов УГО и трассы до прежних узлов. Схема и визуальная история меняются независимо. Численные характеристики хранят временную ось один раз и выделяют Float64Array на каждый порт. Внутренний шаг определяется минимальной задержкой и постоянными устройств. Worker передаёт буферы с передачей владения. График получает первые, последние и экстремальные отсчёты каждого диапазона, а курсор и CSV используют полную историю выбранного окна. Отмена завершает Worker.

## ET-LAB-016–019 — Визуализация и специализированные ядра

Круговая диаграмма вычисляет геометрию из прежних входов URL и использует её в пошаговом отображении. Y и Δ переиспользуют комплексную арифметику и график фазоров, а различия связей остаются в модели. Пользовательский базис Фурье компилируется в ограниченные функции без исполнения пользовательского кода. Дискретные веса задают скалярное произведение, QR строит аппроксимацию по каждой координате. Для линии затухание Хевисайда включено в доставку волн, измерительные функции и эпюры. Эталонный Rust-WASM и характеристики без потерь остаются доступными.

## ET-LAB-015 — Рациональная модель LC

Редактор хранит дерево двухполюсных соединений. Модель `src/models/reactive-two-port.ts` сворачивает его в рациональный импеданс в переменной q = s / (1000 rad/s) и возвращает промежуточные эквиваленты. Номиналы с десятичным шагом представляются целыми. Сокращение общих множителей выполняется точно. График и частоты используют численное представление результата. Сериализация хранит исходное дерево, версию и номиналы. Графики и УГО используют общие инженерные компоненты.

## ET-LAB-014 — Свободная компоновка и промежуточные двухполюсники

Документ хранит Network, смещения X/Y и неподключённые символы. Только подтверждённый Network передаётся в Worker. L/C между выводами добавляют в узловую матрицу проводимость и противоположные источники тока из трапецеидального шага. Для нескольких диодов используются отклики узлов на единичный ток между выводами, скалярные решения Шокли и проверка невязки. Рабочая точка диода вычисляется по разности напряжений его выводов. Контракт — LINE-UX-015..018.

## ET-LAB-013 — Концевой диод и геометрия

Геометрические координаты принадлежат черновику интерфейса и не передаются в Worker. Диодное граничное условие использует отклик линейной сети на ток в концевом узле. Монотонная нагрузочная прямая пересекается с ВАХ Шокли. Напряжения всех связанных узлов и исходящие фронты вычисляются из найденного тока. Контрольные решения: LINE-UX-011..014 и ADR-057.

## ET-LAB-012 — Контакты между портами линий

Для существующей цепочки без дополнительных связей используется прежнее узловое уравнение. Последовательный элемент разделяет узел на два порта, а перемычка добавляет проводимость между двумя сигнальными узлами. При закрытом идеальном ключе решатель объединяет узлы, а события коммутации добавляет в очередь фронтов. В старых JSON отсутствие контактов сохраняет прежнюю схему. Схемы с новыми контактами экспортируются как v3 и локально хранятся отдельно от черновиков v2.

## ET-LAB-011 — Каталог и конструктор сети

Главная ведёт в каталог, сформированный из существующих реестров. Маршруты учебника и решений остаются самостоятельными частями базы знаний. В лаборатории NetworkWorkbench хранит только жесты, камеру и панели. Network-edit строит допустимые операции над Network, а TransmissionNetworkLab сохраняет версию схемы и расположения, отправляет подтверждённую модель в существующий Worker и сверяет ответ с текущей конфигурацией. Математические алгоритмы характеристик и отдельный WASM-эталон используются через прежние точки входа. Контракт — LINE-UX-001..005, FR-412 и ADR-055.

## ET-UI-010 — публичная учебная сборка

`pnpm build` подключает разрешённые страницы существующего Astro-приложения и готовит статический артефакт для Cloudflare Pages и GitHub Pages. `pnpm build:full` сохраняет режим разработки. `pnpm build:mvp` сохраняет прежний ограниченный RU-граф. Решение о публичной границе и проверка CSP зафиксированы в SECURITY и STAGES.


## ET-UI-010 — три раздела full preview

`section-routes.ts` задаёт верхнее меню и визуальные входы. Учебник использует публикационный manifest и curriculum; каталог лабораторий использует существующие метаданные, а выделенные маршруты микромоделей создаются из тех же реестров. В решениях ссылки ведут на существующий MDX и расчёты; код вычислительных модулей и Astro islands переиспользован. Старые фрагменты главной ведут к прежнему содержимому по новым адресам. Публичный MVP сохраняет независимый статический граф.


## ET-UI-009 — каталог доступных материалов

`src/learning/content-catalogue.ts` строит представление для главной, учебника и каталогов из curriculum, опубликованного manifest и метаданных интерактивов. Связь с темой задают `topicIds` или существующая привязка в curriculum. Если у темы задан `lessonSlug`, он определяет маршрут теории, иначе используется ID темы. Опубликованные материалы вне curriculum показываются в общем учебнике отдельно. Ссылки формируются на сервере с локалью и base path. MVP фильтруется по существующему public graph до рендера.

`src/theme-configuration.mjs` управляет режимом светлого оформления. Оба layout задают `data-theme="light"` в HTML, а сборка исключает тёмные правила CSS при `allowDark: false`. При включении флага используются сохранённые стили и общий переключатель.

## Публичная доставка ET-UI-007

2026-11-09: normal push main2f8b31e автоматически опубликовал существующий Cloudflare project electrotutor, deployment5cb7a463-94b8-407f-902a-e15c7d81c6da. Primary domain/7public/hidden404/real browser solver/PWA verified. Ниже RUN6 и initial local-only entries — исторические; актуальное evidence в STAGES и docs/evidence/reference-ui-delivery.json.

## ET-UI-007 — общая главная и CSS оболочки

`src/components/ReferenceHome.astro` — статический localized presentation component с тремя href inputs. Full и MVP entrypoints передают реальные разрешённые URL; новая клиентская логика, дублирующий решатель и backend отсутствуют. `src/reference-ui.css` импортируется обоими layouts после прежних theme styles, меняет UI tokens и targeted chrome; математические source/MDX/SVG примеров остаются неизменными. Новая версия реализуется локально; публичная доставка ниже не обновлялась этим заданием.


## Текущая публичная доставка RUN6

2026-11-05: owner-authorized fresh static MVP source3267948 deployed to electrotutor.pages.dev, canonical 7ba2859a-4b84-449a-8550-ba7084b9f3ef. Seven RU indexed pages, bounded hidden-route404 handler, CSP/security headers, no backend dependency or public catalogue expansion. Authenticated API confirms unchanged deployment settings/fail_open=false in both environments; primary HTTP and browser/PWA/math checks PASS. Earlier delivery entries below are historical; no architecture/security policy mutation. Evidence: STAGES ET-NAV-006, TESTING and docs/evidence/run6-production-deployment.json.


## RUN6 — производная навигация без второго каталога

Source owners: curriculum20definitions + actual published manifest + catalogue31. src/learning/navigation.ts derives stable topic/tool IDs and stage/mode descriptors; curriculumLearningResources adds only relationships, catalogue owns the long-line reference variant. get-navigation.ts composes actual collections only for full builds; MVP uses existing public contract and filters before HTML. Shared LearningMenu/LearningContents and lightweight browser-contents use only rendered trusted hrefs in the browser, not registry/backend imports. Native history carries learningStage; component identity ignores experiment queries, while preserving micro/science hash identity. MeshJourney reuses the URL helper; full mesh keeps original root transition to preserve raster math, MVP keeps its accepted named slide. Full MeshLab reuses existing persistContext; kernels unchanged. Current gates/commit state — STAGES ET-NAV-006.

## CDN-кеш: корректный404 подтверждён на основном домене

REL5-CACHE CLOSED / verified2026-11-05: production 41affa11-3f56-4193-baa9-aebb40b79ec9 (https://electrotutor.pages.dev/), sourcea56fcaa; generated bounded Pages404 handler for /uk and /ru/interactive trees, four non-overlapping invocation rules. Primary24raw GET/HEAD/query/index/nested/oldETag/Range checks404/no Location/no old body, marker v1/no-store/noindex/all5security headers; six bot/browserUA+oldETag checks404;35historic hidden routes404. Public7pages200/CSP/SEO and87served assets exact-match checked direct artifact;2HTML only Astro uid and sw.js only VERSION differ (exact normalized equality). Current automatic deployment:3targeted accepted Playwright PASS (route/lab/PWA). Earlier direct-upload13/13+preview13/13,16independent math and actual worker activation remain prior source-equivalent evidence, not fresh reruns for41affa11. Unit458/59files, Astro3180errors0warnings3oldhints, ESLint/build/guards PASS. No push/DNS/kernel/backend/dependency/full-source or billing-plan changes; owner explicitly approved preview+production fail_open=false and GET confirmed only2fields changed. Physical devices/native install/Narrator/legal remain outside this cache fix; quota exhaustion may affect project availability and was not forced. Code integration a56fcaa is merged and pushed to main; local working fix branch deleted; earlier source branches retained.

Предыдущие checkpoints ниже исторические; статический вариант59cfcc84 не закрыл primary gate и не считается успешным исправлением.


Owner explicit merge/push/delete instruction2026-11-05 completed: clean ff main373f5b8→a56fcaa, normal origin/main48c3fef→a56fcaa confirmed by ls-remote; local fix/mvp-cdn-hidden-routes safely deleted after reachability/push checks, no remote fix branch existed. Other source branches/root worktree/files preserved. Push-triggered Cloudflare Git deployment41affa11/sourcea56fcaa success/canonical confirmed, no manual redeploy/settings/DNS/kernel change. Post-push primary24HTTP hidden404/7public200/CSP/SEO and3accepted browser lab/route/PWA scenarios PASS. Strict byte comparator found3different files:87exact served matches; two HTML only Astro uid differ and sw.js only VERSION, exact normalized equality proved. No numerical/content/client-JS/CSS difference. Previous detailed458unit/16math evidence retained, not unnecessarily rerun. GitHub Actions41938077938 completed FAILURE on2026-11-05T00:15:16Z: production MVP visual suite lacks48Linux golden files,12visual scenarios FAIL;13functional PASS/2conditional skips. Backend gates/types/lint/458unit/full root264PASS+6skips and both builds PASS. GitHub Pages deploy skipped; independent Cloudflare41affa11 remains live. Documentation-only328c812 [skip ci] receipt was merged/pushed, transient branches removed and remote SHA verified; this CI-status audit is separate/local, no new push/deploy.

## REL5-CACHE — static routing before retained asset lookup

REL5-CACHE / FR-370..372: four generated MVP-only static proxies to absent /__mvp_not_found__ with mandatory404.html/exact-policy/collision guards and no-store/noindex. No Function/Worker/new dependency/paid resource, no DNS/push/kernel/full-source change. Fresh92file artifact differs from accepted RUN5 only _redirects(new), _headers and sw.js fingerprint; other89files byte identical. Existing releaseHeadersIntegration owns generated Pages transport config before browser SW fingerprint. Root/non-root base policy tests inspect physical output paths without base prefix. ADR-049. Production pending hosted terminal gate; preview ffba754f successful.

## Public deployment state2026-11-05

Existing static Pages electrotutor/main now serves accepted RUN5 source373f5b8, production8e96428d-7051-4c23-bdaf-9b350f1afb49. Direct artifact upload only, not Git push or adapter/runtime change. Primary module7pages/CSP/assets/16math browser cases/PWA work; strict route boundary is PARTIAL on primary due retained old /uk/ and /ru/interactive/200/noindex. Unique deployment404/manifest absence/body hashes prove correct artifact; do not equate build graph with immediate CDN eviction. Original source/frame/kernel/backend unchanged; future cache-delivery fix requires separate bounded scope. STAGES/TESTING.

## RUN5 — статическая публикация без серверного runtime

Выбранный владельцем первый origin: https://electrotutor.pages.dev/, BASE_PATH=/; custom domain позже. Pure solver/React islands/MDX прежние. `release:build`→обычная static MVP сборка→strict origin/metadata/graph audit; без FastAPI/OIDC/PostgreSQL. `releaseHeadersIntegration` выполняется до worker fingerprint, поэтому CSP/metadata изменения участвуют в новой версии кеша. `_headers` генерируется из объединения SHA256 фактических inline scripts всех страниц для ClientRouter; style-only inline и embedded font data разрешены по фактической необходимости KaTeX. Provider-specific transport metadata находится в scripts; runtime provider port/SDK не нужен для portable static files (YAGNI).

`release:preview` — loopback-only статический HTTP rehearsal с реальными заголовками, не эмулятор Cloudflare. `audit-release` проверяет origin/canonical/OG/robots/sitemap/headers/утечки/source maps. Точный graph не меняется:91files/10HTML/7RU content, без Functions/Worker compute; full190files побайтно совпадает с RUN4. `scripts/release-target.json` фиксирует non-secret target/optional pinned CLI/auth prerequisites; CLI не установлен и не требуется для local build.

При исходном RUN5 account GET403 блокировал inventory; после owner-authorized official login2026-11-05 GET200 подтвердил существующий electrotutor/main/GitHub build settings, custom domains0/zones0. Публичный новый MVP/retention/billing этим не сертифицированы. Наличие HTTPS pages.dev не доказывает custom domain. Сохранённый GitHub Pages workflow публикует при push и зависит от backend gates; RUN5 не меняет/ослабляет его. Recommended manual Pages artifact upload после отдельного разрешения позволяет не разворачивать backend и не ждать его runtime. Исторические утверждения ниже не заменяют текущий target. ADR-048/runbook/STAGES.

## RUN4 — две сборочные поверхности, один учебный материал

`scripts/public-mvp-contract.mjs` — единственный владелец публичного allowlist/flag/icon policy. Канонический `pnpm build` разрешает production env один раз и по умолчанию выбирает MVP; `build:mvp`/`build:full` задают явный режим, обычный `dev` по умолчанию full. Некорректный `PUBLIC_MVP_MODE` останавливает конфигурацию. Прямой Astro build без wrapper остаётся developer surface, поэтому не используется для release artifact.

Astro выбирает `srcDir=src/mvp` и минимальный `publicDir=src/mvp/static` до discovery маршрутов. Скрытых HTML физически нет в MVP, вместо SPA fallback существует `404.html`. Full mode использует исходные `src/pages`, content collections и `public` без удаления/массового изменения. Исходные RU MDX импортируются непосредственно:11глав учебника и4примера остаются единственным владельцем математики. Общие styles/theme/KaTeX/SVG и pure mesh solver переиспользованы; новая оболочка не импортирует старый каталог, авторизацию, Google Fonts или identity fetch.

`MvpLayout`/`MeshJourney` связывают3прямых URL нативными ссылками и официальным ClientRouter. Активен один длинный вертикальный материал. Touch ограничивается безопасной областью, мышь/горизонтальный wheel — панелью, вертикальный wheel не перехватывается. Scroll/history принадлежат ClientRouter; fragment/query переносит номер примера. Optional `MeshLab.persistContext` хранит только bounded raw draft/example/active/loop в sessionStorage. Legacy defaults false/true сохраняют старый normal-mode UX, модель не изменена. Гостевая самопроверка переиспользует grader и guest storage без обращения к account API.

MVP manifest/robots/icons/worker — статические endpoints. Иконки читаются из единственного canonical public/icons по фиксированному allowlist. Build hook формирует только свой sw.js из точного emitted graph и content fingerprint. Новый worker заранее кеширует все3этапа/собственные assets, отклоняет скрытые навигации404/noindex, мигрирует только cache namespaces проекта и только entries своей scope; чужие caches/данные не удаляются. Full legacy worker сохранён. Artifact marker выбирает соответствующий Playwright config; full и MVP regression разделены без ослабления старых сценариев.

Архитектурное решение: ADR-047. Проверка и фактическая степень готовности — ET-MVP-004 в STAGES; локальный код не означает merge/deploy. Дальнейшие разделы описывают также сохранённую full surface.

## RUN3D — ограниченный DC solver и локальный island

`models/mesh-current.ts` собирает настоящую2×2/3×3контурную систему из R/E/J для четырёх топологий. Собственный bounded row-scaled pivot solve нужен: прежнего электрического mesh solver нет, private beam stiffness solver имеет другой symmetric/diagonal/rank contract и остаётся неизменён. Невырожденное решение проверяется KVL, constitutive branch-current crosscheck и nodal KCL через потенциал A/Ohm, full signed power и отдельную I₁−I₂−J связь. При R=0 деление U/R не выполняется, ток идеальной ветви берётся из системы и нулевое падение проверяется KVL. Никакой псевдообратной/подстановки нулей/last-valid fallback.

`mesh/MeshLab` хранит только raw draft/preset/editor/loop state; pure результат вычисляется при render. `MeshLabScheme` SSR использует неизменённые engineering glyphs/порты. RU ресурсы отделены в mesh/ru.ts, presentation передаёт числа в общий форматтер для UI и KaTeX. Новый RU lab route и4ссылки после прежнего examples Content; источники учебника/примеров/UK и31catalogue entries неизменны. Exact RU-only exceptions теперь только examples иlab, BaseLayout default translation contract прежний. Backend/storage/infra/deps отсутствуют в новом path. ADR-046/FR-331..339.

## RUN3C acceptance 2026-11-04 — статические примеры

`src/pages/ru/topics/dc/mesh-current-method/examples/index.astro` рендерит авторский `src/content/mesh-examples/ru.mdx` вне lesson catalogue collection: это ресурс существующей темы, а не новая тема. `TextbookFormula.astro` компилирует129формул; `MeshExampleDiagram` SSR рисует4схемы через прежние инженерные glyphs, без hydration и нового решателя. CTA после текста `MeshTextbook` и обратные ссылки формируют реальный consumer path. Никаких API/store/kernel/provider/dependency changes. `BaseLayout.hasTranslation` по умолчанию true; false только у этой точной RU-only страницы убирает отсутствующий UK alternate/switch. Artifact audit разрешает только её, прежние пары сохраняются. Source data/полярности и независимая математика — FR-321..329/ADR-045.

## RUN3B acceptance 2026-11-04 — статический mesh textbook

RU canonical topic route рендерит Content Collections MDX внутри `MeshTextbook.astro`: длинный индексируемый текст/129формул/схема доступны до JavaScript. `TextbookFormula.astro` принимает явный latex string prop и строго компилирует доверенный авторский KaTeX; React children slot не используется как строка формулы. `MeshTextbookIsland` гидратирует только guest progress/practice и подсветку5anchors. Existing learning store/grader/IDs/namespace и физические модели не меняются. UK остаётся `MeshLessonIsland`/legacy renderer и прежним MDX; это owner-authorized RU-first content delta, не fallback перевод. Новых URL/API/providers/dependencies нет; boundary Astro/MDX+React islands прежний. ADR-044 и mesh-textbook SPEC задают scoped delta.

ET-PAN-004: `showcase/PanoramicCarousel` использует существующие модели и EngineeringPlot; `panorama-model` содержит параметры/метаданные. Четыре локальные иллюстрации в responsive WebP отделены от настоящих SVG-графиков. `catalogue/catalog` — источник31инструмента для домашней подборки8 и фильтруемого каталога; ToolCard/TopicCover/TechnicalThumbnail используют существующие символы. Новые URL/API/зависимости отсутствуют; старые story/hash/query и calculator URL сохранены. EngineeringBoardEraser отделяет preview от ограниченного атомарного commit; формат хранения совместим.

Public static MVP: первоначальный Direct Upload2026-10-28; инженерная витрина2026-10-29 публикуется через подключённый владельцем GitHub main → Cloudflare build (Node22.23.1/pnpm11.23.0), pnpm build → `dist/`, в
Cloudflare Pages: https://electrotutor.pages.dev/, `BASE_PATH=/`, без API origin.
Первый Pages-проект electrotutor-mvp и GitHub Pages сохранены. Backend/OIDC/PKCE topology не менялась; lesson/practice работает локально в браузере.

Документ описывает фактическое устройство проекта «Потенциал». Требования
находятся в `../specs/`, а известные расхождения реализации — в
выбранном record `STAGES.md`.

## Общая модель

```text
Source: Astro pages/layouts, MDX lessons, CSS and React islands
        ↓
      Astro
        ↓
  pnpm run build
        ↓
      dist/
        ↓
GitHub Actions (`.github/workflows/pages.yml`)
        ↓
GitHub Pages (`/electro-tutor/`)

Browser ─> Jitsi public API (только кабинет)
        └> Cal.com URL (только если задан PUBLIC_CALCOM_URL)
        └> Google Fonts CSS/font files (неблокирующий progressive enhancement)
```

Astro генерирует индексируемый HTML. React используется для состояния и
интерактива, а не как основной маршрутизатор production-сайта.

## Current → target platform map

`ET-09.2` реализовал local/CI backend boundary. Текущий Astro/MDX/PWA сайт и
GitHub Pages остаются без изменений и пока не вызывают API:

```text
PUBLIC FRONTEND                          LOCAL/CI BACKEND (ET-09.2)
Astro/MDX/React islands                  тот же public static frontend
  → checked dist/ → GitHub Pages           → /api/v1 (отдельный origin/ingress TBD)
Browser storage + Jitsi + Cal.com            → Electro Tutor modular monolith
                                                transport → application → domain
                                                → repositories/ports
                                                → Electro Tutor PostgreSQL
```

Реализованный первый slice — только local/CI walking skeleton. Production backend host,
DNS/ingress, CORS/cookie topology и provider deployment не выбраны и не входят в
`ET-09.2`; существующая Pages-публикация не зависит от них.

### Принятый foundation contract

| Граница | Решение для `ET-09.2` |
|---|---|
| Repository/layout | тот же product monorepo; backend в `services/api/` |
| Runtime | Python `>=3.12`, FastAPI, Pydantic Settings |
| Persistence | PostgreSQL 17, async SQLAlchemy + asyncpg, Alembic как единственный schema owner |
| Toolchains | root `pnpm@11.23.0` оркестрирует; service-local `uv.lock` и `.venv` принадлежат Python service |
| API | `/api/v1`; generated OpenAPI; стабильные error envelope; server-generated либо strict validated request ID |
| Layers | modular monolith: transport → application/service → domain → repositories/ports |
| Local services | ET-09.2: PostgreSQL; ET-09.3: isolated DEV Keycloak; без Redis, RabbitMQ, workers, object storage и realtime |
| Deployment | local/CI only; API default bind — loopback, PostgreSQL не публикуется в LAN; docs/debug только explicit local profile |

Canonical runnable path `ET-09.2`: root command запускает API и PostgreSQL;
`GET /api/v1/health/live` подтверждает процесс, а
`GET /api/v1/health/ready` выполняет реальный `SELECT 1` и проверяет ожидаемый
Alembic head. DB outage или schema drift возвращают redacted stable `503`, а не
in-memory success. Runtime role не имеет DDL; отдельный migration owner владеет
lineage и grants. `create_all` и SQLite/mock как primary evidence запрещены.
Non-loopback API bind, LAN-exposed PostgreSQL и production-like target требуют
отдельного явного profile/approval; negative tests доказывают safe defaults.
Locked Python restore сопровождается lock-drift и vulnerability gates в local/CI.

`ET-09.2` реализует следующий canonical command catalog в root `package.json`;
на Windows используется тот же script через `pnpm.cmd`:

| Command | Contract |
|---|---|
| `pnpm backend:bootstrap` | `uv sync --frozen`, tool/version/config preflight |
| `pnpm backend:build` / `backend:check` | reproducible build; format/lint/type/lock/security gates |
| `pnpm backend:dev` / `backend:stop` / `backend:logs` | local API + PostgreSQL lifecycle и diagnostics |
| `pnpm backend:status` / `backend:doctor` / `backend:smoke` | effective config без secrets, readiness и API→DB smoke |
| `pnpm backend:test:fast` / `backend:test:integration` | isolated unit и real PostgreSQL suites |
| `pnpm backend:db:status` / `backend:db:migrate` / `backend:db:reset-local` | Alembic state/apply и guarded disposable reset |
| `pnpm backend:idp:dev` / `backend:idp:provision` / `test:e2e:auth` | isolated Keycloak lifecycle/reconciliation и real browser auth evidence |

ET-14.1 добавляет к этому историческому ET-09.2 catalog отдельный
`notification-worker` без Redis/брокера. `backend:dev` и `backend:e2e`
запускают worker после миграции; он использует только runtime DB role и
ограниченные функции delivery/cleanup. 0013 catalog manifest получен из свежей disposable БД;
clean bootstrap, upgrade, rollback и live worker/browser acceptance прошли.
Сохранённая original DB остаётся отдельным compatibility gate и не менялась.

ET-14.2 использует тот же worker/outbox/inbox: 0014 сохраняет отдельные owner-scoped reminder intents и настройки IANA timezone; Booking trigger создаёт/отменяет schedule, worker безопасно claim-ит due intents и доставляет через ET-14.1. Quiet hours и 15-minute grace вычисляются в PostgreSQL IANA timezone, concurrent workers сериализуются по Booking/job. Fresh catalog, upgrade/rollback и live browser→API→worker acceptance прошли на disposable 55437; original DB не использовалась.

Canonical local orchestration — root `compose.yaml`: PostgreSQL 17 доступен
host-only на `127.0.0.1:55432`, API — на `127.0.0.1:8000`; project/profile names
фиксированы и collision обнаруживается до старта. CI вызывает те же root scripts,
а не параллельные shell recipes. Production-like variables запрещены local reset.

### Ownership, reuse и интеграции

| Класс | Граница | Решение |
|---|---|---|
| `ADAPT_PATTERN` | FastAPI app factory, router/service/repository, async PostgreSQL/Alembic, stable errors/request IDs | адаптировать проверенные patterns MathMorph в собственных Electro Tutor modules; код/package не копировать |
| `ADAPT_PATTERN` | migration/runtime role separation и fail-closed config | применить с собственными role names, schema и secrets |
| `KEEP_INDEPENDENT` | MathMorph realm/client/sessions, DB/schema/migrations/API, Rust/WASM, workers и artifact store | не импортировать, не изменять и не использовать как Electro Tutor runtime |
| `FUTURE_INTEGRATION` | formula/document interchange и identity correlation | только отдельный versioned HTTP/export adapter в будущем approved stage |
| `EXTRACT_SHARED` | shared package/service | не требуется: стабильное дублирование для двух consumers не доказано |

Audit provenance: immutable MathMorph snapshot `0fa90c7` (2026-08-31), включая
`services/api/pyproject.toml`, `uv.lock`, architecture и ADR. Его статусы
`NOT_RUN_DOCKER`/`implemented_unverified` не являются evidence Electro Tutor.
Прямой доступ к MathMorph DB, sessions, migrations, config или realm запрещён.
Текущий MathMorph worktree не является evidence и не изменялся этим stage.

### Target data и provider boundaries

PostgreSQL станет authoritative product state только после реализации соответствующих
stages. `ET-09.2` создаёт reversible initial lineage и infrastructure metadata, но
не profile/session/booking tables. Будущие public IDs — opaque UUID, timestamps —
UTC, money — integer minor units, extensible JSON — bounded и versioned.

Identity/OIDC, realtime/media, recording, storage, payment, notifications и AI
разделены provider-neutral ports. Для ET-09.3 принят только isolated local DEV
Keycloak на `127.0.0.1:58081`; production provider/topology не выбраны. Identity
принадлежит Electro Tutor и коррелируется по `(issuer, subject)`; email не
является ключом. Одноразовая auth transaction хранит state digest, nonce и PKCE
verifier; callback создаёт новую opaque server-side session, а raw provider
tokens отбрасываются после проверки. MathMorph client/config/session/schema не
переиспользуются. Provider choice не может менять domain owner.

### ET-09.4 profiles/authz/audit contract (verified runtime)

ADR-023 и `../specs/features/profiles-capabilities-audit.spec.md` отделяют
stable product owner `accounts.id` от provider-login `external_identities.id`.
Один Account может иметь несколько external identities; email не является
linking key. StudentProfile и TutorProfile — независимые private `0..1` persona
records на Account; один Account может иметь обе. Profile fields не являются authority и
TutorProfile не является tenant/membership.

```text
ET-09.3 session → external identity → Principal(account_id, identity_id, provenance)
  → Application Core policy evaluator
      + resource ownership
      + typed operation
      + active account CapabilityGrant
  → profile/grant repository + append-only AuditEvent
      (один PostgreSQL unit-of-work для audit-critical mutation)
```

Baseline trusted grant `TUTOR_PROFILE_MANAGE_OWN` хранится в Tutor PostgreSQL и
может быть issued/revoked только server-created internal provisioning actor.
Client/OIDC claims и profile existence не входят в authority inputs. Grant не
даёт blanket lesson/tenant/board/billing/classroom access; future scoped sources
могут дополнять evaluator, не меняя account-grant semantics.

Authority mutation и первое TutorProfile creation коммитят AuditEvent в той же
transaction; audit failure откатывает mutation. Проверка grant и profile write
сериализуются с concurrent revoke через общий connection/unit-of-work и row lock.
Это определяет runtime order: audit persistence → internal Account boundary →
grant/evaluator → profiles →
HTTP adapters → full RU/UK/authz E2E. `ET-09.4a` уже предоставляет append-only
AuditEvent repository и один PostgreSQL unit-of-work. `ET-09.4b0` предоставляет
Account ownership boundary с atomic first-login. `ET-09.4b` добавляет separate
provisioner DB role, account-scoped grant repository, durable operation ledger,
typed evaluator и atomic grant/revoke audit. `ET-09.4c` добавляет profile domain,
две независимые private tables, connection-scoped repository и fixed-search-path
functions без прямых runtime table privileges; Tutor mutation повторно проверяет
и блокирует grant, а первое create атомарно пишет AuditEvent. Revision `0009`
разделяет `electro_tutor_auth_runtime` и profile runtime, передаёт redacted
session digest только transaction-local и выводит owner/audit actor из active
session внутри PostgreSQL. `ET-09.4c` verified. `ET-09.4d` добавляет thin private
GET/PUT/PATCH adapters с auth → owner → validation precedence и живым
API → Application → PostgreSQL path. `ET-09.4e` добавляет RU/UK browser UI
поверх literal `/profiles/{kind}/me`, который не возвращает internal
`account_id`, а также local-only двухпользовательский Keycloak/trusted-CLI
terminal harness. UI и harness, включая live two-user terminal path, validated
locally 2026-09-14.

### ET-10.1 TutorOffer/Booking contract

ADR-025 и `../specs/features/payments-and-booking.spec.md` добавляют новый
Scheduling/Booking module внутри того же modular monolith:

```text
active session → Principal(account_id) → booking application service
  → exact tutor capability + participant/resource policy
  → session-bound offer/booking repositories
  → PostgreSQL mutation + operation ledger + AuditEvent in one UoW
```

`TutorOffer` — concrete future interval и server-owned terms. Student request
копирует их в immutable Booking snapshot; tutor принимает этот snapshot, а не
current mutable offer. FREE/EXTERNAL полностью работают без provider. Payment,
calendar sync, recurrence, access grant и lesson session остаются отдельными
boundaries.

Tutor operations используют новый `TUTOR_BOOKING_MANAGE_OWN`; profile existence
не является authority. Runtime по-прежнему передаёт только session digest,
PostgreSQL повторно разрешает Account и допускает writes только через narrow
fixed-search-path functions. Concurrent accept сериализуется deterministic
participant advisory locks и half-open overlap check без нового extension.

Frontend остаётся static Astro shell + bounded TypeScript module. Private API
responses не кэшируются; Account IDs в browser contract не попадают. RU/UK time
форматируется через `Intl` из UTC instant + explicit IANA zone. Existing Cal.com
link не синхронизирован с authoritative Booking.

### ET-10.2 LessonAccessGrant contract

ADR-026 и `../specs/features/lesson-access-grants.spec.md` add a separate Access
module without introducing LessonSession or media:

```text
Booking accept/cancel application path
  → existing Booking locks/idempotency
  → one booking-scoped LessonAccessGrant + redacted audit in the same UoW

private session + opaque booking UUID
  → Access application service
  → session-bound participant + grant check using PostgreSQL time
  → ACTIVE media-less shell or stable fail-closed error
```

One grant references one immutable Booking and stores no copied participants.
Allowed sources are only `BOOKING_FREE|BOOKING_EXTERNAL`; policy v1 is the
half-open interval `[starts_at - 15 minutes, ends_at)`. Effective status is
derived, and capability set v1 resolves only `LESSON_SHELL_ENTER` plus the
Booking-derived tutor/student role.

Accept atomically issues; accepted cancellation atomically revokes. Random
server-generated UUIDv4 issue/revoke operation IDs are persisted on the grant
and reused by AuditEvents; client Booking keys cannot pre-reserve their audit
identity. Exact replay returns the persisted result. Lock order is Booking→grant, runtime uses narrow
fixed-search-path functions and has no Access table DML. Check has no cache or
provider fallback; foreign resource is masked and inconsistent policy data
fails closed.

The connection-scoped Python Access repository exposes authorization only.
Issue/revoke are DB-private helpers called exclusively by the authorized Booking
transition functions in the same transaction/UoW; runtime has no direct
`EXECUTE` privilege on those helpers. This is the atomic least-privilege boundary,
not a second application command surface.

The consumer is a new static RU/UK protected shell with no private build-time
data. Existing public Jitsi classroom remains a separate legacy MVP and is not
loaded or reclassified by ET-10.2. A separate exact three-identity terminal
harness proves the foreign-account denial without changing ET-10.1 accepted
two-user phase counts.

### ET-10.3 LessonSession local implementation

ADR-027 and `../specs/features/lesson-sessions.spec.md` define a separate
server-authoritative lifecycle, without coupling Session existence to browser
tabs, Jitsi or a future media room:

```text
active application session + Booking participant + active Access grant
  → Session application service / connection-scoped repository
  → Booking → grant → Session locks in PostgreSQL
  → one READY row per Booking; tutor-only versioned START/END
  → redacted AuditEvent and operation ledger in the same transaction
```

The first tutor or student join creates READY. Only the tutor may start at/after
the Booking start instant and end ACTIVE. Before start, accepted Booking
cancellation atomically closes READY and revokes Access. Grant expiry closes
private reads/writes; unfinished READY/ACTIVE is never falsely persisted as
ENDED. Participant role comes from immutable Booking, Session capabilities
from server policy, and `current_topic_id` remains transport `null` until a
future Topic stage. The static RU/UK lesson shell keeps only an opaque
`#session=` ID for reload and re-reads the API; the public Jitsi classroom is
unchanged. Isolated live Keycloak→API→PostgreSQL Session browser acceptance
passed; prior user-accepted manual RU/UK voice/screen-reader acceptance
is PASS (TESTING.md, ET-10.3-UA-19).

### ET-10.3 database drift-check boundary

ADR-028 repairs a repository-wide Backend DX gate without changing runtime
Session semantics. Immutable Alembic migrations remain the source of
historical transitions; a tooling-only SQLAlchemy Core `MetaData` declares
the desired head schema independently of the database under test. Existing
`alembic check` compares them. A committed versioned `pg_catalog` contract,
derived from a separate disposable migrated baseline, covers SQL
functions, triggers, `CHECK` expressions, partial-index predicates and ACL
not fully compared by
Alembic. `backend:check` reads both contracts and fails closed on drift; it
does not rewrite a live database. Schema metadata and catalog expectations
must advance with future migrations. The tooling and 9 scratch rollback
negatives pass, but the existing data-bearing dev DB genuinely diverges;
the repository-wide gate is not yet PASS and no automatic repair occurs.

## Технологии и границы

| Задача | Реализация |
|---|---|
| Маршруты и статическая сборка | Astro 7 |
| Интерактивные острова | React 19 |
| Учебные материалы | Astro Content Collections + MDX |
| Формулы | KaTeX |
| SEO | canonical, hreflang, sitemap, статический HTML |
| PWA | manifest, service worker, offline page |
| Онлайн-занятие | публичный Jitsi IFrame API и его whiteboard |
| Package manager / build | pnpm 11.23.0 / `pnpm run build` |
| CI/CD | GitHub Actions, `.github/workflows/pages.yml` |
| Production assets | GitHub Pages, project base `/electro-tutor/` |

Минимальная версия Node.js определяется `package.json`: `>=22.12.0`.

## Карта репозитория

```text
src/
├─ pages/                    Astro-маршруты
├─ layouts/BaseLayout.astro  head, навигация, тема, язык, PWA
├─ content/lessons/          парные RU/UK MDX-уроки
├─ components/               React islands и локальные CSS
├─ legacy-pages/MeshLesson.tsx  переходная реализация island урока
├─ content.config.ts         схема frontmatter
├─ site-path.ts              base-aware route/asset helpers
├─ curriculum.ts             разделы и карточки каталога
├─ data.ts                   первые карточки и общие переводы
├─ types.ts                  общие TypeScript-типы
├─ styles.css                глобальный UI
└─ pwa.css                   UI установки PWA

public/                      статические файлы и service worker
services/api/                FastAPI modular monolith, Alembic, uv lock, tests
compose.yaml                 loopback-only API + PostgreSQL + DEV Keycloak orchestration
scripts/backend.mjs          canonical cross-platform backend command surface
specs/                       канонические требования
docs/                        архитектура, решения и состояние
prompts/                     протокол поэтапного продолжения
.github/workflows/           GitHub Actions
```

Сгенерированные `dist/`, `.astro/`, `*.tsbuildinfo` и зависимости не являются
исходным кодом и вручную не редактируются.

## Маршруты

| Файл | URL |
|---|---|
| `src/pages/index.astro` | `<BASE_PATH>` → `<BASE_PATH>ru/` |
| `src/pages/[lang]/index.astro` | `/ru/`, `/uk/` |
| `src/pages/[lang]/topics/index.astro` | каталог |
| `src/pages/[lang]/topics/[section]/[slug].astro` | опубликованный урок |
| `src/pages/[lang]/interactive.astro` | раздел интерактивов и круговая диаграмма |
| `src/pages/[lang]/interactive/star-neutral.astro` | несимметричная звезда с нейтралью |
| `src/pages/[lang]/interactive/circular-diagram.astro` | отдельный маршрут годографа при сохранении встроенного интерактива и старых share links на index |
| `src/pages/[lang]/interactive/transmission-line.astro` | локальная лаборатория переходного процесса длинной линии |
| `src/pages/[lang]/classroom.astro` | кабинет занятия |
| `src/pages/[lang]/services.astro` | услуги и расписание |
| `src/pages/[lang]/contacts.astro` | контакты |

`getStaticPaths()` создаёт локали во время сборки. Код локали украинского языка
— `uk`; надпись в переключателе — `UA`.

Корневой route реализует redirect через `Astro.redirect(...)` с
`import.meta.env.BASE_URL`. Поэтому production path
`/electro-tutor/` переходит на `/electro-tutor/ru/` внутри static site build;
отдельный Cloudflare edge redirect не нужен.

`astro.config.mjs` нормализует независимые параметры `SITE_URL` (origin для
canonical/sitemap) и `BASE_PATH` (deployment prefix). Runtime-код формирует
внутренние URL только через `site-path.ts` и `import.meta.env.BASE_URL`, поэтому
один artifact contract работает в `/` и, например, `/electro-tutor/`.

`src/i18n/` — единый locale catalog общей оболочки, page metadata, действий,
ошибок и accessible names. Runtime helpers нормализуют поддерживаемые коды и
форматируют пользовательские числа, даты, длительности и plural forms.
`scripts/validate-locales.mjs` блокирует build при missing/extra/empty или
неподтверждённо одинаковых ключах; `scripts/audit-built-locales.mjs` проверяет
парность собранных локализованных routes, `html[lang]`, canonical и `ru`/`uk`/`x-default`
hreflang. Авторский lesson MDX и математические обозначения остаются в своих
domain sources и проверяются lesson contract.

## Поток учебного контента

```text
src/content/lessons/<lang>/<slug>.mdx
        ↓ validation by content.config.ts
getPublishedLessonManifest() → pair/uniqueness contracts
        ↓
Astro route + derived curriculum availability
        ↓
visible MDX HTML + optional registered React island
```

Frontmatter содержит `title`, `description`, `language`, `section`, `slug`,
`order`, `duration`, `keywords`, `draft` и optional `interactive`. Правила
автора находятся в `CONTENT_GUIDE.md`.

`lesson-manifest.ts` фильтрует draft, проверяет уникальность и парность RU/UK,
формирует локализованные маршруты и сохраняет ссылку на Content Collection
entry. `curriculum-publication.ts` выводит `available` и `href` карточек из
manifest; `curriculum.ts` остаётся источником порядка и локализованного UI.

Универсальный route получает только записи manifest, рендерит видимый MDX и
по optional ключу выбирает разрешённый React island из статического registry.
Для текущего `mesh-lesson` route использует конкретный статический import,
необходимый Astro для генерации hydration metadata; произвольные dynamic
imports из frontmatter не допускаются.

## Общий макет и клиентское состояние

`BaseLayout.astro` владеет SEO head, навигацией, footer, темой, переключением
языка, установкой PWA и регистрацией service worker. Он сохраняет:

- тему в `localStorage` (`potential-theme`);
- позицию прокрутки при смене языка в `sessionStorage`;
- query/hash при переходе на парную локаль.

`MeshLessonIsland.tsx` сохраняет уровень подробности в `potential-level`.
`star-neutral.ts` владеет чистым расчётом трёхфазной звезды: комплексные
сопротивления и режим нейтрали поступают из локального React state; результат
или диагностическая причина передаются SVG-графикам и таблице. Числовые поля и
drag точки меняют один state. Округление происходит только при отображении;
сервер, URL-state и новая графическая библиотека в этом контуре не участвуют.
Плоскость Z ограничивает R ≥ 0; соседний SVG помещает N, n и A/B/C на плоскость
напряжений и рисует токи от n с отдельным масштабом. Палитра обоих SVG
хранится в `src/components/StarDiagramColors.css` для светлой и тёмной тем.
`circular-diagram-state.ts` владеет схемой `v=1`, defaults, domain limits и pure
pipeline `parse → validate → normalize → canonicalize`. `CircularDiagram.tsx`
получает только типизированное состояние, синхронизирует его с UI и browser
history и не передаёт сырые `URLSearchParams` математической модели. Legacy
share-ссылки без `v` мигрируют; повреждённые ссылки восстанавливают defaults.

Длинная линия имеет отдельную численную границу: `transient-core` хранит
распределённые `V[N+1]`, `I[N]`, per-cell `L/R/dx`, per-node `C/G` и минимальный
state источника/нагрузки. Один шаг leapfrog проходит массивы последовательно;
midpoint companion решает только два граничных узла. `SourcePort` и
`BoundaryDevice` задают заменяемые порты, а grid layout сохраняет место для
неоднородных и потерьных ячеек. Аналитические коэффициенты отражения используются
только в reference tests. `wasm-bindgen` создаёт ES module и WASM; tracked
артефакт проверяется `scripts/transient-wasm.mjs` по SHA-256 источников и output.
`src/transient/transient.worker.ts` единолично владеет WASM объектом, выполняет
play/seek и посылает transferable снимок не чаще, чем UI подтверждает
отрисовку. React хранит поля и скалярные показания; большие массивы остаются
в Worker и одном текущем Canvas-снимке. Static route не зависит от API/DB.
При `Rs=0` порт удерживает заданное полное напряжение источника, поэтому
пришедшее приращение напряжения отражается с `Γs=-1`. При `Rs=Z0` возвращённая
волна поглощается. UI вычисляет `Γs` только для диагностики; шаг времени
остаётся численным в Rust/WASM.

## Кабинет занятия

`Classroom.tsx` нормализует код комнаты, создаёт приглашение и после явного действия пользователя
вызывает provider-neutral `MeetingProvider`. Composition root выбирает текущий Jitsi adapter;
только adapter знает `meet.jit.si`, external script/constructor, options и command names. UI
получает `MeetingSession`, capability whiteboard и canonical errors. Имя сохраняется в
`localStorage`; сервер проекта данные кабинета не хранит. Комната не имеет собственной
авторизации или серверной политики доступа. Ограничения описаны в `SECURITY.md`.

## Расписание и платежи

`services.astro` читает только публичный `PUBLIC_CALCOM_URL`. При его отсутствии
выводится fallback. Платёжного backend, checkout и webhook нет; будущий контракт
находится в `../specs/features/payments-and-booking.spec.md`.

`BaseLayout` запускает неблокирующую загрузку DM Sans и Manrope из Google Fonts
через preload и stylesheet с первоначальным media `print`. После загрузки
self-hosted script `/scripts/web-font.js` переключает stylesheet на media `all`;
inline event handler для этого не используется. Критический CSS не содержит
внешнего `@import`, поэтому первый рендер использует системные fallback-шрифты и
не зависит от ответа внешнего сервиса.

## PWA и кэш

- `public/manifest.webmanifest` задаёт установку и shortcuts;
- `public/sw.js` использует network-first для публичной навигации и cache-first
  только для статических `font/image/manifest/script/style` текущего origin;
- `public/offline.html` — резерв для навигации без сети.

Текущий namespace — `potential-pwa-v2`. При активации безопасные публичные
ответы мигрируют из прежних `potential-pwa-*`, после чего удаляются только
собственные старые namespaces. 404/5xx, `private`/`no-store` и пути
`/api`, `/auth`, `/checkout`, `/payments` не кэшируются. Чужие Cache Storage
namespaces не читаются и не удаляются; navigation cache key хранится без query.
При следующем изменении стратегии cache key снова должен измениться.

Manifest использует scope-relative URL, а worker выводит offline/static paths
из `self.registration.scope`. Регистрация получает base-aware script URL и
scope из `BaseLayout`, поэтому PWA не выходит за project-site prefix.

## Исторический GitHub Pages SEO/profile

`astro.config.mjs` строит canonical и sitemap от `SITE_URL`, а маршруты и assets
— от `BASE_PATH`; резервный origin `https://electrotutor.example` допустим
только локально. Активный workflow `.github/workflows/pages.yml` явно задаёт
`SITE_URL=https://zabulaaleksey.github.io` и `BASE_PATH=/electro-tutor/`.
Build завершается аудитом внутренних HTML/CSS/manifest targets, PWA scope и
запретом localhost/machine-local URL.

Deployment boundary:

```text
GitHub repository
  → push в main
  → GitHub Actions
  → pnpm install --frozen-lockfile
  → pnpm run verify:full
  → full root-artifact E2E
  → production build + project-base smoke
  → checked dist/
  → Pages artifact hand-off
  → GitHub Pages
```

Production URL — `https://zabulaaleksey.github.io/electro-tutor/`. Cloudflare,
Wrangler/Cloudflare тогда не входили в этот GitHub Pages profile; текущий static RUN5 target описан выше, actual hosted/private state проверяется отдельно.

## Переходный lesson seam

От React/Vite-прототипа сохранён только используемый production-путь
`MeshLessonIsland.tsx → legacy-pages/MeshLesson.tsx`. Он подключается из
статического Astro registry и не является отдельным SPA или маршрутизатором.
Корневые `index.html`, `src/main.tsx`, `src/App.tsx`, неиспользуемые страницы и
отдельный `vite.config.*` удалены в `TUTOR-02`. Новые страницы не должны
расширять этот seam; целевая граница — Astro/MDX плюс малые React islands.

## Где вносить изменения

| Задача | Каноническое место |
|---|---|
| SEO head, меню, footer, тема, язык | `src/layouts/BaseLayout.astro` |
| Глобальные токены и layout | `src/styles.css`, `src/pwa.css` |
| Разделы и карточки каталога | `src/curriculum.ts`, `src/data.ts` |
| Frontmatter и публикация урока | `src/content.config.ts`, `src/content/lessons/` |
| Формулы | `src/components/Formula.tsx` |
| Электрическая схема урока | `src/components/CircuitDiagram.tsx` |
| Математика круговой диаграммы | `src/models/circular-diagram.ts` |
| Математика звезды и presets | `src/models/star-neutral.ts` |
| Физика длинной линии и boundary ports | `transient-core/src/` (Rust, `wasm-bindgen`) |
| Worker-протокол и Canvas эпюры | `src/transient/`, `src/components/TransmissionLineLab.tsx` |
| UI, плоскость Z и совмещённая топографическая диаграмма звезды | `src/components/StarNeutralLab.tsx`, `src/components/StarNeutralPlots.tsx`, `src/components/StarDiagramColors.css` |
| URL/state schema и limits | `src/models/circular-diagram-state.ts` |
| Browser adapter круговой диаграммы | `src/components/CircularDiagram.tsx` |
| Вид круговой диаграммы | `src/components/CircularDiagram.css`, `src/components/CircularDiagramMath.css` |
| Кабинет | `src/components/Classroom.tsx`, `src/components/Classroom.css`, `src/classroom/meeting.ts`, `src/classroom/create-meeting-provider.ts`, `src/classroom/jitsi-meeting-adapter.ts` |
| PWA cache/offline | `public/sw.js`, `public/offline.html` |
| GitHub Pages deploy | `.github/workflows/pages.yml` |

## Проверки

Целевой набор:

```bash
pnpm check
pnpm lint
pnpm build
git diff --check
```

Текущее execution state отражено в выбранном record `STAGES.md`;
command contract — в `project-context.md`.

## Контракт зависимостей

- Источник истины (Source of truth): `package.json`, `pnpm-lock.yaml` и `pnpm-workspace.yaml`; канонический менеджер — `pnpm@11.23.0`.
- Чистое восстановление (Clean restore): удалить только disposable `node_modules`, затем выполнить `pnpm install --frozen-lockfile`.
- Общий pnpm content store разрешён, но virtual store остаётся project-local:
  Astro/Rolldown virtual modules должны разрешаться одинаково в clean Linux CI.
  `allowBuilds` ограничен `esbuild` и `workerd`.
- `node_modules`, `.astro`, `dist` и тестовые/build caches можно пересоздавать; исходники, lesson content и локальные секреты dependency cleanup не затрагивает.
- GitHub Pages verify job использует frozen lockfile и `pnpm run verify:full`:
  Git hygiene, workflow contract, Astro check, ESLint, Vitest, полный Chromium
  E2E на транзитном root-artifact в `dist/` с обязательным cleanup, единственная
  production build, project-base smoke этого `dist/` и dependency audit. Только
  после них `dist/` загружается как Pages artifact; deploy job зависит от verify
  и не пересобирает artifact.

## RC1 consolidation delta

Home/catalog/authored lesson/account form one common shell; home/account render a pure DOM progress summary, so home does not hydrate a React island. Existing Mesh React island owns numeric practice and versioned browser progress. `src/learning/` validates record bounds, limits published IDs and resolves guest versus SHA-256(issuer + NUL + subject) only after successful server `/me`; pending identity disables writes. Device-only persistence, not server Course/Progress schema or sync. Account profile/Booking/Session/inbox/reminders retain PostgreSQL ownership and server authority.

`PUBLIC_API_ORIGIN` is a public deployment input: HTTPS, or exact loopback HTTP; no credentials/path/query/fragment. Unconfigured non-loopback builds show localized unavailable state; loopback4321/4322 can resolve existing API8000. No secrets in metadata. Contracts bound requests to10s and preserve cancellation. `PUBLIC_CALCOM_URL` optional validated HTTPS; absence shows unavailable + local product next action.

PWA reuses existing v2 public cache/migration contract, adds raster192/512/maskable assets and same-origin worker/WASM assets for visited offline labs. API/auth/private/no-store responses never cached. No Electron/Tauri or new offline database. Source/lock/security/browser acceptance — evidence/rc1/readiness.json; deployment topology remains ET-18.2.

Главная витрина: одна SSR+hydrated React island `src/showcase/EngineeringShowcase.tsx`;
локальный typed catalog/physics/SVG renderer. Три bounded dynamic модели, five static examples;
open-star переиспользует `models/star-neutral.ts`. Поиск/категории/пагинация и #story IDs живут
на главной; существующий Astro router, серверная граница и зависимости сохранены.

Micro Labs / ET-MICRO-001: внутри той же React island добавлен memoized MicroLabs со своим локальным состоянием. Typed micro-catalog → чистый microModel → CircuitView/LivePlot/LiveParameter/TimeController/MicroLabCard.14 моделей переиспользуют physics DC/RLC/RC/diode; остальные явно ограничены аналитическими уравнениями. Только изменённая карточка пересчитывается; нет отдельных RAF/timer loops. Ползунок t управляет точкой, курсором и значениями. #micro=<id> сохраняется при RU/UK; фильтрация сохраняет состояние. Source-only micro-backlog105тем не импортируется клиентом. Существующие /interactive/ остаются большими расчётными лабораториями; произвольный multi-line/RLC editor и3D — future-only. Новых dependencies/API/БД нет.

Панорамный редизайн ET-PANORAMA-001 сохраняет ту же island и физические функции. `line-surface.ts` задаёт один аналитический boundary model для схемы/результатов/U(x,t)/сечений; `LineSurface.tsx` — ортографическая SVG-проекция без WebGL/новой зависимости. Состояние поверхности хранится в прежнем scene store при переключении. EngineeringBoard — локальные pointer strokes/history и SVG Blob download; данные никуда не отправляются. Micro cards умеют раскрытие, а маршруты остаются прежними. Видимое имя ElectroTutor отделено от legacy storage/compatibility identifiers.


Общий слой SHOW-016..019: `src/engineering/{scale,format,plot,geometry,bode}.ts` и `EngineeringPlot`/`BodeView` переиспользуются текущими islands. Pure functions хранят physical numbers отдельно от presentation; Canvas использует те же scales/units. STUD не runtime dependency. Worker/WASM solver и auth/backend contracts неизменны.


ET-LABS-002: existing islands/shared engineering layer reused. New src/fourier pure TypeScript adaptation and src/science data/models remain independent of src/transient physical engine. A bounded characteristic-wave engine extends supported ideal sections; legacy Rust/WASM retained. One active theme and shared plot/clock contracts; no services/dependencies. UI edits serialize physical topology; display state never mutates solver history.

## ET-UX-003 — рабочие области

Существующие Astro ClientRouter и React islands сохранены. ToolCard задаёт общий каталог; домашние previews ведут к реальным MicroLabs, legacy hash/query маршруты совместимы. usePointerStroke хранит draft в ref/SVG-слое и фиксирует модель одним действием; useLocalZoom обрабатывает только локальный Ctrl-wheel. Shared unsaved guard сохраняет локальные документы до перехода. Android — отдельная тонкая debug-упаковка текущего dist, без новых web/server dependencies.

## ET-BEAM-001 — балка и семантические SVG-символы

Astro RU/UK route → React `src/beam/BeamLab.tsx` → pure `src/models/beam.ts`.
Расчёт независим от DOM, React, сети и LLM. Прямая жёсткость собирает осевые и
Hermite bending DOF в узлах всех разрывов. Согласованные линейные нагрузки,
масштабирование свободной системы и контроль residual заменяют прежние узкие
аналитические подстановки; физический отказ явно скрывает эпюры.
Точные нагрузочные примитивы/полиномы определяют N/Q/M, их пределы/нули/экстремумы.
`src/beam/BeamDiagram.tsx` использует существующие `engineeringAxis`, SI/locale
format и `useLocalZoom`; одно SVG-полотно гарантирует общую координату всех эпюр.
Новый renderer специализирован на редакторе расчётной схемы, не заменяет общий
EngineeringPlot. История pure reducer отделяет live draft от одной команды drag.
Versioned JSON содержит только вход, а результаты всегда пересчитываются.

`src/engineering/symbols.tsx` владеет геометрией/терминалами и provenance.
MicroVisual/SceneVisual/ToolArt, пример CircuitDiagram и механические опоры используют этот слой. Complex impedance Z и reference-specific EMF остаются семантически отдельными glyphs; обмотка на магнитопроводе и блоки редактора не подменяются lumpedL/R. Режимы
full/thumbnail/export имеют одну геометрию; масштаб меняет весь символ. Профили
в SVG units не являются произвольными заявлениями о нормативных миллиметрах.
Внешние пакеты, backend, auth, deployment и service-worker policy не изменены.

ET-UI-008: LanguageSwitcher использует существующие localePath/catalogs и очищает обработчики при Astro transitions. localStorage potential-language содержит только RU/UK; нейтральный full-build root восстанавливает его, explicit locale URL и MVP policy приоритетны. OperationStatus отображает существующий worker busy/error; вычислительный контракт неизменён.

## Рукописный ввод ET-LAB-022

Принятый штрих в документе v5 может ссылаться на объект модели по типу и идентификатору. Редактор переносит ссылку при переподключении и проверяет её при импорте. Исправление штриха и объекта применяется одной операцией истории. Штрихи старых документов без ссылки можно перерисовать в архиве.

Распознавание получает SVG-координаты штрихов и возвращает тип, направление и известные выводы. NetworkWorkbench применяет операции network-edit и проверяет трассировку перед фиксацией. Сырые штрихи и размеры символа хранятся с геометрией документа, а электрические параметры передаются в существующий Worker. Независимый источник тока задаёт токовую инъекцию в одном узле относительно опоры. Переключение УГО резистора меняет его SVG через контекст представления.

Нормативные ориентиры для вариантов резистора доступны в [карточке ГОСТ 2.728-74](https://protect.gost.ru/gost/details/ba115ccd-e5aa-4ba1-a672-b17170f1a7f2), [каталоге IEC 60617](https://webstore.iec.ch/en/publication/2723) и [каталоге IEEE 315](https://standards.ieee.org/ieee/315/515/).
