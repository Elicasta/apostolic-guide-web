begin;

-- Grokbot workbench persistence.
-- Access policy: a session, run, plan, scratch note, and asset link is readable
-- and writable only by its owner_user_id. Studio owner and admin roles do not
-- grant cross-user access. The API uses the service role and must filter by the
-- authenticated Studio user from the server session. Client-supplied user ids
-- are ignored. Direct authenticated access is limited to auth.uid() = owner_user_id.

create table if not exists public.grokbot_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  workspace_key text not null default 'studio' check (char_length(workspace_key) between 1 and 80),
  pathway_slug text check (pathway_slug is null or char_length(pathway_slug) between 1 and 80),
  project_id text check (project_id is null or char_length(project_id) between 1 and 80),
  plan_id uuid,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.grokbot_runs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.grokbot_sessions(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  request_id text check (request_id is null or char_length(request_id) between 8 and 80),
  command text not null check (char_length(command) between 1 and 500),
  action text,
  classification text check (classification is null or classification in ('read', 'private_write', 'public_effect')),
  permission text,
  approval_required boolean not null default false,
  status text not null check (status in ('pending', 'ok', 'error', 'blocked')),
  summary text not null check (char_length(summary) <= 500),
  result_refs jsonb not null default '{}'::jsonb,
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists grokbot_runs_owner_request_idx
  on public.grokbot_runs (owner_user_id, request_id)
  where request_id is not null;

create index if not exists grokbot_runs_session_idx
  on public.grokbot_runs (session_id, created_at desc);

create table if not exists public.grokbot_plans (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.grokbot_sessions(id) on delete set null,
  title text not null check (char_length(title) between 1 and 180),
  timezone text not null default 'America/New_York' check (char_length(timezone) between 1 and 80),
  starts_on date not null,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists grokbot_plans_owner_idx
  on public.grokbot_plans (owner_user_id, updated_at desc);

create table if not exists public.grokbot_plan_slots (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.grokbot_plans(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  position integer not null check (position >= 0 and position < 14),
  slot_date date not null,
  title text not null check (char_length(title) between 1 and 180),
  pathway_slug text,
  goal text not null default '',
  reason text not null default '',
  suggested_topic text not null default '',
  why_now text not null default '',
  next_steps text not null default '',
  dependencies jsonb not null default '[]'::jsonb,
  status text not null check (status in ('idea', 'draft', 'prepared', 'ready-for-review', 'blocked')),
  proposal_kind text not null check (proposal_kind in ('carousel', 'article', 'automation', 'topic')),
  constraint grokbot_plan_slots_position_unique unique (plan_id, position) deferrable initially deferred
);

create table if not exists public.grokbot_plan_revisions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.grokbot_plans(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  revision integer not null check (revision > 0),
  reason text not null check (char_length(reason) between 1 and 300),
  changes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (plan_id, revision)
);

create table if not exists public.grokbot_scratch (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.grokbot_sessions(id) on delete set null,
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 8000),
  kind text not null check (kind in ('text', 'hook', 'outline')),
  linked_asset_ids uuid[] not null default '{}',
  canonical boolean not null default false check (canonical = false),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists grokbot_scratch_owner_idx
  on public.grokbot_scratch (owner_user_id, updated_at desc);

create table if not exists public.grokbot_session_assets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.grokbot_sessions(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  asset_id uuid not null references public.studio_pathway_assets(id) on delete cascade,
  use text not null check (use in ('reference', 'draft_source')),
  created_at timestamptz not null default now(),
  unique (session_id, asset_id)
);

create index if not exists grokbot_sessions_owner_idx
  on public.grokbot_sessions (owner_user_id, updated_at desc);

alter table public.grokbot_sessions enable row level security;
alter table public.grokbot_runs enable row level security;
alter table public.grokbot_plans enable row level security;
alter table public.grokbot_plan_slots enable row level security;
alter table public.grokbot_plan_revisions enable row level security;
alter table public.grokbot_scratch enable row level security;
alter table public.grokbot_session_assets enable row level security;

alter table public.grokbot_sessions force row level security;
alter table public.grokbot_runs force row level security;
alter table public.grokbot_plans force row level security;
alter table public.grokbot_plan_slots force row level security;
alter table public.grokbot_plan_revisions force row level security;
alter table public.grokbot_scratch force row level security;
alter table public.grokbot_session_assets force row level security;

revoke all on public.grokbot_sessions from public, anon, authenticated;
revoke all on public.grokbot_runs from public, anon, authenticated;
revoke all on public.grokbot_plans from public, anon, authenticated;
revoke all on public.grokbot_plan_slots from public, anon, authenticated;
revoke all on public.grokbot_plan_revisions from public, anon, authenticated;
revoke all on public.grokbot_scratch from public, anon, authenticated;
revoke all on public.grokbot_session_assets from public, anon, authenticated;

grant select, insert, update on public.grokbot_sessions to authenticated;
grant select, insert, update on public.grokbot_runs to authenticated;
grant select, insert, update on public.grokbot_plans to authenticated;
grant select, insert, update on public.grokbot_plan_slots to authenticated;
grant select, insert, update on public.grokbot_plan_revisions to authenticated;
grant select, insert, update on public.grokbot_scratch to authenticated;
grant select, insert, update on public.grokbot_session_assets to authenticated;

grant all on public.grokbot_sessions to service_role;
grant all on public.grokbot_runs to service_role;
grant all on public.grokbot_plans to service_role;
grant all on public.grokbot_plan_slots to service_role;
grant all on public.grokbot_plan_revisions to service_role;
grant all on public.grokbot_scratch to service_role;
grant all on public.grokbot_session_assets to service_role;

create policy grokbot_sessions_owner on public.grokbot_sessions
  for all to authenticated
  using ((select auth.uid()) = owner_user_id)
  with check ((select auth.uid()) = owner_user_id);
create policy grokbot_runs_owner on public.grokbot_runs
  for all to authenticated
  using ((select auth.uid()) = owner_user_id)
  with check ((select auth.uid()) = owner_user_id);
create policy grokbot_plans_owner on public.grokbot_plans
  for all to authenticated
  using ((select auth.uid()) = owner_user_id)
  with check ((select auth.uid()) = owner_user_id);
create policy grokbot_plan_slots_owner on public.grokbot_plan_slots
  for all to authenticated
  using ((select auth.uid()) = owner_user_id)
  with check ((select auth.uid()) = owner_user_id);
create policy grokbot_plan_revisions_owner on public.grokbot_plan_revisions
  for all to authenticated
  using ((select auth.uid()) = owner_user_id)
  with check ((select auth.uid()) = owner_user_id);
create policy grokbot_scratch_owner on public.grokbot_scratch
  for all to authenticated
  using ((select auth.uid()) = owner_user_id)
  with check ((select auth.uid()) = owner_user_id);
create policy grokbot_session_assets_owner on public.grokbot_session_assets
  for all to authenticated
  using ((select auth.uid()) = owner_user_id)
  with check ((select auth.uid()) = owner_user_id);

create or replace function public.grokbot_save_plan(
  p_owner uuid,
  p_plan_id uuid,
  p_expected integer,
  p_reason text,
  p_title text,
  p_timezone text,
  p_changes jsonb,
  p_slots jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_revision integer;
  v_slot jsonb;
  v_count integer;
  v_existing integer;
begin
  if p_owner is null then
    raise exception 'owner is required';
  end if;
  if btrim(coalesce(p_reason, '')) = '' or char_length(p_reason) > 300 then
    raise exception 'a revision reason is required';
  end if;
  if btrim(coalesce(p_title, '')) = '' or char_length(p_title) > 180 then
    raise exception 'invalid plan title';
  end if;
  if btrim(coalesce(p_timezone, '')) = '' or char_length(p_timezone) > 80 then
    raise exception 'invalid timezone';
  end if;
  if jsonb_typeof(p_slots) <> 'array' then
    raise exception 'slots must be an array';
  end if;
  v_count := jsonb_array_length(p_slots);
  if v_count < 1 or v_count > 14 then
    raise exception 'a plan holds 1 to 14 slots';
  end if;

  select owner_user_id, revision into v_owner, v_revision
  from public.grokbot_plans
  where id = p_plan_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'missing', true);
  end if;
  if v_owner <> p_owner then
    return jsonb_build_object('ok', false, 'denied', true);
  end if;
  if v_revision <> p_expected then
    return jsonb_build_object('ok', false, 'conflict', true, 'currentRevision', v_revision, 'planId', p_plan_id);
  end if;

  select count(*) into v_existing from public.grokbot_plan_slots where plan_id = p_plan_id;
  if v_existing <> v_count then
    raise exception 'every slot must be included';
  end if;

  for v_slot in select value from jsonb_array_elements(p_slots)
  loop
    update public.grokbot_plan_slots set
      position = (v_slot->>'position')::integer,
      slot_date = (v_slot->>'slotDate')::date,
      title = v_slot->>'title',
      pathway_slug = nullif(v_slot->>'pathwaySlug', ''),
      goal = coalesce(v_slot->>'goal', ''),
      reason = coalesce(v_slot->>'reason', ''),
      suggested_topic = coalesce(v_slot->>'suggestedTopic', ''),
      why_now = coalesce(v_slot->>'whyNow', ''),
      next_steps = coalesce(v_slot->>'nextSteps', ''),
      dependencies = coalesce(v_slot->'dependencies', '[]'::jsonb),
      status = v_slot->>'status',
      proposal_kind = v_slot->>'proposalKind'
    where id = (v_slot->>'id')::uuid
      and plan_id = p_plan_id
      and owner_user_id = p_owner;
    if not found then
      raise exception 'slot does not belong to this plan';
    end if;
  end loop;

  update public.grokbot_plans
  set title = p_title,
      timezone = p_timezone,
      revision = v_revision + 1,
      updated_at = now()
  where id = p_plan_id
    and owner_user_id = p_owner
    and revision = p_expected;

  insert into public.grokbot_plan_revisions (plan_id, owner_user_id, revision, reason, changes)
  values (p_plan_id, p_owner, v_revision + 1, p_reason, coalesce(p_changes, '[]'::jsonb));

  return jsonb_build_object('ok', true, 'revision', v_revision + 1, 'planId', p_plan_id, 'overwritten', false);
end;
$$;

revoke all on function public.grokbot_save_plan(uuid, uuid, integer, text, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.grokbot_save_plan(uuid, uuid, integer, text, text, text, jsonb, jsonb) to service_role;

comment on table public.grokbot_sessions is 'Private Grokbot workbench sessions. Owner-only. Studio admin does not grant cross-user access.';
comment on table public.grokbot_plans is 'Private 14-day operating drafts. They do not publish or schedule.';
comment on table public.grokbot_scratch is 'Private scratch text. canonical is constrained false.';
comment on table public.grokbot_session_assets is 'Links a Grokbot session to an existing Pathway asset. Does not publish the blob.';

commit;
