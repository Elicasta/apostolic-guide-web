-- Atomic draft-only Code Mode apply. Source of truth remains existing Threads tables.
begin;
create or replace function public.apply_studio_threads_code(p_document jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_mode text;v_batch uuid;v_post jsonb;v_row public.studio_threads_posts%rowtype;v_current public.studio_threads_posts%rowtype;
 v_items jsonb:='[]'::jsonb;v_start date;v_topic text;v_position integer;v_existing uuid;v_body text;v_cat text;
begin
 if p_document->>'tool'<>'threads' or p_document->>'version'<>'1' then raise exception 'Unsupported Code Mode tool or version';end if;
 v_mode:=p_document->>'mode';
 if v_mode not in ('single','weekly') then raise exception 'Invalid Threads mode';end if;
 if jsonb_typeof(p_document->'posts')<>'array' or jsonb_array_length(p_document->'posts')<1 or jsonb_array_length(p_document->'posts')>30 then raise exception 'Invalid Threads post count';end if;
 if v_mode='single' and jsonb_array_length(p_document->'posts')<>1 then raise exception 'Single mode requires one post';end if;
 v_start:=(p_document->>'weekStart')::date;v_topic:=left(p_document->>'topic',300);
 v_batch:=nullif(p_document->>'batchId','')::uuid;
 if v_batch is not null then
  perform 1 from public.studio_threads_batches where id=v_batch and status='draft' for update;
  if not found then raise exception 'Batch is not an editable draft';end if;
  update public.studio_threads_batches set week_start=v_start,topic=v_topic,doctrine_status=null,doctrine_summary=null,updated_at=now() where id=v_batch;
 else
  insert into public.studio_threads_batches(week_start,topic,voice,status) values(v_start,v_topic,'serious-witty','draft') returning id into v_batch;
 end if;
 for v_post in select value from jsonb_array_elements(p_document->'posts') loop
  v_body:=trim(v_post->>'body');v_cat:=v_post->>'category';v_position:=(v_post->>'position')::integer;
  if char_length(v_body)<1 or char_length(v_body)>500 then raise exception 'Threads text exceeds 500 characters or is empty';end if;
  if v_position<1 or v_position>30 then raise exception 'Post position out of range';end if;
  if v_cat not in ('oneness','scripture','witty','question','prayer-news','app','response') then raise exception 'Invalid category';end if;
  if v_post ? 'id' then
   v_existing:=(v_post->>'id')::uuid;
   select * into v_current from public.studio_threads_posts where id=v_existing and batch_id=v_batch and status='draft' for update;
   if not found then raise exception 'Post is not an editable draft in this batch';end if;
   update public.studio_threads_posts set body=v_body,category=v_cat,position=v_position,
    source_title=v_post->>'sourceTitle',source_url=v_post->>'sourceUrl',source_summary=v_post->>'sourceSummary',
    doctrine_status=null,doctrine_notes=null,x_status=case when coalesce((v_post->>'mirrorToX')::boolean,false) then 'mirror-later' else 'off' end,updated_at=now()
    where id=v_existing returning * into v_row;
  else
   insert into public.studio_threads_posts(batch_id,position,category,body,source_title,source_url,source_summary,x_status,status)
   values(v_batch,v_position,v_cat,v_body,v_post->>'sourceTitle',v_post->>'sourceUrl',v_post->>'sourceSummary',
   case when coalesce((v_post->>'mirrorToX')::boolean,false) then 'mirror-later' else 'off' end,'draft') returning * into v_row;
  end if;
  v_items:=v_items||jsonb_build_array(jsonb_build_object('id',v_row.id,'body',v_row.body,'category',v_row.category,'position',v_row.position));
 end loop;
 return jsonb_build_object('batchId',v_batch,'posts',v_items);
end $$;
revoke all on function public.apply_studio_threads_code(jsonb) from public,anon,authenticated;
grant execute on function public.apply_studio_threads_code(jsonb) to service_role;
commit;