# Спецификация profiles, capabilities и audit baseline

Статус: Действует как утверждённый implementation contract для `ET-09.4`;
runtime partial — `ET-09.4a` completed/verified, `ET-09.4b..e` planned

Версия: 0.1

Связи: `PLAT-003`, `AUTHZ-001..003`, `ET-09.4`, ADR-020, ADR-022, ADR-023.

## 1. Назначение и границы

Эта SPEC закрывает contract entry-gate `ET-09.4`: отделяет Tutor application
profiles от identity и authority, задаёт минимальный trusted capability model,
authorization matrix, append-only audit contract и dependency-safe порядок
runtime slices.

В scope входят только Student/Tutor personas, account-scoped tutor grant,
собственные private profiles и audit критичных authority mutations. Public tutor
directory, tenant/membership, lessons, Booking, Board/CRDT, Classroom/WebRTC,
billing, marketplace, AI, MFA/passkeys, moderation UI и production IdP topology
остаются вне `ET-09.4`.

## 2. Identity, account и profile invariants

### PCA-ID-001 Canonical application account key

Текущий canonical application account/principal key — server-derived
`Principal.identity_id`, то есть opaque UUID `external_identities.id`. Stable
provider identity остаётся точной парой `(issuer, subject)` по `ET-09.3`;
email — изменяемый identity attribute, а не account key и не authority input.

Profile owner всегда берётся из действующей server-side session. Request body не
принимает и не переопределяет `identity_id`, issuer, subject или owner; path
`identity_id` является только resource selector и должен совпасть с principal.

### PCA-ID-002 Composable personas и cardinality

Для одного account допустимы независимо:

- `0..1` StudentProfile;
- `0..1` TutorProfile.

Обе записи могут отсутствовать или существовать одновременно. StudentProfile и
TutorProfile не являются взаимоисключающими role rows; Tutor может одновременно
использовать student persona.

### PCA-ID-003 Profile never implies authority

Существование, поля и lifecycle profile не выдают role, capability, tenant
access, admin right, entitlement или доступ к чужим private resources.
Client-writable `role`, `is_tutor`, `is_admin`, capability и entitlement
запрещены. Profile не является tenant или tenant membership.

### PCA-ID-004 Privacy и ownership

StudentProfile и TutorProfile private по умолчанию. Baseline API принимает opaque
`identity_id`, но разрешает только совпадение с current principal; selector не
меняет owner. Foreign read/mutation deny-by-default и не раскрывает существование
записи. Public tutor projection требует отдельной SPEC.

## 3. Минимальные profile contracts

Обе таблицы используют server-derived `identity_id` как UUID primary key и FK на
`external_identities.id`, а также содержат `display_name`, `created_at` и
`updated_at`. Это задаёт ровно одну запись каждого profile type на account без
второго публичного profile identifier.
`display_name` не копируется в identity/IdP и не является authority field.

| Поле | Обязательность | Validation / normalization | Visibility / uniqueness |
|---|---|---|---|
| `identity_id` | required, server-only | только текущий principal; immutable | private owner PK/FK; unique per profile type |
| `display_name` | required | Unicode NFC; trim краёв; внутренние whitespace runs сводятся к одному пробелу; после normalization 1..80 code points; control characters запрещены | private; не unique; не authority input |
| `created_at` | required, server-only | UTC, immutable | private |
| `updated_at` | required, server-only | UTC, меняется только при effective update | private |

Email остаётся в `external_identities` и не дублируется в profiles. Bio, avatar,
subjects, rates, verification badges, availability, public slug, locale и любые
directory/decorative fields deferred до отдельного product requirement.

### PCA-PROFILE-001 StudentProfile lifecycle

Lifecycle: `absent → active`; active record можно read/update owner-ом. Создание
доступно любому authenticated account и не выдаёт новых прав. Exact repeated
create после normalization возвращает существующую запись без duplicate;
different create payload возвращает stable `409 profile_already_exists` и требует
отдельного update. Delete/deactivate не входят в baseline.

### PCA-PROFILE-002 TutorProfile lifecycle

Lifecycle: `absent → active`; create и update требуют active trusted
account-scoped `TUTOR_PROFILE_MANAGE_OWN` grant. Revoke запрещает create/read/update
TutorProfile и не даёт доступа к другим resources; сохранённая private запись не
становится public и может снова использоваться только после trusted re-grant.
Exact repeated create idempotent. Delete/deactivate не входят в baseline; если
они добавляются позже, операция audit-critical.

