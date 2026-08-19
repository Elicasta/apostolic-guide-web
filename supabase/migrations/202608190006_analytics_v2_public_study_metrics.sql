create or replace function analytics.public_study_metrics_v2()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
with
params as (
  select now() - interval '7 days' as week_start, now() - interval '14 days' as prior_week_start
),
first_touch_raw as (
  select distinct on (session_id)
    session_id,
    occurred_at as first_event_at,
    nullif(lower(trim(utm_source)), '') as utm_source,
    nullif(lower(trim(referrer_host)), '') as referrer_host
  from analytics.events
  where session_id is not null
  order by session_id, occurred_at, id
),
classified_sessions as (
  select
    session_id,
    coalesce(
      utm_source is null and (
        referrer_host in ('studio.apostolicguide.com', 'admin.apostolicguide.com', 'vercel.com', 'github.com')
        or referrer_host like '%.elicastas-projects.vercel.app'
        or referrer_host like 'apostolic-guide%.vercel.app'
      ),
      false
    ) as is_internal
  from first_touch_raw
),
public_events as (
  select e.*
  from analytics.events e
  join classified_sessions c using (session_id)
  where not c.is_internal
),
shaped as (
  select
    e.*,
    coalesce(
      nullif(e.properties ->> 'pathwaySlug', ''),
      nullif(e.properties ->> 'contentKey', ''),
      case
        when split_part(e.page_path, '?', 1) like '/pathways/%'
          then split_part(split_part(e.page_path, '?', 1), '/', 3)
      end
    ) as pathway_slug,
    case
      when coalesce(e.properties ->> 'stepNumber', '') ~ '^[0-9]+([.][0-9]+)?$'
        then (e.properties ->> 'stepNumber')::numeric
    end as step_number,
    case
      when coalesce(e.properties ->> 'stepCount', '') ~ '^[0-9]+([.][0-9]+)?$'
        then (e.properties ->> 'stepCount')::numeric
    end as step_count,
    case
      when coalesce(e.properties ->> 'milestone', '') ~ '^[0-9]+([.][0-9]+)?$'
        then (e.properties ->> 'milestone')::numeric
    end as milestone,
    case
      when coalesce(e.properties ->> 'listenedSeconds', '') ~ '^[0-9]+([.][0-9]+)?$'
        then (e.properties ->> 'listenedSeconds')::numeric
    end as listened_seconds,
    case
      when coalesce(e.properties ->> 'durationSeconds', '') ~ '^[0-9]+([.][0-9]+)?$'
        then (e.properties ->> 'durationSeconds')::numeric
    end as duration_seconds
  from public_events e
),
engaged_sessions as (
  select distinct session_id
  from shaped
  where event_name in ('pathway_step_completed', 'pathway_completed', 'article_completed', 'audio_completed')
     or (event_name = 'audio_progress' and coalesce(listened_seconds, 0) >= 30)
),
pathway_sessions as (
  select
    pathway_slug as slug,
    session_id,
    max(
      case
        when step_count > 0 and step_number is not null
          then least(100, 100 * step_number / step_count)
        else 0
      end
    ) as reading_progress,
    max(
      case
        when milestone is not null then least(100, milestone)
        when duration_seconds > 0 and listened_seconds is not null
          then least(100, 100 * listened_seconds / duration_seconds)
        else 0
      end
    ) as audio_progress,
    bool_or(
      event_name in ('pathway_completed', 'audio_completed')
      or (step_count > 0 and step_number >= step_count)
    ) as completed
  from shaped
  where session_id is not null
    and pathway_slug is not null
    and event_name in (
      'pathway_started',
      'pathway_step_completed',
      'pathway_completed',
      'audio_started',
      'audio_progress',
      'audio_completed'
    )
  group by pathway_slug, session_id
),
pathway_progress as (
  select
    slug,
    session_id,
    case
      when completed then 100
      else greatest(coalesce(reading_progress, 0), coalesce(audio_progress, 0))
    end as progress,
    completed
  from pathway_sessions
),
pathway_funnel as (
  select
    slug,
    count(*)::int as starts,
    count(*) filter (where progress >= 25)::int as reach25,
    count(*) filter (where progress >= 50)::int as reach50,
    count(*) filter (where progress >= 75)::int as reach75,
    count(*) filter (where completed)::int as completions,
    round(100.0 * count(*) filter (where completed) / nullif(count(*), 0))::int as completion_rate,
    round(avg(progress))::int as average_progress
  from pathway_progress
  group by slug
  order by starts desc, slug
),
search_rollup as (
  select
    count(distinct session_id) filter (where event_name = 'search_submitted')::int as search_sessions,
    count(distinct session_id) filter (where event_name = 'search_result_opened')::int as success_sessions,
    count(*) filter (where event_name = 'search_result_opened')::int as result_opens,
    count(distinct session_id) filter (where event_name = 'search_no_results')::int as no_result_sessions
  from public_events
),
metric_values as (
  select jsonb_build_object(
    'engaged_study_sessions', (select count(*) from engaged_sessions),
    'weekly_engaged_study_sessions', (
      select count(distinct s.session_id)
      from shaped s cross join params p
      where s.occurred_at >= p.week_start
        and (
          s.event_name in ('pathway_step_completed', 'pathway_completed', 'article_completed', 'audio_completed')
          or (s.event_name = 'audio_progress' and coalesce(s.listened_seconds, 0) >= 30)
        )
    ),
    'prior_week_engaged_study_sessions', (
      select count(distinct s.session_id)
      from shaped s cross join params p
      where s.occurred_at >= p.prior_week_start
        and s.occurred_at < p.week_start
        and (
          s.event_name in ('pathway_step_completed', 'pathway_completed', 'article_completed', 'audio_completed')
          or (s.event_name = 'audio_progress' and coalesce(s.listened_seconds, 0) >= 30)
        )
    ),
    'weekly_pathway_start_sessions', (
      select count(distinct e.session_id)
      from public_events e cross join params p
      where e.event_name = 'pathway_started' and e.occurred_at >= p.week_start
    ),
    'weekly_pathway_completion_sessions', (
      select count(distinct e.session_id)
      from public_events e cross join params p
      where e.event_name = 'pathway_completed' and e.occurred_at >= p.week_start
    ),
    'weekly_app_transition_sessions', (
      select count(distinct e.session_id)
      from public_events e cross join params p
      where e.event_name = 'app_link_clicked' and e.occurred_at >= p.week_start
    ),
    'search_sessions', (select search_sessions from search_rollup),
    'search_success_sessions', (select success_sessions from search_rollup),
    'search_success_rate', (
      select case
        when search_sessions = 0 then 0
        else round(100.0 * success_sessions / search_sessions)::int
      end
      from search_rollup
    ),
    'search_result_opens', (select result_opens from search_rollup),
    'search_no_result_sessions', (select no_result_sessions from search_rollup)
  ) as value
)
select jsonb_build_object(
  'metrics', (select value from metric_values),
  'pathwayFunnel', coalesce((
    select jsonb_agg(jsonb_build_object(
      'slug', slug,
      'starts', starts,
      'reach25', reach25,
      'reach50', reach50,
      'reach75', reach75,
      'completions', completions,
      'completionRate', completion_rate,
      'averageProgress', average_progress
    ))
    from pathway_funnel
  ), '[]'::jsonb)
);
$$;

create or replace function analytics.dashboard_snapshot_v2()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
with
core as (
  select analytics.dashboard_snapshot_v2_core() as value
),
public_traffic as (
  select analytics.public_traffic_metrics_v2() as value
),
public_study as (
  select analytics.public_study_metrics_v2() as value
),
merged as (
  select
    core.value,
    (core.value #> '{v2,metrics}')
      || public_traffic.value
      || (public_study.value -> 'metrics') as metrics,
    public_study.value -> 'pathwayFunnel' as pathway_funnel
  from core, public_traffic, public_study
),
with_metrics as (
  select jsonb_set(value, '{v2,metrics}', metrics, true) as value, pathway_funnel
  from merged
)
select jsonb_set(value, '{v2,pathwayFunnel}', pathway_funnel, true)
from with_metrics;
$$;

revoke all on function analytics.public_study_metrics_v2() from public, anon, authenticated;
revoke all on function analytics.dashboard_snapshot_v2() from public, anon, authenticated;
grant execute on function analytics.public_study_metrics_v2() to service_role;
grant execute on function analytics.dashboard_snapshot_v2() to service_role;
