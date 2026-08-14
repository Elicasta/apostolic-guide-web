create table if not exists public.video_producer_music_tracks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source_provider text not null default 'upload' check (source_provider in ('upload','suno')),
  source_url text,
  storage_provider text not null default 'vercel_blob',
  storage_locator text not null,
  filename text not null,
  content_type text not null,
  size_bytes bigint not null default 0,
  duration_seconds numeric,
  bpm numeric,
  mood text,
  tags text[] not null default '{}',
  rights_note text,
  active boolean not null default true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.video_producer_music_tracks enable row level security;
create index if not exists video_producer_music_tracks_active_idx on public.video_producer_music_tracks (active, updated_at desc);

alter table public.video_producer_projects
  add column if not exists pathway_slug text,
  add column if not exists selected_music_track_id uuid references public.video_producer_music_tracks(id) on delete set null,
  add column if not exists publisher_render_id uuid references public.pathway_video_renders(id) on delete set null;

create index if not exists video_producer_projects_pathway_slug_idx on public.video_producer_projects(pathway_slug);
create index if not exists video_producer_projects_music_track_idx on public.video_producer_projects(selected_music_track_id);
create index if not exists video_producer_projects_publisher_render_idx on public.video_producer_projects(publisher_render_id);

create table if not exists public.video_producer_thumbnails (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.video_producer_projects(id) on delete cascade,
  variant text not null check (variant in ('face-hook','doctrine','pathway')),
  headline text not null,
  timestamp_seconds numeric not null default 0,
  status text not null default 'queued' check (status in ('queued','rendering','completed','failed')),
  storage_locator text,
  error text,
  created_by uuid,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(project_id, variant)
);

alter table public.video_producer_thumbnails enable row level security;
create index if not exists video_producer_thumbnails_project_idx on public.video_producer_thumbnails(project_id, created_at desc);