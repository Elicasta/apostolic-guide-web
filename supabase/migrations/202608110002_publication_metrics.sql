-- Normalized social/video performance snapshots for Pathway publications.
-- Keep platform-specific payloads in raw_metrics while exposing a stable shared metric set.

create table if not exists public.publication_metric_snapshots (
  id bigint generated always as identity primary key,
  publication_id uuid not null references public.pathway_publications(id) on delete cascade,
  pathway_slug text not null,
  asset_id uuid references public.pathway_assets(id) on delete set null,
  platform text not null,
  captured_at timestamptz not null default now(),
  views bigint,
  impressions bigint,
  reach bigint,
  likes bigint,
  comments bigint,
  shares bigint,
  saves bigint,
  watch_seconds numeric,
  average_view_duration_seconds numeric,
  average_view_percentage numeric,
  subscribers_gained bigint,
  subscribers_lost bigint,
  raw_metrics jsonb not null default '{}'::jsonb,
  sync_status text not null default 'success' check (sync_status in ('success','partial','failed')),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists publication_metric_snapshots_publication_idx
  on public.publication_metric_snapshots(publication_id, captured_at desc);
create index if not exists publication_metric_snapshots_pathway_idx
  on public.publication_metric_snapshots(pathway_slug, captured_at desc);
create index if not exists publication_metric_snapshots_platform_idx
  on public.publication_metric_snapshots(platform, captured_at desc);

alter table public.publication_metric_snapshots enable row level security;
grant select, insert, update, delete on public.publication_metric_snapshots to service_role;
grant usage, select on sequence public.publication_metric_snapshots_id_seq to service_role;

create or replace view public.publication_latest_metrics
with (security_invoker = true)
as
select distinct on (publication_id)
  publication_id,
  pathway_slug,
  asset_id,
  platform,
  captured_at,
  views,
  impressions,
  reach,
  likes,
  comments,
  shares,
  saves,
  watch_seconds,
  average_view_duration_seconds,
  average_view_percentage,
  subscribers_gained,
  subscribers_lost,
  raw_metrics,
  sync_status,
  error_message
from public.publication_metric_snapshots
order by publication_id, captured_at desc, id desc;

grant select on public.publication_latest_metrics to service_role;

comment on table public.publication_metric_snapshots is
  'Time-series snapshots of Instagram/Facebook/TikTok/YouTube publication performance. Common metrics are normalized and provider-specific fields remain in raw_metrics.';
comment on view public.publication_latest_metrics is
  'Latest normalized metric snapshot for each Pathway publication.';
