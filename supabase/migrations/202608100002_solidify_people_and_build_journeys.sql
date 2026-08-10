create extension if not exists pgcrypto;

create table if not exists public.person_identities (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  provider text not null check (provider in ('email','instagram','app','phone')),
  provider_user_id text not null,
  username text,
  email text,
  is_primary boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, provider_user_id)
);
create index if not exists person_identities_person_idx on public.person_identities(person_id);

insert into public.person_identities(person_id,provider,provider_user_id,username,is_primary,verified_at)
select id,'instagram',instagram_user_id,instagram_username,true,first_seen_at from public.people
where instagram_user_id is not null
on conflict(provider,provider_user_id) do update set person_id=excluded.person_id,username=excluded.username,updated_at=now();

insert into public.person_identities(person_id,provider,provider_user_id,email,is_primary,verified_at)
select id,'email',lower(email),lower(email),true,first_seen_at from public.people
where email is not null
on conflict(provider,provider_user_id) do update set person_id=excluded.person_id,email=excluded.email,updated_at=now();

create table if not exists public.growth_journeys (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  status text not null default 'draft' check (status in ('draft','active','paused','archived')),
  trigger_type text not null default 'manual' check (trigger_type in ('manual','instagram_comment_keyword','instagram_dm_keyword','person_tag')),
  trigger_config jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.growth_journey_steps (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.growth_journeys(id) on delete cascade,
  position integer not null check (position >= 0),
  name text not null,
  step_type text not null check (step_type in ('wait','add_tag','remove_tag','set_status','mark_complete','manual_task')),
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(journey_id,position)
);

create table if not exists public.growth_journey_enrollments (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.growth_journeys(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  status text not null default 'active' check (status in ('active','waiting','paused','completed','cancelled','failed')),
  current_step_position integer not null default 0,
  next_action_at timestamptz,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  last_error text,
  context jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique(journey_id,person_id,status)
);
create index if not exists growth_journey_enrollments_due_idx on public.growth_journey_enrollments(status,next_action_at);
create index if not exists growth_journey_enrollments_person_idx on public.growth_journey_enrollments(person_id,updated_at desc);

create table if not exists public.growth_journey_events (
  id bigint generated always as identity primary key,
  enrollment_id uuid not null references public.growth_journey_enrollments(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  journey_id uuid not null references public.growth_journeys(id) on delete cascade,
  event_type text not null,
  step_position integer,
  detail jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index if not exists growth_journey_events_enrollment_idx on public.growth_journey_events(enrollment_id,occurred_at desc);

alter table public.person_identities enable row level security;
alter table public.growth_journeys enable row level security;
alter table public.growth_journey_steps enable row level security;
alter table public.growth_journey_enrollments enable row level security;
alter table public.growth_journey_events enable row level security;

grant select,insert,update,delete on public.person_identities to service_role;
grant select,insert,update,delete on public.growth_journeys to service_role;
grant select,insert,update,delete on public.growth_journey_steps to service_role;
grant select,insert,update,delete on public.growth_journey_enrollments to service_role;
grant select,insert,update,delete on public.growth_journey_events to service_role;
grant usage,select on sequence public.growth_journey_events_id_seq to service_role;

comment on table public.person_identities is 'Provider identities linked to one canonical person record.';
comment on table public.growth_journeys is 'Admin-defined relationship journeys and their entry triggers.';
comment on table public.growth_journey_steps is 'Ordered non-invasive journey steps. Messaging steps are intentionally excluded until channel policy windows are modeled.';
comment on table public.growth_journey_enrollments is 'Current per-person journey state.';
