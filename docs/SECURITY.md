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

Local/CI backend, PostgreSQL и отдельная DEV OIDC identity/session boundary
реализованы; production backend/IAM и платёжные endpoints отсутствуют.

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

Jitsi SDK, script URL и global constructor принадлежат infrastructure adapter. UI не принимает
vendor objects и получает только canonical meeting session/errors без raw vendor cause. Invite URL
пересобирается только с allowlisted `room`; остальные query/hash не копируются, а display name
очищается от control characters и ограничивается 80 символами. Late-session/unmount cleanup имеет
bounded retry, а Jitsi adapter удаляет provider DOM/iframe из host при vendor dispose failure; UI
не подтверждает выход, если системный teardown всё же не завершён. Эта граница уменьшает leakage,
но не добавляет аутентификацию, waiting room, SLA или privacy-гарантии публичного provider.

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

`ET-09.2` реализовал этот baseline для local/CI API и отдельного Electro Tutor
PostgreSQL. Production hosting и внешние providers не выбраны.

| Asset / boundary | Основная угроза | Fail-closed contract | Privacy/cost boundary |
|---|---|---|---|
| API config и secrets | client leak, permissive defaults | startup fail-fast для missing/unknown config; safe `.env.example`; secrets только server-side; exact CORS allowlist | sentinel secrets отсутствуют в logs/doctor/errors; provider cost не принят |
| API request/response | injection, oversized input, correlation/header abuse | loopback default; bounded body/timeouts; server-generated ID либо strict charset/length validation с replacement invalid/control chars; stable redacted errors; `no-store` | route template/status/duration без payload/PII |
| PostgreSQL | privilege escalation, schema drift, silent fallback | отдельные migration/runtime roles; runtime без DDL; readiness проверяет DB + Alembic head; outage/drift → `503` | собирать только данные утверждённого domain stage; storage/backup cost TBD |
| Identity | account confusion, callback/CSRF/session fixation, token leak | exact DEV issuer/client/redirects/origins; state + nonce + PKCE S256; signed ID-token issuer/audience validation; rotating opaque server-side session | production IAM/retention остаются future decision; provider tokens не сохраняются |
| Internal Account (`ET-09.4b0`, verified) | provider identity ошибочно становится product authority owner, email account takeover, orphan owner при race/failure | server UUID `accounts.id`; required immutable identity FK; narrow DB creation function генерирует новую пару без direct runtime INSERT; unique `(issuer, subject)` winner; no email/public auto-linking | provider provenance остаётся в external identity/session; runtime не читает, не создаёт напрямую и не меняет Account rows |
| Trusted grant / evaluator (`ET-09.4b`, verified) | self/OIDC/profile escalation, duplicate active authority, unaudited grant, grant/revoke race | separate provisioner DB credential; idempotent pre-migration local/CI role reconciliation; typed `AuthorityActor`; Account-only FK/scope; global idempotency ledger; partial unique active grant; shared UoW audit; DB-backed account ordering + active-row lock | runtime only reads exact grant; no public route, wildcard, email/provider authority or blanket access; production cluster IAM remains deployment-owned |
| Profiles / authorization (`ET-09.4c..e`, planned) | profile-driven role escalation, IDOR/BOLA, blanket tutor access | private owner-only profiles; profile/client/OIDC fields не authority; typed account grant + Application Core matrix; foreign resource non-disclosing deny | public directory и tenant/member data отсутствуют; минимальный private `display_name` |
| Audit (`ET-09.4a`, verified foundation) | authority mutation без evidence, audit tampering или PII leak | append-only PostgreSQL AuditEvent + shared UoW; runtime column INSERT/table SELECT, без audit UPDATE/DELETE/TRUNCATE; DB/audit failure rolls back transaction | action-specific scalar metadata allowlist, 16-key/4096-byte bounds; tokens, secrets, email, display name и full bodies запрещены |
| MathMorph integration | foreign DB access, cascading failure | только versioned API/export adapter; no direct DB/session/config access | не дублировать MathMorph PII/artifacts без отдельной цели и срока |
| Media/payment/AI/storage | vendor lock-in, uncontrolled spend/data transfer | provider-neutral ports; disabled until approved vertical slice | pricing, region, retention, consent и deletion — обязательные входные решения |

