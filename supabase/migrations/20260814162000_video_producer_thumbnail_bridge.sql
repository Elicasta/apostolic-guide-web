alter table public.video_producer_thumbnails
  add column if not exists callback_token_hash text;