-- Apostolic Guide persistent creative production system.
-- Additive only: existing Pathway Assets, video publishing, and public content stay intact.

create table if not exists public.studio_creative_projects (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 180),
  pathway_slug text not null,
  pathway_collection text not null,
  intent text not null check (intent in ('information','teaching','objection','conversation','invitation','quote','scripture')),
  format text not null check (format in ('single','carousel','story')),
  destination text not null default 'instagram',
  frame_count integer not null default 1 check (frame_count between 1 and 20),
  status text not null default 'draft' check (status in ('draft','ready','scheduled','publishing','published','failed','needs_manual_finish','archived')),
  editor_state jsonb not null default '{"frames":[],"visualSettings":{},"sourceImages":[]}'::jsonb,
  unified_caption text not null default '',
  cta text not null default '',
  scripture_references text[] not null default '{}',
  tags text[] not null default '{}',
  search_text text not null default '',
  state_version integer not null default 1 check (state_version > 0),
  last_autosaved_at timestamptz,
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.studio_creative_project_revisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.studio_creative_projects(id) on delete cascade,
  version integer not null check (version > 0),
  reason text not null default 'checkpoint' check (reason in ('checkpoint','restore','generation','structure_change','duplicate_source')),
  change_summary text,
  snapshot jsonb not null,
  restored_from_revision_id uuid references public.studio_creative_project_revisions(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, version)
);

create table if not exists public.studio_creative_project_assets (
  project_id uuid not null references public.studio_creative_projects(id) on delete cascade,
  asset_id uuid not null references public.studio_pathway_assets(id) on delete cascade,
  frame_id text,
  role text not null default 'render' check (role in ('render','cover','source','reference')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (project_id, asset_id)
);

create index if not exists studio_creative_projects_status_idx
  on public.studio_creative_projects(status, updated_at desc);
create index if not exists studio_creative_projects_pathway_idx
  on public.studio_creative_projects(pathway_slug, updated_at desc);
create index if not exists studio_creative_projects_format_idx
  on public.studio_creative_projects(format, updated_at desc);
create index if not exists studio_creative_projects_search_idx
  on public.studio_creative_projects using gin (to_tsvector('english', search_text));
create index if not exists studio_creative_revisions_project_idx
  on public.studio_creative_project_revisions(project_id, version desc);
create index if not exists studio_creative_project_assets_project_idx
  on public.studio_creative_project_assets(project_id, sort_order, created_at);
create index if not exists studio_creative_project_assets_asset_idx
  on public.studio_creative_project_assets(asset_id);

alter table public.studio_creative_projects enable row level security;
alter table public.studio_creative_project_revisions enable row level security;
alter table public.studio_creative_project_assets enable row level security;

grant select, insert, update, delete on public.studio_creative_projects to service_role;
grant select, insert, update, delete on public.studio_creative_project_revisions to service_role;
grant select, insert, update, delete on public.studio_creative_project_assets to service_role;

create or replace function public.touch_studio_creative_project_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
alter function public.touch_studio_creative_project_updated_at() set search_path = public, pg_temp;

drop trigger if exists studio_creative_projects_touch on public.studio_creative_projects;
create trigger studio_creative_projects_touch
before update on public.studio_creative_projects
for each row execute function public.touch_studio_creative_project_updated_at();

-- Reuse the existing publication ledger. A publication points at the persistent
-- Creative Project rather than creating a disconnected scheduled copy.
alter table public.pathway_publications
  add column if not exists creative_project_id uuid references public.studio_creative_projects(id) on delete set null,
  add column if not exists publication_mode text not null default 'schedule',
  add column if not exists manual_finish_reason text,
  add column if not exists attempt_count integer not null default 0;

alter table public.pathway_publications
  drop constraint if exists pathway_publications_status_check;
alter table public.pathway_publications
  add constraint pathway_publications_status_check
  check (status in ('draft','ready','scheduled','publishing','published','failed','needs_manual_finish','cancelled'));

alter table public.pathway_publications
  drop constraint if exists pathway_publications_publication_mode_check;
alter table public.pathway_publications
  add constraint pathway_publications_publication_mode_check
  check (publication_mode in ('publish_now','schedule','next_available','finish_manually'));

create index if not exists pathway_publications_creative_project_idx
  on public.pathway_publications(creative_project_id, created_at desc)
  where creative_project_id is not null;
create index if not exists pathway_publications_creative_queue_idx
  on public.pathway_publications(status, scheduled_for, created_at)
  where creative_project_id is not null;

comment on table public.studio_creative_projects is
  'Persistent editable source-of-truth for Single, Carousel, and Story creative work.';
comment on table public.studio_creative_project_revisions is
  'Immutable manual checkpoints and restore snapshots for Creative Projects. Autosave does not create revision noise.';
comment on table public.studio_creative_project_assets is
  'Links persistent Creative Projects to rendered/source media in the Pathway Asset DAM.';
comment on column public.pathway_publications.creative_project_id is
  'Attaches a publication attempt to the existing Creative Project instead of copying the creative.';
