create table if not exists public.pathway_video_projects (
  id uuid primary key default gen_random_uuid(),
  pathway_slug text not null unique,
  audio_content_hash text,
  timeline jsonb not null default '[]'::jsonb,
  style jsonb not null default '{}'::jsonb,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pathway_video_renders (
  id uuid primary key default gen_random_uuid(),
  pathway_slug text not null,
  project_id uuid references public.pathway_video_projects(id) on delete cascade,
  asset_id uuid references public.pathway_assets(id) on delete set null,
  format text not null check (format in ('youtube', 'vertical', 'square')),
  status text not null default 'queued' check (status in ('queued', 'rendering', 'completed', 'failed')),
  config_snapshot jsonb not null default '{}'::jsonb,
  output_url text,
  storage_path text,
  error text,
  requested_by uuid,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index if not exists pathway_video_renders_pathway_requested_idx
  on public.pathway_video_renders(pathway_slug, requested_at desc);
create index if not exists pathway_video_renders_asset_idx
  on public.pathway_video_renders(asset_id) where asset_id is not null;

alter table public.pathway_video_projects enable row level security;
alter table public.pathway_video_renders enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pathway-video', 'pathway-video', true, 1073741824, array['video/mp4'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
