# Repository reconciliation — 2026-09-28

Scope: canonical `E:\DEV\projects\electro-tutor`; read-only remote query plus local Git/worktree and quality checks. This is historical audit evidence; current selector/status/NEXT remain in `../STAGES.md`.

| Checkout/branch | Previous HEAD | Merge base with main | Unique material | Classification / action |
|---|---|---|---|---|
| root `main` | `d58e787` | self | 7 local commits ahead of `origin/main` | canonical product baseline; clean; protected from direct mutation |
| `feature/line-transient-mvp` | `d58e787` | `d58e787` | none | ALREADY_IN_CANONICAL; clean worktree retained for open Rust gate |
| detached `electro-tutor-active-stages` | `72212d5` | `72212d5` | none | ALREADY_IN_CANONICAL; clean historical checkout retained |
| `feature/live-tutoring-design` | `ad6f306` | `dc38ee6` | 2 draft design commits, 8 documentation/SPEC files | SAFE_MERGE into feature branch; merge `03d14ff` incorporates local `main`, clean; canonical-main fast-forward rejected by auto-review |
| `origin/main` | `dc38ee6` | `dc38ee6` | 0 remote-only commits; local main ahead 7 | ALREADY_IN_CANONICAL; read-only `ls-remote` confirmed only remote `main` |

No stashes, tags, staged/unstaged/untracked source files, merge/rebase state or detached unique commits were found. All three additional worktrees were clean before integration. No worktree or volume was deleted. The draft SPEC remains explicitly non-binding; no media/invite runtime is claimed.

## Stage dependency result

- `ET-STAR-001`: ALREADY_VERIFIED after this run's automated terminal status synchronization on feature branch; canonical-main projection awaits approved integration.
- `ET-LINE-001`: partial, Rust reference 6/8; two accepted numerical assertions require contract decision before changing tests. Frontend/Worker browser path passes.
- `ET-10.3`: implementation and historical isolated DB/auth E2E evidence exist; literal RU/UK human screen-reader observation remains PENDING. Original data-bearing DB repair requires separate compatibility decision for unknown external SQL callers.
- `ET-11.1` and later ET-11/12 runtime slices: not dependency-ready while ET-10.3 gate and provider/product prerequisites remain. `live-tutoring-session.spec.md` is a draft, not approval.
- `ET-03`, ET-05/06/07, later payments/media/AI stages retain their ROADMAP human, legal, external, or product prerequisites. None is silently promoted by this audit.

## Fresh verification boundary

At local `main@d58e787`: `pnpm verify:full` exit 0 (frozen install, Vitest 168 PASS, lint, Astro check 119 files/0 errors, root Chromium 106 PASS/5 expected live-auth skips, build 25 pages/115 artifact files, production smoke 4 PASS, dependency audit 3 moderate/0 high); backend fast 196 PASS/83 deselected with Ruff format/lint and mypy PASS; project-base Chromium 4+1 PASS; context, CI workflow and hygiene validators PASS. Full Rust reference 6 PASS/2 FAIL, separate source-reflection 2 PASS. Docker service was stopped and daemon unavailable; backend doctor failed at API `127.0.0.1:8000` connection, so no fresh DB/IdP/restore evidence. Migration 0010 source declares nine columns including `result_payload`; repository adapter reads it. Historical preserved DB eight-column drift is not inferred fixed from source. No original database/volume was accessed or modified.

Approval review rejected local-main fast-forward of `feature/live-tutoring-design`, citing the prohibition on direct `main` mutation. The feature merge is preserved and no push/deploy occurred. Canonical-main integration awaits the exact user approval recorded in `../STAGES.md`.

## Authorized local-main integration

On 2026-09-28 the user explicitly approved exact `main → a7b198f`. Preflight checked both expected refs, clean worktrees and FF ancestry; `git merge --ff-only feature/live-tutoring-design` advanced local `main` to `a7b198f`. Design/reconciliation commits are reachable; context/CI/hygiene validators passed. No push/deploy. The earlier approval rejection above remains historical evidence, now resolved for that exact fast-forward.


## Post-physics no-tails addendum

`main@a7b198f` remains clean; `feature/live-tutoring-design@a7b198f` and detached historical `72212d5` are clean and reachable from main. `feature/line-transient-mvp` fast-forwarded from `d58e787` to `a7b198f`, then committed independent physics oracles/evidence at `6a0d08c`; its test/status documentation checkpoint is being recorded on the same branch. This new unique material is accounted for as a pending canonical-main integration boundary under project Git policy, not orphaned or claimed merged. No stashes, unexpected dirty worktrees, new migrations, push or deploy. The original data-bearing DB and MathMorph resources were not touched. Current stage status/NEXT: `../STAGES.md`.
