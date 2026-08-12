alter table public.pathway_audio_scripts
  add column if not exists checker_status text,
  add column if not exists checker_model text,
  add column if not exists checked_script_hash text,
  add column if not exists checker_result jsonb not null default '{}'::jsonb,
  add column if not exists checked_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pathway_audio_scripts_checker_status_check'
      and conrelid = 'public.pathway_audio_scripts'::regclass
  ) then
    alter table public.pathway_audio_scripts
      add constraint pathway_audio_scripts_checker_status_check
      check (checker_status is null or checker_status in ('passed', 'needs_review'));
  end if;
end $$;

comment on column public.pathway_audio_scripts.checker_status is 'Latest AI editorial/theology checker verdict for the exact checked script hash.';
comment on column public.pathway_audio_scripts.checked_script_hash is 'Script hash covered by checker_status/checker_result. Editing the script invalidates this check.';
comment on column public.pathway_audio_scripts.checker_result is 'Structured Apostolic Guide script checker result. Service-role editorial data only.';
