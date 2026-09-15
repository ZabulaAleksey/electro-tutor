# Этапы Electro Tutor

- Stage ID: ET-09.4

## ET-09.4 — profiles, capabilities и audit

- Status: partial
- Condition: GitHub main `e1527e6` содержит ET-09.4a/b domain/grant/audit checkpoints, но ET-09.4c profile persistence, ET-09.4d HTTP ownership и ET-09.4e RU/UK UI/live `AUTHZ-001..003` на этом main ещё не подтверждены. Текущее состояние активной локальной feature-ветки позже этого main и не является remote completion evidence.
- Plan: после безопасной интеграции с активной feature-веткой проверить `specs/features/profiles-capabilities-audit.spec.md`; следующий dependency-ready slice ET-09.4c, затем ET-09.4d/e только после prerequisites. ET-09.3 OIDC legacy plan содержит устаревший blocker, сохранён как исторический факт в `docs/notes/legacy-ai-state-evidence.md`.
- Evidence: GitHub main `e1527e6`; ET-09.4b revision `20260909_0007`; исторические 85 backend fast и 39 real PostgreSQL tests PASS, provisioner-role/Account FK/idempotency/concurrency/audit negative gates PASS. ET-09.4c profile runtime не начат в этом main. Документационная проверка `node --check scripts/validate-context-route.mjs`, `node scripts/validate-context-route.mjs` и canonical stage adapter PASS; frozen pnpm restore прервался из-за `ENOSPC`, поэтому frontend baseline tests/build в этом task-клоне не повторены. Полный прежний stage catalog/SHA и старый AI state сохранены в `docs/notes/`; Git parent — rollback point.
- NEXT: ET-09.4c
- USER action `ET-ACTIVE-TRACK-RECONCILE`: PENDING; после документационного merge отдельно сверить чистую локальную `feature/et-10-3-lesson-session` (`1722d16`) с новым GitHub main, сохранить ET-10.3 facts и разрешить stage/docs integration на отдельной ветке без reset/force; evidence — ancestry, conflict resolution, selected adapter и accepted gates; unlock — актуальный локальный active selector.
- USER action `ET-DISK-RESTORE`: PENDING; разрешить очистку только disposable partial task projection `~/Documents/Codex/2026-09-15/dev-global-ai-context-automation-script/work/electro-tutor-stages/node_modules` и изолированного task store `~/.codex/scratch/pnpm-electro-20260915`, затем повторить frozen restore и доступные baseline gates; evidence — свободное место, install/check/test/build exit verdicts; unlock — полноценная локальная regression verification этого docs change.
- USER action `ET-MERGE-DOCS`: PENDING; после публикации этой docs ветки явно разрешить merge в GitHub `main`; evidence — GitHub default-branch read-back только `docs/STAGES.md`; unlock — удаление полностью слитой docs ветки.

## Поздние этапы

- ET-09.4d/e требуют завершённого ET-09.4c и live auth/HTTP/UI evidence.
- ET-10.1/ET-10.2/ET-10.3 в отдельной локальной feature истории не заявлены завершёнными на этом GitHub main.
