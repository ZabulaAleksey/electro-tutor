# Этапы Electro Tutor — active local track

- Stage ID: ET-10.3

## ET-10.3 — LessonSession lifecycle и reload

- Status: implemented_unverified
- Condition: approved Session v1/ADR-027 и независимые ADR-028 drift gates реализованы; scratch DB tests прошли, но preserved dev DB содержит genuine catalog drift и 2 accounts. `backend:check` не может быть terminal PASS на этой БД; live authenticated Session browser и manual RU/UK checks остаются открытыми. Remote GitHub main имеет более старое ET-09.4 состояние и не заменяет этот local track.
- Plan: сначала утвердить data-preserving recovery/isolation с backup/rollback и ownership неожиданных catalog objects, без `backend:db:reset-local`; затем повторить `backend:check`, audit и terminal live/manual gates. ET-11.1 не разблокирует эти ET-10.3 gates.
- Evidence: active feature fast-forward `1722d16 → a646303` 2026-09-15, clean source checkout; read-back `docs/STAGES.md`/context route/selected adapter canonical PASS, старые STAGES/AI files отсутствуют. GitHub docs main `ac675d4` содержит более ранний product baseline ET-09.4. Approved `specs/features/lesson-sessions.spec.md` v1/ADR-027. Historical `backend:test:fast` 194 PASS/81 deselected, `backend:test:integration` 72 PASS/201 deselected, Ruff/mypy PASS; scratch DB Alembic/catalog parity и 9 rollback negatives PASS. Preserved dev DB read-only diagnose exits 1 with `status=drift`, 10 missing/3 changed/9 unexpected functions and missing CHECK; 2 accounts, reset/repair not attempted. Повторный task-worktree frontend baseline 2026-09-15: frozen restore, context route/canonical adapter, Astro check 98 files/0 diagnostics, ESLint, 156 unit tests, build 19 pages с audits, built Chromium 92 PASS/5 expected auth skips. Backend/DB/live IdP в этом docs task не повторялись; `verify:full` network audit auto-review rejection в прежнем ET-10.3 task означает отсутствие terminal PASS claim. Selected old record/user actions и AI source SHA сохранены в `docs/notes/`, Git parent rollback.
- NEXT: ET-10.3-DATA-RECOVERY-DECISION
- Blockers: preserved dev DB catalog drift with 2 accounts; missing data-preserving recovery decision, network audit approval, unskipped authenticated Session browser and manual RU/UK evidence.
- USER action `ET-10.3-UA-04`: PENDING CONDITIONAL; после clean `backend:check` запустить `pnpm test:e2e:auth` в личном локальном shell с ephemeral секретами, не публикуя values/output; evidence — unskipped real browser phase и `EXIT_CODE=0`; unlock — terminal live E2E gate.
- USER action `ET-10.3-UA-05`: PENDING CONDITIONAL; после live path проверить RU/UK lesson shell в двух вкладках и keyboard/accessibility workflow; evidence — pass/fail без secret values; unlock — manual UX gate.
- USER action `ET-10.3-UA-08`: PENDING HIGH architecture; утвердить data-preserving recovery/isolation для dev DB с 2 accounts, backup/rollback и ownership unexpected catalog objects; evidence — approved plan; unlock — safe recovery implementation, без reset.
- USER action `ET-10.3-UA-09`: PENDING CONDITIONAL; после DB recovery явно разрешить outbound `pnpm audit --audit-level high` к npm registry; evidence — exit verdict/redacted diagnostic; unlock — dependency audit часть `verify:full`. Прошлый auto-review отказ не обходился.
- USER action `ET-ACTIVE-DOCS-INTEGRATION`: DONE; пользователь разрешил local merge 2026-09-15; чистая `feature/et-10-3-lesson-session` перешла fast-forward `1722d16 → a646303`; read-back selected ET-10.3 adapter/context route PASS, `docs/STAGES.md` единственный active state owner; unlock — активный checkout с текущим ET-10.3 record.
- USER action `ET-ACTIVE-REMOTE-RECONCILE`: PENDING; GitHub docs main `ac675d4` и active ET-10.3 docs track расходятся по product history; read-only `git merge-tree 86f5edf a646303` выявил 8 docs/context conflicts. Подготовить branch-aware manual resolution с сохранением ET-10.3 facts/legacy rollback и повторить accepted checks; перед actual merge получить отдельное явное разрешение, без reset/force. Evidence — resolved diff, ancestry, stage adapter, regression gates; unlock — безопасная синхронизация active feature с GitHub main.

## Поздние этапы

- ET-11.1/ET-11.2 и поздние stages не снимают blockers ET-10.3; их execution требует dependency-ready SPEC/evidence.
