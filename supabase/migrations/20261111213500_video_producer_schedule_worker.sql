-- Scheduled YouTube upload runs on GitHub Actions, never inside a Vercel request.
alter table public.video_producer_schedule_drafts
 add column if not exists worker_callback_token_hash text
   check (worker_callback_token_hash is null or length(worker_callback_token_hash)=64),
 add column if not exists worker_heartbeat_at timestamptz,
 add column if not exists worker_token_expires_at timestamptz,
 add column if not exists worker_stage text,
 add column if not exists worker_progress smallint
   check(worker_progress is null or (worker_progress>=0 and worker_progress<=100));
create index if not exists video_producer_schedule_stalled_idx
 on public.video_producer_schedule_drafts(status,worker_heartbeat_at)
 where status='submitting';
