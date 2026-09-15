# Этапы Electro Tutor

- Stage ID: ET-09.4

## ET-09.4 — profiles, capabilities и audit

- Status: partial
- Condition: GitHub main `e1527e6` содержит ET-09.4a/b domain/grant/audit checkpoints, но ET-09.4c profile persistence, ET-09.4d HTTP ownership и ET-09.4e RU/UK UI/live `AUTHZ-001..003` на этом main ещё не подтверждены. Текущее состояние активной локальной feature-ветки позже этого main и не является remote completion evidence.
- Plan: после безопасной интеграции с активной feature-веткой проверить `specs/features/profiles-capabilities-audit.spec.md`; следующий dependency-ready slice ET-09.4c, затем ET-09.4d/e только после prerequisites. ET-09.3 OIDC legacy plan содержит устаревший blocker, сохранён как исторический факт в `docs/notes/legacy-ai-state-evidence.md`.
- Evidence: GitHub main `e1527e6`; ET-09.4b revision `20260909_0007`; исторические 85 backend fast и 39 real PostgreSQL tests PASS, provisioner-role/Account FK/idempotency/concurrency/audit negative gates PASS. ET-09.4c profile runtime не начат в этом main. Повторный task-clone baseline 2026-09-15: frozen pnpm restore PASS после восстановления свободного места; context route/canonical adapter PASS; Astro check 82 files/0 diagnostics, ESLint, 110 unit tests, build 17 pages с locale/lesson/site audits, built Chromium E2E 46 PASS/2 expected auth skips. Backend/PostgreSQL tests и live IdP в этом docs task не повторялись. Полный прежний stage catalog/SHA и старый AI state сохранены в `docs/notes/`; Git parent — rollback point.
- NEXT: ET-09.4c
- USER action `ET-ACTIVE-TRACK-RECONCILE`: PENDING; после документационного merge отдельно сверить чистую локальную `feature/et-10-3-lesson-session` (`1722d16`) с новым GitHub main, сохранить ET-10.3 facts и разрешить stage/docs integration на отдельной ветке без reset/force; evidence — ancestry, conflict resolution, selected adapter и accepted gates; unlock — актуальный локальный active selector.
- USER action `ET-DISK-RESTORE`: DONE без очистки; свободное место восстановилось, обе disposable task-папки оставлены на месте, повторный frozen restore и frontend baseline завершились PASS; evidence — install/check/lint/unit/build/built E2E exit 0; unlock — локальная regression verification этого docs change.
- USER action `ET-MERGE-DOCS`: PENDING; после публикации этой docs ветки явно разрешить merge в GitHub `main`; evidence — GitHub default-branch read-back только `docs/STAGES.md`; unlock — удаление полностью слитой docs ветки.

## Поздние этапы

- ET-09.4d/e требуют завершённого ET-09.4c и live auth/HTTP/UI evidence.
- ET-10.1/ET-10.2/ET-10.3 в отдельной локальной feature истории не заявлены завершёнными на этом GitHub main.
