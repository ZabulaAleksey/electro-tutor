# Безопасность и границы доверия

Проект является статическим сайтом, но загружает внешнюю видеоплатформу,
сохраняет часть состояния в браузере и планирует расписание/платежи. Поэтому
границы доверия должны быть явными до production-расширения.

## Текущая модель

| Граница | Данные | Текущее поведение |
|---|---|---|
| Браузер ↔ статический сайт | публичный контент и JS | без авторизации |
| Браузер ↔ `meet.jit.si` | имя, код комнаты, media по согласию | внешний публичный сервис |
| Браузер ↔ Cal.com | переход по публичному URL | включается переменной окружения |
| Браузер ↔ Google Fonts | IP/заголовки запроса, CSS и шрифты | неблокирующая optional-загрузка из `BaseLayout` |
| Браузер storage | тема, уровень, имя, позиция/параметры | локальное/session storage |
| URL query → CircularDiagram | восемь публичных числовых параметров | schema `v=1`, size/duplicate/type/range validation до модели |
| GitHub repository ↔ GitHub Actions ↔ GitHub Pages | исходники и `dist/` artifact | CI/deploy через `.github/workflows/pages.yml` |
| GitHub-hosted Actions и package registry ↔ verify job | исполняемый action/dependency code | Actions закреплены полными commit SHA, dependencies из frozen pnpm lockfile |

Backend, база данных, аккаунты и платёжные endpoints сейчас отсутствуют.

## Секреты и конфигурация

- `.env` не коммитится; публичный пример — `.env.example`;
- `SITE_URL`, `BASE_PATH` и `PUBLIC_CALCOM_URL` не являются секретами;
- будущие API keys, OAuth tokens, webhook secrets и provider credentials должны
  храниться только в server-side secret storage;
- секреты нельзя помещать в `src/`, `public/`, client-prefixed variables,
  Markdown-примеры с реальными значениями или GitHub history;
- production `SITE_URL` должен быть точным, иначе canonical и sitemap вводят в
  заблуждение.

## CI/CD и deployment

Production trust boundary проходит от GitHub repository через GitHub Actions к
GitHub Pages. Автоматический путь запускается только при push в `main`;
`workflow_dispatch` остаётся отдельной ручной operator surface.

Workflow разделяет permissions по job:

- verify: только `contents: read`, checkout использует
  `persist-credentials: false`;
- deploy: `actions: read`, `pages: write` и `id-token: write` для получения
  Pages artifact и OIDC-публикации.

Все referenced Actions закреплены immutable full SHA с release-version comment.
Verify и deploy имеют явный guard `github.ref == 'refs/heads/main'`, поэтому
ручной запуск с другого ref не получает upload/deploy path.

После frozen pnpm install workflow запускает `pnpm run verify:full`: полный
root E2E выполняется на транзитном artifact в каноническом `dist/` с cleanup в
`finally`, затем единственный production
`dist/` проходит project-base smoke и dependency audit. Только этот `dist/`
загружается и передаётся deploy job без повторной сборки. Дополнительные branch protection, environment
approval или security controls не считаются настроенными без отдельного
repository evidence.

## Кабинет и Jitsi

Текущий код нормализует room до `[a-z0-9-]` и ограничивает длину 48 символами.
Новые комнаты получают случайный суффикс. Это снижает случайные коллизии, но не
является контролем доступа.

До использования кабинета для чувствительных занятий нужно решить:

- требуется ли аутентификация и роль преподавателя;
- кто может создавать и повторно открывать комнату;
- допустим ли публичный `meet.jit.si` по privacy/retention/SLA;
- нужна ли waiting room, пароль, moderation и ограничение срока ссылки;
- какое уведомление и согласие требуется для камеры, микрофона и внешней доски.

Не передавать в room/query персональные данные, email, телефон или содержание
занятия. Имя в `localStorage` считать пользовательским вводом и не включать в
логи.

## Недоверенный ввод и внешние URL

- значения query и формы валидируются и ограничиваются до использования;
- CircularDiagram принимает query длиной не более 1024 символов, отклоняет
  unknown version, duplicate known keys, нечисловые и выходящие за domain limits
  значения; fallback заменяет весь state defaults и канонизирует URL;
- URL календаря задаётся оператором через окружение, но перед production нужно
  проверить схему `https`, ожидаемый host и отсутствие секретных query;
- ссылки, открывающие новую вкладку, используют безопасный `rel`;
- сторонние scripts добавляются только для зафиксированной интеграции и с
  минимально необходимой областью.

## PWA и service worker

Service worker может долго сохранять старый код. Изменение стратегии требует
новой версии cache key и проверки обновления уже установленного приложения.
`potential-pwa-v2` кэширует только успешные `basic`-ответы публичных навигаций и
явных типов статических ресурсов. `private`/`no-store`, 404/5xx и зарезервированные
`/api`, `/auth`, `/checkout`, `/payments` исключены. Worker мигрирует только
безопасные ответы из собственных старых `potential-pwa-*` namespaces и не читает
или удаляет чужие кэши origin. Query удаляется из navigation cache key, поэтому
room-коды и параметры интерактива не перечисляются через Cache Storage.
Кэшировать ответы с будущими персональными или платёжными данными запрещено.
Worker ограничен `self.registration.scope`, а build audit отклоняет внутренние
targets вне `BASE_PATH` и случайные localhost/machine-local URL.

