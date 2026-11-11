-- Scoped draft-only assistant access. The bearer secret is hashed, never stored.
create table if not exists public.video_producer_agent_tokens (
 id uuid primary key default gen_random_uuid(),
 name text not null check (char_length(name) between 1 and 120),
 token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
 scopes text[] not null check (array_length(scopes,1) between 1 and 5 and
  scopes <@ array['project:create','timeline:write','asset:upload','preview:request','status:read']::text[]),
 created_by uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null check (expires_at > created_at),
 revoked_at timestamptz,
 last_used_at timestamptz
);
create index if not exists video_producer_agent_tokens_owner_idx
 on public.video_producer_agent_tokens(created_by,created_at desc);
alter table public.video_producer_agent_tokens enable row level security;
revoke all on public.video_producer_agent_tokens from anon, authenticated;
grant all on public.video_producer_agent_tokens to service_role;
