# Live tutoring session — reconciliation draft

Статус: **DRAFT / architecture-reconciliation**, 2026-09-27. Этот документ
описывает предлагаемое расширение, а не меняет утверждённые
`lesson-access-grants.spec.md`, `lesson-sessions.spec.md` или их evidence.
Media, invite, presence и hosted acceptance **не реализованы**.

Связи: `PLAT-004/005/008`, `ACCESS-002..004`, `SESSION-001`,
`RTC-001..005` platform SPEC; ADR-025/026/027/030; ET-10.3, ET-12.1..6.
Existing `rtc-provider-boundary.spec.md` относится только к публичному
кабинету. Предлагаемые требования ниже получают утверждённый статус только
после разрешения вопросов в §12 и согласования с canonical ROADMAP/STAGES.

## 1. Repository reconnaissance и collision map

| Существующий владелец | Подтверждённый контракт | Следствие для live tutoring |
|---|---|---|
| `Booking`, ET-10.1 | Immutable tutor/student `Account` IDs, offer title и UTC interval; accepted FREE/EXTERNAL booking, server-only participant policy | Ни URL, ни invite, ни RTC не назначают участника или урок |
| `LessonAccessGrant`, ET-10.2 | Один entitlement на accepted Booking, `LESSON_SHELL_ENTER`, окно `[starts_at - 15 min, ends_at)`, atomic revoke | Переиспользовать check; не называть media JWT этим grant и не расширять `LESSON_SHELL_V1` задним числом |
| `LessonSession`, ET-10.3 | Один row на Booking; `READY→ACTIVE→ENDED` tutor-only, pre-start `READY→CANCELLED`, derived `WINDOW_CLOSED`; текущая session+grant обязательны для private API | Media connection, lost network и iframe не создают Session truth и не меняют её state автоматически |
| Identity, ET-09.3/09.4 | OIDC `(issuer, subject)→Account`, opaque server session, private Student/Tutor profiles | Invite разрешает существующий `Account`; email не identity key; профиль даёт display name, не authority |
| `MeetingProvider`, ET-RTC-001 | Client-only public `join({room, displayName, host})`; `meet.jit.si`; имя/room задаёт браузер | Не использовать как защищённый media grant. Расширение требует отдельного server-side port и защищённого deployment |
| `/{lang}/lesson/` | Static RU/UK shell, `#booking`/ `#session`, private Access/Session API; public Jitsi отдельно | Добавить prejoin/media в этот shell; не создавать конкурирующую страницу с иной авторизацией |

Различие с исходным запросом: approved Session уже существует без media;
существующий Jitsi adapter обеспечивает только публичный кабинет; roadmap
считает LiveKit кандидатом для ET-12, а не выбранным provider. Поэтому
«создать Lesson Session» и «встроить текущий public Jitsi» не являются
начальными задачами. Сначала нужен provider security proof и версия политики
доступа. ET-10.3 остаётся `implemented_unverified` до UA-19.

## 2. Предлагаемая предметная граница

```text
Booking (participant IDs, schedule, cancellation)
  → LessonAccessGrant (lesson entitlement)
  → LessonSession (lifecycle, audit)
  → LessonJoinAuthorization (current app session OR scoped invite credential)
  → MediaJoinGrant (short-lived, one session/participant/endpoint/room)
  → RealtimeMediaProvider port → Jitsi adapter → controlled provider
  → normalized presence observations → attendance projection
```

Application owns identity, role, join window, lifecycle, attendance and audit.
Provider owns transport and provider-specific participant/media IDs. A logical
`Account`/Booking participant can have multiple `MediaEndpoint` instances;
endpoint ID is session-scoped and never substitutes for Account authority.
No `student_id`, tutor flag, display name, room or provider JWT supplied by the
browser is authoritative. Student and tutor permissions are calculated by the
backend from immutable Booking membership and server policy. A future observer
or assistant needs a separately versioned role/booking-membership contract.

