-- Phase 4 only after authorized application rollback and backup.
begin;
drop function if exists public.apply_code_editorial_pack(date,text,text,text,jsonb,jsonb,integer,uuid);
drop table if exists public.studio_teleprompter_code_drafts;
drop table if exists public.studio_code_mode_checkpoints;
commit;
