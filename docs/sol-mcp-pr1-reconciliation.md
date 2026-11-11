# Reconciliation: Sol PR 1A and read-only Apostolic Guide MCP PR 1

**Date:** 2026-10-06
**Sol branch:** `fix/sol-pr1a-security-stop-20261006` (PR #111, draft)
**Local MCP prototype:** `http://127.0.0.1:43123/mcp` (not in the AG GitHub repository)
**Production:** not changed by this reconciliation.

## Decision

Keep **one Apostolic Guide Sol Core** for domain reads and authorization.
The local MCP server is only a Streamable HTTP + OAuth transport adapter. Its model provider remains separate; read tools call no LLM, do not create jobs, and do not modify production.

**Do not merge the MCP prototype into PR #111.** PR #111 secures the Sol backend. Create a separate MCP integration PR based on the accepted Sol safety branch. This document and the `decideSolReadTool` contract are the common seam.

## What matches and what needs correction

| Local MCP v1 | Sol PR 1A / existing source | Reconciliation |
| --- | --- | --- |
| `get_workspace_status` | `getSolOperatorSnapshot` + `getSolAgentTeamSnapshot` | Use a redacted, audited, read-only server facade. |
| `get_content_inventory` | `getSolManagerContentInventory` | Keep Sol's script hash / doctrine readiness rules; do not recompute counts in the MCP package. |
| `get_people_journey_status` | `getSolManagerPeopleStatus` | Require `view_people` **and** `view_journeys`, minimize/mask contact information. |
| `get_forge_status` | `getForgeProductionStatus` | Read-only snapshot, no generation. |
| `list_creative_projects` | `getCreativeProductionSnapshot` | No publishing, editing or render calls. |
| `list_proposals` | `sol_operator_proposals`, `pending` | Owner/Admin-only for unredacted details. Map `pending` to `staged` only at the transport boundary if a client explicitly needs the external vocabulary. |
| `list_runs` | `sol_operator_runs`, `waiting_review`, `stalled`, `completed`, `cancelled` | Do not invent `sol_jobs`; do not claim failed or queued work is done. Owner/Admin-only unredacted. |
| MCP mutation tools | `decideSolControl`, Sol tool dispatch and SQL guards | Not advertised by MCP v1; if a client calls a forbidden tool name, reject before any Studio read or model call. |
| Supabase user OAuth token | Studio member role and service-role-only tables | Verify identity on Studio backend; do **not** make the client a direct table reader or broaden RLS to let MCP work. |
| Demo adapter | local sample rows | Explicitly label every sample result as synthetic and never return it as live Studio status. |

## Shared policy contract added to PR #111

`src/sol-control-policy.ts` now exports:

- `SOL_MCP_READ_TOOLS`: exactly 7 v1 read tools (workspace, inventory, people/journeys, Forge, creative projects, proposals, runs)
- `decideSolReadTool({ role, tool })`: deny-by-default role/allowlist check, independent of Sol's Watch/Assist/Trusted setting and `SOL_KILL_SWITCH`
- `decideSolControl`: **separate** policy for any future mutations; do not call it to authorize read-only tools.
- `decideSolHardLock`: permanent forbidden actions.

`tests/sol-mcp-read-policy.test.ts` verifies role/tool matrix, owner-only work details and rejection of mutation aliases. A Streamable HTTP handshake or a successful PKCE code exchange is **not** proof of authorization to query Studio tables.

## Authentication/authorization separation

1. An MCP client discovers the protected resource, authenticates, and sends a bearer access token.
2. The server validates the bearer token cryptographically and checks the configured issuer, audience, expiry, and authorized Supabase user identity. Do not infer identity from client-supplied user IDs or `role` strings.
3. Resolve that **verified user ID** to the existing `studio_members` permissions on the server. Authentication is not membership.
4. Call `decideSolReadTool` for the **specific** tool with that role. Reject unauthorized tools with structured `ROLE` or `HARD_LOCK` errors.
5. Use a narrow, server-only Studio facade for canonical reads. Because existing Sol tables are service-role-only, an ordinary user JWT cannot query them directly. The facade may use existing server-held privileged access **after** authentication and role checks; it returns only allowed, redacted DTOs. Do not send service keys to the MCP client or a browser.
6. Add request IDs, bounded result sizes, `source` and `as_of` fields; audit with verified actor identity and tool name, avoiding raw email/message leakage.

The **local** `MCP_AUTH_MODE=local` identity is only for protocol test fixtures. It must never grant production Studio table access. `MCP_AUTH_MODE=supabase` needs a real Supabase-authenticated token and a working role-resolving read facade. A local OAuth mock cannot establish either.

Do not proxy through `GET /api/admin/sol?agent=1` in MCP. It is a cookie-authenticated UI route; its chat-memory code can update conversation state, and its aggregated payload is broader than a tool's permission boundary. Do not call `scanSolOperator`, `runSolManagerCycle`, `runSolAgentTurn`, or `executeSolAgentTool` for MCP v1. Those may write data, cause model calls, or queue work.

## Deployment and compatibility gates

1. **Sol PR #111:** complete CI, isolated Preview migration, tests of atomic Stop, approval one-use/expiry, transaction audit, and worker cancellation. No merge without acceptance.
2. **MCP local PR 1:** verify Streamable HTTP initialize/list-tools/call-tool, S256-only PKCE, protected-resource discovery, 401/403 behavior, reauthentication, SSE, and abort. These are protocol tests, not Studio integration tests.
3. **MCP real-data adapter (separate PR):** point to one authenticated Studio read facade; confirm same data, `as_of` and source diagnostics as Sol Manager for every of the seven tools. Test Owner/Admin, Editor, Moderator, Viewer and unauthenticated access. Querying service-role-only tables with a bare user token must remain forbidden.
4. **ChatGPT/Cursor compatibility:** local loopback is not generally reachable from remote ChatGPT. Test with a properly secured HTTPS development endpoint / tunnel, verify actual client OAuth flow and permissions. Do not publish `https://apostolicguide.com/mcp` until the read facade, auth and rate limiting are proven.
5. **Production:** keep the MCP deployment and any scope expansion behind separate approval; no provider calls, SQL writes, scheduled jobs, automation activation, publishing, DM or email sending in v1.

## Compatibility assertions for the MCP implementer

- The MCP tool catalog matches `SOL_MCP_READ_TOOLS` exactly.
- Mutation probes return forbidden **without** invoking models or services; no writes to `sol_operator_*` or `studio_audit_events` except specifically authorized **read-call audit** instrumentation.
- Empty/permission-denied queries never fall back silently to synthetic sample rows.
- Read tools remain usable when Sol execution is Paused, Watch, or administratively stopped.
- No Vercel service-role key or OAuth client secret appears in browser bundles, responses, logs or MCP samples.
- A stale/failed audio record never counts as current. The current canonical doctrine and exact hash rules remain untouched.
- GET/list endpoints return bounded, role-sanitized data. A new role or tool name defaults to deny.

## Remaining blocker

The MCP prototype was reported at `127.0.0.1:43123` but its source is **not in this GitHub repository or linked to this chat as an attachment**. The server cannot be imported, diffed or end-to-end tested from PR #111 yet. This document is a versioned handoff; integration status remains **contract aligned, not runtime connected**.
