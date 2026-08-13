create table if not exists public.studio_content_calendar_items (
  id uuid primary key default gen_random_uuid(),
  pathway_slug text,
  title text not null,
  content_type text not null check (content_type in ('video','reel','carousel','post','thread','music','podcast')),
  platform text,
  status text not null default 'draft' check (status in ('idea','draft','ready','scheduled','published','failed','cancelled')),
  scheduled_for timestamptz,
  published_at timestamptz,
  source text,
  source_ref text,
  asset_id uuid,
  publication_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists studio_content_calendar_items_schedule_idx on public.studio_content_calendar_items (scheduled_for);
create index if not exists studio_content_calendar_items_pathway_idx on public.studio_content_calendar_items (pathway_slug);
create unique index if not exists studio_content_calendar_source_ref_uidx on public.studio_content_calendar_items (source, source_ref) where source_ref is not null;
alter table public.studio_content_calendar_items enable row level security;
