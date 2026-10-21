# Episode Studio article security release (P0)

## Observed production defect (2026-10-20)
- `public.studio_episode_articles`: RLS **disabled**, zero existing rows.
- PostgreSQL privileges for `anon` and `authenticated` included SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, and TRIGGER.
- The only identified app API is `app/api/admin/episode-studio/[episodeId]/article/route.ts`. All GET/POST/PATCH handlers use `getStudioPermission("manage_content")` and `createServiceClient()`.
- Do **not** treat an admin route permission check as protection against direct Supabase Data API requests while RLS is disabled.

## Proposed fix
`supabase/migrations/20261021031500_lock_episode_articles_rls.sql` enables RLS and revokes all table privileges from `anon` and `authenticated`. It adds no client policy, preserves existing records, and keeps server `service_role` privileges. The migration is an isolated table-only change.

## Verified release gates (2026-10-21)
1. The live table was inspected before any change: RLS disabled, zero rows, direct public-role privileges present, and server-role access present.
2. An in-place **rolled-back transaction** ran the exact RLS+REVOKE statements. SQL assertions checked RLS enabled, all SELECT/INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER grants absent for `anon` and `authenticated`, and server `service_role` access preserved. No assertion failed.
3. After `ROLLBACK`, RLS was still disabled and the old grant was restored, confirming that test left production unchanged.
4. GitHub's Vercel preview build succeeded on the reviewed source and includes static permission-regression tests. This does not substitute for an authenticated browser acceptance test.
5. The owner explicitly requested release without paid staging. The production migration is one table, additive access restrictions only; apply it once with migration history, then requery the policy, privilege matrix, and Supabase security advisor.
6. Verify that only owner/editor may use the article GET/POST/PATCH admin handlers. Sign-out/viewer authorization is enforced by `getStudioPermission("manage_content")` on each route. The live UI has not been exercised with test identities and should be checked by a signed-in owner before new article creation.

No unrelated Sol, Video Producer, editorial, or autonomous publishing migrations belong in this security release.

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
