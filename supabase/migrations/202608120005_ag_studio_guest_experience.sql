begin;
create table if not exists public.studio_guest_messages(
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.studio_episodes(id) on delete cascade,
  guest_id uuid references public.studio_episode_guests(id) on delete cascade,
  sender_role text not null check(sender_role in('guest','host','producer')),
  sender_user_id uuid references auth.users(id) on delete set null,
  body text not null check(char_length(body) between 1 and 1500),
  created_at timestamptz not null default now()
);
create table if not exists public.studio_auto_director_settings(
  episode_id uuid primary key references public.studio_episodes(id) on delete cascade,
  enabled boolean not null default false,
  mode text not null default 'assist' check(mode in('off','assist','auto')),
  minimum_hold_seconds integer not null default 8 check(minimum_hold_seconds between 2 and 120),
  question_scene text not null default 'panel-question',
  one_guest_scene text not null default 'split',
  multi_guest_scene text not null default 'panel-grid',
  scripture_scene text not null default 'host-scripture',
  manual_override_until timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists studio_guest_messages_episode_created_idx on public.studio_guest_messages(episode_id,created_at);
create index if not exists studio_guest_messages_guest_created_idx on public.studio_guest_messages(guest_id,created_at);
create trigger touch_studio_auto_director_settings before update on public.studio_auto_director_settings for each row execute function public.touch_updated_at();
alter table public.studio_guest_messages enable row level security;
alter table public.studio_auto_director_settings enable row level security;
create policy "admins manage guest messages" on public.studio_guest_messages for all to authenticated using ((select auth.jwt()->'app_metadata'->>'role')='admin') with check ((select auth.jwt()->'app_metadata'->>'role')='admin');
create policy "admins manage auto director" on public.studio_auto_director_settings for all to authenticated using ((select auth.jwt()->'app_metadata'->>'role')='admin') with check ((select auth.jwt()->'app_metadata'->>'role')='admin');
commit;
