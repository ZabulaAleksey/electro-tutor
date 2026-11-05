# Безопасность и границы доверия

## Текущая публичная доставка RUN6

2026-11-05: owner-authorized fresh static MVP source3267948 deployed to electrotutor.pages.dev, canonical 7ba2859a-4b84-449a-8550-ba7084b9f3ef. Seven RU indexed pages, bounded hidden-route404 handler, CSP/security headers, no backend dependency or public catalogue expansion. Authenticated API confirms unchanged deployment settings/fail_open=false in both environments; primary HTTP and browser/PWA/math checks PASS. Earlier delivery entries below are historical; no architecture/security policy mutation. Evidence: STAGES ET-NAV-006, TESTING and docs/evidence/run6-production-deployment.json.


## RUN6 — граница публичного режима и внешнего видео

Unified index is filtered before SSR serialization; public related tools/variants are empty. Browser behavior derives targets from trusted rendered links, validates stage enum and never inserts search input as HTML. No public hidden route/auth/backend graph, no relaxed CSP, no added API/secret/config/provisioning. Restored guest Jitsi link is full-only and explicitly external; public MVP camera/mic/frame/media prohibitions stay intact. Real two-client provider admission refused membersOnly, no conference/peer/RTP; no auth bypass. Protected LessonSession media remains unimplemented. See notes/run6-video-diagnosis.md and structured redacted evidence; current owner actions in STAGES. The old unpinned third-party top-level Jitsi SDK trust boundary is not declared fixed.

## CDN-кеш: корректный404 подтверждён на основном домене

