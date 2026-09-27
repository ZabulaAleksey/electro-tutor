# ET-10.3 integration checkpoint (2026-09-27)

This note records the local rehearsal. Product state and `NEXT` remain owned by `docs/STAGES.md`; this is not a second status source.

## Fresh refs and ancestry

- `feature/et-10-3-lesson-session` = `origin/feature/et-10-3-lesson-session` = `91df4d35f349c234bb6a7670b696fb06792ed710` after `git fetch --prune origin`; checkout clean.
- Local `main` = `07aa04fc6d4face861c708db5c1b32d303721ef5`; `origin/main` = `ac675d40767883e1235996815b9a05615b1c7b30`; merge-base = `e1527e62799796df96ae11ff39a2c6b7316f7f16`.
- `git rev-list --left-right --count main...origin/main` = `31 3`. All 31 local-only commits are ancestors of the feature branch. They comprise 10 feature, 3 fix, 4 test, 13 documentation/state and 1 merge commit. None are discarded. The three remote-only commits are one context migration (`b465deb`) and two documentation/evidence commits (`86f5edf`, `ac675d4`); all are merge ancestors.
- Integration branch `integration/et-10-3-main-reconciliation` uses local `main` as baseline. Merge `49ef350` joined `origin/main`, with archive provenance fix `2443ae2`; merge `4b1b40c` joined published feature HEAD. Both histories remain intact.

## Conflict resolution

| Path | Main/remote intent | Feature intent | Resolution |
| --- | --- | --- | --- |
| `docs/DECISIONS.md` (main reconciliation) | ADR-029 execution owner | Local ADR-024..026 access/booking | Keep all IDs; no duplicate ADR-029. |
| `docs/notes/legacy-stage-contracts.md` (main reconciliation) | Archive remote ET-09.4 catalog | Archive local later catalog | Retain later catalog, link earlier `b465deb` snapshot in Git history. |
| `docs/CONTEXT_COMPATIBILITY.md` | Remote ET-09.4 and formal bridge not asserted | Active ET-10.3 protected DB | Preserve active state and record remote provenance/bridge limitation. |
| `docs/DECISIONS.md` | ADR-029 ownership | ADR-027/028 and later ADR-029 wording | Preserve ADR-027/028 and one ADR-029 with remote context. |
| `docs/STAGES.md` | Remote ET-09.4 partial selector and user actions | ET-10.3 implemented_unverified, UA-18 evidence, UA-19 runbook/NEXT | Select ET-10.3; retain remote snapshot, prior actions and evidence in Git ancestry/notes. |
| `docs/notes/legacy-ai-state-evidence.md` | Old remote ET-09.4 and AI conflict history | Later ET-10.3 protected DB facts | Retain both as explicitly historical snapshots. |
| `docs/notes/legacy-stage-contracts.md` | Earlier archived ET-09.4 catalog | Later archived ET-10.3 catalog and ADR correction | Retain later snapshot with SHA and pointer to earlier Git blob. |
| `docs/project-context.md` | SHA-bound migration provenance | Same migration provenance, updated wording | One canonical evidence pointer; preserve current Backend DX delta. |
| `scripts/validate-context-route.mjs` | Exact selected stage and detached-source checks | Adds ADR uniqueness and requirements-ledger coverage validation | Preserve full stricter checks; keep remote diagnostic wording. |
| `specs/features/context-automation.spec.md` | Exact legacy evidence file | Current route contract | Preserve current contract with exact evidence path. |

## Pages publication control

`.github/workflows/pages.yml` has `on.push.branches: [main]` and `workflow_dispatch`, no path filter, a `verify` job restricted to `refs/heads/main`, and a `deploy` job with the same ref condition and `needs: verify`. The deploy job uses `github-pages`, `pages: write`, `id-token: write`, `actions: read`, and `actions/deploy-pages`; concurrency is `github-pages-${{ github.ref }}` with cancel in progress. It calls no reusable workflow. Neither repo variable nor path ignore nor manual-only dispatch guards deploy in this YAML. An ordinary successful push to `main` can deploy.

GitHub documents that `[skip ci]` on a pushed commit suppresses `push` workflow runs; the final pushed HEAD must carry it. The feature merge commit `4b1b40c` does. [GitHub skip-workflow documentation](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/skip-workflow-runs). A read-only GitHub Pages settings API request returned 404, so it supplies no independent Pages source evidence. ADR-017 identifies Actions as the production Pages path. Before publication, fetch and compare `origin/main` to `ac675d4`; fast-forward `main` to the verified integration HEAD and push without force. If the remote changes or a separate Pages source appears, stop.

## Verification and applicability

- Frozen offline pnpm restore PASS; `pnpm check:context`, `pnpm check:hygiene`, `pnpm check:ci-workflow`, ESLint of context validator PASS; two workflow/full-verify Vitest files, 14 tests PASS; `git diff --check` PASS.
- `validate_project_overlay.py` reports missing structured DEV opt-in and human marker on both feature baseline and integration branch. The project explicitly does not assert a formal DEV bridge; this pre-existing full-overlay result was not changed to make the gate green.
- `git diff feature/et-10-3-lesson-session -- src services/api tests/e2e scripts/backend.mjs scripts/run-auth-e2e.mjs scripts/run-auth-e2e-isolated.mjs scripts/run-auth-e2e-isolated.ps1 package.json pnpm-lock.yaml .github/workflows` is empty. UA-18 live-auth evidence remains applicable. No DB, IdP, browser, production site or MathMorph runtime was started in this checkpoint.
- ET-10.3 remains `implemented_unverified`; UA-19 remains `NOT VERIFIED / BLOCKED_BY_OBSERVABILITY`; product `NEXT` remains `ET-10.3-UA-19-MANUAL-RU-UK-SCREEN-READER-ACCEPTANCE`.
