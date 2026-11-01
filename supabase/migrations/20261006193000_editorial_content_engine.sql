-- Recurring draft production. No publication, enrollment, or send side effects.
create table public.studio_editorial_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.studio_editorial_settings(id) values (true);
alter table public.studio_editorial_settings enable row level security;

create table public.studio_editorial_packs (
  production_date date primary key,
  pathway_slug text not null,
  source_hash text not null,
  project_id uuid not null references public.studio_creative_projects(id),
  payload jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.studio_editorial_packs enable row level security;

-- One transaction includes the pack, editable Creative Project and calendar handoff.
-- Serialize overlapping refill requests; retries never replace an editor's work.
create function public.prepare_editorial_packs(p_packs jsonb)
returns integer language plpgsql security invoker set search_path = public as $$
declare
  pack jsonb;
  project uuid;
  inserted integer := 0;
begin
  if jsonb_typeof(p_packs) <> 'array' or jsonb_array_length(p_packs) > 30 then
    raise exception 'Expected at most 30 editorial packs';
  end if;
  perform pg_advisory_xact_lock(hashtext('apostolic-guide-editorial-refill'));
  for pack in select value from jsonb_array_elements(p_packs) loop
    if exists (select 1 from studio_editorial_packs where production_date = (pack->>'date')::date) then continue; end if;
    project := gen_random_uuid();
    insert into studio_creative_projects (
      id, title, pathway_slug, pathway_collection, intent, format, destination, frame_count,
      status, editor_state, unified_caption, cta, scripture_references, tags, search_text
    ) values (
      project, left(pack->>'title',180), pack->>'pathwaySlug', pack->>'collection',
      case when pack->>'lane' = 'poster' then 'scripture' when pack->>'lane' = 'teaching' then 'teaching' else 'invitation' end,
      pack->>'format', 'instagram', jsonb_array_length(pack->'frames'), 'draft',
      jsonb_build_object('frames',pack->'frames','sourceImages','[]'::jsonb,
        'visualSettings',jsonb_build_object('template','editorial-white','texturePreset','ag-paper-white'),
        'generatedText',jsonb_build_object('producer','Editorial Engine','sourceHash',pack->>'sourceHash','reviewRequired',true,'blockers',pack->'blockers')),
      pack->>'caption', 'Study the full pathway',
      array(select distinct value->>'scripture' from jsonb_array_elements(pack->'frames') where value->>'scripture' <> ''),
      array['editorial-engine',pack->>'lane',pack->>'date'],
      concat_ws(' ',pack->>'title',pack->>'pathwaySlug',pack->>'caption')
    );
    insert into studio_editorial_packs(production_date,pathway_slug,source_hash,project_id,payload)
      values ((pack->>'date')::date,pack->>'pathwaySlug',pack->>'sourceHash',project,pack);
    insert into studio_content_calendar_items(pathway_slug,title,content_type,platform,status,source,source_ref,metadata)
      values (pack->>'pathwaySlug',pack->>'title',case when pack->>'format' = 'single' then 'post' else 'carousel' end,
        'instagram','draft','editorial-engine',pack->>'date',
        jsonb_build_object('planned_date',pack->>'date','creative_project_id',project,'source_hash',pack->>'sourceHash','review_required',true));
    inserted := inserted + 1;
  end loop;
  return inserted;
end $$;
revoke all on function public.prepare_editorial_packs(jsonb) from public, anon, authenticated;
grant execute on function public.prepare_editorial_packs(jsonb) to service_role;
grant all on public.studio_editorial_settings, public.studio_editorial_packs to service_role;
