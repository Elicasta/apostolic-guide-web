-- Manual rollback for 20260816120000_persistent_creative_publishing.sql.
-- Run only when intentionally removing the persistent creative layer.

alter table public.pathway_publications drop constraint if exists pathway_publications_publication_mode_check;
alter table public.pathway_publications drop constraint if exists pathway_publications_status_check;

alter table public.pathway_publications
  drop column if exists attempt_count,
  drop column if exists manual_finish_reason,
  drop column if exists publication_mode,
  drop column if exists creative_project_id;

alter table public.pathway_publications
  add constraint pathway_publications_status_check
  check (status in ('draft','ready','scheduled','publishing','published','failed','cancelled'));

drop trigger if exists studio_creative_projects_touch on public.studio_creative_projects;
drop function if exists public.touch_studio_creative_project_updated_at();
drop table if exists public.studio_creative_project_assets;
drop table if exists public.studio_creative_project_revisions;
drop table if exists public.studio_creative_projects;
