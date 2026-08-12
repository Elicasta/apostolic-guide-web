create table if not exists public.pathway_social_clips (
  id uuid primary key default gen_random_uuid(),
  pathway_slug text not null,
  source_render_id uuid not null references public.pathway_video_renders(id) on delete cascade,
  asset_id uuid references public.pathway_assets(id) on delete set null,
  platform text not null default 'both' check (platform in ('instagram', 'tiktok', 'both')),
  rank integer not null default 1,
  score integer not null default 0 check (score between 0 and 100),
  start_seconds numeric not null check (start_seconds >= 0),
  end_seconds numeric not null check (end_seconds > start_seconds),
  hook text not null default '',
  title text not null default '',
  rationale text not null default '',
  caption text not null default '',
  status text not null default 'candidate' check (status in ('candidate', 'queued', 'rendering', 'completed', 'failed', 'archived')),
  output_url text,
  storage_path text,
  error text,
  model text,
  analysis_metadata jsonb not null default '{}'::jsonb,
  callback_token_hash text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists pathway_social_clips_pathway_rank_idx
  on public.pathway_social_clips(pathway_slug, rank asc, created_at desc);
create index if not exists pathway_social_clips_source_render_idx
  on public.pathway_social_clips(source_render_id, created_at desc);
create index if not exists pathway_social_clips_status_idx
  on public.pathway_social_clips(status, updated_at desc);

alter table public.pathway_social_clips enable row level security;
