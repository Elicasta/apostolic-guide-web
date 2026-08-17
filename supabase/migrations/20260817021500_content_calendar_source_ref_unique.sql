alter table public.studio_content_calendar_items
  add constraint studio_content_calendar_items_source_ref_key unique (source, source_ref);
