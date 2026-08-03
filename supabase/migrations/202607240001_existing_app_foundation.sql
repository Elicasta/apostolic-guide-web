begin;

create extension if not exists pgcrypto;

create table if not exists public.user_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.content_records (
  id bigint generated always as identity primary key,
  entity_type text not null check (entity_type in ('scripture', 'pathway', 'objection', 'category')),
  entity_id text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  payload jsonb not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entity_type, entity_id)
);

create table if not exists public.ai_review_suggestions (
  id bigint generated always as identity primary key,
  entity_type text not null,
  entity_id text not null,
  suggestion_type text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_by uuid references auth.users(id),
  reviewed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_user_workspaces on public.user_workspaces;
create trigger touch_user_workspaces
before update on public.user_workspaces
for each row execute function public.touch_updated_at();

drop trigger if exists touch_content_records on public.content_records;
create trigger touch_content_records
before update on public.content_records
for each row execute function public.touch_updated_at();

alter table public.user_workspaces enable row level security;
alter table public.content_records enable row level security;
alter table public.ai_review_suggestions enable row level security;

create policy "users read own workspace"
on public.user_workspaces for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "users insert own workspace"
on public.user_workspaces for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "users update own workspace"
on public.user_workspaces for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "users delete own workspace"
on public.user_workspaces for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "anyone reads published content"
on public.content_records for select
to anon, authenticated
using (
  status = 'published'
  or (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
);

create policy "admins insert official content"
on public.content_records for insert
to authenticated
with check (
  (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  and (select auth.uid()) = created_by
);

create policy "admins update official content"
on public.content_records for update
to authenticated
using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "admins archive official content"
on public.content_records for delete
to authenticated
using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "admins manage ai review suggestions"
on public.ai_review_suggestions for all
to authenticated
using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

revoke all on public.user_workspaces from anon;
grant select, insert, update, delete on public.user_workspaces to authenticated;
grant select on public.content_records to anon, authenticated;
grant insert, update, delete on public.content_records to authenticated;
grant all on public.ai_review_suggestions to authenticated;

commit;