Keep two ports with distinct responsibilities:

- Browser `MeetingProvider`: iframe lifecycle and normalized commands/events.
- Backend `RealtimeMediaProvider`: issue room-scoped participant access,
  provider capabilities, end/kick if supported, trusted presence ingestion.
  `create_session` is idempotent provider-room provisioning and never creates
  the domain `LessonSession`. Advertise unsupported capabilities explicitly.

Composition root selects the adapter. Domain DTOs and API errors must not
contain Jitsi SDK types. Provider room ID is a random opaque mapping to
`LessonSession.id`, never the Booking ID or user-facing link. Mapping/rotation
must be durable before issuing a token; provider outage cannot alter Booking or
LessonSession.

## 3. Identity and access paths

### Authenticated participant

Current opaque Electro Tutor session → DB-bound `Principal` → Booking
participant → active LessonAccessGrant → LessonSession policy → short-lived
MediaJoinGrant → provider descriptor. Existing `/bookings/me`, Access and
Session routes remain the authoritative path. Backend response may include
bounded lesson preview (title, time, tutor display name), scoped media
descriptor and capability codes, with `Cache-Control: no-store`.
Names come from server-owned Student/Tutor profiles. If a profile name is
absent, use a localized generic participant label plus a session-scoped
identifier; never ask the browser to invent an authoritative name or send
email to fill the gap.

### Invite for the existing student Account

`/join/<opaque-token>` → digest lookup of a random high-entropy bearer token
→ existing Booking student Account and Session → same entitlement/window checks
→ **scoped** invite credential → same MediaJoinGrant policy. Invite does not
create a new Account, OIDC identity or general Tutor application session.
Existing Session functions require an active application-session digest: a
guest-specific narrow DB authorization path or scoped session extension must
be designed with equivalent DB time, locks, runtime ACL and audit guarantees.
Guest credential must be rejected by `/me`, profile, booking mutation, tutor
and general account routes. It may authorize only the bound lesson and role.

Proposed `lesson_invites`: random UUID PK; unique `token_hash` (SHA-256 of
at least 256 random bits); `booking_id` FK; `student_account_id` FK equal to
the immutable Booking student; fixed role `student`; `valid_from`,
`expires_at`, nullable `revoked_at`/`consumed_at`; `created_at`,
`created_by_account_id`; policy version and optional max redemptions. Raw
token is shown once, never stored. Token lookup is constant-time at the
application boundary where applicable; uniformly redacted misses, rate limits
and bounded input length prevent useful enumeration.

Recommendation for MVP: a revocable, time-limited, multi-redemption invite
with per-redemption scoped credential, because link scanners and reconnect
can consume a strict single-use link. If single-use is required, consumption
must occur atomically on an explicit POST, not on GET/prefetch; replacement
and reconnect flow must already work. Initial GET must serve a generic,
no-external-assets page with `Referrer-Policy: no-referrer`; no private lesson
data or token is serialized into static HTML. Exchange token via a redacted
POST, replace the visible URL immediately after success, and keep resulting
credential out of localStorage. Initial URL can still appear in browser
history, proxies and recipient systems; edge/app logs and analytics must
redact it. Revoke stolen links and offer resend.

## 4. Grants, roles and time

`LessonAccessGrant` remains the persisted booking entitlement. Proposed
`MediaJoinGrant` is a short-lived server-issued provider credential or
descriptor bound to exact Session, Booking participant, role, random room,
endpoint, issued/expiry instants and minimal provider permissions. Recheck
current application/scoped invite credential and DB authorization on **every**
issue/refresh. Student can join and use allowed media controls; tutor can
start/end Session and receive only separately approved provider moderation.
No student token may gain moderator privilege by joining first. Provider JWT
signature, issuer, audience, room claim, expiry and role enforcement need real
provider negative tests; expiration of a JWT may not disconnect a participant
already connected, so revocation/end require a proven provider control path.
No email claim unless a selected provider demonstrably requires it.

