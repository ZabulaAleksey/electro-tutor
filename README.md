# ElectroTutor

ET-MVP-004 / RUN4: локально проверена русская публичная PWA-поверхность одного mesh-модуля. Учебник → Примеры решений → Лаборатория:3прямых URL, горизонтальные touch/mouse/trackpad/keyboard переходы, нативная вертикальная прокрутка, Back/Forward и bounded контекст лаборатории. PUBLIC_MVP_MODE: canonical build по умолчанию MVP, dev по умолчанию full; скрытых HTML нет в MVP,7indexable RU pages/404/noindex/sitemap/manifest/offline/cache upgrade проверены. 446unit, Astro0errors/0warnings/3oldhints, ESLint, обе сборки PASS; production-runner25/25 MVP, base-path12/12, full Chromium264PASS/6oldlive-auth skips/0flaky/0retry.16exact nodal cases/72zero residuals;134просмотренных captures,48newgoldens/534oldPNG unchanged,197protected hashes unchanged. RUN3D56e314c принят/ff merged main; RUN4 — отдельный atomic feature checkpoint, main56e314c и sourcebranch сохранены. Нет RUN4 merge/push/deploy. Physical/Narrator/hosted release acceptance и применимость formal legal/hosting policy — отдельные caveats в STAGES. Подробные evidence: TESTING, public-mvp-run4 SPEC и current chat outputs/ElectroTutor_run4_evidence.zip.

Публичный RUN4 пока не развёрнут. Описания каталогов, других тем, UK, кабинета и прежних публикаций ниже относятся к сохранённой full/development поверхности и историческим receipts.

Для проверки установленными зависимостями:

```bash
pnpm dev                       # full mode, обычная разработка
pnpm build                     # безопасный RU MVP по умолчанию
pnpm build:mvp                 # явно RU MVP
pnpm build:full                # явно полная сохранённая поверхность
pnpm preview
pnpm test:e2e:production-smoke  # выбирает suite по marker артефакта
```

`PUBLIC_MVP_MODE=true|false` задаётся окружением/production env; query/localStorage режим не переключают. Неверное значение останавливает сборку. Пустое значение использует указанные defaults. `SITE_URL`, `BASE_PATH` и `BUILD_OUTPUT_DIR` сохраняют прежние контракты. Для проверки реального legacy-worker upgrade задайте `MVP_LEGACY_ARTIFACT` на отдельный ранее проверенный full artifact; в RUN4 эта проверка выполнена, это не mock. Production deploy всегда должен использовать проверенный MVP artifact. Источник проекта и full build не являются публичным release artifact.

ET-MESH-003D / RUN3D acceptance2026-11-04: реальная RU лаборатория4схем RUN3C, мгновенное изменение R/E/J и знаков источников, mesh/branch currents/voltages/matrix/signed power/nodal-KCL/KVL/constraint/residuals. Компактный редактор рядом с SVG и показаниями; нет фиктивного запуска/динамики. Независимый exact nodal oracle16cases (4исходных+12изменённых),72zero residuals;439unit,264Chromium PASS/6oldlive-auth skips,273-file types/lint/build41pages PASS.6width×2themes/48states просмотрены:144newPNG,390oldPNG+193protected files unchanged. RUN3C99b9302 принят и ff merged main, ветка сохранена; RUN3D56e314c принят владельцем и ff merged local main, sourcebranch сохранена; no push/deploy. Учебник→примеры→лаборатория доступен обычными ссылками. RUN4 horizontal UI/release visibility проверены локально в ET-MVP-004; hosted/manual acceptance и публикация — отдельные будущие gates. Полный MVP PARTIAL. Evidence: specs/features/mesh-laboratory.spec.md, STAGES, TESTING, current chat outputs/ElectroTutor_run3d_evidence.zip.

