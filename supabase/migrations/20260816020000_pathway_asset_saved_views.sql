create table if not exists public.studio_pathway_asset_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pathway_slug text not null,
  name text not null check (char_length(name) between 1 and 80),
  filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, pathway_slug, name)
);

create index if not exists studio_pathway_asset_views_user_pathway_idx
  on public.studio_pathway_asset_views(user_id, pathway_slug, updated_at desc);

alter table public.studio_pathway_asset_views enable row level security;
revoke all on table public.studio_pathway_asset_views from public, anon, authenticated;

comment on table public.studio_pathway_asset_views is
  'Per-user dynamic saved searches/smart views for Pathway Assets. The filters remain live as the underlying asset library changes.';
