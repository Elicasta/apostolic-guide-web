-- SOL Runtime V1. Durable execution state lives here. Legacy operator tables remain readable during migration.

create table if not exists public.sol_runtime_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_key text not null default 'apostolic-guide',
  user_id uuid,
  goal text not null,
  intent jsonb not null default '{}'::jsonb,
  workflow_key text,
  workflow_version integer,
  runtime_version integer not null default 1,
  planner_version text,
  environment text not null default 'production' check (environment in ('local','development','preview','production')),
  mode text not null default 'assist' check (mode in ('watch','assist','trusted')),
  status text not null default 'created' check (status in ('created','planning','queued','running','waiting_for_approval','retrying','repairing','completed','failed','stalled','cancelled','superseded')),
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  idempotency_key text,
  execution_generation integer not null default 1,
  legacy_run_id uuid,
  legacy_proposal_id uuid,
  superseded_by uuid references public.sol_runtime_runs(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists sol_runtime_runs_legacy_run_uidx on public.sol_runtime_runs(legacy_run_id) where legacy_run_id is not null;
create index if not exists sol_runtime_runs_status_idx on public.sol_runtime_runs(status, created_at desc);
create index if not exists sol_runtime_runs_workflow_idx on public.sol_runtime_runs(workflow_key, workflow_version, created_at desc);
create index if not exists sol_runtime_runs_idempotency_idx on public.sol_runtime_runs(idempotency_key, execution_generation desc) where idempotency_key is not null;

create table if not exists public.sol_runtime_tasks (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.sol_runtime_runs(id) on delete cascade,
  task_key text not null,
  name text not null,
  tool_name text,
  workflow_name text,
  status text not null default 'pending' check (status in ('pending','blocked','queued','running','waiting','waiting_for_approval','retry_scheduled','verifying','repairing','completed','failed','stalled','cancelled','skipped')),
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  depends_on text[] not null default '{}',
  permission text not null default 'read' check (permission in ('read','write','execute','publish','deploy','delete','financial','security')),
  environment text not null default 'production' check (environment in ('local','development','preview','production')),
  idempotency_key text,
  approval_type text check (approval_type is null or approval_type in ('review','publish','deploy','delete','financial','security')),
  verifier_name text,
  retry_strategy text not null default 'exponential' check (retry_strategy in ('fixed','exponential')),
  attempt_count integer not null default 0,
  max_attempts integer not null default 3 check (max_attempts >= 1),
  retry_base_delay_ms integer not null default 2000 check (retry_base_delay_ms >= 0),
  retry_max_delay_ms integer not null default 60000 check (retry_max_delay_ms >= 0),
  timeout_ms integer not null default 300000 check (timeout_ms > 0),
  worker_id text,
  heartbeat_at timestamptz,
  lease_expires_at timestamptz,
  next_retry_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(run_id, task_key)
);

create index if not exists sol_runtime_tasks_runnable_idx on public.sol_runtime_tasks(status, next_retry_at, created_at);
create index if not exists sol_runtime_tasks_run_idx on public.sol_runtime_tasks(run_id, created_at);
create index if not exists sol_runtime_tasks_lease_idx on public.sol_runtime_tasks(lease_expires_at) where lease_expires_at is not null;

create table if not exists public.sol_runtime_task_attempts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.sol_runtime_runs(id) on delete cascade,
  task_id uuid not null references public.sol_runtime_tasks(id) on delete cascade,
  attempt_number integer not null,
  worker_id text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running',
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  duration_ms integer,
  created_at timestamptz not null default now(),
  unique(task_id, attempt_number)
);

