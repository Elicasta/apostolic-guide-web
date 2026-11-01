create table if not exists public.video_producer_media_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.video_producer_projects(id) on delete cascade,
  role text not null check (role in ('camera_b','external_audio')),
  storage_provider text not null default 'vercel_blob' check (storage_provider in ('vercel_blob')),
  storage_locator text not null,
  filename text not null,
  mime_type text not null,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  duration double precision check (duration is null or duration >= 0),
  has_audio boolean,
  sync_status text not null default 'uploading' check (sync_status in ('uploading','analyzing','syncing','synced','needs_review','failed','manual')),
  sync_method text check (sync_method is null or sync_method in ('waveform','manual')),
  offset_seconds double precision,
  sync_confidence double precision check (sync_confidence is null or (sync_confidence >= 0 and sync_confidence <= 1)),
  sync_metadata jsonb not null default '{}'::jsonb,
  revision integer not null default 1 check (revision > 0),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists video_producer_media_assets_one_active_role_idx
  on public.video_producer_media_assets(project_id, role)
  where active;
create index if not exists video_producer_media_assets_project_idx
  on public.video_producer_media_assets(project_id, active, role);
create index if not exists video_producer_media_assets_sync_idx
  on public.video_producer_media_assets(sync_status)
  where active and sync_status in ('uploading','analyzing','syncing','needs_review');
create index if not exists video_producer_media_assets_created_by_idx on public.video_producer_media_assets(created_by);
create index if not exists video_producer_media_assets_updated_by_idx on public.video_producer_media_assets(updated_by);

alter table public.video_producer_media_assets enable row level security;

alter table public.video_producer_projects
  add column if not exists camera_plan jsonb,
  add column if not exists audio_plan jsonb not null default '{"version":1,"source":"camera_a"}'::jsonb,
  add column if not exists media_revision integer not null default 1 check (media_revision > 0);

comment on table public.video_producer_media_assets is
  'Optional synchronized Camera B and External Audio assets. Camera A remains the project source_* contract.';
comment on column public.video_producer_projects.camera_plan is
  'Source-time Camera A/B decision list. Null means legacy/single-camera Camera A only.';
comment on column public.video_producer_projects.audio_plan is
  'Continuous production audio selection independent of visual camera switching.';

create trigger video_producer_media_assets_touch_updated_at
before update on public.video_producer_media_assets
for each row execute function public.touch_updated_at();
