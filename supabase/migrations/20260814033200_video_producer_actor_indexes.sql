create index if not exists video_producer_projects_created_by_idx
  on public.video_producer_projects(created_by)
  where created_by is not null;

create index if not exists video_producer_projects_updated_by_idx
  on public.video_producer_projects(updated_by)
  where updated_by is not null;

create index if not exists video_producer_renders_requested_by_idx
  on public.video_producer_renders(requested_by)
  where requested_by is not null;