Approved v1 window is `[starts_at - 15m, ends_at)` for both roles. New
configurable lead/late/extension/reconnect semantics require a **versioned**
Access+Session policy and migration; changing only media issuance would leave
the shell inaccessible. Recommended initial safe values are 15m before and
zero after for both roles, matching v1. A tutor-authorized extension, late
arrival, post-end reconnect, unfinished ACTIVE state and historical reads need
an approved follow-up contract before a nonzero grace is enabled. Use fresh
PostgreSQL time after resource locks. Any ambiguity fails closed.

Persisted Session states stay `READY|ACTIVE|ENDED|CANCELLED`. `invited`,
`connected`, `disconnected` and `reconnected` are participant presence;
`temporarily_disconnected` must not become a Session state. Derived
`WINDOW_CLOSED` is not a persisted completion. Authority to START/END stays
with the tutor through existing versioned commands. Booking cancellation
retains its approved pre-start atomic cascade.

## 5. Media and presence

The current public `meet.jit.si` adapter is inadequate for controlled access.
Provider POC must prove exact room JWT enforcement, no anonymous bypass,
student non-moderator role, direct room URL denial, token rotation/revocation
behavior, embed controls and acceptable privacy/hosting. Official Jitsi
documentation exposes iframe `jwt`, `userInfo`, configuration and events,
but the documented token/guest configurations differ in who can create versus
join rooms; configuration alone is not proof of room isolation. A provider
that cannot satisfy the bypass negative must be rejected for this path.
Avoid relying on hidden toolbar buttons as an authorization control.
Provider checks should use the official
[IFrame API](https://jitsi.github.io/handbook/docs/dev-guide/dev-guide-iframe/),
[JWT deployment settings](https://jitsi.github.io/handbook/docs/devops-guide/devops-guide-docker/),
[token authentication notes](https://jitsi.github.io/handbook/docs/devops-guide/token-authentication/)
and [iframe events](https://jitsi.github.io/handbook/docs/dev-guide/dev-guide-iframe-events/)
as documentation inputs, then verify the selected deployment itself.

Presence is separate from Session state. Normalize trusted provider
join/leave events into endpoint-level observations with source event ID,
provider timestamp, receive timestamp, session/participant/endpoint mapping
and confidence. Verify webhook authenticity, replay, size and room mapping;
deduplicate, order and reconcile missing/out-of-order events. Browser iframe
events may drive immediate local UI but are not authoritative attendance
evidence. Compute first join, last leave, total connected intervals and
disconnect count from validated endpoint intervals; do not double-count two
tutor devices or turn a transient disconnect into lesson END. If provider has
no trustworthy event feed, show presence as uncertain and defer attendance
claim until a compatible provider/control path exists.
Tutor projection may show `invited` after a valid invite is issued,
`connected` after a trusted join, `disconnected` during a bounded
reconnect grace, `reconnected` after a fresh trusted join and `left` after
explicit leave or grace expiry. These states are per participant and derived
from endpoint intervals; they do not transition the domain Session.
Structured event names should be
`lesson.invite.created|redeemed|revoked`,
`lesson.access.denied`,
`lesson.participant.joined|left|reconnected` and
`lesson.session.created|started|ended|cancelled`, with bounded
request/correlation IDs, action/deny codes and no raw invite, provider JWT,
cookie, email or media payload.

## 6. Threat model

| Threat | Required mitigation / proof |
|---|---|
| Stolen invite, replay, one-time reuse | High-entropy digest-only token, short bound, revoke/resend, redemption policy, scoped credential; atomic consume only if single-use; explicit scanner/reconnect tests |
| Guessing, malformed token, room enumeration | Input bounds, rate limit, uniform miss, random room ID, masked foreign 404, no sequential resource IDs; load tests for denial |
| Expired/revoked link or cancelled/completed lesson | DB-time recheck at redemption and every media grant; provider kick/revocation proof or documented bounded residual connection window |
| Client changes lesson, identity, role or moderator flag | Resolve Account/Booking/role in backend and DB; reject extra fields; room/role locked in signed provider token; negative role/room tests |
| Direct provider-room entry | Token-required provider configuration with anonymous join disabled; real browser direct URL/no-token/wrong-room tests |
| Forged provider JWT/claims | Server-only signing key or trusted key service, pinned issuer/audience/algorithm, key rotation, short TTL, negative signature/claim tests |
| CSRF and session fixation | Exact Origin, JSON/content-type and CSRF strategy for credentialed writes; rotate existing app session at login; scoped guest credential never upgrades app session |
| XSS and secret exfiltration | No token in HTML/localStorage/analytics; escaping/CSP plan; iframe origin allowlist; treat iframe messages as untrusted |
| Open redirect and URL leakage | Exact return URL allowlist; no email address in invite URL and no invite token in room/provider URL; no-referrer first response, no external assets before exchange, immediate history replacement, redacted ingress logs |
| Provider failure, missing/duplicate events | Bounded retry with idempotency/reconciliation; stable 503 and uncertain presence; no success claim from local iframe event alone |

Recording, transcription and AI processing are disabled in product and
provider configuration. They require their
own consent, indicator, retention/deletion, access and provider-data contracts;
attendance telemetry is not implicit consent to recording.

## 7. Failure and UX contract

Use existing `{error:{code,message,request_id,details}}` envelope, masked
resource policy, `no-store` and RU/UK translation keys. Exact codes remain
draft until API contract approval.

| Condition | Proposed outcome | User-facing behavior |
|---|---|---|
| Invalid/unknown/malformed invite | 404 (malformed bounded request may be 422 internally; public response uniform) | Ссылка недействительна; запросить новую |
| Expired/revoked invite | 410 or uniform 404 where enumeration risk dominates | Ссылка больше не действует; запросить новую |
| Not participant / foreign lesson | masked 404 | Занятие недоступно |
| Not yet in join window | 403 with safe `join_not_yet_available` | Показать время начала и повторить проверку |
| Booking cancelled, Session ENDED or window closed | 403/409 according to existing state precedence | Отмена/завершение без раскрытия чужих данных |
| Provider config/unavailable/token issue failure | redacted 503 | Сохранить lesson state, повторить позже; не открывать public room |
| Camera/mic missing or denied | local recoverable device state | Разрешить вход без соответствующего устройства |
| Unsupported browser | local capability failure | Совместимый браузер/поддерживаемый путь |
| Network lost/provider join failed/backend unavailable | local reconnect with bounded backoff and fresh grant | Состояние соединения и явная повторная попытка; Session не завершается автоматически |

## 8. Migration and rollback impact

Expected additive Alembic change: invite table and indexes/constraints; scoped
credential storage or an equivalent narrow authorization path; durable
Session→provider-room mapping; endpoint/presence observation tables only when
trusted events are available; audit allowlist additions. Keep Booking
participants and Session lifecycle canonical. Reuse `PostgresUnitOfWork`,
runtime/migrator separation, fixed-search-path functions, Booking→grant→Session
lock order and existing audit/event namespace. Define lock extension, ACL,
retention, token-key rotation and downgrade on a disposable database before
DDL. Do not repair or reset the preserved ET-10.3 original database as part
of this feature. Operational rollback disables invite/media consumers and
preserves additive rows/audit; provider room cleanup must be bounded and
reconcilable.

## 9. Test and acceptance matrix

- Unit: role/capability/time policy; invite validity/replay; token claims and
  error precedence; endpoint interval aggregation, duplicate/out-of-order
  reconnect events.
- Real PostgreSQL integration: accept→invite, revoke/cancel race, foreign
  participant, expiry under lock wait, scoped guest denied on all unrelated
  routes, idempotent grant issuance, audit rollback, ACL negatives, additive
  migration and manifest parity.
- HTTP/component: current session and magic-link entry; no user-entered
  name/email/room; RU/UK prejoin/device-denied/expired/revoked/unavailable
  states; keyboard/screen-reader and two-tab re-entry; no token in
  request/response logs, analytics, URL after exchange or localStorage.
- Provider contract: controlled Jitsi instance (or approved alternative)
  rejects anonymous/direct/wrong-room/wrong-role/forged/expired token;
  student never becomes moderator; provider outage/config failure; reliable
  presence source or explicit uncertain status.
- Terminal live E2E: authenticated tutor and student plus magic-link student
  each traverse browser → Electro Tutor API → PostgreSQL → actual provider;
  tutor starts/ends, student reconnects, tutor sees presence and durable
  attendance. No fake/iframe-only path counts as provider or attendance PASS.
- Hosted acceptance remains separate: production origin/HTTPS/cookie/CSP,
  provider hosting/region, privacy, secrets, ingress log redaction, real
  camera/mic and direct-room bypass checks. No deploy claim from local tests.

## 10. Proposed bounded stages

Keep existing stable ET IDs. The following is a proposed decomposition for
ROADMAP approval, not a second execution selector:

1. **ET-12.1** — provider security POC/ADR and approved feature SPEC; real
   token→room and direct-bypass negatives. Reject insecure provider before
   issuing a production-path token.
2. **ET-12.2a** — authenticated tutor/student → current Access/Session → API
   media grant → controlled provider → minimal embedded video; live two-role
   consumer path and role/bypass negatives. Fully usable without invites.
3. **ET-12.2b** — existing student Account invite → scoped credential → same
   media path; live no-login one-link E2E and token/revoke/replay negatives.
4. **ET-12.3** — device/endpoint and screen-share controls, only after measured
   capability and privacy contract; may remain deferred from first MVP.
5. **ET-12.4/12.5** — reconnect/refresh and provider/network quality with real
   disconnect/recovery; no fabricated Session END.
6. **ET-12.6** — trusted presence, tutor status and attendance projection with
   live join/leave/reconnect and durable history. If trusted source is absent,
   stage stays blocked, not completed on iframe events.
7. **ET-12.7 candidate** — full hosted student/tutor acceptance and security
   operations after production origin/provider/retention decisions; no
   automatic recording.

Each user-facing stage needs its own real browser→API→DB→provider (or
browser→API→DB for invite-only preparatory work) PASS, with command, result,
environment and commit recorded in the selected STAGES record. None of these
stages becomes dependency-ready before ET-10.3 terminal evidence and the
current ET-11/ET-12 DAG are reconciled in canonical docs. ET-11 timeline/topic
may be decoupled from media only by an explicit SPEC/ROADMAP dependency change.

## 11. Recommended NEXT

Keep `docs/STAGES.md` selector `ET-10.3` and complete its existing
`ET-10.3-UA-19` literal RU/UK human screen-reader gate. In parallel, this
read-only architecture draft can be reviewed. The first new bounded execution
stage is ET-12.1 only after ET-10.3 status and roadmap prerequisites are
truthfully reconciled; provider POC and policy/guest credential ADR precede
any invite/media schema mutation.

## 12. Decisions that repository evidence cannot settle

1. Which controlled media deployment, region and operator are acceptable
   (self-hosted Jitsi, managed Jitsi/JaaS, or another provider), and what
   privacy/SLA/cost limits apply? Public `meet.jit.si` is not an authorized
   room backend.
2. Should invite be multi-use until expiry or strictly single-use with a
   resend/reconnect path? Recommendation: revocable multi-use for MVP.
3. May tutor extend the scheduled end, and should a reconnect/end action work
   after `Booking.ends_at`? This changes approved Access and Session v1.
4. Is provider-enforced removal required immediately on invite revoke/lesson
   end, or is a measured short residual connection window acceptable? Provider
   capability and product policy must agree.
5. Is a trustworthy provider event stream available and permitted for
   attendance? Without it, show uncertain presence and leave attendance
   unverified.
