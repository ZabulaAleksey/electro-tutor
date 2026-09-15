# Этапы Electro Tutor

- Stage ID: ET-09.4

## ET-09.4 — profiles, capabilities и audit

- Status: partial
- Condition: GitHub main `86f5edf` содержит документационный перенос поверх product baseline `e1527e6` с ET-09.4a/b domain/grant/audit checkpoints. ET-09.4c profile persistence, ET-09.4d HTTP ownership и ET-09.4e RU/UK UI/live `AUTHZ-001..003` на этом main ещё не подтверждены. Активная локальная feature-ветка позже remote product baseline и не является remote completion evidence.
- Plan: после безопасной интеграции с активной feature-веткой проверить `specs/features/profiles-capabilities-audit.spec.md`; следующий dependency-ready slice ET-09.4c, затем ET-09.4d/e только после prerequisites. ET-09.3 OIDC legacy plan содержит устаревший blocker, сохранён как исторический факт в `docs/notes/legacy-ai-state-evidence.md`.
- Evidence: GitHub main `86f5edf` read-back 2026-09-15: только `docs/STAGES.md`, старые `prompts/STAGES.md` и AI pair отсутствуют; product baseline `e1527e6`, ET-09.4b revision `20260909_0007`; исторические 85 backend fast и 39 real PostgreSQL tests PASS, provisioner-role/Account FK/idempotency/concurrency/audit negative gates PASS. ET-09.4c profile runtime не начат в этом main. Повторный task-clone baseline 2026-09-15: frozen pnpm restore PASS после восстановления свободного места; context route/canonical adapter PASS; Astro check 82 files/0 diagnostics, ESLint, 110 unit tests, build 17 pages с locale/lesson/site audits, built Chromium E2E 46 PASS/2 expected auth skips. Backend/PostgreSQL tests и live IdP в этом docs task не повторялись. Полный прежний stage catalog/SHA и старый AI state сохранены в `docs/notes/`; Git parent — rollback point.
- NEXT: ET-09.4c
- USER action `ET-ACTIVE-TRACK-RECONCILE`: PENDING; локальный ET-10.3 уже канонизирован отдельно в `feature/docs-stages-active-track` (`a646303`) с проверками 156 unit/92 built Chromium E2E; исходный active checkout пока сохранён. Dry-run `git merge-tree 86f5edf a646303` показал 8 docs/context conflicts. После отдельного local fast-forward сохранить ET-10.3 facts и разрешить branch-aware integration с GitHub main вручную, без reset/force; evidence — ancestry, conflict resolution, selected adapter и accepted gates; unlock — актуальный active selector на интегрированной ветке.
- USER action `ET-DISK-RESTORE`: DONE без очистки; свободное место восстановилось, обе disposable task-папки оставлены на месте, повторный frozen restore и frontend baseline завершились PASS; evidence — install/check/lint/unit/build/built E2E exit 0; unlock — локальная regression verification этого docs change.
- USER action `ET-MERGE-DOCS`: DONE; пользователь явно разрешил merge 2026-09-15; GitHub main fast-forward `e1527e6 → 86f5edf`, fresh `ls-remote` подтвердил main=`86f5edf`; canonical stage adapter/проверки ветки PASS, rollback — Git parent и `docs/notes/`. Evidence — default-branch read-back только `docs/STAGES.md`, старые AI files отсутствуют; unlock — удаление полностью слитой docs ветки после этого evidence checkpoint.

## Поздние этапы

- ET-09.4d/e требуют завершённого ET-09.4c и live auth/HTTP/UI evidence.
- ET-10.1/ET-10.2/ET-10.3 в отдельной локальной feature истории не заявлены завершёнными на этом GitHub main.
