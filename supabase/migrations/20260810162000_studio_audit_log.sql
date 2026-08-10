-- Server-only audit log for privileged Studio actions.

begin;

create table if not exists public.studio_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null check (char_length(action) between 1 and 120),
  resource_type text not null check (char_length(resource_type) between 1 and 120),
  resource_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists studio_audit_created_idx
on public.studio_audit_events (created_at desc);

create index if not exists studio_audit_resource_idx
on public.studio_audit_events (resource_type, resource_id, created_at desc);

alter table public.studio_audit_events enable row level security;
revoke all on table public.studio_audit_events from public, anon, authenticated;

create or replace function public.record_studio_audit(
  p_actor_user_id uuid,
  p_action text,
  p_resource_type text,
  p_resource_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_actor_user_id is null then
    raise exception 'actor_user_id is required';
  end if;
  if btrim(coalesce(p_action, '')) = '' or char_length(p_action) > 120 then
    raise exception 'invalid audit action';
  end if;
  if btrim(coalesce(p_resource_type, '')) = '' or char_length(p_resource_type) > 120 then
    raise exception 'invalid audit resource_type';
  end if;

  insert into public.studio_audit_events (
    actor_user_id,
    action,
    resource_type,
    resource_id,
    metadata
  ) values (
    p_actor_user_id,
    p_action,
    p_resource_type,
    p_resource_id,
    coalesce(p_metadata, '{}'::jsonb)
  ) returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.list_studio_audit(
  p_limit integer default 100,
  p_offset integer default 0,
  p_resource_type text default null,
  p_action text default null
)
returns table (
  id uuid,
  actor_user_id uuid,
  actor_email text,
  action text,
  resource_type text,
  resource_id uuid,
  metadata jsonb,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    a.id,
    a.actor_user_id,
    u.email::text as actor_email,
    a.action,
    a.resource_type,
    a.resource_id,
    a.metadata,
    a.created_at
  from public.studio_audit_events a
  left join auth.users u on u.id = a.actor_user_id
  where (p_resource_type is null or a.resource_type = p_resource_type)
    and (p_action is null or a.action = p_action)
  order by a.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 200))
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.record_studio_audit(uuid, text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.record_studio_audit(uuid, text, text, uuid, jsonb) to service_role;

revoke all on function public.list_studio_audit(integer, integer, text, text) from public, anon, authenticated;
grant execute on function public.list_studio_audit(integer, integer, text, text) to service_role;

commit;
