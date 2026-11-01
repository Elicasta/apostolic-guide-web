begin;

create table if not exists public.sol_operator_settings (
  workspace_key text primary key default 'apostolic-guide',
  enabled boolean not null default false,
  mode text not null default 'watch' check (mode in ('watch', 'assist', 'trusted')),
  weekly_targets jsonb not null default '{"youtube":1,"carousel":3,"short_video":4,"post":5}'::jsonb,
  allow_live_publishing boolean not null default false,
  allow_automation_activation boolean not null default false,
  max_concurrent_runs integer not null default 1 check (max_concurrent_runs between 1 and 3),
  last_scan_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sol_operator_proposals (
  id uuid primary key default gen_random_uuid(),
  proposal_key text not null,
  recipe_key text not null check (recipe_key in ('audio_to_youtube', 'carousel_topic_pack', 'journey_automation_draft')),
  title text not null,
  summary text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'running', 'completed', 'dismissed', 'failed', 'expired')),
  priority text not null default 'medium' check (priority in ('urgent', 'high', 'medium', 'low')),
  risk text not null default 'review_required' check (risk in ('safe_draft', 'review_required', 'external_effect')),
  pathway_slugs text[] not null default '{}',
  evidence jsonb not null default '[]'::jsonb,
  plan jsonb not null default '[]'::jsonb,
  inputs jsonb not null default '{}'::jsonb,
  suggested_constraints text[] not null default '{}',
  approval_constraints text[] not null default '{}',
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  dismissed_by uuid references auth.users(id) on delete set null,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sol_operator_runs (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid references public.sol_operator_proposals(id) on delete set null,
  recipe_key text not null check (recipe_key in ('audio_to_youtube', 'carousel_topic_pack', 'journey_automation_draft')),
  pathway_slug text,
  status text not null default 'queued' check (status in ('queued', 'running', 'waiting_review', 'completed', 'failed', 'cancelled')),
  progress integer not null default 0 check (progress between 0 and 100),
  current_step text,
  inputs jsonb not null default '{}'::jsonb,
  steps jsonb not null default '[]'::jsonb,
  result jsonb not null default '{}'::jsonb,
  error text,
  requested_by uuid references auth.users(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sol_operator_events (
  id bigint generated always as identity primary key,
  run_id uuid references public.sol_operator_runs(id) on delete cascade,
  proposal_id uuid references public.sol_operator_proposals(id) on delete set null,
  event_type text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists sol_operator_proposals_active_key_uidx
  on public.sol_operator_proposals (proposal_key)
  where status in ('pending', 'approved', 'running');
create index if not exists sol_operator_proposals_status_idx
  on public.sol_operator_proposals (status, priority, updated_at desc);
create index if not exists sol_operator_runs_status_idx
  on public.sol_operator_runs (status, updated_at desc);
create index if not exists sol_operator_runs_proposal_idx
  on public.sol_operator_runs (proposal_id, created_at desc);
create index if not exists sol_operator_events_run_idx
  on public.sol_operator_events (run_id, created_at desc);

alter table public.sol_operator_settings enable row level security;
alter table public.sol_operator_proposals enable row level security;
alter table public.sol_operator_runs enable row level security;
alter table public.sol_operator_events enable row level security;

revoke all on public.sol_operator_settings from anon, authenticated;
revoke all on public.sol_operator_proposals from anon, authenticated;
revoke all on public.sol_operator_runs from anon, authenticated;
revoke all on public.sol_operator_events from anon, authenticated;
grant select, insert, update, delete on public.sol_operator_settings to service_role;
grant select, insert, update, delete on public.sol_operator_proposals to service_role;
grant select, insert, update, delete on public.sol_operator_runs to service_role;
grant select, insert, update, delete on public.sol_operator_events to service_role;
grant usage, select on sequence public.sol_operator_events_id_seq to service_role;

create or replace function public.touch_sol_operator_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sol_operator_settings_touch on public.sol_operator_settings;
create trigger sol_operator_settings_touch before update on public.sol_operator_settings
for each row execute function public.touch_sol_operator_updated_at();

drop trigger if exists sol_operator_proposals_touch on public.sol_operator_proposals;
create trigger sol_operator_proposals_touch before update on public.sol_operator_proposals
for each row execute function public.touch_sol_operator_updated_at();

drop trigger if exists sol_operator_runs_touch on public.sol_operator_runs;
create trigger sol_operator_runs_touch before update on public.sol_operator_runs
for each row execute function public.touch_sol_operator_updated_at();

insert into public.sol_operator_settings (workspace_key)
values ('apostolic-guide')
on conflict (workspace_key) do nothing;

comment on table public.sol_operator_settings is 'Server-only safety controls and KPI targets for Sol Content Operator.';
comment on table public.sol_operator_proposals is 'Evidence-backed work proposals generated from canonical Apostolic Guide state.';
comment on table public.sol_operator_runs is 'Approved, allowlisted workflow executions. Live publishing remains outside Phase 1.';
comment on table public.sol_operator_events is 'Append-only execution history for Sol Content Operator runs.';

commit;