REL5-CACHE CLOSED / verified2026-11-05: production 41affa11-3f56-4193-baa9-aebb40b79ec9 (https://electrotutor.pages.dev/), sourcea56fcaa; generated bounded Pages404 handler for /uk and /ru/interactive trees, four non-overlapping invocation rules. Primary24raw GET/HEAD/query/index/nested/oldETag/Range checks404/no Location/no old body, marker v1/no-store/noindex/all5security headers; six bot/browserUA+oldETag checks404;35historic hidden routes404. Public7pages200/CSP/SEO and87served assets exact-match checked direct artifact;2HTML only Astro uid and sw.js only VERSION differ (exact normalized equality). Current automatic deployment:3targeted accepted Playwright PASS (route/lab/PWA). Earlier direct-upload13/13+preview13/13,16independent math and actual worker activation remain prior source-equivalent evidence, not fresh reruns for41affa11. Unit458/59files, Astro3180errors0warnings3oldhints, ESLint/build/guards PASS. No push/DNS/kernel/backend/dependency/full-source or billing-plan changes; owner explicitly approved preview+production fail_open=false and GET confirmed only2fields changed. Physical devices/native install/Narrator/legal remain outside this cache fix; quota exhaustion may affect project availability and was not forced. Code integration a56fcaa is merged and pushed to main; local working fix branch deleted; earlier source branches retained.

Предыдущие checkpoints ниже исторические; статический вариант59cfcc84 не закрыл primary gate и не считается успешным исправлением.


Owner explicit merge/push/delete instruction2026-11-05 completed: clean ff main373f5b8→a56fcaa, normal origin/main48c3fef→a56fcaa confirmed by ls-remote; local fix/mvp-cdn-hidden-routes safely deleted after reachability/push checks, no remote fix branch existed. Other source branches/root worktree/files preserved. Push-triggered Cloudflare Git deployment41affa11/sourcea56fcaa success/canonical confirmed, no manual redeploy/settings/DNS/kernel change. Post-push primary24HTTP hidden404/7public200/CSP/SEO and3accepted browser lab/route/PWA scenarios PASS. Strict byte comparator found3different files:87exact served matches; two HTML only Astro uid differ and sw.js only VERSION, exact normalized equality proved. No numerical/content/client-JS/CSS difference. Previous detailed458unit/16math evidence retained, not unnecessarily rerun. GitHub Actions41938077938 completed FAILURE on2026-11-05T00:15:16Z: production MVP visual suite lacks48Linux golden files,12visual scenarios FAIL;13functional PASS/2conditional skips. Backend gates/types/lint/458unit/full root264PASS+6skips and both builds PASS. GitHub Pages deploy skipped; independent Cloudflare41affa11 remains live. Documentation-only328c812 [skip ci] receipt was merged/pushed, transient branches removed and remote SHA verified; this CI-status audit is separate/local, no new push/deploy.

## REL5-CACHE — bounded static route policy

REL5-CACHE / FR-370..372: four generated MVP-only static proxies to absent /__mvp_not_found__ with mandatory404.html/exact-policy/collision guards and no-store/noindex. No Function/Worker/new dependency/paid resource, no DNS/push/kernel/full-source change. Fresh92file artifact differs from accepted RUN5 only _redirects(new), _headers and sw.js fingerprint; other89files byte identical. Global CSP byte policy unchanged. Real Pages preview24GET/HEAD variants404/no Location/no old body plus all90served bytes match; seven public200/CSP/SEO verified. Runtime fail_open=true inspected read-only; no Functions means no compute quota fallback is introduced. No unsupported purge. Primary verification pending.

## First hosted RUN5 — partial route restriction

Owner-authorized direct publish2026-11-05 produced canonical8e96428d/source373f5b8 without push/DNS/settings changes. Real primary HTTP enforces exact hashed-script CSP, nosniff/frame/referrer/permissions and cache policy; actual browser16math/negativeinput/theme/offline scenarios have0unexpectedCSP/app errors/externalapprequests; arbitrary untrusted inline blocked.90served bytes equal reviewed artifact. Old retained /uk/ and /ru/interactive/ still200/noindex on primary; all-new alias404. This is a release restriction defect, not evidence of newly leaked secrets/private data or source deletion. No false full-hidden-route PASS. Current SW hides those URLs after control, but build/SW are not revocation of historical public cache. Provider NEL/Report-To headers observed; hosting network error reporting is distinct from application analytics and remains within owner hosting-policy review. No unsupported purge/credential mutation/source workaround.

## Восстановленный OAuth доступ2026-11-05

Owner explicitly authorized pinned Wrangler4.157.0 installation and official login; browser grant and CLI/whoami/GET accounts+Pages200 verified. Read scopes account/user/zone and the only Pages OAuth catalog scope pages:write were requested; resource inventory performed GET only. No worker/dns-write scopes requested, no deploy/settings/DNS changes. Credentials stored by official CLI; reports contain no token values. Historical expired-OAuth notes below are superseded for access availability; billing/retention/account-wide policy/hosted new-MVP acceptance remain unverified. Product dependency/lockfile/runtime boundaries unchanged.

## RUN5 — воспроизводимая HTTP-policy и актуальный audit

CSP содержит только self+4вычисляемых SHA256 для scripts, script attributes/eval/внешние script origins запрещены; base/object/form/frame/media none, worker/connect/manifest self. KaTeX требует style-src unsafe-inline и один data:font; это не разрешение data scripts. Frame-ancestors/DENY, nosniff, referrer, permissions включены в Pages `_headers`, точные страницы/SW/manifest revalidate, только hashed _astro immutable. Ни HSTS includeSubDomains/preload, ни общие cache-everything, ни cookies/analytics/providers не добавлены. Совместимость проверена actual HTTP browser27/27,0CSP violations,0external runtime requests; hosted enforcement NOT_RUN. Синтетический SW hidden404 — постоянный inert HTML/noindex без унаследованного host CSP; P3 hardening, не доказанная эксплуатация, будущая узкая задача.

Artifact guards сканируют HTML/JS/JSON/CSS/SVG/XML/TXT/webmanifest, high-signal credentials/absolute host paths/private API, отклоняют maps/Functions/backend worker, проверяют точный graph и фактические inline hashes. Это детерминированный regression guard плюс просмотр source, не математическое доказательство отсутствия любого секрета. Новый input surface не вводится; прежние numeric/context bounds сохранены.

Network audit: **4LOW/6MODERATE/0HIGH/0CRITICAL**, HIGH gate exit0; полный и --prod audit exit1 из-за оставшихся findings, --prod2LOW/1MODERATE. Версии/lockfile не менялись; ничего не объявлено исправленным. Последний audit не следует путать с историческими4LOW/5MODERATE. Public artifact не содержит node_modules/runtime TOML/glob/mock server.

| Package / primary advisory | Applicability to current static MVP |
|---|---|
| Astro7.3.2 [GHSA-mpr7-6m5w-76rw](https://github.com/advisories/GHSA-mpr7-6m5w-76rw), LOW | Fixed source transition duration; advisory needs attacker-derived animation values; no such input path found. Affected version remains; patched>=7.3.3. |
| KaTeX0.16.47 [GHSA-238p-pmpm-9mq7](https://github.com/advisories/GHSA-238p-pmpm-9mq7), LOW | Requires separate prototype pollution plus untrusted expression/options; source-only/generated numeric LaTeX and literal options. Affected version remains, no patch claim. |
| smol-toml1.7.1 [GHSA-r4xh-jqrq-34v2](https://github.com/advisories/GHSA-r4xh-jqrq-34v2), MODERATE | Build/config trusted TOML only, no public parser/upload/runtime. |
| @vitest/mocker4.1.11 [GHSA-qxg6-89mg-rqv8](https://github.com/advisories/GHSA-qxg6-89mg-rqv8), [GHSA-xp26-3454-mjgp](https://github.com/advisories/GHSA-xp26-3454-mjgp),2MODERATE | Development server/WebSocket precondition; release uses vitest run, no server deployed. |
| fast-uri3.1.8 [GHSA-w74x-v6f9-j3xg](https://github.com/advisories/GHSA-w74x-v6f9-j3xg), [GHSA-xhq7-xmqj-769h](https://github.com/advisories/GHSA-xhq7-xmqj-769h), [GHSA-wjr9-j795-jxcr](https://github.com/advisories/GHSA-wjr9-j795-jxcr), [GHSA-333x-w4r6-6crp](https://github.com/advisories/GHSA-333x-w4r6-6crp),2LOW2MODERATE | Check/language-server/AJV tools, absent from static runtime. Exact override3.1.8 now affected, follow-up>=3.1.9 after compatible lock/full regression. |
| minimatch10.2.5 [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249), MODERATE | Build/dev trusted glob patterns, no attacker pattern endpoint. |

Security review found no demonstrated exploit precondition in the current static path; this is bounded applicability assessment, not patch or universal safety. Follow-up dependency maintenance tracked in ET-REL-005; dev servers stay loopback-only. Expired Cloudflare OAuth/unknown bot/WAF/analytics/domain/env configuration are separate owner gates; no token refresh, secret output or remote mutation. Contacts checked by GET/MX only, no outbound messages.

## RUN4 — публичная сборочная граница и PWA upgrade

MVP-флаг управляет только составом сборки. В клиенте нет секретов/приватного API origin/identity fetch, удалённых шрифтов/аналитики или коммерческих путей. src/mvp не импортирует bilingual collection/full shell/catalog. Точный состав HTML и emitted JS проверяется audit-built-mvp; скрытые страницы дают404/noindex и не входят в sitemap. robots разрешает повторный обход404, чтобы старые URL могли выпасть из индекса после будущего развёртывания. Это не доступ к приватной информации и не замена авторизации.

Иконки ограничены5known filenames до readFile. sessionStorage UI-контекста ограничен4096символами, известными topology/keys и32символами каждого raw value; некорректные записи игнорируются, raw draft валидирует прежний solver. Гостевая практика использует только прежний guest key, не читает authenticated namespaces. При запрете storage расчёт остаётся рабочим. Нет изменений backend/OIDC/DB/Cloudflare.

Worker перехватывает только same-origin GET под registration scope и точные публичные страницы/assets. Не кеширует API/secret/error/private/no-store/query assets; hidden navigation404/noindex и online/offline. При upgrade удаляются только entries собственной scope из legacy potential-pwa-vN и same-scope MVP namespaces; unrelated caches/внешниеscope/localStorage сохраняются. Уже открытая нерелизная вкладка не закрывается принудительно; следующий navigation/reload скрытого URL получает404. Mode не является revocation/IAM. Контактные email/Telegram разрешены владельцем, не секреты; оператор/юрисдикция/условия hosting logging требуют отдельной проверки перед релизом, если применимо. Существующие CSP и hosted/manual ограничения не объявляются закрытыми этим RUN4.

## RUN3D — локальная численная поверхность

Новый mesh solver и редактор работают локально без API/storage/auth/provider. Внешние raw значения ограничены32символами, strict finite numeric parsing/ranges и максимумом3неизвестных; invalid/rank/numerical errors fail closed без старого результата. KaTeX получает только генерируемые числовые выражения/фиксированные symbols, raw input не конкатенируется в HTML/LaTeX. Source values не выполняются как code. Дополнительные зависимости, secrets, сетевые endpoints и service-worker policy не вводились.

ET-PAN-004: новые изображения созданы для проекта, оптимизированы локально; manifest содержит происхождение/контрольные суммы, без приватных путей и STUD-материалов. Фотоиллюстрации не являются результатом расчёта. Ластик имеет общий бюджет вычислений/памяти, при превышении отменяет всё действие и сохраняет исходные штрихи. Draft блокирует смену инструмента/истории до завершения или отмены. Новых API, auth/PKCE, credentials, service-worker policy и серверных провайдеров нет. Контролируемая видеосвязь BLOCKED: доступен только public Jitsi adapter; tenant/token/moderator path не настроен, two-client acceptance NOT_RUN.

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
| Profiles / authorization (`ET-09.4c..e` verified) | profile-driven role escalation, IDOR/BOLA, blanket tutor access | separate auth/profile DB roles; transaction-local redacted session credential; DB-derived owner/audit actor; auth→owner→payload validation; `/me` response без internal owner key; private profile routes/tables; Tutor grant lock + atomic create/audit; exact local two-user terminal harness; privileged E2E CLI bounded to the two canonical managed subjects | cross-account, malformed payload, old-signature, ACL/membership, expiry/logout, pool/cancellation и exact downgrade negatives PASS; security review GO; live Keycloak/API/PostgreSQL/browser terminal path PASS; public directory и tenant/member data отсутствуют |
| Audit (`ET-09.4a`, verified foundation) | authority mutation без evidence, audit tampering или PII leak | append-only PostgreSQL AuditEvent + shared UoW; runtime column INSERT/table SELECT, без audit UPDATE/DELETE/TRUNCATE; DB/audit failure rolls back transaction | action-specific scalar metadata allowlist, 16-key/4096-byte bounds; tokens, secrets, email, display name и full bodies запрещены |
| TutorOffer / Booking (`ET-10.1a..d`, completed) | client price/owner/state spoof, self/foreign booking, IDOR, double/overlap accept, stale offer, late private response after logout, ambiguous retry duplication, false external-payment claim | active session + server-derived participants; exact tutor booking capability; immutable server snapshot; operation idempotency retained across status `0`/5xx; optimistic versions; deterministic participant locks + overlap recheck; session-generation invalidation on `401`; atomic redacted audit; strict private HTTP precedence/OpenAPI/CORS | three-account real HTTP/PostgreSQL negatives, revoke persistence and browser session-expiry/late-response tests PASS; Account IDs/title/payment details excluded from audit; exact live profiles `7/2`, booking `6/3` and identity-change `6/3` phases passed with cleanup and exit `0`; EXTERNAL settlement explicitly unverified; payment/provider/calendar remain absent |
| LessonAccessGrant (`ET-10.2`) | forged participant/payment/capability input, foreign Booking enumeration, access outside window, accept-without-grant, check/revoke race, public Jitsi confused with protected access | one server-issued grant per accepted FREE/EXTERNAL Booking; participant resolved from session + immutable Booking; DB-time half-open policy; one-way revoke; exact `LESSON_SHELL_ENTER`; atomic Booking transition/grant/audit; session-bound functions and no direct DML/cache/fallback | third authenticated user must receive masked 404; start/end/revoke and inconsistent-grant paths fail closed; audit excludes Account IDs, title, money, session/token and provider data; PLATFORM/media/admin grant paths remain absent |
| LessonSession (`ET-10.3`, local implementation) | foreign Session IDOR, forged tutor role/transition, stale authorization after lock wait, cross-domain key/replay, CSRF simple POST, unaudited transition, stale private DOM after 401 | active application session + immutable Booking participant + active grant rechecked at fresh DB time; Booking→grant→Session locks; tutor-only server-derived START/END; exact request-side Origin/JSON/key; masked foreign 404; private fixed-search-path functions and no direct Session/ledger SELECT/DML; mutation and redacted audit in one UoW | opaque fragment is not authority; no Account IDs/media tokens/title/money in Session DTO; expired grant closes history read without fake persisted ENDED; late responses and hidden DOM metadata cleared; isolated live auth/Session browser gate passed with anonymous 401 and third-account 404; prior user-accepted manual RU/UK voice/screen-reader acceptance PASS (TESTING/UA-19) |
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

`ET-10.1` carves out a permanent provider-independent path. `FREE` creates no
money state. `EXTERNAL` stores only an informational agreed amount/currency
snapshot and never creates Payment, provider transaction, paid/refund flag or
platform guarantee. UI must state this distinction in RU/UK.

Offer/Booking writes fail closed on invalid session/capability/resource,
idempotency mismatch, stale version, server-time boundary, overlap or audit
failure. Foreign/draft/retired resources are non-disclosing; client-selected
Account IDs and snapshot fields are rejected. Audit excludes offer title,
profile fields, session material, free-text reason and external settlement data.

Platform payments не реализованы. Требования находятся в
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

## ET-14.2 reminder ownership

Настройки доступны только через текущую application session; PUT требует точный разрешённый Origin. Client не передаёт Account ID для чтения или записи настроек. Таблицы reminder_settings и booking_reminders закрыты от прямого runtime DML; узкие security-definer функции привязывают операции к session Account или проверенному Booking transition. Worker повторно проверяет состояние Booking и 15-minute grace перед записью в ET-14.1 outbox; cancellation/settings change инвалидируют queued intent. Unique business keys и row locks исключают duplicate при двух workers. Real PostgreSQL тесты проверили foreign/anonymous access, ACL, stale cancellation и concurrency; isolated live browser подтвердил foreign notification read 404. Telegram и другие внешние каналы отсутствуют в ET-14.2; их privacy/credential gate относится к ET-14.3.
## Проверка изменений

- поиск случайно добавленных секретов и приватных URL;
- review внешних origins и переменных окружения;
- негативные тесты недоверенного ввода;
- проверка client bundle на отсутствие server secrets;
- проверка обновления service worker, изоляции cache namespace и запрета
  кэширования приватных/ошибочных ответов;
- для webhook — поддельная подпись, replay и повтор события;
- фиксация оставшегося риска в выбранном record `STAGES.md`.

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

## RC1 bounded product pass

Provider signup produces ordinary student identity only; actual new-user Tutor PUT403 and unowned profile404 tested. Existing Account/Booking/Session/notification ownership, cookie/CSRF/OIDC negatives and least-privilege real DB regression retained. Test-only58181 is opt-in only for test profile/exact realm/loopback; local/CI/arbitrary hosts/ports rejected. Owned disposable infrastructure does not touch original data or other repositories.

Learning namespace derives from trusted successful `/me` issuer+subject, never client email/tutor flags. Browser SHA-256 key is a separation mechanism, not encryption or protection from same-device developer tools/XSS. Record contains lesson ID/step/timestamps/completion only. Guest records do not auto-merge. Corrupt/oversized/malformed records preserve raw evidence and fail closed; denied/quota storage cannot claim persisted completion. Pending identity cannot write guest completion for a signed-in learner.

Public API config rejects credentialed/nonloopback HTTP URLs; no private API caching/raw exceptions/JSON exposed. Request deadlines preserve external abort. Existing production build removes DEV-only performance details. Compatible patch graph: fast-uri3.1.8, brace-expansion1.1.21/5.0.12, devalue5.9.3, Vitest4.1.11; PyJWT2.15.1 (minimum2.14). Fresh frontend audit0 and applicable Python runtime pip-audit0. No broad external pentest/OS vulnerability certification or production deployment claim. Original DB compatibility is retained separate debt.

## Локальные научные лаборатории / ET-LABS-002

JSON импорты Fourier и линий остаются в браузере: размер/число точек/узлов, типы, конечность и физические диапазоны проверяются до применения. Нет HTML/SVG injection, удалённых импортов, исполнения кода либо передачи файлов. Расчёт линий выполняется в отдельном Worker с ограничениями событий/шагов/вложенности; неподдерживаемая или слишком жёсткая задача завершается видимой ошибкой. Экспортируются только собственные данные/доверенный SVG приложения. Проверка import/resource boundaries выполнена readonly review; production credentials и source projects не изменялись.

## ET-UX-003 — локальные документы и Android debug

Доска валидирует весь bounded payload атомарно и не обрезает данные молча; ошибки чтения/квоты отображаются. Калькулятор не исполняет код. Android обслуживает только свои bundled HTTPS assets, запрещает file-access/mixed-content, не имеет JavaScript bridge/TLS bypass. File picker/export требуют системный выбор пользователем; blob экспорт ограничен своим origin и2MB. Debug package явно debuggable; release signing/store distribution не выполнены. Production secrets, OIDC/PKCE и MathMorph не изменены.

## ET-BEAM-001 — локальный JSON и numerical failure

Новый beam import ограничен200000символов/байт файла до parse, version1, конечными
числами, диапазонами длины/жёсткости/нагрузки,16участками/12опорами/32нагрузками.
Нормализатор создаёт только известные поля; чужие HTML/результаты/прототипы не
исполняются и не становятся authoritative state. Invalid import сохраняет схему.
Нестабильная/плохо обусловленная система не получает псевдо-реакций. Storage denial
даёт сообщение и сохраняет JSON download как доступный путь. Нет нового API,
телеметрии, внешнего provider, credentials, auth или worker/cache-policy change.

ET-CI-001 maintenance2026-10-30: exact c9a43fb GitHub41025558068 verify/deploy SUCCESS; certifi2026.10.23 locked runtime pip-audit0. Current Node audit HIGH gate passes with4LOW/5MODERATE (earlier RC1 audit-zero receipt is historical). CI browser uses immutable Noble image, only locked core read-only, loopback endpoint and unconditional cleanup;5negative contract tests PASS. Temporary public-diagram-only PNG diagnostics removed after use; no ongoing new artifact upload. Details and boundary evidence — STAGES/TESTING/DEPENDENCIES.
