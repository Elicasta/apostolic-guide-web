# Threads Code Mode

Uses `{ "tool":"threads", "version":1, "mode":"single"|"weekly", "weekStart":"YYYY-MM-DD", "topic":"...", "batchId"?:uuid, "posts":[{ "id"?:uuid, "position":1, "category":"oneness", "body":"Text, max 500 chars", "sourceTitle"?:string, "sourceUrl"?:url, "sourceSummary"?:string, "mirrorToX":false }] }`.

Apply invokes the service-role-only atomic `apply_studio_threads_code` function, inserting/updating **draft-only** records. It invokes the existing single shared Doctrine validator per saved post. PASS/FLAG/FAIL are represented in the results; owner overrides of FLAG still go through the normal doctrine panel. Failure to check leaves the post unchecked and blocked from Ready. The ordinary single/weekly composers remain available. No images or quote-card adapter exists because Threads is currently text-only.

Migration: `supabase/migrations/20261027113000_threads_code_mode.sql`. Rollback: `supabase/rollback/20261027113000_threads_code_mode.sql`. No existing table is rewritten. No production migration was applied. Test in isolated Supabase/PGlite and obtain owner approval before release. Apply is never a publish or schedule action.
