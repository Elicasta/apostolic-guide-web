# Whole-item Code Mode (Phase 4)

Use `/admin/code-mode` or **Open Code Mode** in the corresponding admin tool. New documents include a `tool` and `version:1`, validated by `src/code-mode/whole-item.ts` and `parseCodeDocument` with line numbers. The editor has Copy, Apply and Reload. Paste JSON to replace a draft's editable fields, not its approval state.

| Tool | JSON body | Canonical draft destination | Hard limit |
| --- | --- | --- | --- |
| Website Content | `{tool:'website',kind,title,slug,summary,body}` | existing `content.create_editorial_item`/`update_editorial_item`, **publish=false** | No edits to published website items |
| Content Engine | `{tool:'content_engine',productionDate,expectedStateVersion,title,caption,artDirection,frames,newsletter}` | atomic update to `studio_editorial_packs` plus linked draft Creative Project | Canonical source/pathway unchanged; doctrine verdict invalidated by project trigger |
| Episode Studio | `{tool:'episode',kind:'script'|'article',id,title,body,premise?}` | draft-only video script/article records | Script theology review cleared; no Ready/approval |
| Pathway Audio | `{tool:'audio',pathwaySlug,scriptText}` | draft-only `pathway_audio_scripts` | 100–4096 chars, previous checker invalidated |
| Teleprompter | `{tool:'teleprompter',id?,title,scriptText,notes}` | private `studio_teleprompter_code_drafts` | No live Teleprompter session mutation |
| Video Studio / Producer | `{tool:'video',kind:'studio'|'producer',id,timeline/style OR title/directorMetadata}` | existing video draft record | No active render, no source footage or publish step |

Example JSON lives in `docs/code-mode/example-*.json`. New HTML/CSS design is in Broadcasts and Carousel where the render path is grounded. Video accepts timeline graphic text and visual style JSON, not unconsumed arbitrary HTML. Threads text-only remains in its own adapter PR.

**Security**: signed-in `manage_content` permission, Zod allowlist, versioned JSON and current-draft checks. No bearer token, new external API token, send, schedule or publication endpoint. The API writes an immutable pre-Apply checkpoint and an audit record. The app must be rolled back before any authorized rollback of the two new private tables or atomic Content Engine RPC.

**Migration**: `supabase/migrations/20261027120000_multi_tool_code_mode.sql`. **Rollback**: `supabase/rollback/20261027120000_multi_tool_code_mode.sql`. RLS ON, service_role only. Test against isolated database before production approval. No SQL run on production in this PR.

**Verification**: npm test, npm run typecheck, changed-file lint, npm run build; UI keyboard/mobile check in preview. Editing a draft never starts a render, sends a broadcast, or changes a published item. No production end-to-end edit or browser-specific visual claim without an authenticated test.
