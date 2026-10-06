# Sol PR 1A: Security, single-use approvals, audit integrity and Stop Sol

Repository: Elicasta/apostolic-guide-web
Branch: fix/sol-pr1a-security-stop-20261006
Scope: backend only. Does not restore the missing launcher or add MCP.

## Existing code reused

- `src/sol-operator.ts` for settings and proposal decisions
- `src/sol-agent-memory.ts` for saved chat and agent approvals
- `src/sol-agent-tools.ts` for the agent's registered tools
- `src/sol-operator-executor.ts` for durable work
- `src/studio-audit.ts` / `public.record_studio_audit` for the audit log
- `app/api/admin/sol/route.ts` for authenticated Sol requests

## Actual database schema (not the draft specification's guesses)

- `sol_operator_settings` (not `sol_settings`)
- `sol_operator_proposals` with status `pending` (not `staged`)
- `sol_operator_runs` with `waiting_review` (not `sol_jobs`)
- `sol_agent_threads`, `sol_agent_messages`, `sol_agent_approvals`
- `studio_audit_events` behind RPC `record_studio_audit`
- `sol_operator_events` for worker events.

## Changes

1. `src/sol-control-policy.ts` makes mode, role, kill and hard-lock decisions in one pure module. Mode activation and Trusted escalation are page-only; Trusted requires Owner acknowledgment. Chat may not change the mode.
2. `app/api/admin/sol/route.ts` enforces the policy before mutations, checks the request Origin and offers POST `{ "action": "stop", "confirm": true }`. Read-only chat still works while stopped.
3. `src/sol-stop.ts` invokes the single database transaction to stop execution, cancel live or review-waiting jobs, revoke pending agent approvals and write a `sol.stop` audit entry.
4. `src/sol-agent-memory.ts` makes an agent approval consumable once, only by its original user, before its 15-minute expiry. A second request fails before tool execution.
5. `src/sol-operator.ts` makes the proposal claim compare-and-swap. A second approval cannot queue duplicate runs. Proposal decision and settings audits are written by database triggers rather than an unverified second call.
6. `src/sol-agent-tools.ts` blocks chat mode changes and rechecks the current stop/pause/mode before mutation tools.
7. `src/sol-operator-executor.ts` checks run status, the execution setting and the env kill switch at claim and between steps. Work already in an external call might finish; Stop cannot retract an external request.
8. The migration extends existing tables, creates transactional audit triggers, expiry, a no-new-jobs-while-stopped trigger and a single Stop RPC. No parallel Sol tables.
9. `.env.example` documents `SOL_KILL_SWITCH`.
10. `tests/sol-control-policy.test.ts` exercises role, mode, acknowledgment, pause, kill and source-contract regressions.

## Required Preview rollout

**Do not merge until a developer runs the database checks against a disposable Preview database.**

1. Open this PR and the Vercel Preview for it. **Do not point its migration test at production.**
2. Back up the Preview database first. In Supabase SQL Editor, select the Preview project and run the migration file `supabase/migrations/20261006180000_sol_pr1a_guardrails.sql` once. Do not run it a second time on the same project just to troubleshoot. If your team already runs migrations from the CLI, `supabase db push` is acceptable only after verifying which Supabase project is linked.
3. In Vercel Preview variables set `SOL_KILL_SWITCH=false` and deploy the PR. Keep the key server-side (no NEXT_PUBLIC prefix).
4. Check that `npm test`, `npm run typecheck` and `npm run build` pass in Studio CI/Vercel.
5. Use the signed-in Studio session to test: Editor cannot change mode; Owner Trusted activation requires `acknowledged:true` in the admin request; approve the same pending agent approval twice concurrently and confirm only one executes; approve a proposal twice and confirm only one run set exists; Stop cancels queued/running/waiting-review jobs; existing scheduled publishing remains unchanged.
6. Open Audit Log and verify one new `sol.proposal_approved`, `sol.proposal_dismissed`, `sol.settings_updated` and `sol.stop` per corresponding action.
7. In Preview only, set `SOL_KILL_SWITCH=true` and redeploy; GET and read-only chat should work, but no mutating scan, approval, retry, or job step should execute. Restore `false` and redeploy.

**Important:** The launcher is not mounted yet. Test these API behaviors with an authenticated admin session, not the missing launcher. The UI repair is Sol PR 1B.

## Production sequence and rollback

After the Preview tests and owner approval, back up production before applying the reviewed additive migration to the production Supabase project. Deploy the matching code only after the migration is present. Merge the PR only when the owner accepts it.

For application rollback, use Vercel **Instant Rollback** / promote the previous healthy deployment. The migration adds columns, triggers and functions; do **not** drop columns or delete approval data as a quick rollback. If the SQL objects themselves must be removed, have a developer review and apply a dedicated down migration against a backup. Reverting the app to an older version after triggers are installed can produce duplicate decision audit entries until the matching trigger is disabled, so coordinate both rollbacks.

## Follow-up work (not in this PR)

PR 1B: mount `SolAdminJarvis` in the shared admin layout, add streamed chat, per-page context, Today briefing, and one visible Review Queue. A separate MCP PR then exposes the same service and policy to ChatGPT and Cursor. Do not start autonomous publishing in PR 1A or 1B.
