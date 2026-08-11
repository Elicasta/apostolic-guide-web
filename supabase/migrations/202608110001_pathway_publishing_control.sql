-- Apostolic Guide pathway publishing control panel
-- The canonical pathway definitions remain in src/pathway-catalog.ts.
-- These tables only track publishing state, assets, publications, and social handoffs.

create table if not exists public.pathway_publishing_profiles (
  pathway_slug text primary key,
  primary_keyword text,
  campaign_status text not null default 'planning' check (campaign_status in ('planning','active','paused','complete','archived')),
  app_url text,
  social_automation_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pathway_assets (
  id uuid primary key default gen_random_uuid(),
  pathway_slug text not null,
  type text not null check (type in ('youtube','short_video','carousel','graphic','story','pdf','email','article','thumbnail','script','print','merch','other')),
  title text not null,
  language text not null default 'en',
  status text not null default 'idea' check (status in ('idea','script','ready_to_produce','in_production','ready_to_publish','published','blocked','archived')),
  platform text,
  source_url text,
  file_url text,
  published_url text,
  hook text,
  caption text,
  cta_type text not null default 'none' check (cta_type in ('none','comment_keyword','visit_pathway','download_pdf','watch_youtube','open_app')),
  cta_keyword text,
  destination_url text,
  notes text,
  sort_order integer not null default 0,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pathway_publications (
  id uuid primary key default gen_random_uuid(),
  pathway_slug text not null,
  asset_id uuid references public.pathway_assets(id) on delete set null,
  platform text not null,
  status text not null default 'draft' check (status in ('draft','ready','scheduled','publishing','published','failed','cancelled')),
  external_post_id text,
  published_url text,
  scheduled_for timestamptz,
  published_at timestamptz,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pathway_assets_slug_idx on public.pathway_assets(pathway_slug, sort_order, created_at);
create index if not exists pathway_assets_status_idx on public.pathway_assets(status, updated_at desc);
create index if not exists pathway_publications_slug_idx on public.pathway_publications(pathway_slug, created_at desc);
create index if not exists pathway_publications_status_idx on public.pathway_publications(status, scheduled_for);

alter table public.pathway_publishing_profiles enable row level security;
alter table public.pathway_assets enable row level security;
alter table public.pathway_publications enable row level security;

-- Studio reads/writes these through the server-side service client.
grant select, insert, update, delete on public.pathway_publishing_profiles to service_role;
grant select, insert, update, delete on public.pathway_assets to service_role;
grant select, insert, update, delete on public.pathway_publications to service_role;

-- Keep updated_at correct without requiring every caller to remember it.
create or replace function public.touch_pathway_publishing_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Keep the trigger function from inheriting a mutable role search_path.
alter function public.touch_pathway_publishing_updated_at() set search_path = public, pg_temp;

drop trigger if exists pathway_publishing_profiles_touch on public.pathway_publishing_profiles;
create trigger pathway_publishing_profiles_touch before update on public.pathway_publishing_profiles
for each row execute function public.touch_pathway_publishing_updated_at();

drop trigger if exists pathway_assets_touch on public.pathway_assets;
create trigger pathway_assets_touch before update on public.pathway_assets
for each row execute function public.touch_pathway_publishing_updated_at();

drop trigger if exists pathway_publications_touch on public.pathway_publications;
create trigger pathway_publications_touch before update on public.pathway_publications
for each row execute function public.touch_pathway_publishing_updated_at();

comment on table public.pathway_publishing_profiles is 'Campaign metadata keyed to canonical pathway slugs in src/pathway-catalog.ts.';
comment on table public.pathway_assets is 'Reusable content assets belonging to a canonical Apostolic Guide pathway.';
comment on table public.pathway_publications is 'Platform-specific publication instances for pathway assets.';
