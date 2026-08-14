alter table public.video_producer_projects
  add column if not exists source_provider text not null default 'vercel_blob'
    check (source_provider in ('vercel_blob','external_url'));

alter table public.video_producer_projects
  add column if not exists source_locator text;

comment on column public.video_producer_projects.source_locator is
  'Provider-specific immutable source locator. For Vercel Blob this is the private blob pathname; never store short-lived signed URLs here.';