ET-MESH-003C / RUN3C acceptance 2026-11-04: отдельный RU этап примеров решений доступен из учебника и обратно:4схемы с полным KVL/решением/ветвями/напряжениями/балансом,129строгих формул. Независимый Fraction nodal→mesh расчёт:26нулевых невязок, включая поглощение20/3W источником тока. 395unit,244Chromium PASS/6ожидаемых unrelated live-auth skips; Astro/check/lint/build PASS. Шесть ширин320..1920 в обеих темах,144новых просмотренных PNG;246старых PNG и191protected files SHA-256 unchanged. RUN3B принят владельцем и ff merged main186013d, sourcebranch сохранена. RUN3C99b9302 впоследствии принят и ff merged local main по разрешению владельца; sourcebranch сохранена, push/deploy не выполнялись. Лаборатория завершена локально отдельным RUN3D; горизонтальный маршрут/release visibility остаются будущими блоками, полный MVP PARTIAL. Evidence: mesh-worked-examples SPEC, STAGES, TESTING и outputs/ElectroTutor_run3c_evidence.zip текущего чата.

ET-MESH-003B / RUN3B acceptance 2026-11-04: русский урок метода контурных токов — единый подробный статический MDX учебник без переключателя уровней:11глав,129формул, независимые nodal/KCL/KVL/Cramer/reversal/power checks. Практика и5step progress сохранены; UK остаётся прежней. Локально390unit,230Chromium PASS/6expected live-auth skips, check/lint/build PASS;132новых PNG просмотрены,114старых сохранены. RUN3A e743df5 слит ff в main по разрешению владельца, source branch сохранена. RUN3B commit186013d впоследствии принят и ff merged в local main по разрешению владельца; sourcebranch сохранена, push/deploy не выполнялись. Примеры завершены локально отдельным RUN3C; новая лаборатория, горизонтальная последовательность и RU-only release visibility остаются будущими задачами. Contract/evidence: specs/features/mesh-textbook.spec.md, docs/STAGES.md, docs/TESTING.md.

ET-MESH-003A / RUN3A acceptance 2026-11-04: локально исправлены формулы и схема русского урока метода контурных токов, включая мобильные экраны и обе темы. 389 unit и 228 Chromium PASS / 6 ожидаемых live-auth skips; Astro/TypeScript, ESLint, production build PASS. Новые 60 PNG просмотрены, прежние 54 PNG сохранены. Один bounded repair в `fix/mesh-lesson-run3a`; публикация не выполнялась. Полноценный эталонный учебный модуль остаётся PARTIAL: подробная теория, отдельные примеры/лаборатория и переходы — последующие задачи. Contract/evidence: `specs/features/mesh-lesson-visual-repair.spec.md`, `docs/STAGES.md`, `docs/TESTING.md`.

