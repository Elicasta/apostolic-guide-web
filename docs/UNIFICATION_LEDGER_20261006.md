# Apostolic Guide: Unified Reconciliation Ledger

Status: **IN PROGRESS / NOT RELEASED**  
Inventory captured: 2026-10-06  
Repository: `Elicasta/apostolic-guide-web`  
Integration branch: `integration/ag-unified-20261006`  
Baseline `main`: `9b995dd065ea737e81345b3904da1a48d1ae7af4` (PR #110 was already merged)

## Objective

Reconcile the repository's current unique work into **one reviewable integration branch**, without dropping valuable work, blindly merging stale branches, or modifying production. The final implementation on this branch must pass tests and present an evidence-backed list of what was integrated, superseded, or blocked before any separate decision to merge to `main`.

**Production stays on `main`. This integration branch is not a release authorization.**

## Confirmed remote inventory

GitHub inspection found **134 remote branches** (2 pages) and **12 open PRs**, as of the capture above. These are *remote* counts; they do not include any local-only Cursor/Desktop branches or unpushed changes. A branch's existence or an open PR does not prove it adds unique changes to current `main`.

### Open PR inventory and provisional action

| PR | Work | Branch / base | Provisional reconciliation |
| --- | --- | --- | --- |
| [#113](https://github.com/Elicasta/apostolic-guide-web/pull/113) | ChatGPT/Cursor rules + PR template | `docs/shared-agent-contract-20261006` → main | Bring in unmodified unless contradicted by current code |
| [#112](https://github.com/Elicasta/apostolic-guide-web/pull/112) | Daily editorial drafts, KJV passages, queue handoffs | `feat/editorial-content-engine` → main | Integrate after validating schema/runtime assumptions; do not schedule or publish |
| [#111](https://github.com/Elicasta/apostolic-guide-web/pull/111) | Sol security/Stop Sol | `fix/sol-pr1a-security-stop-20261006` → main | Remote PR only has `372b5362402a`; restore missing local work before calling complete; no production migration |
| [#104](https://github.com/Elicasta/apostolic-guide-web/pull/104) | Exact reader funnel analytics | `feat/pathway-reader-funnel-20261002` → main | Code can be reconciled; production 30-day read-only validation is still pending |
| [#103](https://github.com/Elicasta/apostolic-guide-web/pull/103) | Native video scene editor, background drafts | `feat/video-producer-scene-editor` → **#102 branch** | Integrate only after #102; block cron activation and publishing; authenticated workflow/E2E verification pending |
| [#102](https://github.com/Elicasta/apostolic-guide-web/pull/102) | Visual Pass and B-roll renderer | `feat/video-producer-visual-pass` → main | Integrate before #103, preserving verified footage/FFmpeg output |
| [#88](https://github.com/Elicasta/apostolic-guide-web/pull/88) | Video Producer multicam | `feat/video-producer-multicam` → main | Compare patch IDs/content with #102/#103 before applying: likely overlapping, not assumed merged |
| [#79](https://github.com/Elicasta/apostolic-guide-web/pull/79) | Big-edit staging lane | `edit/ag-big-edit-2026-08-19` → main | Audit unique changes; do not wholesale merge old staging work |
| [#74](https://github.com/Elicasta/apostolic-guide-web/pull/74) | Motion Engine pilot | `feature/apostolic-motion-engine-v1` → `fix/carousel-studio-design-hierarchy` | Audit stacked ancestors and relevance |
| [#70](https://github.com/Elicasta/apostolic-guide-web/pull/70) | Older Sol Runtime V1 | `codex/sol-runtime-v1` → main | Compare to current Sol implementation, avoid competing runtimes |
| [#26](https://github.com/Elicasta/apostolic-guide-web/pull/26) | Song Studio | `agent/apostolic-song-studio` → main | Separate product scope; classify and request explicit inclusion if unrelated |
| [#3](https://github.com/Elicasta/apostolic-guide-web/pull/3) | Spanish i18n foundation | `feature/guia-apostolica-i18n-foundation` → main | Separate product scope; classify and request explicit inclusion if unrelated |

### Known unpushed Cursor/Desktop work

Reported in previous handoff, **not verified on GitHub**:

- `04359be` on `fix/sol-pr1a-security-stop-20261006`: hardening above the current #111 head.
- `7711357` on `cursor/sol-mcp-read-facade-2e88`: Sol MCP read facade.
- `e72ab1c` on `cursor/sol-ui-restore-2e88`: Sol Studio UI restoration.

**Hard requirement:** Never mark those patches integrated based on their descriptions or SHA alone. Cursor Cloud Agents cannot assume access to a separate desktop's local Git objects. Request a safe push/PR or a reproducible source handoff from the original environment; preserve the existing branches and never force-push.

## Execution sequence

1. **Audit first.** Refresh remote branches/PRs. For every remote branch, determine whether its unique changes are already on `main` by ancestry, equivalent/squashed patch, or not yet integrated. Group duplicates and record uncertain cases. Avoid obsolete features and overlapping SQL migrations.
2. **Stabilize the base.** Work on `integration/ag-unified-20261006`. Preserve #113 rules and review template, so all agents follow one contract. Document exact HEAD and merge decisions. Avoid interfering with active branches/PRs.
3. **Reconcile active features in dependency order.** Prioritize #112 editorial, #102 Visual Pass, then stacked #103 editor, #111 remote backend safety and any retrieved local-only patches, and #104 analytics; prefer targeted cherry-picks/semantic merges that retain newest conventions, not blind branch merges. Validate each conflict at source and with tests.
4. **Address legacy PRs.** Prove whether #88, #79, #74, #70, #26, and #3 contain unique desirable work or are superseded/out-of-scope. Keep outstanding requests visible rather than silently deleting history.
5. **Verify.** Check `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` (note build already runs tests), and relevant video/FFmpeg and Studio browser E2E tests wherever the environment supports them. Report unavailable verification honestly, including pending Studio login/isolated DB access.
6. **Release gate.** Produce a final diff, PR inventory disposition, migration plan, required permissions, and explicit go/no-go. No merges into `main` or production changes until separately approved.

## Never do during consolidation without a separate explicit approval

- Do **not** merge to `main`, auto-merge old PRs, delete branches, or force-push.
- Do **not** apply Supabase migrations to production, run destructive data operations, or loosen auth/policy gates.
- Do **not** activate Video Producer cron, marketing automation, social posts, email campaigns, or published content.
- Do **not** treat a passing typecheck as authenticated Studio E2E validation.
- Do **not** make competing duplicate Sol managers, video producer workers, content engines, or analytics tables.
- Do **not** assume a local-only commit is available in a Cloud Agent workspace.

## Reconciliation evidence table (maintained by implementing agent)

Use the following statuses: `INTEGRATED`, `ALREADY_IN_MAIN`, `SUPERSEDED`, `BLOCKED`, `OUT_OF_SCOPE`, `PENDING_REVIEW`.

For every PR, active remote branch with unique work, and local-only item, record:
`source | base/head SHA | unique diff or patch proof | disposition | integration commit | test evidence | risk/blocker | next owner action`.

When all *in-scope, accessible* sources are reconciled and tested, request a review on the one integration PR. If any missing local-only commits remain, say **incomplete**, not unified or release-ready.

## Cost discipline

Keep the original deployment instructions in root `AGENTS.md`. Use `[skip vercel]` for intermediate commits when needed and one final preview at a reviewable checkpoint. Documentation-only checkpoints need no Vercel build.
