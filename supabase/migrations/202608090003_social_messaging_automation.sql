create schema if not exists social;

grant usage on schema social to service_role;

create table if not exists social.automations (
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

create table if not exists social.events (
  id bigint generated always as identity primary key,
  external_event_id text not null unique,
  automation_id uuid references social.automations(id) on delete set null,
  trigger_type text not null check (trigger_type in ('dm_keyword','comment_keyword')),
  matched_keyword text,
  source_media_id text,
  delivery_status text not null default 'received' check (delivery_status in ('received','matched','sent','failed','ignored')),
  provider_message_id text,
  error_code text,
  event_at timestamptz not null default now(),
  received_at timestamptz not null default now()
);

create table if not exists social.connection_status (
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

create index if not exists social_automations_enabled_idx
  on social.automations (enabled, trigger_type, updated_at desc);

create index if not exists social_events_automation_idx
  on social.events (automation_id, event_at desc);

create index if not exists social_events_status_idx
  on social.events (delivery_status, event_at desc);

alter table social.automations enable row level security;
alter table social.events enable row level security;
alter table social.connection_status enable row level security;

grant select, insert, update, delete on social.automations to service_role;
grant select, insert, update, delete on social.events to service_role;
grant select, insert, update, delete on social.connection_status to service_role;
grant usage, select on sequence social.events_id_seq to service_role;

comment on schema social is 'Server-only social messaging automation data for Apostolic Guide.';
comment on table social.automations is 'Keyword-triggered Instagram DM and comment automations managed from the Apostolic Guide admin.';
comment on table social.events is 'Idempotent social automation delivery ledger. Usernames and message bodies are intentionally not retained.';
comment on table social.connection_status is 'Non-secret Instagram connection state. Secrets remain in analytics.integration_secrets.';
