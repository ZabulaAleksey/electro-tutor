# Потенциал

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
задайте `E=100 В`, `Rs=50 Ом`, `l=1000 км`, `v=200000 км/с`, `Z0=50 Ом`,
`N=1000`, open load и `Stop at=20 мс`: время пробега будет 5 мс.

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

`backend:dev` применяет Alembic migrations и запускает API с PostgreSQL.
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
2. Запомни имя рабочей ветки через `git branch --show-current`. На другом
   компьютере сначала проверь `git status --short --branch`, затем выполни
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
