-- Analytics V3 keeps the existing exact event ledger and V2 functions intact.
-- It adds one server-only decision snapshot with current/prior periods, daily trends,
-- quality by acquisition/device/country, current-period Pathway funnels, and search demand.

create or replace function analytics.dashboard_snapshot_v3()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
with
params as (
  select
    now() as now_at,
    now() - interval '7 days' as current_start,
    now() - interval '14 days' as previous_start
),
first_touch_raw as (
  select distinct on (session_id)
    session_id,
    occurred_at as first_event_at,
    nullif(lower(trim(utm_source)), '') as utm_source,
    nullif(lower(trim(utm_campaign)), '') as utm_campaign,
    nullif(lower(trim(referrer_host)), '') as referrer_host,
    coalesce(nullif(device_type, ''), 'Unknown') as device_type,
    coalesce(nullif(country, ''), 'Unknown') as country
  from analytics.events
  where session_id is not null
  order by session_id, occurred_at, id
),
classified_sessions as (
  select
    session_id,
    first_event_at,
    utm_campaign,
    device_type,
    country,
    coalesce(
      utm_source is null and (
        referrer_host in ('studio.apostolicguide.com', 'admin.apostolicguide.com', 'vercel.com', 'github.com')
        or referrer_host like '%.elicastas-projects.vercel.app'
        or referrer_host like 'apostolic-guide%.vercel.app'
      ),
      false
    ) as is_internal,
    case
      when utm_source in ('ig', 'instagram', 'instagram.com', 'l.instagram.com') then 'Instagram'
      when utm_source in ('yt', 'youtube', 'youtube.com', 'youtu.be') then 'YouTube'
      when utm_source in ('fb', 'facebook', 'facebook.com', 'm.facebook.com') then 'Facebook'
      when utm_source in ('tt', 'tiktok', 'tiktok.com') then 'TikTok'
      when utm_source in ('x', 'twitter', 'twitter.com', 't.co') then 'X'
      when utm_source is not null then utm_source
      when referrer_host is null then 'Direct'
      when referrer_host in ('apostolicguide.com', 'www.apostolicguide.com', 'app.apostolicguide.com') then 'Direct'
      when referrer_host in ('instagram.com', 'www.instagram.com', 'l.instagram.com') then 'Instagram'
      when referrer_host in ('youtube.com', 'www.youtube.com', 'youtu.be') then 'YouTube'
      when referrer_host in ('facebook.com', 'www.facebook.com', 'm.facebook.com', 'l.facebook.com') then 'Facebook'
      when referrer_host in ('tiktok.com', 'www.tiktok.com') then 'TikTok'
      when referrer_host in ('x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 't.co') then 'X'
      when referrer_host like 'google.%' or referrer_host like 'www.google.%' then 'Google'
      when referrer_host like '%.apostolicguide.com' then 'Direct'
      else referrer_host
    end as source_label
  from first_touch_raw
),
public_events as (
  select e.*
  from analytics.events e
  join classified_sessions c using (session_id)
  where not c.is_internal
),
public_first_seen as (
  select anonymous_id, min(occurred_at) as first_seen_at
  from public_events
  where anonymous_id is not null
  group by anonymous_id
),
shaped as (
  select
    e.*,
    coalesce(
      nullif(e.properties ->> 'pathwaySlug', ''),
      nullif(e.properties ->> 'contentKey', ''),
      case when split_part(e.page_path, '?', 1) like '/pathways/%'
        then split_part(split_part(e.page_path, '?', 1), '/', 3)
      end
    ) as pathway_slug,
    case when coalesce(e.properties ->> 'stepNumber', '') ~ '^[0-9]+([.][0-9]+)?$'
      then (e.properties ->> 'stepNumber')::numeric end as step_number,
    case when coalesce(e.properties ->> 'stepCount', '') ~ '^[0-9]+([.][0-9]+)?$'
      then (e.properties ->> 'stepCount')::numeric end as step_count,
    case when coalesce(e.properties ->> 'milestone', '') ~ '^[0-9]+([.][0-9]+)?$'
      then (e.properties ->> 'milestone')::numeric end as milestone,
    case when coalesce(e.properties ->> 'listenedSeconds', '') ~ '^[0-9]+([.][0-9]+)?$'
      then (e.properties ->> 'listenedSeconds')::numeric end as listened_seconds,
    case when coalesce(e.properties ->> 'durationSeconds', '') ~ '^[0-9]+([.][0-9]+)?$'
      then (e.properties ->> 'durationSeconds')::numeric end as duration_seconds,
    lower(trim(coalesce(e.properties ->> 'query', ''))) as search_query
  from public_events e
),
session_quality as (
  select
    s.session_id,
    bool_or(
      s.event_name in ('pathway_step_completed', 'pathway_completed', 'article_completed', 'audio_completed')
      or (s.event_name = 'audio_progress' and coalesce(s.listened_seconds, 0) >= 30)
    ) as engaged,
    bool_or(s.event_name in ('pathway_completed', 'article_completed', 'audio_completed')) as completed,
    bool_or(s.event_name = 'app_link_clicked') as app_transition
  from shaped s
  where s.session_id is not null
  group by s.session_id
),
current_metric_values as (
  select jsonb_build_object(
    'pageViews', (select count(*) from public_events e cross join params p where e.event_name = 'page_viewed' and e.occurred_at >= p.current_start),
    'visitors', (select count(distinct e.anonymous_id) from public_events e cross join params p where e.event_name = 'page_viewed' and e.occurred_at >= p.current_start),
    'sessions', (select count(distinct e.session_id) from public_events e cross join params p where e.event_name = 'page_viewed' and e.occurred_at >= p.current_start),
    'newVisitors', (
      select count(distinct e.anonymous_id)
      from public_events e join public_first_seen f using (anonymous_id) cross join params p
      where e.event_name = 'page_viewed' and e.occurred_at >= p.current_start and f.first_seen_at >= p.current_start
    ),
    'returningVisitors', (
      select count(distinct e.anonymous_id)
      from public_events e join public_first_seen f using (anonymous_id) cross join params p
      where e.event_name = 'page_viewed' and e.occurred_at >= p.current_start and f.first_seen_at < p.current_start
    ),
    'engagedStudySessions', (
      select count(distinct s.session_id) from shaped s cross join params p
      where s.occurred_at >= p.current_start and (
        s.event_name in ('pathway_step_completed', 'pathway_completed', 'article_completed', 'audio_completed')
        or (s.event_name = 'audio_progress' and coalesce(s.listened_seconds, 0) >= 30)
      )
    ),
    'pathwayStartSessions', (select count(distinct e.session_id) from public_events e cross join params p where e.event_name = 'pathway_started' and e.occurred_at >= p.current_start),
    'pathwayCompletionSessions', (select count(distinct e.session_id) from public_events e cross join params p where e.event_name = 'pathway_completed' and e.occurred_at >= p.current_start),
    'appTransitionSessions', (select count(distinct e.session_id) from public_events e cross join params p where e.event_name = 'app_link_clicked' and e.occurred_at >= p.current_start),
    'searchSessions', (select count(distinct e.session_id) from public_events e cross join params p where e.event_name = 'search_submitted' and e.occurred_at >= p.current_start),
    'noResultSearchSessions', (select count(distinct e.session_id) from public_events e cross join params p where e.event_name = 'search_no_results' and e.occurred_at >= p.current_start)
  ) as value
),
previous_metric_values as (
  select jsonb_build_object(
    'pageViews', (select count(*) from public_events e cross join params p where e.event_name = 'page_viewed' and e.occurred_at >= p.previous_start and e.occurred_at < p.current_start),
    'visitors', (select count(distinct e.anonymous_id) from public_events e cross join params p where e.event_name = 'page_viewed' and e.occurred_at >= p.previous_start and e.occurred_at < p.current_start),
    'sessions', (select count(distinct e.session_id) from public_events e cross join params p where e.event_name = 'page_viewed' and e.occurred_at >= p.previous_start and e.occurred_at < p.current_start),
    'newVisitors', (
      select count(distinct e.anonymous_id)
      from public_events e join public_first_seen f using (anonymous_id) cross join params p
      where e.event_name = 'page_viewed' and e.occurred_at >= p.previous_start and e.occurred_at < p.current_start
        and f.first_seen_at >= p.previous_start and f.first_seen_at < p.current_start
    ),
    'returningVisitors', (
      select count(distinct e.anonymous_id)
      from public_events e join public_first_seen f using (anonymous_id) cross join params p
      where e.event_name = 'page_viewed' and e.occurred_at >= p.previous_start and e.occurred_at < p.current_start
        and f.first_seen_at < p.previous_start
    ),
    'engagedStudySessions', (
      select count(distinct s.session_id) from shaped s cross join params p
      where s.occurred_at >= p.previous_start and s.occurred_at < p.current_start and (
        s.event_name in ('pathway_step_completed', 'pathway_completed', 'article_completed', 'audio_completed')
        or (s.event_name = 'audio_progress' and coalesce(s.listened_seconds, 0) >= 30)
      )
    ),
    'pathwayStartSessions', (select count(distinct e.session_id) from public_events e cross join params p where e.event_name = 'pathway_started' and e.occurred_at >= p.previous_start and e.occurred_at < p.current_start),
    'pathwayCompletionSessions', (select count(distinct e.session_id) from public_events e cross join params p where e.event_name = 'pathway_completed' and e.occurred_at >= p.previous_start and e.occurred_at < p.current_start),
    'appTransitionSessions', (select count(distinct e.session_id) from public_events e cross join params p where e.event_name = 'app_link_clicked' and e.occurred_at >= p.previous_start and e.occurred_at < p.current_start),
    'searchSessions', (select count(distinct e.session_id) from public_events e cross join params p where e.event_name = 'search_submitted' and e.occurred_at >= p.previous_start and e.occurred_at < p.current_start),
    'noResultSearchSessions', (select count(distinct e.session_id) from public_events e cross join params p where e.event_name = 'search_no_results' and e.occurred_at >= p.previous_start and e.occurred_at < p.current_start)
  ) as value
),
current_pathway_sessions as (
  select
    s.pathway_slug as slug,
    s.session_id,
    bool_or(s.event_name = 'pathway_started') as started,
    max(case when s.step_count > 0 and s.step_number is not null then least(100, 100 * s.step_number / s.step_count) else 0 end) as reading_progress,
    max(case
      when s.milestone is not null then least(100, s.milestone)
      when s.duration_seconds > 0 and s.listened_seconds is not null then least(100, 100 * s.listened_seconds / s.duration_seconds)
      else 0 end) as audio_progress,
    bool_or(s.event_name in ('pathway_completed', 'audio_completed') or (s.step_count > 0 and s.step_number >= s.step_count)) as completed
  from shaped s cross join params p
  where s.occurred_at >= p.current_start and s.session_id is not null and s.pathway_slug is not null
    and s.event_name in ('pathway_started','pathway_step_completed','pathway_completed','audio_started','audio_progress','audio_completed')
  group by s.pathway_slug, s.session_id
),
current_pathway_progress as (
  select slug, session_id, started,
    case when completed then 100 else greatest(coalesce(reading_progress, 0), coalesce(audio_progress, 0)) end as progress,
    completed
  from current_pathway_sessions
),
prior_pathway_counts as (
  select s.pathway_slug as slug,
    count(distinct s.session_id) filter (where s.event_name = 'pathway_started')::int as starts,
    count(distinct s.session_id) filter (where s.event_name = 'pathway_completed')::int as completions
  from shaped s cross join params p
  where s.occurred_at >= p.previous_start and s.occurred_at < p.current_start and s.pathway_slug is not null
  group by s.pathway_slug
),
pathway_funnel as (
  select
    c.slug,
    count(*) filter (where c.started)::int as starts,
    count(*) filter (where c.started and c.progress >= 25)::int as reach25,
    count(*) filter (where c.started and c.progress >= 50)::int as reach50,
    count(*) filter (where c.started and c.progress >= 75)::int as reach75,
    count(*) filter (where c.started and c.completed)::int as completions,
    case when count(*) filter (where c.started) = 0 then 0 else round(100.0 * count(*) filter (where c.started and c.completed) / count(*) filter (where c.started))::int end as completion_rate,
    case when count(*) filter (where c.started) = 0 then 0 else round(avg(c.progress) filter (where c.started))::int end as average_progress,
    coalesce(p.starts, 0)::int as prior_starts,
    coalesce(p.completions, 0)::int as prior_completions
  from current_pathway_progress c
  left join prior_pathway_counts p using (slug)
  group by c.slug, p.starts, p.completions
  having count(*) filter (where c.started) > 0
  order by starts desc, c.slug
),
acquisition as (
  select
    c.source_label,
    count(*) filter (where c.first_event_at >= p.current_start)::int as sessions,
    count(*) filter (where c.first_event_at >= p.previous_start and c.first_event_at < p.current_start)::int as prior_sessions,
    count(*) filter (where c.first_event_at >= p.current_start and q.engaged)::int as engaged_sessions,
    count(*) filter (where c.first_event_at >= p.current_start and q.completed)::int as completion_sessions,
    count(*) filter (where c.first_event_at >= p.current_start and q.app_transition)::int as app_sessions
  from classified_sessions c
  join session_quality q using (session_id)
  cross join params p
  where not c.is_internal and c.first_event_at >= p.previous_start
  group by c.source_label
),
quality_by_device as (
  select c.device_type as label,
    count(*)::int as sessions,
    count(*) filter (where q.engaged)::int as engaged_sessions,
    count(*) filter (where q.completed)::int as completion_sessions,
    count(*) filter (where q.app_transition)::int as app_sessions
  from classified_sessions c join session_quality q using (session_id) cross join params p
  where not c.is_internal and c.first_event_at >= p.current_start
  group by c.device_type order by sessions desc, label
),
quality_by_country as (
  select c.country as label,
    count(*)::int as sessions,
    count(*) filter (where q.engaged)::int as engaged_sessions,
    count(*) filter (where q.completed)::int as completion_sessions,
    count(*) filter (where q.app_transition)::int as app_sessions
  from classified_sessions c join session_quality q using (session_id) cross join params p
  where not c.is_internal and c.first_event_at >= p.current_start
  group by c.country order by sessions desc, label limit 12
),
days as (
  select generate_series(
    (timezone('America/New_York', now())::date - 6),
    timezone('America/New_York', now())::date,
    interval '1 day'
  )::date as day
),
daily as (
  select d.day,
    count(*) filter (where e.event_name = 'page_viewed')::int as page_views,
    count(distinct e.anonymous_id) filter (where e.event_name = 'page_viewed')::int as visitors,
    count(distinct e.session_id) filter (where e.event_name = 'page_viewed')::int as sessions,
    count(distinct e.session_id) filter (where e.event_name in ('pathway_step_completed','pathway_completed','article_completed','audio_completed') or (e.event_name = 'audio_progress' and coalesce(s.listened_seconds, 0) >= 30))::int as engaged,
    count(distinct e.session_id) filter (where e.event_name = 'pathway_started')::int as pathway_starts,
    count(distinct e.session_id) filter (where e.event_name = 'pathway_completed')::int as pathway_completions,
    count(distinct e.session_id) filter (where e.event_name = 'app_link_clicked')::int as app_transitions
  from days d
  left join public_events e on timezone('America/New_York', e.occurred_at)::date = d.day
  left join shaped s on s.id = e.id
  group by d.day order by d.day
),
searches as (
  select s.search_query as query, count(*)::int as count
  from shaped s cross join params p
  where s.event_name = 'search_submitted' and s.occurred_at >= p.current_start and s.search_query <> ''
  group by s.search_query order by count desc, query limit 12
),
search_gaps as (
  select s.search_query as query, count(*)::int as count
  from shaped s cross join params p
  where s.event_name = 'search_no_results' and s.occurred_at >= p.current_start and s.search_query <> ''
  group by s.search_query order by count desc, query limit 12
),
top_pages as (
  select split_part(e.page_path, '?', 1) as label, count(*)::int as count
  from public_events e cross join params p
  where e.event_name = 'page_viewed' and e.occurred_at >= p.current_start and coalesce(e.page_path, '') <> ''
  group by split_part(e.page_path, '?', 1) order by count desc, label limit 12
),
campaigns as (
  select c.utm_campaign as label, count(*)::int as count
  from classified_sessions c cross join params p
  where not c.is_internal and c.first_event_at >= p.current_start and c.utm_campaign is not null
  group by c.utm_campaign order by count desc, label limit 12
),
tracking as (
  select
    coalesce(greatest(1, ceil(extract(epoch from (now() - min(occurred_at))) / 86400.0))::int, 0) as tracking_days,
    coalesce(min(occurred_at) <= now() - interval '14 days', false) as trend_ready
  from public_events
),
internal as (
  select count(*)::int as sessions from classified_sessions c cross join params p
  where c.is_internal and c.first_event_at >= p.current_start
),
v3_value as (
select jsonb_build_object(
  'schemaVersion', 3,
  'generatedAt', now(),
  'period', jsonb_build_object(
    'currentStart', (select current_start from params),
    'currentEnd', (select now_at from params),
    'previousStart', (select previous_start from params),
    'previousEnd', (select current_start from params),
    'trackingDays', (select tracking_days from tracking),
    'trendReady', (select trend_ready from tracking),
    'current', (select value from current_metric_values),
    'previous', (select value from previous_metric_values)
  ),
  'acquisition', coalesce((select jsonb_agg(jsonb_build_object(
    'source', source_label,
    'sessions', sessions,
    'priorSessions', prior_sessions,
    'engagedSessions', engaged_sessions,
    'completionSessions', completion_sessions,
    'appSessions', app_sessions,
    'studyRate', case when sessions = 0 then 0 else round(100.0 * engaged_sessions / sessions)::int end,
    'completionRate', case when sessions = 0 then 0 else round(100.0 * completion_sessions / sessions)::int end,
    'appRate', case when sessions = 0 then 0 else round(100.0 * app_sessions / sessions)::int end
  ) order by sessions desc, source_label) from acquisition where sessions > 0), '[]'::jsonb),
  'pathways', coalesce((select jsonb_agg(jsonb_build_object(
    'slug', slug,
    'starts', starts,
    'reach25', reach25,
    'reach50', reach50,
    'reach75', reach75,
    'completions', completions,
    'completionRate', completion_rate,
    'averageProgress', average_progress,
    'priorStarts', prior_starts,
    'priorCompletions', prior_completions
  ) order by starts desc, slug) from pathway_funnel), '[]'::jsonb),
  'daily', coalesce((select jsonb_agg(jsonb_build_object(
    'date', day,
    'pageViews', page_views,
    'visitors', visitors,
    'sessions', sessions,
    'engagedStudySessions', engaged,
    'pathwayStarts', pathway_starts,
    'pathwayCompletions', pathway_completions,
    'appTransitions', app_transitions
  ) order by day) from daily), '[]'::jsonb),
  'devices', coalesce((select jsonb_agg(jsonb_build_object(
    'label', label,
    'sessions', sessions,
    'engagedSessions', engaged_sessions,
    'completionSessions', completion_sessions,
    'appSessions', app_sessions,
    'studyRate', case when sessions = 0 then 0 else round(100.0 * engaged_sessions / sessions)::int end,
    'completionRate', case when sessions = 0 then 0 else round(100.0 * completion_sessions / sessions)::int end,
    'appRate', case when sessions = 0 then 0 else round(100.0 * app_sessions / sessions)::int end
  ) order by sessions desc, label) from quality_by_device), '[]'::jsonb),
  'countries', coalesce((select jsonb_agg(jsonb_build_object(
    'label', label,
    'sessions', sessions,
    'engagedSessions', engaged_sessions,
    'completionSessions', completion_sessions,
    'appSessions', app_sessions,
    'studyRate', case when sessions = 0 then 0 else round(100.0 * engaged_sessions / sessions)::int end,
    'completionRate', case when sessions = 0 then 0 else round(100.0 * completion_sessions / sessions)::int end,
    'appRate', case when sessions = 0 then 0 else round(100.0 * app_sessions / sessions)::int end
  ) order by sessions desc, label) from quality_by_country), '[]'::jsonb),
  'searches', coalesce((select jsonb_agg(jsonb_build_object('query', query, 'count', count) order by count desc, query) from searches), '[]'::jsonb),
  'searchGaps', coalesce((select jsonb_agg(jsonb_build_object('query', query, 'count', count) order by count desc, query) from search_gaps), '[]'::jsonb),
  'topPages', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'count', count) order by count desc, label) from top_pages), '[]'::jsonb),
  'campaigns', coalesce((select jsonb_agg(jsonb_build_object('label', label, 'count', count) order by count desc, label) from campaigns), '[]'::jsonb),
  'internalSessionsExcluded', (select sessions from internal)
) as value
)
select analytics.dashboard_snapshot_v2() || jsonb_build_object('v3', (select value from v3_value));
$$;

revoke all on function analytics.dashboard_snapshot_v3() from public, anon, authenticated;
grant execute on function analytics.dashboard_snapshot_v3() to service_role;
