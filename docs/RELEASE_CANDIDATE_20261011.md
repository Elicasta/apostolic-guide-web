# Apostolic Guide unified release candidate: 2026-10-11

Status: **RELEASE HOLD**. This is an evidence-based readiness checkpoint, not approval to deploy production migrations or merge #115.

## Owner decision and exclusions

- Finish Studio, Sol, Grokbot, analytics, Content Engine, broadcast, and Video Producer work as a gated unified release.
- **Experimental Teleprompter is deferred.** PR #124 was closed unmerged on 2026-10-11, its branch was preserved, and the existing live Teleprompter remains unchanged. Do not import Voice Follow, cloud-document migration, or changes under Teleprompter routes or components into #115.
- The unified release PR #115 remains draft and is not approved for production until the checks below are complete.
- Doctrine-reviewed Pathway text is already live on production, and was synced into integration. Do not replace it with older copy.
- Do not enable autonomous publishing, external messages, enrollment, Sol Trusted mode, or new production cron side effects as part of an unverified merge.

## Verified in this pass

| Gate | Evidence | Decision |
| --- | --- | --- |
| Source and preview | Integration head `8ecf31b8391d7935fc19936af699093127195a40` had a READY Vercel preview | Code builds, not live behavior proof |
| Existing code coverage | Unit tests for Sol role/kill decisions, Grokbot idempotency, session isolation, planning conflicts, and PGlite RLS are present | Unit evidence only |
| Browserless signed-out API probes | Preview GET `/api/admin/sol` = 403 and GET `/api/admin/editorial` = 403 without a signed-in Studio session | Negative-path smoke pass; not authenticated E2E |
| Database inventory | Supabase `apostolicguide-staging` (`vikmaynudolxiaszxpwg`) exists but lacks `sol_operator_settings`, `studio_creative_projects`, `studio_pathway_assets`, and `video_producer_projects` | **Blocking** foundation mismatch |
| Production inventory (read-only) | Production project `jtvrrsyqvahslelpmtvv` has those prerequisite tables; editorial and Grokbot tables are not present | No schema writes to production |
| Deferred Teleprompter | PR #124 closed unmerged, branch retained. `scripts/check-ag-unified-scope.mjs` and CI scope check reject deferred file paths on #115 | Frozen |
| Three missing local Sol commits | `04359be`, `7711357`, `e72ab1c` remain absent from the connected GitHub repository search | **Blocking until recovered or explicitly scoped out with replacement evidence** |

## Database gate

The pending migrations require tables that are absent from the existing staging project. **Do not simply apply them to that staging database.** Doing so may fail or leave a misleading partial result. Do not copy user data or live secrets to staging.

Before applying SQL:

1. Prepare an isolated **production-schema-equivalent, data-free** database with the correct existing app/studio foundation. A Supabase development branch from the production schema may be suitable, but branch creation can have an additional charge. Get explicit cost approval before creating one.
2. Confirm the schema contains the required parent relations, RPC dependencies, roles, and extensions.
3. Apply the pending SQL on that isolated database, in reviewed dependency order:
   - `202609020001_video_producer_visual_pass.sql`
   - `202609020002_video_producer_visual_import_jobs.sql`
   - `20261006180000_sol_pr1a_guardrails.sql`
   - `20261006193000_editorial_content_engine.sql`
   - `20261008050000_grokbot_workbench.sql`
4. Verify RLS by impersonating authenticated roles with distinct user IDs. Test unauthorized direct reads/writes; preserve the owner-only Grokbot boundary and audit integrity.
5. Prove revision-conflict handling, duplicate requests, Stop Sol, expired approvals, and failure rollback on a separate non-production dataset.
6. Confirm editorial production remains `enabled=false`, and public effects remain disabled until the owner explicitly enables them.
7. Record migration versions, rollback/restore plan, and pass/fail evidence without exposing keys, real accounts, or private content.

## Authenticated end-to-end gate

Required before #115 can become release-ready: a **staging-only preview** with credentials pointing exclusively to the isolated database, and test identities for owner, editor, viewer, and a separate owner. Verify:

- Login/logout, role boundaries, and blocked unauthenticated API calls.
- Sol watch/assist/stop, double approvals, cancellation, persistent audit, and kill switch.
- Grokbot session create/resume, cross-user denial, plan edit conflicts, private upload storage, signed download, and no public effect.
- Studio mobile drawer/fixed Sol launcher and navigation at 390/768/1024/1440px, preferably including iPhone Safari.
- Content Engine produces **drafts only**, without scheduled publication or outbound messages.
- Video Producer media import and scene pipeline against private test assets, without publishing.
- Broadcast and social workflows must not send, publish, or enroll during testing.
- Pathway analytics and 30-day funnel queries must be read-only and reviewed for coverage gaps.
- Existing live Teleprompter unaffected in the production deployment.

## Final review conditions

- Base #115 on the then-current `main`, preserving the released doctrine content.
- Run full npm test, TypeScript, build, targeted lint, video media checks, and the exact-SHA Vercel preview. Global lint legacy debt must be reported separately rather than called a clean pass.
- CI `AG unified release scope` passes and `git diff` confirms no deferred Teleprompter path changes. This is a **path-based check**, not a substitute for human diff review.
- Confirm migrations applied only after explicit authorization and backup, and then merge + production verification in sequence.
- If staging foundation, authenticated identities, or missing Sol commits remain unavailable, report **BLOCKED**, not released.

## Next owner decision

Approve the cost (if any) and use of an isolated Supabase schema-equivalent development database for release testing, or provide an existing isolated project containing the complete prerequisite schema. Do not change the currently configured teleprompter staging data or production schema.
