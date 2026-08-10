alter table public.people add column if not exists attribution_token uuid not null default gen_random_uuid();
create unique index if not exists people_attribution_token_uidx on public.people(attribution_token);

create table if not exists public.person_browser_identities (
  anonymous_id uuid primary key,
  person_id uuid not null references public.people(id) on delete cascade,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  source text not null default 'website'
);

create index if not exists person_browser_identities_person_idx
  on public.person_browser_identities(person_id,last_seen_at desc);

alter table public.person_browser_identities enable row level security;
grant select,insert,update,delete on public.person_browser_identities to service_role;

alter table analytics.events add column if not exists person_id uuid references public.people(id) on delete set null;
create index if not exists analytics_events_person_idx on analytics.events(person_id,occurred_at desc);

create or replace function public.link_browser_identity(p_person_id uuid, p_anonymous_id uuid)
returns void
language plpgsql
security definer
set search_path = public, analytics
as $$
begin
  insert into public.person_browser_identities(anonymous_id,person_id,last_seen_at)
  values(p_anonymous_id,p_person_id,now())
  on conflict(anonymous_id) do update
    set person_id=excluded.person_id,last_seen_at=now();

  update analytics.events
  set person_id=p_person_id
  where anonymous_id=p_anonymous_id
    and person_id is distinct from p_person_id;

  update public.people
  set last_seen_at=greatest(last_seen_at,now()),updated_at=now()
  where id=p_person_id;
end;
$$;

grant execute on function public.link_browser_identity(uuid,uuid) to service_role;
