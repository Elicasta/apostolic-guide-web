# Episode Studio article security release (P0)

## Observed production defect (2026-10-20)
- `public.studio_episode_articles`: RLS **disabled**, zero existing rows.
- PostgreSQL privileges for `anon` and `authenticated` included SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, and TRIGGER.
- The only identified app API is `app/api/admin/episode-studio/[episodeId]/article/route.ts`. All GET/POST/PATCH handlers use `getStudioPermission("manage_content")` and `createServiceClient()`.
- Do **not** treat an admin route permission check as protection against direct Supabase Data API requests while RLS is disabled.

## Proposed fix
`supabase/migrations/20261021031500_lock_episode_articles_rls.sql` enables RLS and revokes all table privileges from `anon` and `authenticated`. It adds no client policy, preserves existing records, and keeps server `service_role` privileges. The migration is an isolated table-only change.

## Required release gates
1. **Never apply this migration to production as the first test.** Obtain a production-schema-equivalent *data-free* Supabase branch or an equivalent isolated local Postgres database.
2. Apply the migration on staging and query `pg_class.relrowsecurity` and `has_table_privilege` for both public roles. Every direct privilege tested must return false.
3. Confirm `anon` and a distinct ordinary `authenticated` test user cannot SELECT, INSERT, UPDATE, DELETE, or TRUNCATE this table through the Data API.
4. With a staging episode-script fixture, verify an owner/editor can POST (draft), PATCH (edit), and GET through the admin API; viewer and signed-out requests must return 403. This ensures the server-side service client still works.
5. Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`; inspect exact-SHA Vercel preview. Mark checks not run as NOT RUN rather than passed.
6. Obtain explicit permission for the production SQL, make a backup/restore plan, apply exactly the reviewed migration, and rerun security advisors. Do not apply unrelated integration migrations in this release.

## Read-only inspection SQL (safe on any environment)
```sql
select
  c.relrowsecurity as rls_enabled,
  has_table_privilege('anon', 'public.studio_episode_articles', 'SELECT') as anon_can_select,
  has_table_privilege('anon', 'public.studio_episode_articles', 'INSERT') as anon_can_insert,
  has_table_privilege('anon', 'public.studio_episode_articles', 'UPDATE') as anon_can_update,
  has_table_privilege('anon', 'public.studio_episode_articles', 'DELETE') as anon_can_delete,
  has_table_privilege('anon', 'public.studio_episode_articles', 'TRUNCATE') as anon_can_truncate,
  has_table_privilege('authenticated', 'public.studio_episode_articles', 'SELECT') as authenticated_can_select,
  has_table_privilege('authenticated', 'public.studio_episode_articles', 'INSERT') as authenticated_can_insert,
  has_table_privilege('authenticated', 'public.studio_episode_articles', 'UPDATE') as authenticated_can_update,
  has_table_privilege('authenticated', 'public.studio_episode_articles', 'DELETE') as authenticated_can_delete,
  has_table_privilege('authenticated', 'public.studio_episode_articles', 'TRUNCATE') as authenticated_can_truncate,
  has_table_privilege('service_role', 'public.studio_episode_articles', 'SELECT') as service_can_select
from pg_class c where c.oid = 'public.studio_episode_articles'::regclass;
```

## Rollback
If legitimate server operations fail, investigate service-key configuration first. Restore the reviewed previous grants/RLS configuration only under explicit incident authorization. A blind rollback would reopen direct unauthenticated access, so preserve the secure state whenever possible.