ET-CI-001: certifi2026.10.23; source `c9a43fbe0149aae5072b02cd04d7268bc743397a`, [GitHub Actions](https://github.com/ZabulaAleksey/electro-tutor/actions/runs/41025558068) verify/deploy SUCCESS; Cloudflare `a1db51d3-6979-4112-a33e-a007055ef99b` SUCCESS. Backend и полный frontend pipeline проходят; подробности и ограничения — docs/STAGES.md, docs/TESTING.md.

ET-PAN-004 опубликован и проверен2026-10-30: https://electrotutor.pages.dev/ru/ — четыре оригинальные панорамы, каталог31инструмента, тематические карточки и частичный ластик. Source c5ac7b8, Cloudflare41ad6330 SUCCESS;382unit/61primary-domain browser PASS. Контролируемая видеосвязь отдельно BLOCKED_BY_PROVIDER; подробности — docs/STAGES.md и docs/TESTING.md. Предыдущие receipts ниже сохранены.

ET-UX-003: локально проверены карточные каталоги и прямые инструменты, общий header, Fourier preview/масштаб/полный экран/stem-спектр, доска с сохранением и небольшой калькулятор. Android debug APK собран и проверен в отдельном эмуляторе; команды — android/README.md. Опубликовано на https://electrotutor.pages.dev/ru/: source9ed98f5, Cloudflare19537dec SUCCESS,30public-browser PASS; актуальный receipt — docs/STAGES.md.

ET-LABS-002: первый релиз опубликован и проверен2026-10-29 — длинные линии V2, Fourier Sketch,12научных Micro Labs и общая тема.283unit/18public-browser PASS; source64a6ba0, Cloudflarebc8455b3 SUCCESS72s. Точный scope/receipt и будущие возможности — docs/STAGES.md. Исторические релизы ниже сохранены.

Панорамный редизайн и общий инженерный стандарт опубликованы: [ElectroTutor](https://electrotutor.pages.dev/ru/).14Micro Labs, удобные шкалы/СИ/локаль, Bode, исправленная геометрия фазоров и синхронные2D/3D-сечения.231unit/41local-browser/15public-browser PASS; source26985b6, Cloudflare12ca3006. Подробный receipt — `docs/STAGES.md`.

Публичный MVP: https://electrotutor.pages.dev/ — Cloudflare Pages, 2026-10-28.
Инженерная витрина опубликована и проверена 2026-10-29: 8 сюжетов, 3 динамические модели DC/RLC/RC, каталог12карточек, RU/UK. Исходный код слит и отправлен в main; временная ветка удалена локально и на GitHub. Cloudflare Git integration собирает pnpm build → dist.
Micro Labs опубликованы и проверены2026-10-29:14 мини-экспериментов с регуляторами, схемами, графиками и физическим временем; категории/поиск/сброс/прямые ссылки RU/UK. Source main9cacf22, Cloudflare deployment76b3eaf7 SUCCESS, реальные public controls/reset/time/reload/mobile PASS.
Первый адрес https://electrotutor-mvp.pages.dev/ также сохранён. Прогресс хранится отдельно для каждого адреса.
Начните с урока «Метод контурных токов»: RU/UK, схема, формулы, проверка ответа
и прогресс на этом устройстве. Регистрация и настройка сервера для урока не нужны.
Сборка и реальный публичный сценарий проверены; evidence — `docs/STAGES.md` и `docs/TESTING.md`.

Локальная консолидация 2026-10-23: main `7d63a28`,15 согласованных веток удалены,
один checkout. Повторно прошли frontend189/backend208 тестов, typecheck/build и context/CI
проверки. RC1_READY сохранён; следующий bounded staging plan и owner decisions — `docs/STAGES.md`.

`electro-tutor` — русско-украинская образовательная платформа по электротехнике
на Astro с MDX-уроками, формулами KaTeX, React-интерактивом и
PWA-возможностями. Технические коды локалей — `ru` и `uk`.

В разделе «Интерактив» доступны отдельные RU/UK страницы круговой диаграммы
(`/{lang}/interactive/circular-diagram/`), несимметричной звезды
(`/{lang}/interactive/star-neutral/`) и симулятора длинной линии
(`/{lang}/interactive/transmission-line/`). Круговая диаграмма также остаётся
на странице раздела для совместимости существующих ссылок с параметрами.
В интерактиве звезды можно менять сопротивления фаз в формах R/X и |Z|/φ или
перетаскиванием точек на правой полуплоскости Z, выбирать
идеальную/конечную/разомкнутую нейтраль и видеть совмещённую топографическую
диаграмму напряжений и токов справа от Z. Числовые настройки находятся внизу;
расчёт выполняется локально.

Симулятор линии численно рассчитывает `U(x)` и `I(x)` в Rust/WASM Worker. Он
поддерживает холостой ход, короткое замыкание, R/L/C и смешанные нагрузки,
Play/Pause/Reset/Step, переход к времени и автоматическую остановку. Для
локальной проверки откройте `http://127.0.0.1:4321/ru/interactive/transmission-line/`,
оставьте стартовые `E=100 В`, `Rs=0 Ом`, `l=1000 км`, `v=200000 км/с`,
`Z0=50 Ом`, `N=1000` и open load: время пробега будет 5 мс. Волна
отражается от нагрузки и идеального источника повторно. Для сравнения
установите `Rs=50 Ом`: согласованный источник поглощает вернувшуюся волну.

Собранный WASM хранится в `public/transient-core/` вместе с контрольными
хешами исходников и артефакта; обычный `pnpm build` проверяет их соответствие.
Для регенерации нужен установленный Rust с target `wasm32-unknown-unknown`
и `wasm-bindgen-cli 0.2.129`, затем `pnpm wasm:build`.

## Быстрый старт

Требования: Node.js `>=22.12.0`, pnpm `11.23.0`.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Локальный сайт: `http://127.0.0.1:4321`.

На Windows при запрете запуска `pnpm.ps1` используй `pnpm.cmd dev` и
аналогично для остальных pnpm-команд.

### Local backend ET-09.2

Требования: Python `3.12`, `uv 0.12.3`, Docker Desktop с Compose. Backend
работает только локально: API `http://127.0.0.1:8000`, PostgreSQL
`127.0.0.1:55432`. Эти порты фиксированы для ET-09.2; backend-блок
`.env.example` документирует имена config, но не поддерживаемые overrides.

```bash
pnpm backend:bootstrap
pnpm backend:dev
pnpm backend:doctor
pnpm backend:smoke
pnpm backend:stop
```

`backend:dev` применяет Alembic migrations и запускает API с PostgreSQL;
в текущем `main` также запускается notification worker. Migration 0013,
catalog manifest и live worker/browser acceptance проверены на отдельной disposable DB.
Сохранённый original Electro Tutor volume остаётся отдельным compatibility gate;
backend:dev к нему не применять. Подробности: docs/STAGES.md и docs/TESTING.md.
`backend:stop` останавливает контейнеры, сохраняя named volume. Полный local/CI
gate — `pnpm backend:check`; отдельные уровни — `backend:test:fast` и
`backend:test:integration`. Удаление local DB разрешается только точным
`ET_CONFIRM_RESET_LOCAL=electro-tutor-local` и командой
`backend:db:reset-local`; этот reset удаляет весь named volume, который
может содержать данные из других checkouts, и не является способом
исправления ET-10.3 drift. Для проверки независимой схемы без изменения
dev-БД: `pnpm backend:db:catalog:baseline test`; для read-only диагностики
dev-БД: `pnpm backend:db:catalog:diagnose` (exit 1 при обнаруженном drift).

### Local authentication ET-09.3

DEV authentication использует только отдельные Keycloak realm
`electro-tutor-dev` и public client `electro-tutor-web-dev` на
`http://127.0.0.1:58081`. Client secret отсутствует; callback API —
`http://127.0.0.1:8000/api/v1/auth/callback`. Пароли bootstrap admin и synthetic
test identity не входят в repository: перед provisioning задай
`ET_KEYCLOAK_ADMIN_PASSWORD` и `ET_DEV_TEST_PASSWORD` в текущем shell или local
secret manager; optional non-secret names — `ET_KEYCLOAK_ADMIN_USERNAME`,
`ET_DEV_TEST_EMAIL`. Имена трёх synthetic identities фиксированы как
`et-dev-acceptance`, `et-dev-acceptance-b` и `et-dev-acceptance-c`; optional
`ET_DEV_TEST_USERNAME` допускает только primary `et-dev-acceptance`, другое
значение fail closed. Все три identity используют один local test password.

```bash
pnpm backend:idp:dev
pnpm test:e2e:auth
pnpm backend:idp:cleanup
```

`backend:idp:dev` idempotently создаёт/сверяет realm, exact redirects/origins,
PKCE `S256` client и три DEV identities. Команда fail closed без обоих password env и
не печатает их. Страница `/ru/account/` или `/uk/account/` доступна только в
local DEV/E2E runtime; production IAM остаётся не выбран.
`backend:idp:cleanup` удаляет только три named synthetic identities после
ownership preflight для каждой; если хотя бы одна не принадлежит managed group,
удаление не начинается. Realm/client остаются для следующего idempotent запуска.
`test:e2e:auth` сам собирает текущий source, применяет migrations и запускает API
на изолированной local/test БД `electro_tutor_test`, не сбрасывая основную
`electro_tutor`; перед run он безопасно пересоздаёт эти три identity, чтобы
immutable subjects и application Accounts не зависели от прошлого запуска.
После success/failure runner останавливает local API, PostgreSQL и Keycloak без
удаления named volumes; cleanup failure возвращает non-zero и точную recovery-команду.

Для ET-10.3 на host с сохранённым original PostgreSQL volume используй
`pnpm test:e2e:auth:isolated` из PowerShell. Этот runner проверяет точный
disposable контейнер `electro-tutor-et103-test-20260926` на loopback `55434`,
создаёт временный Keycloak на `58081`, запускает API и built browser phase,
затем останавливает только эти два контейнера. Пароли создаются в памяти
текущего процесса. Обычный `test:e2e:auth` использует original-bound Compose
project и для preserved DB host не подходит.

## Проверки

```bash
pnpm check
pnpm lint
pnpm build
pnpm check:base-path
pnpm verify:full
```

Результат production-сборки находится в `dist/` и вручную не редактируется.
`check:base-path` собирает artifact во временный ignored каталог `.astro/`
на том же томе с
`BASE_PATH=/electro-tutor/`, проверяет internal links/assets и выполняет live
Chromium smoke; временный artifact удаляется после проверки.
`verify:full` выполняет frozen install, Git hygiene, static check, lint, все
unit/integration/component tests, полный Chromium E2E на транзитном root-artifact
в `dist/`, удаляет его и затем выполняет production build, smoke именно
собранного production artifact и dependency audit.
Astro — единственный application build path; Vite используется внутри Astro и
Vitest как инструмент и не является отдельным SPA entrypoint.
Известные проблемы текущего stage фиксируются в выбранном record
`docs/STAGES.md`.

## Контекст проекта

- требования и критерии приёмки: `specs/README.md`;
- current selector, stage status, `NEXT` и blockers: `docs/STAGES.md`;
- дорожная карта: `docs/ROADMAP.md`;
- устройство: `docs/ARCHITECTURE.md`;
- дизайн и безопасность: `docs/DESIGN.md`, `docs/SECURITY.md`;
- backend: `docs/API.md`, `docs/DATA_MODEL.md`, `docs/TESTING.md`,
  `docs/DEPENDENCIES.md`, `docs/project-context.md`;
- добавление уроков: `docs/CONTENT_GUIDE.md`.

Чтобы из нового чата выбрать и выполнить один следующий этап, напиши:

```text
Продолжай Electro Tutor
```

Полный протокол находится в `docs/STAGES.md`.

### Продолжение на другом компьютере

1. Перед переключением убедись, что нужная работа сохранена в commit и отправлена
   в доступный remote; dirty/untracked файлы автоматически не переносятся.
2. Запомни имя рабочей ветки через `git branch --show-current` и проверь
   `git worktree list --porcelain`: несколько worktree могут содержать разные
   этапы и SHA. На другом компьютере сначала проверь `git status --short --branch`
   и `git worktree list --porcelain`, затем выполни
   `git fetch origin`. Переключись через `git switch <branch>`; если локальной
   ветки ещё нет, используй `git switch --track -c <branch> origin/<branch>`.
3. Получи только fast-forward изменения выбранной ветки:

   ```bash
   git pull --ff-only origin <branch>
   ```

   Не применяй reset/clean к неизвестным локальным изменениям.
4. Восстанови зависимости командой `pnpm install --frozen-lockfile`.
5. Выполни `pnpm check:context` и проверь project overlay. В POSIX-shell:

   ```bash
   python ~/.codex/tools/validate_project_overlay.py .
   ```

   В Windows PowerShell:

   ```powershell
   py -3 -B "$HOME/.codex/tools/validate_project_overlay.py" .
   ```

6. Прочитай selector и соответствующий record в `docs/STAGES.md`, затем
   затрагиваемую SPEC и напиши `Продолжай Electro Tutor`. Canonical record
   определит status, `NEXT`, blockers и dependencies; `blocked` stage не
   запускается и не пропускается ради downstream stage.

Если `git status` показывает чужую или незавершённую работу, сначала сохрани либо
согласуй её; не выполняй pull поверх конфликтующего dirty worktree.

## Переменные окружения

Скопируй `.env.example` в `.env` и задай нужные публичные значения:

```env
SITE_URL=https://ваш-production-домен
BASE_PATH=/
PUBLIC_CALCOM_URL=https://cal.com/ваш-профиль/консультация
```

`SITE_URL` содержит только origin и обязателен перед публичным SEO-релизом.
`BASE_PATH=/` используется для root-domain. Активный GitHub Pages workflow явно
задаёт production-значения `SITE_URL=https://zabulaaleksey.github.io` и
`BASE_PATH=/electro-tutor/`; без `SITE_URL` локальная сборка использует
резервный `https://electrotutor.example`. `PUBLIC_CALCOM_URL` необязателен: без
него страница услуг показывает локализованный fallback.

## Публикация

- Production URL: <https://zabulaaleksey.github.io/electro-tutor/>.
- Единственный активный deployment workflow — `.github/workflows/pages.yml`:
  push в `main` запускает frozen pnpm install и `pnpm run verify:full`, после
  чего загружает проверенный `dist/` как Pages artifact. Deploy job зависит от
  verify job и не пересобирает artifact.
- `workflow_dispatch` и deploy явно ограничены `main`; локальная успешная
  проверка сама по себе не разрешает merge, push или production deploy.
- Production artifact собирается с project base `/electro-tutor/`.
- `src/pages/index.astro` выполняет base-aware redirect с
  `/electro-tutor/` на `/electro-tutor/ru/` внутри Astro static build;
  отдельный edge redirect не требуется.
- Cloudflare/Wrangler больше не входят в действующий deployment path.
- deploy не выполняется автоматически агентом без явного запроса пользователя.

## Release Candidate 1 — локальный Web/PWA

Canonical current status/evidence: `docs/STAGES.md` ET-RC1, `docs/TESTING.md`, `docs/evidence/rc1/readiness.json`; подробный productization report — `docs/notes/productization-report.md`. One RU/UK authored lesson + three practice labs, account/history/resume and integrated inbox/reminders. Learning progress is explicitly device-only.

Repeat public candidate locally with pinned Node/pnpm: `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm preview --host 127.0.0.1 --port 4322`; open `/ru/` or `/uk/`, catalog -> mesh lesson -> answer -> return/resume/account. Public deployment build supplies `SITE_URL`, `BASE_PATH` and, when backend is configured, safe `PUBLIC_API_ORIGIN`; secrets never belong in PUBLIC variables. Account needs the separately configured API/Keycloak/PostgreSQL, not a fake static login. Ordinary provider signup creates a Student, never Tutor rights. The isolated registration runner uses explicitly owned stopped disposable DB55437/IdP58181 and stops only its own processes.

PWA has manifest/raster/maskable icons, installability/offline public shell and visited offline Worker/WASM lab acceptance. This is a local production-like release candidate; deployment/publication are not performed. Next bounded stage — ET-18.2 hosting/runtime/HTTPS IAM/backup plan.

## Лаборатория «Сопротивление материалов»

Опубликована `/{lang}/interactive/beam/` (RU/UK) на https://electrotutor.pages.dev/ru/interactive/beam/; ссылка — в «Лаборатории».
Прямые балки Эйлера–Бернулли: консоли с обеих сторон, шарнир/ролик, защемления,
промежуточные опоры, кусочно-постоянные EI/EA; сосредоточенные F/Fx/M и линейная q.
Перетаскивание/ввод рядом с элементом обновляют реакции и N/Q/M. Есть история,
общий курсор с пределами слева/справа, m/cm/mm, JSON-файл и сохранение в браузере.
Схемы Micro Labs используют общие SVG-символы; происхождение геометрии и область
применимости стандартов — `docs/notes/engineering-symbol-audit.md`.
Текущая проверка/ограничения и интеграция этой ветки — `docs/STAGES.md`, ET-BEAM-001.

Для повторения: `pnpm dev` → `/ru/interactive/beam/` → выберите пример →
переместите F → измените знак/величину → сохраните JSON и загрузите его.
`pnpm test`, `pnpm lint`, `pnpm check`, `pnpm build`, затем `pnpm test:e2e:built`.
Числа золотых эталонов дополнительно пересчитывает независимый аналитический скрипт.
