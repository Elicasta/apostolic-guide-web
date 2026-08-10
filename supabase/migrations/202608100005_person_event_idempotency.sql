alter table public.person_events
  add constraint person_events_external_event_id_key unique (external_event_id);
