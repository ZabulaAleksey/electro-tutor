# PRODUCTIZATION_REPORT — Electro Tutor RC1

Дата:2026-10-02. Derived report; status owner:docs/STAGES.md ET-RC1; machine receipt:docs/evidence/rc1/readiness.json. RESULT:RC1_READY locally; exact local-main integration receipt is finalized separately. No production deployment/publication.

## Current Product State

«Потенциал» / «Потенціал» теперь соединяет общую оболочку, учебный контент, практику, device-only progress/history/resume и Account/Booking/Session/inbox/reminders. Существующие physics/provider/server ownership contracts сохранены. Это законченный локальный кандидат с1 содержательным опубликованным уроком RU/UK и3 практическими лабораториями; широкий курс/AI/realtime/payments из roadmap не объявлен реализованным.

## User Journey

Публичный настоящий путь: `/` -> `/ru/` или `/uk/` -> topics -> mesh-current-method ->3 уровня объяснения/схема/формулы -> числовой ответ -> invalid/incorrect/correct feedback -> completion -> leave/reload -> resume step5 -> home/account history. Обе локали проверены без mocked backend. Завершение идемпотентно.

Authenticated настоящий путь: account -> provider registration -> OIDC callback -> server `/me` -> own Student profile -> опубликованный урок -> completion в authenticated namespace -> reload -> account summary -> logout с обычным provider confirmation -> guest без account history -> login -> тот же progress/settings/empty inbox. Реальный Keycloak26.7.2/API/PostgreSQL17.6,1 PASS; fake API не использован. Signup не выдаёт Tutor capability (403), unowned profile скрыт404.

Reminders составляют отдельный реально выполненный Booking -> due worker -> localized student inbox -> mark-read/reload path; он прошёл fresh reconciliation до productization. Timezone/settings RU/UK и чужой/anonymous доступ проверены. Не смешиваем этот acceptance с mock error matrix или не запускаем неизменный campaign ради повторного PASS.

## Product Shell

Home объясняет учебный путь и ведёт к опубликованному уроку/каталогу. Общая desktop/mobile navigation содержит Account; home/account — progress/resume. Profiles, offers/bookings/history, reminders settings и inbox находятся в account; protected media-less Session — отдельный participant-only lesson screen. Theme/language/install/preferences доступны через существующий shell. Отдельный новый onboarding wizard не нужен для текущего простого учебного пути. Пустые/private/unavailable состояния честны.

## Content Readiness

Published: один авторский mesh-current-method lesson в RU/UK. Цель — получить токи методом контурных токов; содержательная часть включает5 шагов,3 глубины объяснения, схемы, формулы и worked example. Практика I3=I1−I2=24/11 A с±0.03 A, decimal comma/dot; есть feedback/result/completion/save/resume. Circular diagram, star-neutral и transmission-line — полноценные bounded numerical tools для практики, не отдельные законченные курсы. Future catalog entries не публикуют fake lessons; demo/placeholder не считается production course. Content publication/MDX parity audit PASS.

## Routes

Каждая строка ниже существует в обеих локалях (`/{lang}` = `/ru` и `/uk`); всего24 localized routes + root redirect. Все маршруты прошли автоматический semantic/responsive audit; внутренние ссылки разрешаются, unknown route возвращает настоящий404.

| Route | Screen / purpose / next action |
|---|---|
| `/` | Redirect к declared default `/ru/` |
| `/{lang}/` | Landing/home, catalog/lesson/resume |
| `/{lang}/topics/` | Catalog, опубликованный lesson или честный unavailable |
| `/{lang}/topics/dc/mesh-current-method/` | Authored lesson/practice/result/resume; next -> catalog/labs |
| `/{lang}/interactive/` | Lab menu; legacy circular query state intentionally retained |
| `/{lang}/interactive/circular-diagram/` | Circular lab/share/history |
| `/{lang}/interactive/star-neutral/` | Star phasor lab |
| `/{lang}/interactive/transmission-line/` | Real WASM/Worker/Canvas line lab |
| `/{lang}/account/` | Auth/profiles/Booking/history/inbox/reminder settings/progress/logout |
| `/{lang}/lesson/` | Public entry, protected Booking Access/Session only after server authority |
| `/{lang}/classroom/` | Existing optional public Jitsi adapter; not private production RTC |
| `/{lang}/services/` | Optional configured scheduling or honest unavailable/local next link |
| `/{lang}/contacts/` | Honest unavailable contacts + catalog/account next links |

