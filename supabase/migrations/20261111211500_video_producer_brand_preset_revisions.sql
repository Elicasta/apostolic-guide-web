-- Retain a complete undo chain for each brand-owned reusable overlay preset.
create table if not exists public.video_producer_brand_preset_revisions (
 id uuid primary key default gen_random_uuid(),
 preset_id uuid not null references public.video_producer_brand_presets(id) on delete cascade,
 version bigint not null check (version > 0),
 previous_document jsonb not null,
 edited_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 unique(preset_id,version)
);
alter table public.video_producer_brand_preset_revisions enable row level security;
revoke all on public.video_producer_brand_preset_revisions from anon,authenticated;
grant all on public.video_producer_brand_preset_revisions to service_role;
alter table public.video_producer_brand_presets add column if not exists version bigint not null default 1 check(version>0);
create index if not exists video_producer_brand_preset_revisions_time_idx on public.video_producer_brand_preset_revisions(preset_id,version desc);
