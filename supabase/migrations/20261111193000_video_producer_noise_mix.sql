alter table public.video_producer_projects
  add column if not exists rnnoise_mix numeric(4,3)
  check (rnnoise_mix is null or (rnnoise_mix>=0 and rnnoise_mix<=1));
