create table if not exists public.studio_pathway_assets (
  id uuid primary key default gen_random_uuid(),
  pathway_slug text not null,
  studio text not null check (studio in ('carousel','video')),
  asset_type text not null check (asset_type in (
    'carousel-deck','carousel-slide','single-post','story-set','story-frame','thumbnail',
    'generated-image','uploaded-image','caption','video-project','video-render','video-thumbnail','other'
  )),
  parent_asset_id uuid references public.studio_pathway_assets(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 180),
  status text not null default 'draft' check (status in ('draft','review','approved','ready','published','archived')),
  source_type text not null default 'manual' check (source_type in ('manual','sol','generated','uploaded','rendered','imported')),
  editable boolean not null default true,
  version integer not null default 1 check (version > 0),
  content jsonb not null default '{}'::jsonb,
  storage_bucket text,
  storage_path text,
  public_url text,
  prompt text,
  model text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.studio_pathway_asset_versions (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.studio_pathway_assets(id) on delete cascade,
  version integer not null check (version > 0),
  snapshot jsonb not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (asset_id, version)
);

create table if not exists public.studio_visual_style_profile (
  id text primary key default 'apostolic-guide',
  name text not null default 'Apostolic Guide',
  instructions text not null,
  reference_asset_ids uuid[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.studio_visual_style_profile (id, name, instructions, metadata)
values (
  'apostolic-guide',
  'Apostolic Guide',
  'Scripture-first editorial design. Use Montserrat, Bebas Neue, and Cormorant Garamond. Brand white #F5F7F4, ink #10202A, slate ink #263A44, crimson #A12D3D, AG blue #15566A, blue soft #DCEBEE. No orange. No crown. Prefer restrained editorial hierarchy, tactile/documentary imagery, generous negative space, clear mobile readability, and exact typography rendered by the app rather than baked into AI imagery.',
  '{"version":1,"source":"brand-system"}'::jsonb
)
on conflict (id) do nothing;

create index if not exists studio_pathway_assets_pathway_studio_idx
  on public.studio_pathway_assets(pathway_slug, studio, updated_at desc);
create index if not exists studio_pathway_assets_parent_idx
  on public.studio_pathway_assets(parent_asset_id, updated_at desc)
  where parent_asset_id is not null;
create index if not exists studio_pathway_assets_type_idx
  on public.studio_pathway_assets(asset_type, updated_at desc);
create index if not exists studio_pathway_asset_versions_asset_idx
  on public.studio_pathway_asset_versions(asset_id, version desc);

alter table public.studio_pathway_assets enable row level security;
alter table public.studio_pathway_asset_versions enable row level security;
alter table public.studio_visual_style_profile enable row level security;

comment on table public.studio_pathway_assets is
  'Editable Pathway-owned creative assets shared by Carousel Studio and Video Studio while keeping each studio separate.';
comment on table public.studio_pathway_asset_versions is
  'Immutable snapshots created before an editable Pathway asset is changed.';
comment on table public.studio_visual_style_profile is
  'Persistent Apostolic Guide visual direction used by Sol/image generation and optionally enriched by approved reference assets.';
