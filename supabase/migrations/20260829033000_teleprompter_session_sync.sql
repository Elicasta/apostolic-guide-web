create table if not exists public.teleprompter_sessions (
  session_code text primary key,
  state jsonb not null,
  sequence bigint not null default 0,
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '12 hours'),
  constraint teleprompter_sessions_code_check
    check (session_code ~ '^[A-Z0-9]{7,10}$'),
  constraint teleprompter_sessions_state_size_check
    check (pg_column_size(state) <= 65536)
);

alter table public.teleprompter_sessions enable row level security;

revoke all on table public.teleprompter_sessions from anon, authenticated;
grant select, insert, update, delete on table public.teleprompter_sessions to service_role;

create index if not exists teleprompter_sessions_expires_at_idx
  on public.teleprompter_sessions (expires_at);

create or replace function public.save_teleprompter_session(
  p_session_code text,
  p_state jsonb,
  p_sequence bigint
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.teleprompter_sessions (
    session_code,
    state,
    sequence,
    updated_at,
    expires_at
  ) values (
    p_session_code,
    p_state,
    p_sequence,
    now(),
    now() + interval '12 hours'
  )
  on conflict (session_code) do update
  set state = excluded.state,
      sequence = excluded.sequence,
      updated_at = now(),
      expires_at = now() + interval '12 hours'
  where excluded.sequence > teleprompter_sessions.sequence
     or (
       excluded.sequence = teleprompter_sessions.sequence
       and coalesce((excluded.state ->> 'updatedAt')::bigint, 0)
         > coalesce((teleprompter_sessions.state ->> 'updatedAt')::bigint, 0)
     )
     or (
       excluded.sequence = teleprompter_sessions.sequence
       and coalesce((excluded.state ->> 'updatedAt')::bigint, 0)
         = coalesce((teleprompter_sessions.state ->> 'updatedAt')::bigint, 0)
       and coalesce(excluded.state ->> 'actorId', '')
         > coalesce(teleprompter_sessions.state ->> 'actorId', '')
     );
end;
$$;

revoke all on function public.save_teleprompter_session(text, jsonb, bigint)
  from public, anon, authenticated;
grant execute on function public.save_teleprompter_session(text, jsonb, bigint)
  to service_role;

comment on table public.teleprompter_sessions is
  'Short-lived authoritative state for paired Teleprompter displays and remotes.';
