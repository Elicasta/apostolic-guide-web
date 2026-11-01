create table if not exists public.video_producer_graphic_assets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  kind text not null default 'texture' check (kind in ('logo','scripture-frame','pathway-frame','lower-third','statement','cta','texture','overlay','other')),
  storage_provider text not null default 'vercel_blob',
  storage_locator text not null,
  filename text not null,
  content_type text not null,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  tags text[] not null default '{}',
  notes text,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists video_producer_graphic_assets_active_kind_idx
  on public.video_producer_graphic_assets(active, kind, updated_at desc);
create index if not exists video_producer_graphic_assets_created_by_idx
  on public.video_producer_graphic_assets(created_by);
create index if not exists video_producer_graphic_assets_updated_by_idx
  on public.video_producer_graphic_assets(updated_by);

alter table public.video_producer_graphic_assets enable row level security;

comment on table public.video_producer_graphic_assets is
  'Private reusable PNG/WebP design assets for deterministic Video Producer graphics packs. Managed through service-role admin APIs.';
