create or replace view public.pathway_audio_metrics
with (security_invoker = true)
as
select
  pathway_slug,
  starts,
  unique_listeners,
  completions,
  listened_seconds
from analytics.pathway_audio_metrics;

revoke all on public.pathway_audio_metrics from anon, authenticated;
grant usage on schema analytics to service_role;
grant select on analytics.pathway_audio_metrics to service_role;
grant select on public.pathway_audio_metrics to service_role;