Первое создание TutorProfile и его AuditEvent фиксируются атомарно. Обычное
изменение `display_name` не является privileged security audit event.

## 4. Trusted capability/grant model

### PCA-GRANT-001 Stored authority source

Единственный stored source trusted tutor authority — Tutor-owned PostgreSQL
`CapabilityGrant`; OIDC/Keycloak claims, request body, profile fields и client
state не являются authority. Baseline grant code — `TUTOR_PROFILE_MANAGE_OWN`.

Минимальный persisted contract:

- `id`: immutable UUID;
- `subject_identity_id`: target account FK;
- `capability_code`: allowlisted typed code, baseline only `TUTOR_PROFILE_MANAGE_OWN`;
- `scope_kind`: baseline only `account`;
- `scope_id`: target `identity_id`; для account scope обязан совпадать с subject;
- `issued_at`, `issued_by_actor_type`, `issued_by_actor_id`;
- nullable `revoked_at`, `revoked_by_actor_type`, `revoked_by_actor_id`;
- `issue_operation_id` и nullable `revoke_operation_id` для idempotent commands.

Grant scope/capability/subject immutable. Изменение означает audited revoke старой
записи и audited issue новой. Partial unique index запрещает более одного active
grant для `(subject_identity_id, capability_code, scope_kind, scope_id)`.
Existing `account` semantics не меняются при будущем добавлении `tenant` или
`resource` scopes; такие scopes требуют отдельной SPEC/migration/policy.

### PCA-GRANT-002 Issue/revoke authority

Baseline issue/revoke вызывает только internal application service через trusted
provisioning adapter. Adapter создаёт server-side `AuthorityActor` из exact
allowlisted service identity/config; end-user session и mutable OIDC claim не
могут создать такого actor. Controlled tests используют тот же service contract
с отдельным test actor и disposable test DB.

Public self-grant endpoint отсутствует. Future admin UI или admin identity требует
отдельного approved authority contract; admin right не выводится из
`TUTOR_PROFILE_MANAGE_OWN`.

### PCA-GRANT-003 Deterministic evaluator

Application Core policy evaluator принимает только:

1. validated `Principal.identity_id`;
2. typed requested operation;
3. server-loaded resource owner/scope;
4. active, non-revoked grants из repository;
5. versioned code/config authorization matrix.

Precedence: invalid/anonymous principal → deny; foreign owner/scope → deny;
explicit operation prerequisites → active matching grant; otherwise deny. Profile
existence и client claims никогда не повышают результат. Baseline built-in
ownership policy разрешает authenticated account own StudentProfile operations;
active `TUTOR_PROFILE_MANAGE_OWN` добавляет только own TutorProfile
create/read/update. Он не
даёт blanket access к students, lessons, tenants, boards, billing или classroom.

### PCA-GRANT-004 Idempotency и revoke

Exact repeat `issue_operation_id`/`revoke_operation_id` возвращает прежний
результат без второго mutation/AuditEvent. Повтор с тем же operation ID, но
другим intent, возвращает `409 idempotency_conflict`. Revoke действует немедленно
для следующего evaluation; cache не является authority source.

## 5. Authorization matrix

Stable transport errors используют существующий envelope
`{"error":{"code","message","request_id","details"}}`.

| Actor / action | Preconditions | Decision | Stable outcome | Behavior |
|---|---|---|---|---|
| anonymous → любой profile endpoint | session отсутствует/invalid | deny | `401 authentication_required` | `AUTHZ-002` |
| authenticated → own StudentProfile create/read/update | owner из principal | allow | create/read/update; exact repeated create idempotent | `AUTHZ-001`, `PCA-PROFILE-001` |
| authenticated without active `TUTOR_PROFILE_MANAGE_OWN` → own TutorProfile create/read/update | grant отсутствует/revoked | deny | `403 capability_required` | `AUTHZ-002` |
| authenticated with active `TUTOR_PROFILE_MANAGE_OWN` → own TutorProfile create/read/update | matching account scope | allow | доступ только через policy service | `AUTHZ-001` |
| User A → User B private profile read/mutation | owner не совпадает | deny | non-disclosing `404 profile_not_found` | `AUTHZ-002` |
| end-user/public request → tutor grant/revoke | public authority запрещена | deny | route отсутствует; service-level `403 authorization_denied` | `AUTHZ-002` |
| trusted internal actor → tutor grant/revoke | exact actor allowlist, operation ID | allow | atomic grant/revoke + AuditEvent | `AUTHZ-001`, `AUTHZ-003` |
| controlled test/provisioner → tutor grant/revoke | same application service, isolated profile/DB | allow | production rules не обходятся | `AUTHZ-001`, `AUTHZ-003` |
| repeated exact profile/grant command | normalized intent совпадает | allow/no-op | прежний result, no duplicate row/event | `AUTHZ-001` |

