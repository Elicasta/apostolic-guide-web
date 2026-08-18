create table if not exists public.video_producer_episode_scripts (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Untitled episode' check (char_length(title) between 1 and 180),
  premise text not null default '' check (char_length(premise) <= 6000),
  primary_pathway_slug text not null,
  supporting_pathway_slugs text[] not null default '{}',
  format text not null default 'solo' check (format in ('solo','dialogue','panel')),
  speakers jsonb not null default '[{"name":"Cedar","role":"host"}]'::jsonb,
  script_text text not null default '',
  generation_metadata jsonb not null default '{}'::jsonb,
  theology_review jsonb,
  status text not null default 'draft' check (status in ('draft','needs_review','approved','exported')),
  exported_project_id uuid references public.video_producer_projects(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists video_producer_episode_scripts_updated_idx
  on public.video_producer_episode_scripts(updated_at desc);
create index if not exists video_producer_episode_scripts_pathway_idx
  on public.video_producer_episode_scripts(primary_pathway_slug, updated_at desc);
create index if not exists video_producer_episode_scripts_status_idx
  on public.video_producer_episode_scripts(status, updated_at desc);

alter table public.video_producer_episode_scripts enable row level security;

comment on table public.video_producer_episode_scripts is
  'Persistent pre-production episode scripts grounded in Apostolic Guide Pathways before recording and Video Producer handoff.';

create trigger video_producer_episode_scripts_touch_updated_at
before update on public.video_producer_episode_scripts
for each row execute function public.touch_updated_at();
