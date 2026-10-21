-- P0 security hardening: episode article drafts are edited exclusively through
-- authenticated, permission-checked Next.js route handlers using the server
-- service client. No browser role should have direct table access.
--
-- Production finding (2026-10-20): this table had RLS disabled, with
-- INSERT/SELECT/UPDATE/DELETE/TRUNCATE/TRIGGER privileges for anon and
-- authenticated. The table contained zero rows during the audit.
--
-- Verified using BEGIN / permission assertions / ROLLBACK against the live
-- schema on 2026-10-21. No changes were retained in the dry run.
-- No backfill or destructive data change is required.
begin;

alter table public.studio_episode_articles enable row level security;

-- Explicitly revoke privileges too. RLS alone does not protect TRUNCATE,
-- REFERENCES, or certain other table privileges.
revoke all privileges on table public.studio_episode_articles
  from anon, authenticated;

-- No client policies are intended. Server-only service-role operations are
-- unchanged; the admin API checks manage_content before accessing this table.
commit;
