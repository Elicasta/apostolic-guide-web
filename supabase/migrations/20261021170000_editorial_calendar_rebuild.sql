-- Rebuild the editorial queue safely after a cleared/archived 14-day batch.
-- Existing calendar entries are only reused when they still point at an
-- archived editorial draft, never approved, scheduled, published or asset-
-- attached content. Duplicate retries remain serialized by advisory lock.
-- The caller must be service_role; no browser RPC execution is granted.
create or replace function public.prepare_editorial_packs(p_packs jsonb)
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
        'visualSettings',jsonb_build_object('style','editorial-white','template','editorial-white','texturePreset','ag-paper-white'),
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
        jsonb_build_object('planned_date',pack->>'date','creative_project_id',project,'source_hash',pack->>'sourceHash','review_required',true))
      on conflict (source, source_ref) where source_ref is not null do update
        set pathway_slug = excluded.pathway_slug,
            title = excluded.title,
            content_type = excluded.content_type,
            platform = excluded.platform,
            status = 'draft',
            metadata = excluded.metadata,
            updated_at = now()
      where studio_content_calendar_items.source = 'editorial-engine'
        and studio_content_calendar_items.status = 'draft'
        and studio_content_calendar_items.scheduled_for is null
        and studio_content_calendar_items.published_at is null
        and studio_content_calendar_items.publication_id is null
        and studio_content_calendar_items.asset_id is null
        and exists (
          select 1 from studio_creative_projects old_project
          where old_project.id::text = studio_content_calendar_items.metadata->>'creative_project_id'
            and old_project.status = 'archived'
        );
    if not found then
      raise exception 'Editorial calendar date % is reserved by reviewed or scheduled content; no overwrite performed',
        pack->>'date';
    end if;
    inserted := inserted + 1;
  end loop;
  return inserted;
end $$;
revoke all on function public.prepare_editorial_packs(jsonb) from public, anon, authenticated;
grant execute on function public.prepare_editorial_packs(jsonb) to service_role;
