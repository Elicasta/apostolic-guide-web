-- Persist per-slide manual Carousel Studio styling without competing with the
-- Creative Project optimistic state-version autosave path.

create table if not exists public.studio_creative_frame_designs (
  project_id uuid not null references public.studio_creative_projects(id) on delete cascade,
  frame_id text not null,
  design jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, frame_id)
);

create index if not exists studio_creative_frame_designs_project_idx
  on public.studio_creative_frame_designs(project_id, updated_at desc);

alter table public.studio_creative_frame_designs enable row level security;

grant select, insert, update, delete on public.studio_creative_frame_designs to service_role;

comment on table public.studio_creative_frame_designs is
  'Per-frame manual typography, layout, color, and texture settings for persistent Carousel Studio projects.';
