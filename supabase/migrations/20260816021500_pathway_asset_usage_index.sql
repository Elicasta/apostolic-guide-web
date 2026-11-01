create index if not exists studio_content_calendar_asset_usage_idx
  on public.studio_content_calendar_items(asset_id, updated_at desc)
  where asset_id is not null;

comment on index public.studio_content_calendar_asset_usage_idx is
  'Supports Pathway Asset where-used tracing from Content Calendar references.';
