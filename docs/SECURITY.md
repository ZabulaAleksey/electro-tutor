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
| GitHub-hosted Actions и package registry ↔ build job | исполняемый action/dependency code | Actions по major tags, dependencies из frozen pnpm lockfile |

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

Workflow имеет ровно объявленные в repository permissions:

- `contents: read` для checkout исходников;
- `pages: write` для публикации Pages;
- `id-token: write` для OIDC, используемого Pages deployment action.

Permissions объявлены на уровне всего workflow, поэтому build job сейчас также
наследует `pages: write` и `id-token: write`; это избыточная область доступа, а
не подтверждённый защитный control. `actions/checkout` не отключает сохранение
credentials явно.

После frozen pnpm install workflow создаёт Astro artifact командой
`pnpm run build`, загружает только `dist/` и передаёт его deploy job для
environment `github-pages`. Дополнительные branch protection, environment
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
5. GitHub Pages workflow пока не блокирует upload/deploy полным набором
   `check`, `lint`, unit/integration/component и live E2E gates; это открытый
   `T0-REL-001`, назначенный `TUTOR-06`.
6. `workflow_dispatch` может собрать выбранный вручную ref, а workflow не
   содержит явного deploy guard `github.ref == 'refs/heads/main'`; наличие
   внешней environment branch policy из repository не подтверждено.
7. `pages: write` и `id-token: write` выданы workflow-wide, включая build job;
   checkout credentials сохраняются по default.
8. GitHub Actions подключены по изменяемым major tags, а не по immutable commit
   SHA, поэтому Actions являются отдельной supply-chain границей.
9. Автоматические security-тесты отсутствуют.
