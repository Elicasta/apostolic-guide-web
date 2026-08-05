create extension if not exists pgcrypto;

create table if not exists public.email_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  status text not null default 'subscribed' check (status in ('subscribed', 'unsubscribed', 'bounced', 'complained')),
  wants_live_teachings boolean not null default true,
  wants_new_articles boolean not null default true,
  source text not null default 'website',
  signup_path text not null default '/',
  consented_at timestamptz not null default now(),
  last_signup_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  resend_contact_id text,
  resend_synced_at timestamptz,
  resend_error text,
  welcome_email_id text,
  welcome_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_subscribers_status_idx
  on public.email_subscribers (status, created_at desc);

create index if not exists email_subscribers_interests_idx
  on public.email_subscribers (wants_live_teachings, wants_new_articles)
  where status = 'subscribed';

alter table public.email_subscribers enable row level security;

comment on table public.email_subscribers is
  'Permanent Apostolic Guide subscriber ledger. Writes are performed only through the server-side service role.';

comment on column public.email_subscribers.source is
  'The form or campaign that captured the subscriber.';

comment on column public.email_subscribers.signup_path is
  'The website path where the subscriber joined.';
