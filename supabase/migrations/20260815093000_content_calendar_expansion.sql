alter table public.studio_content_calendar_items
  drop constraint if exists studio_content_calendar_items_content_type_check;

alter table public.studio_content_calendar_items
  add constraint studio_content_calendar_items_content_type_check
  check (content_type in ('video','reel','carousel','post','story','thumbnail','image','thread','music','podcast'));

create index if not exists studio_content_calendar_platform_published_idx
  on public.studio_content_calendar_items(platform, published_at desc)
  where published_at is not null;

create index if not exists studio_content_calendar_source_idx
  on public.studio_content_calendar_items(source, updated_at desc);
