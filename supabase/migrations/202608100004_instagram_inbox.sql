create table if not exists public.inbox_conversations (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  platform text not null default 'instagram' check (platform in ('instagram')),
  provider_thread_id text,
  status text not null default 'open' check (status in ('open','follow_up','resolved','archived')),
  unread_count integer not null default 0 check (unread_count >= 0),
  last_message_at timestamptz not null default now(),
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  assigned_to uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(platform, person_id)
);

create index if not exists inbox_conversations_last_message_idx on public.inbox_conversations(last_message_at desc);
create index if not exists inbox_conversations_status_idx on public.inbox_conversations(status, last_message_at desc);

create table if not exists public.inbox_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.inbox_conversations(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  platform text not null default 'instagram' check (platform in ('instagram')),
  direction text not null check (direction in ('inbound','outbound')),
  kind text not null default 'text' check (kind in ('text','automation','system')),
  body text,
  provider_message_id text,
  external_event_id text,
  delivery_status text not null default 'received' check (delivery_status in ('received','sent','failed')),
  metadata jsonb not null default '{}'::jsonb,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists inbox_messages_provider_id_idx on public.inbox_messages(platform, provider_message_id) where provider_message_id is not null;
create unique index if not exists inbox_messages_external_event_idx on public.inbox_messages(external_event_id) where external_event_id is not null;
create index if not exists inbox_messages_conversation_idx on public.inbox_messages(conversation_id, sent_at asc);

alter table public.inbox_conversations enable row level security;
alter table public.inbox_messages enable row level security;
revoke all on public.inbox_conversations from anon, authenticated;
revoke all on public.inbox_messages from anon, authenticated;
grant all on public.inbox_conversations to service_role;
grant all on public.inbox_messages to service_role;
