-- Phase 2 rollback. Apply ONLY in an authorized maintenance window after app rollback and backup.
begin;
drop table if exists public.studio_code_mode_presets;
drop table if exists public.studio_broadcast_code_revisions;
drop table if exists public.studio_broadcast_code_drafts;
alter table public.studio_doctrine_verdicts drop constraint if exists studio_doctrine_verdicts_source_type_check;
alter table public.studio_doctrine_verdicts add constraint studio_doctrine_verdicts_source_type_check check(source_type in ('creative_project','threads','custom_asset','video_render','video_clip'));
commit;