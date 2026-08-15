alter table public.video_producer_projects
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users(id) on delete set null;

create index if not exists video_producer_projects_deleted_at_idx
  on public.video_producer_projects(deleted_at desc)
  where deleted_at is not null;

create index if not exists video_producer_projects_active_updated_idx
  on public.video_producer_projects(updated_at desc)
  where deleted_at is null;

comment on column public.video_producer_projects.deleted_at is
  'Soft-delete timestamp used by the Video Producer Recovery Bucket. Null means active.';