Validation failure возвращает `422 invalid_request`; audit persistence failure на
audit-critical command возвращает `503 audit_unavailable` после rollback.

## 6. Audit contract

### PCA-AUDIT-001 Envelope

`AuditEvent` содержит:

- `event_id`: immutable UUID;
- `schema_version`: baseline `1`;
- `occurred_at`: server/DB UTC timestamp;
- `actor_type` и `actor_id`: server-derived identity/service actor;
- `subject_type` и `subject_id`: account/grant/profile target;
- `action`: allowlisted typed action;
- `result`: typed outcome (`succeeded`, с extension point для `denied`/`failed`);
- `request_id` и `correlation_id`;
- `operation_id` для idempotent authority command;
- `metadata`: allowlisted bounded object, максимум 16 scalar keys и 4096 encoded bytes.

Baseline actions: `tutor_capability.granted`, `tutor_capability.revoked`,
`tutor_profile.created`. Future TutorProfile deletion/deactivation и изменение
authority-bearing scope/ownership также audit-critical.

### PCA-AUDIT-002 Privacy и immutability

AuditEvent append-only: application runtime получает `INSERT`/`SELECT`, но не
`UPDATE`/`DELETE`; correction создаёт новый compensating event. Event не содержит
raw provider/access/ID/refresh token, cookie/session token или digest, secret,
password, full request/profile body, email либо display name. Metadata содержит
только минимальные identifiers, capability/scope codes и безопасную reason
category.

Denied self-escalation/foreign access может формировать redacted security
observability event с request/correlation ID, но не обязана создавать durable
AuditEvent и не копирует private profile content.

### PCA-AUDIT-003 Atomicity

Capability issue/revoke, первое TutorProfile creation и соответствующий
AuditEvent выполняются одной PostgreSQL transaction через один application
service/unit-of-work. Успешно применённого authority mutation или TutorProfile
creation без durable AuditEvent существовать не может. Audit insert/commit failure
откатывает mutation и возвращает `503 audit_unavailable`; in-memory/log fallback
запрещён.

Audit persistence поэтому является prerequisite grant/profile mutations, а не
последующим observability enhancement.

Grant evaluation и TutorProfile mutation используют один explicit unit-of-work.
Проверка active grant сериализуется с concurrent revoke блокировкой grant row;
репозитории одной critical operation получают общий connection/transaction, а не
открывают независимые transactions на каждый write.

### PCA-AUDIT-004 Correlation и access

Request ID следует существующему API contract; correlation ID связывает одну
logical operation без раскрытия payload. Audit read/export endpoint и operator UI
не входят в baseline. Direct table access ограничивается service/runtime grants и
approved operational access; public profile owner не получает audit browsing API.

## 7. Data и migration contract

Runtime implementation создаёт additive reversible Alembic revisions для
`audit_events`, `capability_grants`, `student_profiles`, `tutor_profiles` в порядке
dependency DAG. Public IDs — UUID; timestamps — UTC; constraints и indexes
проверяются real PostgreSQL integration tests. Runtime role получает только
минимальные table/column privileges, migration role остаётся schema owner.

Downgrade разрешён только на disposable local/test DB. До production data
destructive downgrade запрещён; recovery — forward fix/backup restore. Profile
deletion semantics и cascade-delete identity не вводятся этим stage.

## 8. Dependency DAG и ordered runtime slices

```text
ET-09.3 verified + SPEC v0.1 + ADR-023
    → ET-09.4a Audit persistence foundation
        → ET-09.4b Trusted grant + policy evaluator
            → ET-09.4c Student/Tutor profile persistence + lifecycle
                → ET-09.4d Application/HTTP ownership paths
                    → ET-09.4e RU/UK UI + complete AUTHZ E2E verification
```

- `ET-09.4a → ET-09.4b`: authority mutation запрещена без durable atomic audit.
- `ET-09.4b → ET-09.4c`: TutorProfile create нельзя безопасно реализовать до
  trusted grant source и evaluator; Student/Tutor persistence остаётся одним
  coherent profile slice.
