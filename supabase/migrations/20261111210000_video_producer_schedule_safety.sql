-- Calendar drafts never publish by themselves. Only an authenticated user action can submit.
alter table public.video_producer_schedule_drafts
  drop constraint if exists video_producer_schedule_drafts_status_check;
alter table public.video_producer_schedule_drafts
  add constraint video_producer_schedule_drafts_status_check
  check (status in ('draft','submitting','submitted','failed','canceled'));
alter table public.video_producer_schedule_drafts
  add column if not exists local_date date,
  add column if not exists local_time text not null default '18:00',
  add column if not exists title text not null default '',
  add column if not exists description text not null default '',
  add column if not exists youtube_video_id text,
  add column if not exists error_message text,
  add column if not exists submitted_at timestamptz,
  add column if not exists custom_thumbnail_path text;
create unique index if not exists video_producer_one_publish_per_brand_day
  on public.video_producer_schedule_drafts(brand_slug,local_date)
  where status in ('draft','submitting','submitted');
create index if not exists video_producer_schedule_drafts_project_idx
  on public.video_producer_schedule_drafts(project_id,status);