create table if not exists public.sol_runtime_artifacts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.sol_runtime_runs(id) on delete cascade,
  task_id uuid not null references public.sol_runtime_tasks(id) on delete cascade,
  type text not null,
  title text not null,
  storage_type text not null check (storage_type in ('database','file','url','external')),
  location text not null,
  metadata jsonb not null default '{}'::jsonb,
  verification_status text not null default 'pending' check (verification_status in ('pending','passed','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sol_runtime_artifacts_run_idx on public.sol_runtime_artifacts(run_id, created_at desc);

create table if not exists public.sol_runtime_approvals (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.sol_runtime_runs(id) on delete cascade,
  task_id uuid not null references public.sol_runtime_tasks(id) on delete cascade,
  type text not null check (type in ('review','publish','deploy','delete','financial','security')),
  requested_action text not null,
  artifact_ids uuid[] not null default '{}',
  status text not null default 'pending' check (status in ('pending','approved','rejected','changes_requested','expired')),
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid,
  note text,
  decision jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists sol_runtime_pending_approval_uidx on public.sol_runtime_approvals(task_id) where status = 'pending';
create index if not exists sol_runtime_approvals_queue_idx on public.sol_runtime_approvals(status, requested_at desc);

create table if not exists public.sol_runtime_events (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.sol_runtime_runs(id) on delete cascade,
  task_id uuid references public.sol_runtime_tasks(id) on delete set null,
  event_type text not null,
  message text not null default '',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists sol_runtime_events_run_idx on public.sol_runtime_events(run_id, created_at desc);

create table if not exists public.sol_runtime_idempotency (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  scope text not null default 'run',
  run_id uuid references public.sol_runtime_runs(id) on delete cascade,
  task_id uuid references public.sol_runtime_tasks(id) on delete cascade,
  external_effect text,
  state text not null default 'reserved' check (state in ('reserved','succeeded','failed','released')),
  result jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(scope, key)
);

create table if not exists public.sol_runtime_observations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.sol_runtime_runs(id) on delete cascade,
  task_id uuid references public.sol_runtime_tasks(id) on delete cascade,
  source text not null,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists sol_runtime_observations_run_idx on public.sol_runtime_observations(run_id, created_at desc);

create or replace function public.sol_runtime_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger sol_runtime_runs_touch before update on public.sol_runtime_runs for each row execute function public.sol_runtime_touch_updated_at();
create trigger sol_runtime_tasks_touch before update on public.sol_runtime_tasks for each row execute function public.sol_runtime_touch_updated_at();
create trigger sol_runtime_artifacts_touch before update on public.sol_runtime_artifacts for each row execute function public.sol_runtime_touch_updated_at();
create trigger sol_runtime_approvals_touch before update on public.sol_runtime_approvals for each row execute function public.sol_runtime_touch_updated_at();
create trigger sol_runtime_idempotency_touch before update on public.sol_runtime_idempotency for each row execute function public.sol_runtime_touch_updated_at();

-- Atomic worker claiming. Dependencies are stored as task keys and are satisfied only by completed/skipped tasks.
create or replace function public.sol_runtime_claim_tasks(
  p_worker_id text,
  p_limit integer default 4,
  p_lease_seconds integer default 90
)
returns setof public.sol_runtime_tasks
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with candidates as (
    select t.id
    from public.sol_runtime_tasks t
    join public.sol_runtime_runs r on r.id = t.run_id
    where t.status in ('queued','retry_scheduled')
      and r.status not in ('completed','failed','cancelled','superseded')
      and (t.next_retry_at is null or t.next_retry_at <= now())
      and (t.lease_expires_at is null or t.lease_expires_at <= now())
      and not exists (
        select 1
        from unnest(t.depends_on) dependency(task_key)
        left join public.sol_runtime_tasks d on d.run_id = t.run_id and d.task_key = dependency.task_key
        where d.id is null or d.status not in ('completed','skipped')
      )
    order by t.created_at asc
    for update of t skip locked
    limit greatest(1, least(coalesce(p_limit, 4), 50))
  )
  update public.sol_runtime_tasks t
  set status = 'running',
      worker_id = p_worker_id,
      heartbeat_at = now(),
      lease_expires_at = now() + make_interval(secs => greatest(15, coalesce(p_lease_seconds, 90))),
      started_at = coalesce(t.started_at, now()),
      attempt_count = t.attempt_count + 1,
      next_retry_at = null,
      error_code = null,
      error_message = null
  from candidates c
  where t.id = c.id
  returning t.*;
end;
$$;

-- Unlock tasks whose dependencies have become satisfied. Kept deterministic so workers never need AI to select runnable work.
create or replace function public.sol_runtime_unblock_tasks(p_run_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  changed integer;
begin
  update public.sol_runtime_tasks t
  set status = 'queued'
  where t.run_id = p_run_id
    and t.status = 'blocked'
    and not exists (
      select 1
      from unnest(t.depends_on) dependency(task_key)
      left join public.sol_runtime_tasks d on d.run_id = t.run_id and d.task_key = dependency.task_key
      where d.id is null or d.status not in ('completed','skipped')
    );
  get diagnostics changed = row_count;
  return changed;
end;
$$;

alter table public.sol_runtime_runs enable row level security;
alter table public.sol_runtime_tasks enable row level security;
alter table public.sol_runtime_task_attempts enable row level security;
alter table public.sol_runtime_artifacts enable row level security;
alter table public.sol_runtime_approvals enable row level security;
alter table public.sol_runtime_events enable row level security;
alter table public.sol_runtime_idempotency enable row level security;
alter table public.sol_runtime_observations enable row level security;

revoke all on public.sol_runtime_runs from anon, authenticated;
revoke all on public.sol_runtime_tasks from anon, authenticated;
revoke all on public.sol_runtime_task_attempts from anon, authenticated;
revoke all on public.sol_runtime_artifacts from anon, authenticated;
revoke all on public.sol_runtime_approvals from anon, authenticated;
revoke all on public.sol_runtime_events from anon, authenticated;
revoke all on public.sol_runtime_idempotency from anon, authenticated;
revoke all on public.sol_runtime_observations from anon, authenticated;

grant all on public.sol_runtime_runs to service_role;
grant all on public.sol_runtime_tasks to service_role;
grant all on public.sol_runtime_task_attempts to service_role;
grant all on public.sol_runtime_artifacts to service_role;
grant all on public.sol_runtime_approvals to service_role;
grant all on public.sol_runtime_events to service_role;
grant all on public.sol_runtime_idempotency to service_role;
grant all on public.sol_runtime_observations to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on function public.sol_runtime_claim_tasks(text, integer, integer) to service_role;
grant execute on function public.sol_runtime_unblock_tasks(uuid) to service_role;
