-- One Video Producer pipeline, multiple data-driven private brand profiles.
create table if not exists public.video_producer_brand_profiles (
  slug text primary key check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and lower(slug) not like '%cornerstone%'),
  name text not null check (char_length(name) between 1 and 120 and lower(name) not like '%cornerstone%'),
  active boolean not null default true,
  config jsonb not null check (jsonb_typeof(config) = 'object' and lower(coalesce(config #>> '{destination,youtubeHandle}', '')) not like '%cornerstone%'),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.video_producer_brand_profiles enable row level security;
revoke all on public.video_producer_brand_profiles from anon, authenticated;
grant all on public.video_producer_brand_profiles to service_role;

insert into public.video_producer_brand_profiles (slug,name,config) values
('apostolic-guide','Apostolic Guide',
 '{
   "theme":{"ink":"#0E1E2D","accent":"#B3212D","paper":"#FFF9F2","fonts":["Bebas Neue","Montserrat","Playfair Display"]},
   "logo":{"wordmark":"Apostolic Guide","assetPath":"public/brand/apostolic-guide-wordmark-reversed.png"},
   "bumpers":{"introSeconds":3,"outroSeconds":4,"outroSafeBottom":0.25},
   "pathwayRequired":true,"doctrineGate":"required",
   "destination":{"type":"ag_publisher","youtubeHandle":null},
   "audio":{"integratedLufs":-16,"truePeakDbtp":-1,"lra":7,"rnnoiseMix":0},
   "captions":{"font":"Montserrat","fill":"#FFF9F2","highlight":"#B3212D"}
 }'::jsonb),
('in-the-now','In the Now',
 '{
   "theme":{"ink":"#220909","accent":"#6A0000","paper":"#FFF9F2","fonts":["Poppins","Playfair Display","Bebas Neue"]},
   "logo":{"wordmark":"In the Now","assetPath":null},
   "bumpers":{"introSeconds":3,"outroSeconds":4,"outroSafeBottom":0.25},
   "pathwayRequired":false,"doctrineGate":"optional",
   "destination":{"type":"youtube","youtubeHandle":"@iamelicastaneda"},
   "audio":{"integratedLufs":-14,"truePeakDbtp":-1.5,"lra":7,"rnnoiseMix":0},
   "captions":{"font":"Poppins","fill":"#FFF9F2","highlight":"#6A0000"}
 }'::jsonb)
on conflict (slug) do nothing;

alter table public.video_producer_projects
  add column if not exists brand_profile text not null default 'apostolic-guide'
  references public.video_producer_brand_profiles(slug);
create index if not exists video_producer_projects_brand_idx
  on public.video_producer_projects(brand_profile,updated_at desc);

create table if not exists public.video_producer_brand_presets (
  id uuid primary key default gen_random_uuid(),
  brand_slug text not null references public.video_producer_brand_profiles(slug) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  document jsonb not null check (jsonb_typeof(document)='object'),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (brand_slug,name)
);
alter table public.video_producer_brand_presets enable row level security;
revoke all on public.video_producer_brand_presets from anon, authenticated;
grant all on public.video_producer_brand_presets to service_role;
create index if not exists video_producer_brand_presets_owner_idx
  on public.video_producer_brand_presets(created_by,updated_at desc);

-- This is a calendar/draft queue, never a background publishing trigger.
create table if not exists public.video_producer_schedule_drafts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.video_producer_projects(id) on delete cascade,
  brand_slug text not null references public.video_producer_brand_profiles(slug),
  channel_handle text not null check (lower(channel_handle) not like '%cornerstone%'),
  publish_at timestamptz not null,
  timezone text not null default 'America/New_York',
  playlist_id text,
  thumbnail_variant text check (thumbnail_variant is null or thumbnail_variant in ('A','B')),
  status text not null default 'draft' check (status in ('draft','submitted','canceled')),
  submitted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id)
);
alter table public.video_producer_schedule_drafts enable row level security;
revoke all on public.video_producer_schedule_drafts from anon, authenticated;
grant all on public.video_producer_schedule_drafts to service_role;
create index if not exists video_producer_schedule_calendar_idx
  on public.video_producer_schedule_drafts(publish_at,brand_slug);
