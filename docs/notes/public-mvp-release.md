# Публикация автономного ElectroTutor MVP

Текущий этап и открытые действия владельца: `../STAGES.md`, ET-REL-005. Этот runbook описывает будущие действия, а не выполненный деплой. RUN5 начат 2026-11-04, локальная приёмка завершена 2026-11-05. Владелец выбрал `https://electrotutor.pages.dev/`; собственный домен позже. Ни DNS, ни настройки Cloudflare, ни remote Git этим этапом не менялись.

## Платформа и границы

Рекомендуется существующий **Cloudflare Pages** со статическим артефактом. Astro `output: static`, HTML/React islands/локальный DC solver не требуют adapter, Functions, Workers compute, FastAPI, OIDC или PostgreSQL. Workers Static Assets тоже подходят для статических файлов, но перенос на новый продукт/проект сейчас увеличит число операций. Pages `_headers` относится именно к Pages; GitHub Pages его не применяет.

Потребность MVP укладывается в Pages Free: 91 файл, максимальный размер проверить в release receipt; лимиты — 20 000 файлов и 25 MiB на файл, 500 сборок в месяц, статические запросы бесплатны. Выбор платного тарифа не требуется; фактический тариф аккаунта не подтверждён из-за недоступного API. Собственный домен может иметь регистрационный платёж у регистратора; домен сейчас не покупается, цена не выдумывается.

