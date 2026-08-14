create table if not exists public.video_producer_projects (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 180),
  mode text not null check (mode in ('podcast','reels')),
  status text not null default 'draft' check (status in ('draft','uploading','uploaded','transcribing','directing','planned','approved','rendering','review','completed','failed')),
  parent_project_id uuid references public.video_producer_projects(id) on delete set null,
  source_storage_path text,
  source_filename text,
  source_mime_type text,
  source_size_bytes bigint check (source_size_bytes is null or source_size_bytes >= 0),
  source_duration double precision check (source_duration is null or source_duration >= 0),
  source_range_start double precision check (source_range_start is null or source_range_start >= 0),
  source_range_end double precision check (source_range_end is null or source_range_end >= 0),
  transcript_text text,
  transcript jsonb not null default '{"words":[],"segments":[]}'::jsonb,
  edit_plan jsonb,
  director_metadata jsonb not null default '{}'::jsonb,
  reel_candidates jsonb not null default '[]'::jsonb,
  approval_fingerprint text,
  approved_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint video_producer_source_range_order check (
    source_range_end is null or source_range_start is null or source_range_end > source_range_start
  ),
  constraint video_producer_parent_reels_only check (
    parent_project_id is null or mode = 'reels'
  )
);

create table if not exists public.video_producer_renders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.video_producer_projects(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','rendering','completed','failed')),
  manifest_storage_path text not null,
  config_snapshot jsonb not null default '{}'::jsonb,
  progress jsonb not null default '{"percent":0,"stage":"Queued"}'::jsonb,
  output_storage_path text,
  output_url text,
  error text,
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index if not exists video_producer_projects_updated_idx
  on public.video_producer_projects(updated_at desc);
create index if not exists video_producer_projects_parent_idx
  on public.video_producer_projects(parent_project_id)
  where parent_project_id is not null;
create index if not exists video_producer_projects_mode_status_idx
  on public.video_producer_projects(mode, status);
create index if not exists video_producer_renders_project_requested_idx
  on public.video_producer_renders(project_id, requested_at desc);
create index if not exists video_producer_renders_status_idx
  on public.video_producer_renders(status)
  where status in ('queued','rendering');

alter table public.video_producer_projects enable row level security;
alter table public.video_producer_renders enable row level security;

comment on table public.video_producer_projects is
  'Service-role managed Video Producer projects. Source media remains immutable in storage; edits are stored as decisions.';
comment on table public.video_producer_renders is
  'Immutable Video Producer render job snapshots dispatched to the media worker.';

create trigger video_producer_projects_touch_updated_at
before update on public.video_producer_projects
for each row execute function public.touch_updated_at();
