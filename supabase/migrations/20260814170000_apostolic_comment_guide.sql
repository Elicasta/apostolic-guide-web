create table if not exists public.social_comment_guide_settings (
  id smallint primary key default 1 check (id = 1),
  mode text not null default 'shadow' check (mode in ('paused','shadow','live')),
  model text not null default 'gpt-5.6-sol',
  positive_replies_enabled boolean not null default true,
  public_keyword_ack_enabled boolean not null default true,
  daily_reply_limit integer not null default 250 check (daily_reply_limit between 1 and 5000),
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.social_comment_guide_settings (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.social_comment_guide_jobs (
  id bigint generated always as identity primary key,
  external_event_id text not null unique,
  platform text not null default 'instagram' check (platform = 'instagram'),
  comment_id text not null,
  parent_comment_id text,
  media_id text,
  sender_id text,
  person_id uuid references public.people(id) on delete set null,
  inbound_text text not null check (char_length(inbound_text) between 1 and 5000),
  event_at timestamptz not null,
  status text not null default 'received' check (status in (
    'received','classifying','classification_retry','scheduled','sending',
    'delivery_retry','sent','ignored','shadowed','failed'
  )),
  intent text check (intent is null or intent in (
    'keyword_request','positive','sincere_question','doctrinal_objection',
    'gotcha_contention','hostile_abuse','pastoral_sensitive','spam_off_topic','ambiguous'
  )),
  action text check (action is null or action in (
    'acknowledge','answer_once','redirect_once','deliver_keyword','ignore'
  )),
  contention_level text check (contention_level is null or contention_level in (
    'none','skeptical','gotcha','abusive','repetitive'
  )),
  confidence numeric(4,3),
  automation_id uuid references public.social_automations(id) on delete set null,
  matched_keyword text,
  pathway_slug text,
  public_reply_text text,
  private_reply_text text,
  destination_url text,
  scripture_references text[] not null default '{}',
  decision_json jsonb,
  doctrine_review_json jsonb,
  model text,
  prompt_version text,
  available_at timestamptz not null default now(),
  classification_attempts smallint not null default 0,
  delivery_attempts smallint not null default 0,
  locked_at timestamptz,
  public_reply_provider_id text,
  private_reply_provider_id text,
  last_error text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists social_comment_guide_jobs_due_idx
  on public.social_comment_guide_jobs (status, available_at, id);
create index if not exists social_comment_guide_jobs_sender_media_idx
  on public.social_comment_guide_jobs (sender_id, media_id, created_at desc);
create index if not exists social_comment_guide_jobs_activity_idx
  on public.social_comment_guide_jobs (created_at desc);

alter table public.social_comment_guide_settings enable row level security;
alter table public.social_comment_guide_jobs enable row level security;

revoke all on table public.social_comment_guide_settings from public, anon, authenticated;
revoke all on table public.social_comment_guide_jobs from public, anon, authenticated;
grant select, insert, update, delete on table public.social_comment_guide_settings to service_role;
grant select, insert, update, delete on table public.social_comment_guide_jobs to service_role;
revoke all on sequence public.social_comment_guide_jobs_id_seq from public, anon, authenticated;
grant usage, select on sequence public.social_comment_guide_jobs_id_seq to service_role;

comment on table public.social_comment_guide_settings is
  'Server-only controls for the doctrine-locked Instagram comment guide. Shadow mode is the safe default.';
comment on table public.social_comment_guide_jobs is
  'Durable, idempotent Instagram comment decisions, delayed deliveries, and doctrine review records.';
