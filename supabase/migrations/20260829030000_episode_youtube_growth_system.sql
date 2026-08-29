alter table public.video_producer_episode_scripts
  add column if not exists growth_plan jsonb not null default '{}'::jsonb,
  add column if not exists growth_metrics jsonb not null default '{}'::jsonb,
  add column if not exists growth_learning jsonb not null default '{}'::jsonb;

comment on column public.video_producer_episode_scripts.growth_plan is
  'Versioned YouTube package, retention, production, Shorts, and publishing plan generated before the episode script.';
comment on column public.video_producer_episode_scripts.growth_metrics is
  'Post-publish YouTube performance snapshots used to compare an episode against Apostolic Guide channel history.';
comment on column public.video_producer_episode_scripts.growth_learning is
  'Sample-size-aware learning result and next experiment derived from episode performance versus the channel baseline.';