Orphan account navigation and disabled next-lesson dead end corrected. Dedicated circular route and legacy interactive query compatibility intentionally coexist: existing shared links must survive. Classroom/Session differ by approved provider and authority boundary; they are not silently merged or deleted. No obsolete live user route removed without evidence.

## UX/UI

Existing design system retained: shared layout/cards/forms/buttons/spacing and approved RU/UK terminology. New practice input/actions/summary have44px targets and mobile reflow. Account/profile unavailable copy is product-level; services/contacts no longer ask users to interpret provider/DEV placeholders. Loading/identity checking/error/no-data states available. Dark main CTA contrast corrected; small accent text follows accessible mix. Built visible HTML contains no Stage IDs/DEV/TODO/mock placeholders. No sweeping translation/refactor.

## Responsive

All24 routes visited at desktop1440×900, tablet768×1024, mobile390×844. No horizontal overflow, missing H1, duplicate IDs, missing ARIA references, unnamed visible form controls or browser exceptions. Existing diagrams/real Canvas/WASM mobile tests retained. Mobile menu supports keyboard/next route. This is browser viewport automation, not a claim about every physical device.

## Accessibility

Semantic/control-name/ARIA-reference checks; keyboard/focus-visible, theme, dialog label/modal focus/Escape/return focus, mobile navigation, live feedback, reduced-motion; bounded computed sRGB text/CTA contrast light/dark4.5 or3 large text. Existing Session ARIA/keyboard/security state cases PASS. Narrator UA-19 and RU/UK voice already owner-confirmed PASS; protected Session announcements/focus unchanged, no repeat. Not a whole-product WCAG certification; no invented manual gate.

## Auth

Provider-owned signup/login and opaque server session, exact OIDC trust, CSRF/account scope retained. Ordinary signup creates Student only; Tutor remains trusted grant. Logout confirms at provider, revokes own session, returns home. Real repeated login restores own browser progress and account UI; anonymous history does not display authenticated lesson record. Production HTTPS IAM topology is separate deployment work.

## Progress

Versioned4096-byte bounded record, only published lesson ID, monotonic highestStep, idempotent completedAt. Guest and trusted issuer+subject-hash stores separated; no silent guest migration. No PII/token/password/email. Async identity-loading blocks answer writes until namespace resolution; regression prevents fast guest completion during delayed signed-in `/me`. Malformed nested/oversized/quota/denied storage gives truthful unavailable and preserves corrupt raw data. Browser/device-only persistence explicitly labelled; no cross-device/cloud promise.

## Notifications

Inbox/settings UI integrated in local main since19c6ea2: `/ru/account/`, `/uk/account/`, `[data-notifications]`, `[data-reminder-settings]`, migration0014. Current reconciliation live profiles7/inbox1/reminder1 PASS and PG83/no skips; timer/quiet-hours/DST/15-minute grace/cancellation/worker retries/ownership tests retain accepted policy. Defaults24h/1h ON,15m OFF; confirmed IANA zone, quiet hours OFF. Failed save preserves form and retries; request timeout includes external cancellation. No Web Push permission request exists: in-app inbox/PWA installation is not push messaging. Adding push/Telegram is future scope, not current manual acceptance.

## Error Handling

Backend/auth unavailable and10s timeout, invalid/malformed response, expired/stale session, failed save/reminder retry, storage unavailable, empty results and server-denied access mapped to localized product states. Raw JSON/internal errors stay hidden; private offers/Session/inbox clear on expiry and ignore late responses. Existing install/SW registration failure handling is bounded. Error mocks explicitly exercise failures; real public learning and signup provide actual consumer acceptance.

## Security

Bounded pass: auth/account/profile/Booking/Session/inbox ownership, 403 escalation/404 masking, OIDC/cookie/CSRF/ACL regressions; no client authority/secrets, redacted logs; private/no-store API responses never cached. SHA-256 browser namespace is separation, not encryption/XSS defense. Compatible dependency patches close current frontend findings9 high plus5 residual moderate and Python13 PyJWT advisories; final audits0. No production pentest/host OS certification claimed. Original data-bearing DB/MathMorph preserved.

