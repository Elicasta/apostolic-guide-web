begin;

create table if not exists public.studio_host_media_signals (
  session_id uuid primary key references public.studio_sessions(id) on delete cascade,
  offer_sdp text,
  answer_sdp text,
  signal_version bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.studio_host_media_signals enable row level security;

create trigger touch_studio_host_media_signals
before update on public.studio_host_media_signals
for each row execute function public.touch_updated_at();

revoke all on public.studio_host_media_signals from anon, authenticated;

commit;
