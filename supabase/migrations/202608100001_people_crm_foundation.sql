create extension if not exists pgcrypto;

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  display_name text,
  first_name text,
  last_name text,
  email text,
  instagram_user_id text unique,
  instagram_username text,
  phone text,
  status text not null default 'lead' check (status in ('lead','subscriber','app_user','inactive','archived')),
  source text not null default 'unknown',
  source_detail text,
  email_subscriber_id uuid references public.email_subscribers(id) on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists people_email_unique_idx on public.people (lower(email)) where email is not null;
create index if not exists people_last_seen_idx on public.people (last_seen_at desc);
create index if not exists people_source_idx on public.people (source, last_seen_at desc);
create index if not exists people_status_idx on public.people (status, last_seen_at desc);

create table if not exists public.person_events (
  id bigint generated always as identity primary key,
  person_id uuid not null references public.people(id) on delete cascade,
  event_type text not null,
  channel text not null default 'system',
  event_name text,
  automation_id uuid references public.social_automations(id) on delete set null,
  external_event_id text,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index if not exists person_events_external_unique_idx on public.person_events (external_event_id) where external_event_id is not null;
create index if not exists person_events_person_idx on public.person_events (person_id, occurred_at desc);
create index if not exists person_events_channel_idx on public.person_events (channel, occurred_at desc);

create table if not exists public.person_tags (
  person_id uuid not null references public.people(id) on delete cascade,
  tag text not null,
  created_at timestamptz not null default now(),
  primary key (person_id, tag)
);
create index if not exists person_tags_tag_idx on public.person_tags (tag, created_at desc);

create table if not exists public.person_notes (
  id bigint generated always as identity primary key,
  person_id uuid not null references public.people(id) on delete cascade,
  note text not null,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists person_notes_person_idx on public.person_notes (person_id, created_at desc);

create table if not exists public.journey_progress (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  journey_key text not null,
  journey_name text not null,
  stage_key text,
  stage_name text,
  status text not null default 'active' check (status in ('active','completed','paused','exited')),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (person_id, journey_key)
);
create index if not exists journey_progress_person_idx on public.journey_progress (person_id, status, updated_at desc);

alter table public.people enable row level security;
alter table public.person_events enable row level security;
alter table public.person_tags enable row level security;
alter table public.person_notes enable row level security;
alter table public.journey_progress enable row level security;

grant select, insert, update, delete on public.people to service_role;
grant select, insert, update, delete on public.person_events to service_role;
grant select, insert, update, delete on public.person_tags to service_role;
grant select, insert, update, delete on public.person_notes to service_role;
grant select, insert, update, delete on public.journey_progress to service_role;
grant usage, select on sequence public.person_events_id_seq to service_role;
grant usage, select on sequence public.person_notes_id_seq to service_role;

comment on table public.people is 'Unified Apostolic Guide CRM person record across social, email, website and app channels.';
comment on table public.person_events is 'Privacy-conscious engagement timeline for a person. Store event metadata, not raw private message bodies.';
comment on table public.person_tags is 'Operator-managed CRM tags and interests.';
comment on table public.person_notes is 'Private admin notes for ministry follow-up.';
comment on table public.journey_progress is 'Current and completed multi-step ministry journeys for a person.';