Structured request log содержит request ID, route template, method, status и
duration. DB diagnostics допускают latency/error class, но не SQL, URL или
credentials. Audit, technical telemetry и product analytics — разные streams;
Sentry/OTel vendor в `ET-09.2` не выбирается. PWA по-прежнему не кэширует
`/api`, `/auth`, `/checkout`, `/payments`, private или `no-store` responses.

Local/CI profile по умолчанию bind-ит API только к loopback, не публикует
PostgreSQL на LAN и не включает FastAPI debug/docs вне явного local profile.
Negative tests отклоняют non-loopback exposure и подтверждают default-deny CORS,
body limit, request-ID replacement и redacted failures. Migrate/reset/cleanup deny by
default, пока target не доказан как disposable local/test; production-like
connection string и неизвестный profile не допускают destructive action.
Python `uv.lock` проходит lock-drift и vulnerability audit тем же local/CI gate,
что и runtime tests; исключение требует owner, причины и срока пересмотра.
Base images используют точные version tags, но digest pinning и отдельный image
vulnerability scan ещё не являются gate: это явно отложенный production
hardening, который должен быть закрыт до live backend rollout.

ET-09.3 Keycloak публикуется только на `127.0.0.1:58081` и использует отдельные
realm/client Tutor. Client public, client secret отсутствует, implicit/direct
grant выключены, redirect/origin/post-logout lists не имеют wildcard. Bootstrap
admin и synthetic test passwords требуются только из local environment,
provisioner принимает только exact loopback admin URL, pin-ит synthetic username,
проверяет ownership group и отсутствие `realm-management` roles до завершения,
имеет bounded HTTP timeout и не выводит credentials. Весь named realm является
disposable project-owned DEV state; cleanup удаляет только managed identity.
OIDC backchannel
игнорирует ambient proxy variables и принимает только exact local container/host
origins. Callback атомарно consume-ит transaction только при совпавших id/state;
invalid/missing state, invalid nonce/issuer/audience/authorized-party и foreign endpoint fail
closed. Session cookie `HttpOnly`, `SameSite=Lax`, path `/api/v1`; logout требует
exact Origin и удаляет local session до provider confirmation. Uvicorn access log
отключён, чтобы query `code`/`state` не попадал в logs; auth Playwright suite не
сохраняет trace/screenshot/video с credential или session material.

Long-running API container не получает `ET_MIGRATION_DATABASE_URL`; migrator
credential доступен только one-shot migration service. Runtime role может читать
`alembic_version` для readiness, но `UPDATE` и DDL подтверждённо запрещены.

Data minimization применяется до schema design: новый field обязан иметь owner,
purpose, access rule и retention/deletion contract. Неутверждённые Keycloak,
LiveKit, Stripe, object storage, notification и AI vendors не создают расходов и
не получают данные. PostgreSQL — technology boundary, а не разрешение на
production provider или бессрочное хранение.

Для `ET-09.4` trusted grant source — только Tutor PostgreSQL; internal
provisioning actor формируется server-side из exact allowlisted config и не
доступен public session. Denied self-escalation/foreign access может попадать в
redacted security observability с request/correlation ID, но без private profile
payload. Durable audit read/export и public admin UI в baseline отсутствуют.

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
- фиксация оставшегося риска в выбранном record `../prompts/STAGES.md`.

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
6. Uvicorn слушает все interfaces внутри container; только поддерживаемый Compose
   path ограничивает host publish loopback. Прямой `docker run -p` требует
   отдельного exposure/ingress решения и не является approved deployment path.
7. Root logs command полагается на текущий запрет credentials/payload в logs;
   централизованный redaction filter обязателен до добавления adapters/providers,
   способных передать сторонние error details.
