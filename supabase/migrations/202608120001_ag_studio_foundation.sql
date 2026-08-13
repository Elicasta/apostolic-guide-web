begin;

create table if not exists public.studio_episodes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  episode_type text not null default 'solo' check (episode_type in ('solo','interview','panel','live_qa')),
  status text not null default 'draft' check (status in ('draft','prepared','green_room','active','ended','archived')),
  access_mode text not null default 'public' check (access_mode in ('public','account','members','private')),
  series_id text,
  scheduled_at timestamptz,
  expected_duration_minutes integer check (expected_duration_minutes is null or expected_duration_minutes > 0),
  notes text,
  youtube_url text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.studio_episode_pathways (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.studio_episodes(id) on delete cascade,
  pathway_id text not null,
  is_primary boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (episode_id, pathway_id)
);

create unique index if not exists studio_episode_pathways_one_primary
on public.studio_episode_pathways (episode_id)
where is_primary;

create table if not exists public.studio_assets (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.studio_episodes(id) on delete cascade,
  asset_type text not null check (asset_type in ('scripture','question','talking_point','lower_third','title','quote','cta','pathway','video','audio','image','poll','custom_text')),
  source_type text,
  source_id text,
  snapshot_data jsonb not null default '{}'::jsonb,
  custom_data jsonb not null default '{}'::jsonb,
  label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.studio_runs (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.studio_episodes(id) on delete cascade,
  name text not null default 'Main Run',
  version integer not null default 1 check (version > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.studio_cues (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.studio_runs(id) on delete cascade,
  position integer not null,
  label text not null,
  asset_id uuid references public.studio_assets(id) on delete set null,
  presenter_notes text,
  estimated_duration_seconds integer check (estimated_duration_seconds is null or estimated_duration_seconds >= 0),
  auto_advance boolean not null default false,
  auto_advance_delay_ms integer check (auto_advance_delay_ms is null or auto_advance_delay_ms >= 0),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, position)
);

create table if not exists public.studio_cue_actions (
  id uuid primary key default gen_random_uuid(),
  cue_id uuid not null references public.studio_cues(id) on delete cascade,
  position integer not null,
  action_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (cue_id, position)
);

create table if not exists public.studio_sessions (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.studio_episodes(id) on delete cascade,
  active_run_id uuid not null references public.studio_runs(id),
  status text not null default 'created' check (status in ('created','green_room','active','ended')),
  output_token_hash text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.studio_session_state (
  session_id uuid primary key references public.studio_sessions(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  state_version bigint not null default 0 check (state_version >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.studio_production_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.studio_sessions(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  cue_id uuid references public.studio_cues(id) on delete set null,
  action_id text,
  payload jsonb not null default '{}'::jsonb,
  success boolean not null default true,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists studio_production_events_session_created_idx
on public.studio_production_events (session_id, created_at);

create table if not exists public.studio_clip_markers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.studio_sessions(id) on delete cascade,
  timestamp_seconds numeric not null check (timestamp_seconds >= 0),
  label text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.user_entitlements (
  user_id uuid not null references auth.users(id) on delete cascade,
  entitlement_key text not null,
  source text not null default 'membership',
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, entitlement_key)
);

create table if not exists public.live_questions (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.studio_episodes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text,
  anonymous_to_audience boolean not null default false,
  body text not null check (char_length(body) between 1 and 1000),
  status text not null default 'submitted' check (status in ('submitted','approved','queued','live','answered','dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.live_question_votes (
  question_id uuid not null references public.live_questions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (question_id, user_id)
);

create table if not exists public.live_polls (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.studio_episodes(id) on delete cascade,
  question text not null,
  status text not null default 'draft' check (status in ('draft','scheduled','open','closed','archived')),
  allow_answer_change boolean not null default false,
  show_results boolean not null default false,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.live_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.live_polls(id) on delete cascade,
  label text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.live_poll_responses (
  poll_id uuid not null references public.live_polls(id) on delete cascade,
  option_id uuid not null references public.live_poll_options(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);

create table if not exists public.studio_episode_recommendations (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  reason text not null,
  priority text not null default 'medium' check (priority in ('low','medium','high')),
  primary_pathway_id text not null,
  supporting_pathway_ids text[] not null default '{}',
  signals jsonb not null default '[]'::jsonb,
  suggested_duration_minutes integer,
  status text not null default 'suggested' check (status in ('suggested','accepted','dismissed','converted')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.studio_question_clusters (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  canonical_question text not null,
  pathway_ids text[] not null default '{}',
  occurrence_count integer not null default 0 check (occurrence_count >= 0),
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists studio_assets_episode_idx on public.studio_assets (episode_id);
create index if not exists studio_cues_run_position_idx on public.studio_cues (run_id, position);
create index if not exists live_questions_episode_status_idx on public.live_questions (episode_id, status, created_at);
create index if not exists live_polls_episode_status_idx on public.live_polls (episode_id, status);

create trigger touch_studio_episodes before update on public.studio_episodes for each row execute function public.touch_updated_at();
create trigger touch_studio_assets before update on public.studio_assets for each row execute function public.touch_updated_at();
create trigger touch_studio_runs before update on public.studio_runs for each row execute function public.touch_updated_at();
create trigger touch_studio_cues before update on public.studio_cues for each row execute function public.touch_updated_at();
create trigger touch_studio_session_state before update on public.studio_session_state for each row execute function public.touch_updated_at();
create trigger touch_user_entitlements before update on public.user_entitlements for each row execute function public.touch_updated_at();
create trigger touch_live_questions before update on public.live_questions for each row execute function public.touch_updated_at();
create trigger touch_live_polls before update on public.live_polls for each row execute function public.touch_updated_at();
create trigger touch_live_poll_responses before update on public.live_poll_responses for each row execute function public.touch_updated_at();
create trigger touch_studio_episode_recommendations before update on public.studio_episode_recommendations for each row execute function public.touch_updated_at();
create trigger touch_studio_question_clusters before update on public.studio_question_clusters for each row execute function public.touch_updated_at();

alter table public.studio_episodes enable row level security;
alter table public.studio_episode_pathways enable row level security;
alter table public.studio_assets enable row level security;
alter table public.studio_runs enable row level security;
alter table public.studio_cues enable row level security;
alter table public.studio_cue_actions enable row level security;
alter table public.studio_sessions enable row level security;
alter table public.studio_session_state enable row level security;
alter table public.studio_production_events enable row level security;
alter table public.studio_clip_markers enable row level security;
alter table public.user_entitlements enable row level security;
alter table public.live_questions enable row level security;
alter table public.live_question_votes enable row level security;
alter table public.live_polls enable row level security;
alter table public.live_poll_options enable row level security;
alter table public.live_poll_responses enable row level security;
alter table public.studio_episode_recommendations enable row level security;
alter table public.studio_question_clusters enable row level security;

create policy "admins manage studio episodes" on public.studio_episodes for all to authenticated using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "admins manage studio episode pathways" on public.studio_episode_pathways for all to authenticated using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "admins manage studio assets" on public.studio_assets for all to authenticated using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "admins manage studio runs" on public.studio_runs for all to authenticated using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "admins manage studio cues" on public.studio_cues for all to authenticated using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "admins manage studio cue actions" on public.studio_cue_actions for all to authenticated using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "admins manage studio sessions" on public.studio_sessions for all to authenticated using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "admins manage studio state" on public.studio_session_state for all to authenticated using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "admins manage studio events" on public.studio_production_events for all to authenticated using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "admins manage studio markers" on public.studio_clip_markers for all to authenticated using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "admins manage recommendations" on public.studio_episode_recommendations for all to authenticated using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "admins manage question clusters" on public.studio_question_clusters for all to authenticated using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "users read own entitlements" on public.user_entitlements for select to authenticated using ((select auth.uid()) = user_id);
create policy "admins manage entitlements" on public.user_entitlements for all to authenticated using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "users submit own live questions" on public.live_questions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "users read own live questions" on public.live_questions for select to authenticated using ((select auth.uid()) = user_id or (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "admins manage live questions" on public.live_questions for all to authenticated using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "users manage own question votes" on public.live_question_votes for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "admins read all question votes" on public.live_question_votes for select to authenticated using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "authenticated read active polls" on public.live_polls for select to authenticated using (status in ('scheduled','open','closed') or (select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "admins manage polls" on public.live_polls for all to authenticated using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "authenticated read poll options" on public.live_poll_options for select to authenticated using (true);
create policy "admins manage poll options" on public.live_poll_options for all to authenticated using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin') with check ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "users manage own poll response" on public.live_poll_responses for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "admins read all poll responses" on public.live_poll_responses for select to authenticated using ((select auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

grant select, insert, update, delete on public.studio_episodes, public.studio_episode_pathways, public.studio_assets, public.studio_runs, public.studio_cues, public.studio_cue_actions, public.studio_sessions, public.studio_session_state, public.studio_production_events, public.studio_clip_markers, public.studio_episode_recommendations, public.studio_question_clusters to authenticated;
grant select on public.user_entitlements to authenticated;
grant select, insert, update, delete on public.user_entitlements to authenticated;
grant select, insert, update, delete on public.live_questions, public.live_question_votes, public.live_polls, public.live_poll_options, public.live_poll_responses to authenticated;

commit;