## Target platform threat, privacy и cost atlas

Этот раздел задаёт contract для будущего backend, но не утверждает, что он уже
существует. `ET-09.2` разрешает только local/CI API + отдельный Electro Tutor
PostgreSQL; production hosting и внешние providers не выбраны.

| Asset / boundary | Основная угроза | Fail-closed contract | Privacy/cost boundary |
|---|---|---|---|
| API config и secrets | client leak, permissive defaults | startup fail-fast для missing/unknown config; safe `.env.example`; secrets только server-side; exact CORS allowlist | sentinel secrets отсутствуют в logs/doctor/errors; provider cost не принят |
| API request/response | injection, oversized input, correlation/header abuse | loopback default; bounded body/timeouts; server-generated ID либо strict charset/length validation с replacement invalid/control chars; stable redacted errors; `no-store` | route template/status/duration без payload/PII |
| PostgreSQL | privilege escalation, schema drift, silent fallback | отдельные migration/runtime roles; runtime без DDL; readiness проверяет DB + Alembic head; outage/drift → `503` | собирать только данные утверждённого domain stage; storage/backup cost TBD |
| Identity | account confusion, cross-product privilege | exact `(issuer, subject)`; отдельные Electro Tutor client/session/schema | retention/deletion и IdP vendor решаются до `ET-09.3` |
| MathMorph integration | foreign DB access, cascading failure | только versioned API/export adapter; no direct DB/session/config access | не дублировать MathMorph PII/artifacts без отдельной цели и срока |
| Media/payment/AI/storage | vendor lock-in, uncontrolled spend/data transfer | provider-neutral ports; disabled until approved vertical slice | pricing, region, retention, consent и deletion — обязательные входные решения |

Structured request log содержит request ID, route template, method, status и
duration. DB diagnostics допускают latency/error class, но не SQL, URL или
credentials. Audit, technical telemetry и product analytics — разные streams;
Sentry/OTel vendor в `ET-09.2` не выбирается. PWA по-прежнему не кэширует
`/api`, `/auth`, `/checkout`, `/payments`, private или `no-store` responses.

Local/CI profile по умолчанию bind-ит API только к loopback, не публикует
PostgreSQL на LAN и не включает FastAPI debug/docs вне явного local profile.
Negative test отклоняет non-loopback exposure. Migrate/reset/cleanup deny by
default, пока target не доказан как disposable local/test; production-like
connection string и неизвестный profile не допускают destructive action.
Python `uv.lock` проходит lock-drift и vulnerability audit тем же local/CI gate,
что и runtime tests; исключение требует owner, причины и срока пересмотра.

Data minimization применяется до schema design: новый field обязан иметь owner,
purpose, access rule и retention/deletion contract. Неутверждённые Keycloak,
LiveKit, Stripe, object storage, notification и AI vendors не создают расходов и
не получают данные. PostgreSQL — technology boundary, а не разрешение на
production provider или бессрочное хранение.

## Платежи

Платежи не реализованы. Требования находятся в
`../specs/features/payments-and-booking.spec.md`.

Обязательные инварианты:

- hosted checkout вместо сбора карточных реквизитов;
- server-side проверка webhook signature;
- idempotency создания заказа и обработки событий;
- статус оплаты не доверяет redirect клиента;
- минимизация персональных данных и redaction логов;
- rate limiting и повторяемые безопасные ошибки;
- отдельные test/live credentials и явный production checklist.

Любое изменение платежей, аутентификации, внешних scripts, OAuth или хранения
данных требует security review.

## Проверка изменений

- поиск случайно добавленных секретов и приватных URL;
- review внешних origins и переменных окружения;
- негативные тесты недоверенного ввода;
- проверка client bundle на отсутствие server secrets;
- проверка обновления service worker, изоляции cache namespace и запрета
  кэширования приватных/ошибочных ответов;
- для webhook — поддельная подпись, replay и повтор события;
- фиксация оставшегося риска в `AI_STATUS.md`.

## Известные риски

1. Публичные Jitsi-комнаты не имеют собственного контроля доступа.
2. В проекте нет настроенной Content Security Policy. Обработчик загрузки
   web-font уже вынесен из inline `onload` в self-hosted script, но остальные
   inline-скрипты layout потребуют nonce/hash или выноса перед строгой CSP.
3. Зависимости внешнего Jitsi script не закреплены локальным integrity hash.
4. Шрифты загружаются с внешних Google origins; self-hosting/privacy-решение не
   принято.
5. Полный специализированный security suite отсутствует; обязательный pipeline
   включает dependency audit с порогом `high`, workflow contract tests и review
   минимальных permissions/immutable Action refs.
