create table if not exists public.social_automations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  platform text not null default 'instagram' check (platform = 'instagram'),
  trigger_type text not null check (trigger_type in ('dm_keyword','comment_keyword')),
  keywords text[] not null default '{}',
  match_type text not null default 'contains' check (match_type in ('exact','contains','starts_with')),
  reply_text text not null,
  destination_url text,
  enabled boolean not null default false,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.social_events (
  id bigint generated always as identity primary key,
  external_event_id text not null unique,
  automation_id uuid references public.social_automations(id) on delete set null,
  trigger_type text not null check (trigger_type in ('dm_keyword','comment_keyword')),
  matched_keyword text,
  source_media_id text,
  delivery_status text not null default 'received' check (delivery_status in ('received','matched','sent','failed','ignored')),
  provider_message_id text,
  error_code text,
  event_at timestamptz not null default now(),
  received_at timestamptz not null default now()
);

create table if not exists public.social_connection_status (
  platform text primary key check (platform = 'instagram'),
  instagram_user_id text,
  username text,
  graph_version text,
  webhook_subscribed boolean not null default false,
  last_verified_at timestamptz,
  last_webhook_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

insert into public.social_automations (id,name,platform,trigger_type,keywords,match_type,reply_text,destination_url,enabled,created_by,created_at,updated_at)
select id,name,platform,trigger_type,keywords,match_type,reply_text,destination_url,enabled,created_by,created_at,updated_at from social.automations
on conflict (id) do nothing;

insert into public.social_connection_status (platform,instagram_user_id,username,graph_version,webhook_subscribed,last_verified_at,last_webhook_at,last_error,updated_at)
select platform,instagram_user_id,username,graph_version,webhook_subscribed,last_verified_at,last_webhook_at,last_error,updated_at from social.connection_status
on conflict (platform) do update set
  instagram_user_id = excluded.instagram_user_id,
  username = excluded.username,
  graph_version = excluded.graph_version,
  webhook_subscribed = excluded.webhook_subscribed,
  last_verified_at = excluded.last_verified_at,
  last_webhook_at = excluded.last_webhook_at,
  last_error = excluded.last_error,
  updated_at = excluded.updated_at;

insert into public.social_events (external_event_id,automation_id,trigger_type,matched_keyword,source_media_id,delivery_status,provider_message_id,error_code,event_at,received_at)
select external_event_id,automation_id,trigger_type,matched_keyword,source_media_id,delivery_status,provider_message_id,error_code,event_at,received_at from social.events
on conflict (external_event_id) do nothing;

create index if not exists social_automations_enabled_idx on public.social_automations (enabled, trigger_type, updated_at desc);
create index if not exists social_events_automation_idx on public.social_events (automation_id, event_at desc);
create index if not exists social_events_status_idx on public.social_events (delivery_status, event_at desc);

alter table public.social_automations enable row level security;
alter table public.social_events enable row level security;
alter table public.social_connection_status enable row level security;

grant select, insert, update, delete on public.social_automations to service_role;
grant select, insert, update, delete on public.social_events to service_role;
grant select, insert, update, delete on public.social_connection_status to service_role;
grant usage, select on sequence public.social_events_id_seq to service_role;
