-- Apostolic Guide Video Producer: Visual Pass / B-roll assembly.
-- Search candidates remain lightweight. Only selected or generated media is
-- persisted to private Vercel Blob and promoted into the durable asset table.

create table if not exists public.video_producer_visual_beats (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.video_producer_projects(id) on delete cascade,
  source_start double precision not null check (source_start >= 0),
  duration double precision not null check (duration > 0 and duration <= 30),
  dialogue text not null default '' check (char_length(dialogue) <= 1000),
  recommendation text not null check (recommendation in ('a-roll','punch-in','camera-b','scripture','graphic','b-roll')),
  intent text not null check (char_length(intent) between 1 and 800),
  search_queries text[] not null default '{}',
  vocabulary text not null check (vocabulary in ('scripture','god-eternity','incarnation','history','debate-argument','humanity','church-life','abstract-editorial')),
  preferred_style text,
  avoid text[] not null default '{}',
  status text not null default 'open' check (status in ('open','searching','resolved','skipped')),
  source text not null default 'sol' check (source in ('sol','manual')),
  revision integer not null default 1 check (revision > 0),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, source_start, recommendation)
);

create table if not exists public.video_producer_visual_assets (
  id uuid primary key default gen_random_uuid(),
  source_provider text not null check (source_provider in ('ag-library','pexels','pixabay','runway','firefly','upload')),
  provider_asset_id text,
  source_url text,
  creator text,
  license_name text,
  license_url text,
  license_snapshot text,
  retrieved_at timestamptz not null default now(),
  storage_provider text not null default 'vercel_blob' check (storage_provider = 'vercel_blob'),
  storage_locator text not null unique,
  filename text not null check (char_length(filename) between 1 and 255),
  mime_type text not null,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  sha256 text,
  duration double precision check (duration is null or duration >= 0),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  fps double precision check (fps is null or fps > 0),
  tags text[] not null default '{}',
  description text,
  generation_prompt text,
  generation_model text,
  reusable boolean not null default true,
  rights_flags jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  revision integer not null default 1 check (revision > 0),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists video_producer_visual_assets_provider_id_idx
  on public.video_producer_visual_assets(source_provider, provider_asset_id)
  where provider_asset_id is not null and reusable;
create index if not exists video_producer_visual_assets_tags_idx
  on public.video_producer_visual_assets using gin(tags);
create index if not exists video_producer_visual_assets_provider_updated_idx
  on public.video_producer_visual_assets(source_provider, updated_at desc);

create table if not exists public.video_producer_visual_candidates (
  id uuid primary key default gen_random_uuid(),
  beat_id uuid not null references public.video_producer_visual_beats(id) on delete cascade,
  provider text not null check (provider in ('ag-library','pexels','pixabay','runway','firefly','upload')),
  provider_asset_id text,
  title text not null default '',
  preview_url text,
  source_url text,
  download_url text,
  creator text,
  duration double precision,
  width integer,
  height integer,
  score double precision check (score is null or (score >= 0 and score <= 100)),
  license_name text,
  license_url text,
  metadata jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists video_producer_visual_candidates_beat_idx
  on public.video_producer_visual_candidates(beat_id, score desc nulls last, created_at desc);

create table if not exists public.video_producer_visual_placements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.video_producer_projects(id) on delete cascade,
  beat_id uuid not null references public.video_producer_visual_beats(id) on delete cascade,
  asset_id uuid not null references public.video_producer_visual_assets(id) on delete restrict,
  source_start double precision not null check (source_start >= 0),
  source_end double precision not null check (source_end > source_start),
  asset_in double precision not null default 0 check (asset_in >= 0),
  asset_out double precision not null check (asset_out > asset_in),
  fit text not null default 'cover' check (fit in ('cover','contain')),
  position_x double precision not null default 0.5 check (position_x between 0 and 1),
  position_y double precision not null default 0.5 check (position_y between 0 and 1),
  scale double precision not null default 1 check (scale > 0 and scale <= 4),
  layer integer not null default 2 check (layer >= 2),
  audio_enabled boolean not null default false check (audio_enabled = false),
  source text not null default 'auto' check (source in ('auto','manual')),
  locked boolean not null default false,
  revision integer not null default 1 check (revision > 0),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists video_producer_visual_placements_active_beat_idx
  on public.video_producer_visual_placements(beat_id)
  where active;
create index if not exists video_producer_visual_placements_project_idx
  on public.video_producer_visual_placements(project_id, active, source_start);

create table if not exists public.video_producer_visual_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.video_producer_projects(id) on delete cascade,
  beat_id uuid not null references public.video_producer_visual_beats(id) on delete cascade,
  provider text not null check (provider in ('runway','firefly')),
  model text not null,
  generation_mode text not null check (generation_mode in ('text-to-video','image-to-video')),
  prompt text not null check (char_length(prompt) between 1 and 5000),
  source_image_asset_id uuid references public.video_producer_visual_assets(id) on delete set null,
  provider_task_id text,
  provider_status_url text,
  status text not null default 'queued' check (status in ('queued','generating','succeeded','importing','completed','failed','cancelled')),
  ephemeral_output_url text,
  output_expires_at timestamptz,
  asset_id uuid references public.video_producer_visual_assets(id) on delete set null,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index if not exists video_producer_visual_generation_jobs_project_idx
  on public.video_producer_visual_generation_jobs(project_id, created_at desc);
create index if not exists video_producer_visual_generation_jobs_work_idx
  on public.video_producer_visual_generation_jobs(status, created_at)
  where status in ('queued','generating','succeeded','importing');

alter table public.video_producer_visual_beats enable row level security;
alter table public.video_producer_visual_assets enable row level security;
alter table public.video_producer_visual_candidates enable row level security;
alter table public.video_producer_visual_placements enable row level security;
alter table public.video_producer_visual_generation_jobs enable row level security;

revoke all on public.video_producer_visual_beats from public, anon, authenticated;
revoke all on public.video_producer_visual_assets from public, anon, authenticated;
revoke all on public.video_producer_visual_candidates from public, anon, authenticated;
revoke all on public.video_producer_visual_placements from public, anon, authenticated;
revoke all on public.video_producer_visual_generation_jobs from public, anon, authenticated;

grant all on public.video_producer_visual_beats to service_role;
grant all on public.video_producer_visual_assets to service_role;
grant all on public.video_producer_visual_candidates to service_role;
grant all on public.video_producer_visual_placements to service_role;
grant all on public.video_producer_visual_generation_jobs to service_role;

create trigger video_producer_visual_beats_touch_updated_at
before update on public.video_producer_visual_beats
for each row execute function public.touch_updated_at();

create trigger video_producer_visual_assets_touch_updated_at
before update on public.video_producer_visual_assets
for each row execute function public.touch_updated_at();

create trigger video_producer_visual_placements_touch_updated_at
before update on public.video_producer_visual_placements
for each row execute function public.touch_updated_at();

comment on table public.video_producer_visual_beats is
  'Sol/manual editorial visual decisions tied to source-time dialogue. A beat may intentionally choose graphics or A-roll instead of B-roll.';
comment on table public.video_producer_visual_assets is
  'Durable owned/licensed/generated Visual Pass media. Provider provenance and license evidence travel with the stored bytes.';
comment on table public.video_producer_visual_candidates is
  'Short-lived search candidates. Do not use as a stock mirror; only selected candidates are persisted as durable assets.';
comment on table public.video_producer_visual_placements is
  'Assembly-authority B-roll placements over A-roll. Final taste review remains human-controlled.';
comment on table public.video_producer_visual_generation_jobs is
  'Async Runway/Firefly generation jobs. Ephemeral provider outputs must be imported into permanent storage before completion.';
