alter table public.video_producer_episode_scripts
  add column if not exists audio_url text,
  add column if not exists audio_storage_path text,
  add column if not exists audio_content_hash text,
  add column if not exists audio_model text,
  add column if not exists audio_voice_map jsonb not null default '{}'::jsonb,
  add column if not exists audio_generated_at timestamptz;

comment on column public.video_producer_episode_scripts.audio_url is
  'Mastered Episode Studio WAV generated from the approved episode script.';
comment on column public.video_producer_episode_scripts.audio_voice_map is
  'Speaker-to-voice mapping used for the generated episode audio.';
