begin;

-- Sol V3 keeps the existing three operating modes, but makes both conversation
-- state and long-running work durable. The API remains the only access path.

alter table public.sol_operator_runs
  add column if not exists heartbeat_at timestamptz,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists max_attempts integer not null default 3,
  add column if not exists next_retry_at timestamptz,
  add column if not exists last_progress_at timestamptz,
  add column if not exists worker_id text;

alter table public.sol_operator_runs
  drop constraint if exists sol_operator_runs_status_check;
alter table public.sol_operator_runs
  add constraint sol_operator_runs_status_check
  check (status in ('queued', 'running', 'retrying', 'stalled', 'waiting_review', 'completed', 'failed', 'cancelled'));

alter table public.sol_operator_runs
  drop constraint if exists sol_operator_runs_attempt_count_check;
alter table public.sol_operator_runs
  add constraint sol_operator_runs_attempt_count_check check (attempt_count >= 0 and attempt_count <= 20);
alter table public.sol_operator_runs
  drop constraint if exists sol_operator_runs_max_attempts_check;
alter table public.sol_operator_runs
  add constraint sol_operator_runs_max_attempts_check check (max_attempts between 1 and 10);

create index if not exists sol_operator_runs_recovery_idx
  on public.sol_operator_runs (status, next_retry_at, lease_expires_at, created_at);

create table if not exists public.sol_agent_threads (
  id uuid primary key default gen_random_uuid(),
  workspace_key text not null default 'apostolic-guide',
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Sol',
  current_pathname text not null default '/admin',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_key, user_id)
);

create table if not exists public.sol_agent_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.sol_agent_threads(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'tool', 'system')),
  kind text not null default 'text' check (kind in ('text', 'tool_call', 'tool_result', 'approval', 'status')),
  content text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.sol_agent_approvals (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.sol_agent_threads(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  tool_name text not null,
  tool_arguments jsonb not null default '{}'::jsonb,
  summary text not null,
  risk text not null default 'review_required' check (risk in ('safe_draft', 'review_required', 'external_effect')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null
);

create index if not exists sol_agent_messages_thread_idx
  on public.sol_agent_messages (thread_id, created_at desc);
create index if not exists sol_agent_approvals_thread_status_idx
  on public.sol_agent_approvals (thread_id, status, created_at desc);

alter table public.sol_agent_threads enable row level security;
alter table public.sol_agent_messages enable row level security;
alter table public.sol_agent_approvals enable row level security;

revoke all on public.sol_agent_threads from anon, authenticated;
revoke all on public.sol_agent_messages from anon, authenticated;
revoke all on public.sol_agent_approvals from anon, authenticated;
grant select, insert, update, delete on public.sol_agent_threads to service_role;
grant select, insert, update, delete on public.sol_agent_messages to service_role;
grant select, insert, update, delete on public.sol_agent_approvals to service_role;

drop trigger if exists sol_agent_threads_touch on public.sol_agent_threads;
create trigger sol_agent_threads_touch before update on public.sol_agent_threads
for each row execute function public.touch_sol_operator_updated_at();

comment on table public.sol_agent_threads is 'Persistent admin conversations for the Sol Studio agent.';
comment on table public.sol_agent_messages is 'Durable user, assistant, tool, and status events shown in Sol chat.';
comment on table public.sol_agent_approvals is 'Human approval checkpoints for Sol mutation tools.';
comment on column public.sol_operator_runs.heartbeat_at is 'Last worker liveness signal for active Sol work.';
comment on column public.sol_operator_runs.lease_expires_at is 'Worker lease deadline used to detect orphaned runs.';
comment on column public.sol_operator_runs.attempt_count is 'Number of execution attempts claimed by workers.';

commit;