## Performance

Artifact sanity inventory recorded in performance.json: total build about2.5 MB across121 assets; all JS about653 KB raw/201 KB gzip across routes, not initial payload. Largest Mesh island about276 KB raw/81 KB gzip, shared React client184 KB/57 KB gzip. Home has no React island; pure DOM summary avoids initial React hydration. Fonts/math assets dominate remaining size; no huge photos/video bundles. Existing nonblocking font-loading test PASS. Managed preview ready in36–64ms on warm final runs; no unsupported global latency/SLO claim or speculative micro-optimization.

## PWA

Existing architecture completed without native wrapper: manifest standalone/root/base-aware start/scope,192/512 raster plus maskable icons, existing v2 SW update/migration, public offline navigation and actual visited offline WASM lab. Chromium CDP installabilityErrors empty. API/auth/checkout/payments/private/no-store cached paths forbidden. Unvisited unavailable lesson routes remain honest offline fallback. OS installation/Safari/Firefox not inferred; automated release criteria pass, no additional mandatory manual gate.

## Production Build

Frozen pnpm11.23 and uv locks; production-like static25 pages/24 localized routes/121 files,394 paired locale keys, publication/locales/site/WASM parity PASS. Config contract separates public API URL from secrets, safe missing-provider state. Existing API non-root Docker image built from locked runtime; isolated live `/health/live` and `/health/ready`200 after migration0014. No dependence on foreign project process/data; owned services stopped finally. This does not mean public hosting/production IAM deployed. Startup workflow uses exact configured provider/database, not fake login.

## Feature Flags / DEV Cleanup

| Input | Classification / rationale |
|---|---|
| `import.meta.env.DEV` line performance details | development diagnostics; removed by production build |
| `ET_DEBUG`, `ET_DOCS_ENABLED` | local developer configuration, false defaults; no exposed production debug claim |
| `ET_ENVIRONMENT`, `ET_TEST_POSTGRES_PORT`, `ET_TEST_OIDC_PORT` | explicit runtime/test safety inputs, exact constrained guards; not random product feature flags |
| `PUBLIC_API_ORIGIN` | production/public deployment config, no secret |
| `PUBLIC_CALCOM_URL` | optional scheduling integration, validated HTTPS + honest unavailable |
| `BASE_URL` / `BASE_PATH` | static distribution topology; verified root and subpath |

No executable stale experimental product flags/TODO switches found in bounded source scan. Legacy components share active routes/compatibility; absence of use was not proven, so no blind deletion. Generated WASM glue warnings retained; source/artifact parity preserved.

## Remaining Technical Debt

1. ET-18.2 public staging/hosting/HTTPS IAM/API ingress, backup/recovery/operator budget and deployment DB plan. Original legacy SQL caller/catalog drift is preserved, never repaired opportunistically.
2. Device-only progress and one authored lesson limit breadth/cross-device use; cloud sync/large course require separate SPEC and approval.
3. Optional public Jitsi is not protected production RTC; Cal.com not silently authoritative alongside immutable internal Booking.
4. Cross-browser/device certification, extended contrast audit, architecture DTO/import boundary cleanup and production observability remain bounded future work. They are not fabricated current manual obligations.

## Remaining Manual Gates

REAL_MANUAL_REMAINING:NONE. Narrator/UA-19 PASS, RU/UK voice PASS and ET-14.2 product policy ACCEPTED are recorded in canonical evidence. No repeat requested. All RC1 blockers discovered here were agent-automatable and resolved.

## RC1 Readiness

RC1_READY locally. Frontend189, backend208, real PG83/no skips, full Chromium128/6 expected dedicated-live skips, genuine signup/return1, base-path5; lint/typecheck/validators/build/health/route/mobile/a11y/error/PWA/security audit PASS. Canonical state, requirements-ledger, traceability, ADR-035, TESTING, dependency/security/design/architecture/data/API/context/README updated; existing accepted tests/manual decisions retained. No push/deploy/release publication/worktree deletion. Next concrete stage: ET-18.2 bounded staging Web/PWA hosting/runtime/HTTPS IAM/backup plan.
