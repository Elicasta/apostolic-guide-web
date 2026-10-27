-- Additive, service-only automation configuration, deduped delivery ledger, and opt-out token.
-- Back up the production database and apply in staging before production.
begin;

create table if not exists public.email_automations (
  key text primary key check (key = 'welcome'),
  status text not null default 'active' check (status in ('active','paused')),
  copy jsonb not null default '{}'::jsonb check (jsonb_typeof(copy) = 'object'),
  revision integer not null default 1 check (revision > 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.email_automations (key, status, copy)
values ('welcome','active','{}'::jsonb)
on conflict (key) do nothing;

alter table public.email_subscribers
  add column if not exists unsubscribe_token uuid not null default gen_random_uuid();
create unique index if not exists email_subscriber_optout_token_idx
  on public.email_subscribers (unsubscribe_token);

create table if not exists public.email_automation_deliveries (
  id uuid primary key default gen_random_uuid(),
  automation_key text not null references public.email_automations(key),
  subscriber_id uuid not null references public.email_subscribers(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued','processing','sent','failed','uncertain','skipped')),
  attempts integer not null default 0 check (attempts between 0 and 3),
  resend_email_id text,
  last_error text,
  next_attempt_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (automation_key,subscriber_id)
);
create index if not exists email_automation_delivery_due_idx
  on public.email_automation_deliveries(status,next_attempt_at) where status in ('queued','failed');
create index if not exists email_automation_delivery_recent_idx
  on public.email_automation_deliveries(automation_key,created_at desc);

alter table public.email_automations enable row level security;
alter table public.email_automation_deliveries enable row level security;
revoke all on table public.email_automations,public.email_automation_deliveries from public,anon,authenticated;
grant select,insert,update,delete on table public.email_automations,public.email_automation_deliveries to service_role;
commit;