- `ET-09.4c → ET-09.4d`: transport оркестрирует готовые domain/repository
  contracts и не содержит role checks.
- `ET-09.4d → ET-09.4e`: browser/component E2E требует реальный protected API.

Ни один slice не зависит от tenant, admin UI, future lesson authorization или
production provider. Следующий implementation pass выбирает только
`ET-09.4a`.

## 9. Acceptance и evidence по slices

### ET-09.4a — Audit persistence foundation

- reversible migration lifecycle `upgrade → downgrade → upgrade`, head/drift;
- append-only audit privileges: runtime `INSERT/SELECT` allowed, `UPDATE/DELETE` denied;
- envelope validation, bounds/redaction unit tests;
- real DB append/read/correlation integration;
- transaction rollback test при audit failure.

### ET-09.4b — Trusted grant и evaluator

- migration constraints, active-grant partial uniqueness и idempotency conflict;
- table-driven unit authorization matrix;
- trusted internal actor positive; public/self/OIDC-claim escalation negatives;
- real DB atomic grant/revoke + AuditEvent assertions;
- revoke immediately changes evaluation.

### ET-09.4c — Profiles

- two independent `0..1` identity relations; account may own both;
- normalization/limits/uniqueness and repeated-create tests;
- authenticated own StudentProfile positive path;
- TutorProfile create without/with grant deny/allow;
- TutorProfile create and AuditEvent atomicity; no authority from profile row.

### ET-09.4d — Application/HTTP

- stable 401/403/404/409/422/503 envelope tests;
- anonymous/invalid-session rejection;
- own profile positive paths and foreign IDOR/BOLA read/mutation negatives;
- handlers delegate to Application Core policy; no scattered client role checks;
- API → application → PostgreSQL component path.

### ET-09.4e — UI и terminal verification

- RU/UK signed-out, loading, validation, permission-denied and own-profile states;
- accessibility/keyboard/mobile checks for changed UI;
- real browser → Keycloak → session → own Student/Tutor profiles → forbidden
  foreign/self-escalation → durable audit correlation;
- full required backend/frontend gates, router/context validators, secret/diff review;
- only after all `AUTHZ-001..003` acceptance is PASS may ET-09.4 become verified
  and NEXT advance. Earlier slices keep `NEXT: ET-09.4` and truthful partial state.

## 10. Behavior mapping

| Behavior | Exact ET-09.4 contract |
|---|---|
| `PLAT-003` | Tutor owns application profiles/grants; provider/client claims cannot authorize foreign access |
| `AUTHZ-001` | Application Core deterministically computes effective operations from principal, ownership, typed active grants and code/config matrix |
| `AUTHZ-002` | Anonymous, self-grant, revoked-grant, client-role and foreign-profile attempts fail closed with stable non-leaking errors |
| `AUTHZ-003` | Authority grant/revoke and authorized TutorProfile creation emit redacted durable AuditEvent atomically; moderation later reuses this baseline |
| `PCA-ID-001..004` | account key, composable persona cardinality, profile/authority separation and privacy |
| `PCA-PROFILE-001..002` | minimal Student/Tutor lifecycle and idempotent ownership behavior |
| `PCA-GRANT-001..004` | persisted trusted grant, issuer authority, evaluator and idempotency |
| `PCA-AUDIT-001..004` | envelope, privacy/immutability, transaction atomicity and access |

## 11. Runtime checkpoint

`ET-09.4a` реализует revision `20260908_0005`, executable audit envelope/
metadata validation, connection-scoped `PostgresAuditEventRepository`, one-shot
`PostgresUnitOfWork`, column-level runtime `INSERT`, table `SELECT` и запрет
`UPDATE`/`DELETE`/`TRUNCATE`. `event_id`, `schema_version` и `occurred_at`
заполняются PostgreSQL и недоступны construction boundary/runtime INSERT grant.
`actor_id`/`subject_id` — typed soft references без FK на provider identity,
поэтому audit не блокирует future account linking и сохраняется независимо от
будущего lifecycle subject.

Fast gate: `71 passed`; real PostgreSQL migration/integration gate: `22 passed`.
CapabilityGrant, evaluator, profiles, HTTP routes и UI не реализованы. Whole
`ET-09.4` имеет truthful `partial`, а stage-level `NEXT` остаётся `ET-09.4`.