Официальные источники: [Astro на Pages](https://developers.cloudflare.com/pages/framework-guides/deploy-an-astro-site/), [лимиты](https://developers.cloudflare.com/pages/platform/limits/), [стоимость статических запросов](https://developers.cloudflare.com/pages/functions/pricing/), [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/).

Публичный HTTP сейчас показывает старый сайт: `/uk/` доступен, неизвестные пути дают HTTP 200; это **не RUN4/RUN5 acceptance**. Нет `wrangler.jsonc` и Cloudflare deploy workflow в текущем source; сохранён `.github/workflows/pages.yml` с backend/full gates и автоматическим GitHub Pages deploy при push main. Исторически Cloudflare был Git-connected, но текущие private build/branch/domain/env settings не прочитаны: существующий OAuth GET `/accounts` вернул 403, токен истёк. Нельзя предполагать отсутствие custom domains/DNS или считать исторические настройки действующими.

## Локальная сборка и проверка

Используются уже установленные зависимости, canonical manager/version из `package.json`; проверенный runtime Node22.23.1/pnpm11.23.0. Для чистого будущего build host сначала выполняется обычный frozen restore `pnpm install --frozen-lockfile`, не переключая package manager. В RUN5 install не выполнялся. Полный сохранённый CI/backend pipeline отдельно и не требуется для этой статической команды.

PowerShell из корня проекта:

```powershell
$env:SITE_URL = 'https://electrotutor.pages.dev'
$env:BASE_PATH = '/'
$env:PUBLIC_MVP_MODE = 'true'
$env:PUBLIC_API_ORIGIN = ''
$env:BUILD_OUTPUT_DIR = 'dist'
pnpm test
pnpm check
pnpm lint
pnpm release:build
pnpm release:check
pnpm release:preview -- --port 4325
```

`release:build` проверяет HTTPS origin до сборки, принудительно выбирает MVP и запускает прежние WASM/locale/build/artifact guards плюс release guard. Placeholder, credentials, query/path в origin отклоняются. Header rehearsal доступен только на loopback; порт должен быть свободен. Остановка своего preview — Ctrl+C. Это не Cloudflare emulator/hosted proof.

Во втором терминале для всей MVP browser suite с применёнными заголовками:

```powershell
$env:BUILD_OUTPUT_DIR = 'dist'
$env:E2E_EXTERNAL_SERVER = '1'
$env:E2E_BASE_PATH = '/'
$env:MVP_E2E_ORIGIN = 'http://127.0.0.1:4325'
$env:E2E_RELEASE_HEADERS = '1'
pnpm exec playwright test --config=playwright.mvp.config.ts --workers=1 --update-snapshots=none
```

Legacy v2→MVP upgrade test дополнительно требует `MVP_LEGACY_ARTIFACT` — отдельный full artifact. Его можно получить штатным `build:full` в другом `BUILD_OUTPUT_DIR`, затем обязательно вернуть `dist` и выполнить `release:build`. Не публиковать full artifact. Без этого env конкретный legacy upgrade честно пропускается; в RUN5 он реально выполнен с отдельным full artifact. Стандартный `test:e2e:production-smoke` применяет Astro preview и пропускает только отдельный HTTP-policy test; для CSP необходим `release:preview`.

Сохранить проверенный `dist`, SHA256 manifest, исходный commit, журнал и rollback-копию **до** публикации. Готовый RUN5 artifact и receipts находятся во внешнем evidence, не в Git. Генерируемые `_headers`/`sw.js` не редактировать вручную и не удалять прежние кэши.

## Публикация — только после отдельного разрешения

1. Восстановить Cloudflare login официальным локальным способом; секреты не отправлять в чат и не помещать в repository. Прочитать список проектов и точный project ID/name, production branch, build command/output, domains, environment variable names/публичные значения, тариф и текущий deployment. `electrotutor` пока является кандидатом имени по существующему pages.dev; подтвердить его списком аккаунта.
2. Проверить и при отдельном разрешении приостановить автоматические production/preview Cloudflare Git deployments на время ручного выпуска, чтобы старый queued build не перезаписал проверенный артефакт. Push main также запускает сохранённый GitHub Pages workflow; не смешивать эти два канала. Никакие auto-deploy settings в RUN5 не изменялись.
3. Закрыть ручные device/accessibility и owner legal applicability checks ниже. Получить разрешение на конкретный commit/artifact/проект и deployment; merge/push разрешаются отдельно.
4. Самый короткий независимый от backend путь — загрузить **уже проверенный артефакт** Wrangler в существующий Pages project. CLI сейчас не установлен; pinned optional prerequisite/Node/auth описаны в `scripts/release-target.json`. Следующие команды **в RUN5 не запускались**. `pnpm dlx` загрузит CLI при будущем разрешённом исполнении.

```powershell
$releaseTarget = Get-Content scripts/release-target.json -Raw | ConvertFrom-Json
$wranglerVersion = $releaseTarget.publicationTool.version
pnpm dlx "wrangler@$wranglerVersion" --version
pnpm dlx "wrangler@$wranglerVersion" login
pnpm dlx "wrangler@$wranglerVersion" whoami
pnpm dlx "wrangler@$wranglerVersion" pages project list
# Продолжить только после подтверждения точного project и production branch.
pnpm dlx "wrangler@$wranglerVersion" pages deploy dist --project-name electrotutor --branch main
```

Команда последней строки — точный план для кандидата `electrotutor/main`; если read-only inventory покажет иные значения, сначала обновить target/runbook по подтверждённым данным. Не создавать второй project автоматически. В Git-connected Pages возможен manual Wrangler upload после отключения auto deployments; drag-and-drop для уже Git-connected проекта не поддерживается. Источники: [Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/), [Git integration / disable automatic deploys](https://developers.cloudflare.com/pages/configuration/git-integration/), [Wrangler commands](https://developers.cloudflare.com/workers/wrangler/commands/#deploy-1).

Альтернативный существующий Git путь: после проверки account build config использовать `SITE_URL=https://electrotutor.pages.dev`, `BASE_PATH=/`, `PUBLIC_MVP_MODE=true`, пустой API origin, `pnpm release:build`, output `dist`, совместимый pinned Node/pnpm. Изменение remote settings и push выполняются только по отдельному разрешению. Не обходить существующий backend CI скрытым skip/ослаблением проверок.

## Hosted smoke после разрешённой публикации

Проверить сам выбранный HTTPS hostname, не только deployment preview. Корневой переход ведёт на `/ru/`; все 7 страниц дают200, directURL/reload/Back/Forward работают. `/uk/`, каталог, аккаунт, административные/несуществующие пути дают настоящий404/noindex, а не SPA200. Top-level `404.html` обязателен: [Pages serving/SPA defaults](https://developers.cloudflare.com/pages/configuration/serving-pages/).

```powershell
curl.exe -I https://electrotutor.pages.dev/ru/
curl.exe -I https://electrotutor.pages.dev/uk/
curl.exe -I https://electrotutor.pages.dev/not-a-release-route/
curl.exe -I https://electrotutor.pages.dev/sw.js
curl.exe -I https://electrotutor.pages.dev/manifest.webmanifest
curl.exe https://electrotutor.pages.dev/robots.txt
curl.exe https://electrotutor.pages.dev/sitemap-index.xml
curl.exe https://electrotutor.pages.dev/sitemap-0.xml
```

Для 200/404/SW/manifest проверить фактические CSP/nosniff/frame/referrer/permissions/cache headers, корректный Content-Type, HTTPS certificate, отсутствие mixed content. Проверить `/_astro/<реальный hashed file>` immutable и повторную валидацию HTML/SW/manifest. Не вводить broad cache-everything rule, не отключать TLS/verification и не назначать HSTS includeSubDomains/preload непроверенным именам. Сверить HTTP body/manifest fingerprint с сохранённым artifact receipt; убедиться, что хост не инъецирует analytics/Zaraz/Rocket Loader, нарушающие CSP или privacy.

Robots разрешает обход всем, включая Googlebot/OAI-SearchBot; sitemap содержит только7публичных RU URL, canonical/OG едины с SITE_URL. Проверить 200 на запросы с этими User-Agent, затем реальные search-console/crawler results отдельно: подмена UA не доказывает доступ всех проверенных бот-IP и не гарантирует индексацию. Материал/258формул рендерится без JS. Скрытые страницы должны быть доступны crawler как404, не закрыты одним robots Disallow. Проверить account-level bot/WAF rules отдельно после login — они не видны в source.

В браузере выполнить 4схемы, изменить R/E/J, проверить знаки/сброс/сохранение, установки и обновление SW. Статическая модель не требует запуска/фиктивной динамики. Установленный старый клиент обновлять при сети и проверять `controllerchange`/текущий cache fingerprint; старые открытые вкладки не закрываются насильно.

## Ручной чек-лист перед публичным запуском

| Среда | Действия и ожидаемый результат | RUN5 |
|---|---|---|
| Windows Chrome/Edge | Открыть7страниц, клавиатура Tab/Enter/Home/End, обычное колесо, мышь/trackpad, Back/Forward; без ловушки фокуса/ошибок | Chromium автоматизирован; ручной Chrome/Edge NOT_RUN |
| Android Chrome | Реальный swipe/pan, четыре схемы/R/E/J/±/reset, поворот/короткий viewport/клавиатура; рядом схема, редактор и live readings | Физическое устройство NOT_RUN |
| iPhone Safari | Те же действия, Safari history, Add to Home Screen, повторный запуск standalone | Если недоступен — NOT_RUN |
| PWA install/offline | Установить, прогреть ресурсы, закрыть/открыть без сети; учебник/примеры/lab работают, скрытый URL404 | Browser SW/offline PASS; native install NOT_RUN |
| PWA update | На том же origin обновить старый клиент до нового artifact, проверить newSW/cache/новый контент, сохранность unrelated storage | Реальный legacy worker upgrade локально PASS; физический/hosted NOT_RUN |
| Windows Narrator | Стадия/заголовок объявляются один раз, skip-link/rail/input labels/ошибки/отрицательные токи понятны, restore/back не теряет фокус | Новый маршрут вручную NOT_RUN; старое acceptance не переиспользовано |

Receipt ручной приёмки содержит OS/browser/version, URL/commit, viewport/theme, шаги/результаты и снимки ошибок. Автоматический Chromium не называется физическим Android/iPhone и не заменяет Narrator.

## Контакты, данные, право и ограничения

Контакты утверждены владельцем: `mailto:aleksey.zabula@gmail.com`, `https://t.me/toemath`. Telegram GET200 с публичным профилем; email syntax/mailto/MX gmail проверены, доставка конкретному ящику NOT_RUN. Сообщения/письма не отправлялись.

В приложении нет auth/forms отправки данных, платежей, cookies/аналитики или внешних API. Guest practice form локальна. localStorage — тема/гостевой прогресс, sessionStorage — опыт в текущей вкладке, Cache Storage — офлайн публичные ресурсы; хост получает HTTP metadata. Контактные внешние сервисы действуют по своим правилам. Перед запуском владелец подтверждает фактические hosting analytics/logging/retention, применимые сведения оператора/юрисдикцию, права на материалы и необходимость terms/cookie wording. Наличие страницы privacy не доказывает юридическое соответствие; персональные данные/правовая квалификация не выдуманы. Отдельные terms/banner не добавлялись без подтверждённой необходимости.

Аудит:0HIGH/CRITICAL,4LOW/6MODERATE остаются. Production dependency graph содержит2LOW/1MODERATE; Astro/smol-toml package classification не равна browser-runtime. Astro transition values фиксированы, KaTeX получает trusted/generated numeric LaTeX; остальные findings относятся к trusted build/dev inputs. Никакая advisory не объявлена исправленной. Dependency maintenance отдельно с lockfile/full regression; dev/test servers не выставлять в Интернет. Точный список/первичные GHSA ссылки — SECURITY и внешний evidence.

## Откат

До первого запуска сохранить проверенный safe-MVP artifact/hash и сведения текущего deployment. Последующий откат — только к сохранённому совместимому **MVP**, не к прежнему full/UK/catalog artifact. [Pages rollback](https://developers.cloudflare.com/pages/configuration/rollbacks/) возвращает выбранный production deployment целиком; проверить его содержание до действия. Альтернатива — повторно загрузить сохранённый проверенный MVP тем же `pages deploy` после отдельного разрешения.

SW получает fingerprint по содержимому финального артефакта; при возврате к другому известному содержимому fingerprint отличается от отменяемого. Старые клиентские offline caches не отзываются мгновенно: требуется сеть/проверка update/controllerchange. Никаких SQL migrations/rollback, reset localStorage или удаления чужих caches. Если нового совместимого fallback ещё нет, не возвращать исторический full release под видом безопасного отката: остановить rollout и подготовить проверенный исправленный MVP. После rollback повторить HTTPS/404/SEO/CSP/cache/math smoke, записать точные deployment/commit/hash, сохранить диагностику.

## Собственный домен позже

Сначала подтвердить принадлежность имени и разрешение владельца. Добавить имя в Pages Custom domains до DNS; для subdomain внешнего DNS обычно нужен CNAME на `<project>.pages.dev`, для apex Cloudflare требует обслуживаемую зону. Эти действия и domain registration в RUN5 не выполняются. После выдачи TLS сменить SITE_URL, пересобрать/re-audit artifact, решить primary-host redirect/canonical и заново проверить SEO/PWA scope/storage: другой origin имеет отдельные caches/данные. Не обещать автоматический перенос локального прогресса между origins. Источник: [Custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/).
