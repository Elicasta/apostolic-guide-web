create table if not exists public.studio_campaigns (
  id uuid primary key default gen_random_uuid(),
  pathway_slug text not null,
  title text not null,
  status text not null default 'draft' check (status in ('draft','review','approved','changes_requested','published','cancelled')),
  strategy jsonb not null default '{}'::jsonb,
  copy_package jsonb not null default '{}'::jsonb,
  social_package jsonb not null default '{}'::jsonb,
  youtube_package jsonb not null default '{}'::jsonb,
  email_package jsonb not null default '{}'::jsonb,
  link_report jsonb not null default '{}'::jsonb,
  doctrine_report jsonb not null default '{}'::jsonb,
  keyword_automation_id uuid,
  runtime_run_id uuid references public.sol_runtime_runs(id) on delete set null,
  created_by text not null default 'SOL Runtime',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists studio_campaigns_pathway_idx on public.studio_campaigns(pathway_slug, created_at desc);
create index if not exists studio_campaigns_runtime_idx on public.studio_campaigns(runtime_run_id) where runtime_run_id is not null;

create table if not exists public.studio_campaign_artifacts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.studio_campaigns(id) on delete cascade,
  pathway_slug text not null,
  artifact_type text not null,
  title text not null,
  mime_type text,
  content_text text,
  content_json jsonb,
  width integer,
  height integer,
  ordinal integer not null default 0,
  verification_status text not null default 'pending' check (verification_status in ('pending','passed','failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists studio_campaign_artifacts_campaign_idx on public.studio_campaign_artifacts(campaign_id, ordinal, created_at);

alter table public.studio_campaigns enable row level security;
alter table public.studio_campaign_artifacts enable row level security;
revoke all on public.studio_campaigns from anon, authenticated;
revoke all on public.studio_campaign_artifacts from anon, authenticated;
grant all on public.studio_campaigns to service_role;
grant all on public.studio_campaign_artifacts to service_role;

create trigger studio_campaigns_touch before update on public.studio_campaigns for each row execute function public.sol_runtime_touch_updated_at();
create trigger studio_campaign_artifacts_touch before update on public.studio_campaign_artifacts for each row execute function public.sol_runtime_touch_updated_at();
