insert into public.person_events(person_id,event_type,channel,event_name,external_event_id,metadata,occurred_at)
select p.id,
       case when p.source='instagram' then 'comment' else 'identified' end,
       case when p.source='instagram' then 'instagram' else 'email' end,
       case when p.source='instagram' then 'First Instagram interaction' else 'First identified interaction' end,
       'first-touch:'||p.id::text,
       jsonb_build_object('source',p.source,'source_detail',p.source_detail),
       p.first_seen_at
from public.people p
where not exists (select 1 from public.person_events pe where pe.person_id=p.id)
on conflict (external_event_id) do nothing;
