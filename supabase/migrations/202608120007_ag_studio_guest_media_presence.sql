begin;
alter table public.studio_episode_guests add column if not exists media_state text not null default 'offline' check(media_state in('offline','connecting','connected','reconnecting','failed'));
alter table public.studio_episode_guests add column if not exists media_updated_at timestamptz;
create index if not exists studio_episode_guests_live_media_idx on public.studio_episode_guests(episode_id,state,media_state);
commit;
