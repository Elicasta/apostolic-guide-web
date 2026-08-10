create table if not exists public.studio_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null unique,
  role text not null check (role in ('owner','admin','editor','moderator','viewer')),
  invited_by uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.studio_members enable row level security;
revoke all on public.studio_members from anon, authenticated;
grant all on public.studio_members to service_role;

create index if not exists studio_members_role_idx on public.studio_members(role);

insert into public.studio_members (user_id,email,role)
select id, lower(email), 'owner'
from auth.users
where deleted_at is null and email is not null
on conflict (user_id) do nothing;
