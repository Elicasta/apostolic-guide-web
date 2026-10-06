-- Visual Pass media worker ledger. Stock and generated provider URLs are
-- temporary inputs only. Completed jobs always point at durable private media.

create table if not exists public.video_producer_visual_import_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.video_producer_projects(id) on delete cascade,
  beat_id uuid not null references public.video_producer_visual_beats(id) on delete cascade,
  generation_job_id uuid references public.video_producer_visual_generation_jobs(id) on delete set null,
  provider text not null check (provider in ('pexels','pixabay','runway','firefly','upload')),
  provider_asset_id text,
  source_url text,
  download_url text not null,
  creator text,
  license_name text,
  license_url text,
  license_snapshot text,
  title text not null default '',
  desired_duration double precision not null check (desired_duration > 0 and desired_duration <= 30),
  requested_asset_in double precision not null default 0 check (requested_asset_in >= 0),
  reusable boolean not null default true,
  status text not null default 'queued' check (status in ('queued','downloading','normalizing','uploading','completed','failed','cancelled')),
  progress jsonb not null default '{"percent":0,"stage":"Queued"}'::jsonb,
  asset_id uuid references public.video_producer_visual_assets(id) on delete set null,
  placement_id uuid references public.video_producer_visual_placements(id) on delete set null,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index if not exists video_producer_visual_import_jobs_project_idx
  on public.video_producer_visual_import_jobs(project_id, created_at desc);
create index if not exists video_producer_visual_import_jobs_work_idx
  on public.video_producer_visual_import_jobs(status, created_at)
  where status in ('queued','downloading','normalizing','uploading');

alter table public.video_producer_visual_import_jobs enable row level security;
revoke all on public.video_producer_visual_import_jobs from public, anon, authenticated;
grant all on public.video_producer_visual_import_jobs to service_role;

comment on table public.video_producer_visual_import_jobs is
  'Async stock/generated-media ingest jobs. The worker downloads only selected footage, normalizes it, hashes it, saves provenance, and creates the provisional V2 placement.';
