create or replace function analytics.dashboard_snapshot_v2()
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
    now() - interval '7 days' as week_start,
    now() - interval '14 days' as prior_week_start
),
first_seen as (
  select anonymous_id, min(occurred_at) as first_seen_at
  from analytics.events
  where anonymous_id is not null
  group by anonymous_id
),
browser_days as (
  select anonymous_id, count(distinct occurred_at::date) as active_days
  from analytics.events
  where anonymous_id is not null
  group by anonymous_id
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
  from analytics.events e
),
session_flags as (
  select
    session_id,
    min(occurred_at) as first_event_at,
    bool_or(
      event_name in ('pathway_step_completed', 'pathway_completed', 'article_completed', 'audio_completed')
      or (event_name = 'audio_progress' and coalesce(listened_seconds, 0) >= 30)
    ) as engaged,
    bool_or(event_name = 'pathway_completed') as pathway_completed,
    bool_or(event_name in ('pathway_completed', 'article_completed')) as study_completed,
    bool_or(event_name = 'app_link_clicked') as app_transition
  from shaped
  where session_id is not null
  group by session_id
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
first_touch as (
  select
    session_id,
    first_event_at,
    case
      when utm_source in ('ig', 'instagram', 'instagram.com', 'l.instagram.com') then 'Instagram'
      when utm_source in ('yt', 'youtube', 'youtube.com', 'youtu.be') then 'YouTube'
      when utm_source in ('fb', 'facebook', 'facebook.com', 'm.facebook.com') then 'Facebook'
      when utm_source in ('tt', 'tiktok', 'tiktok.com') then 'TikTok'
      when utm_source in ('x', 'twitter', 'twitter.com', 't.co') then 'X'
      when utm_source is not null then utm_source
      when referrer_host is null then 'Direct'
      when referrer_host in ('apostolicguide.com', 'www.apostolicguide.com', 'app.apostolicguide.com') then 'Direct'
      when referrer_host in ('studio.apostolicguide.com', 'admin.apostolicguide.com') then 'Internal / Studio'
      when referrer_host like '%.elicastas-projects.vercel.app'
        or referrer_host like 'apostolic-guide%.vercel.app'
        or referrer_host in ('vercel.com', 'github.com') then 'Internal / Preview'
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
acquisition as (
  select
    ft.source_label,
    count(*)::int as sessions,
    count(*) filter (where sf.engaged)::int as engaged_sessions,
    count(*) filter (where sf.study_completed)::int as completion_sessions,
    count(*) filter (where sf.app_transition)::int as app_sessions,
    round(100.0 * count(*) filter (where sf.engaged) / nullif(count(*), 0))::int as study_rate,
    round(100.0 * count(*) filter (where sf.study_completed) / nullif(count(*), 0))::int as completion_rate,
    round(100.0 * count(*) filter (where sf.app_transition) / nullif(count(*), 0))::int as app_rate
  from first_touch ft
  join session_flags sf using (session_id)
  cross join params p
  where ft.first_event_at >= p.week_start
    and ft.source_label not like 'Internal /%'
  group by ft.source_label
  order by sessions desc, ft.source_label
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
cohort7 as (
  select f.anonymous_id, f.first_seen_at
  from first_seen f
  cross join params p
  where f.first_seen_at >= p.now_at - interval '15 days'
    and f.first_seen_at < p.now_at - interval '8 days'
),
cohort7_return as (
  select
    c.anonymous_id,
    exists (
      select 1
      from analytics.events e
      where e.anonymous_id = c.anonymous_id
        and e.occurred_at >= c.first_seen_at + interval '1 day'
        and e.occurred_at < c.first_seen_at + interval '8 days'
    ) as returned
  from cohort7 c
),
cohort30 as (
  select f.anonymous_id, f.first_seen_at
  from first_seen f
  cross join params p
  where f.first_seen_at >= p.now_at - interval '61 days'
    and f.first_seen_at < p.now_at - interval '31 days'
),
cohort30_return as (
  select
    c.anonymous_id,
    exists (
      select 1
      from analytics.events e
      where e.anonymous_id = c.anonymous_id
        and e.occurred_at >= c.first_seen_at + interval '1 day'
        and e.occurred_at < c.first_seen_at + interval '31 days'
    ) as returned
  from cohort30 c
),
search_rollup as (
  select
    count(*) filter (where event_name = 'search_submitted')::int as searches,
    count(distinct session_id) filter (where event_name = 'search_submitted')::int as search_sessions,
    count(*) filter (where event_name = 'search_result_opened')::int as result_opens,
    count(distinct session_id) filter (where event_name = 'search_result_opened')::int as success_sessions,
    count(distinct session_id) filter (where event_name = 'search_no_results')::int as no_result_sessions
  from analytics.events
),
v2_metrics as (
  select jsonb_build_object(
    'engaged_study_sessions', (select count(*) from session_flags where engaged),
    'returning_browsers', (select count(*) from browser_days where active_days >= 2),
    'weekly_visitors', (
      select count(distinct e.anonymous_id)
      from analytics.events e cross join params p
      where e.event_name = 'page_viewed' and e.occurred_at >= p.week_start
    ),
    'weekly_sessions', (
      select count(distinct e.session_id)
      from analytics.events e cross join params p
      where e.event_name = 'page_viewed' and e.occurred_at >= p.week_start
    ),
    'weekly_new_browsers', (
      select count(distinct e.anonymous_id)
      from analytics.events e
      join first_seen f using (anonymous_id)
      cross join params p
      where e.event_name = 'page_viewed'
        and e.occurred_at >= p.week_start
        and f.first_seen_at >= p.week_start
    ),
    'weekly_returning_browsers', (
      select count(distinct e.anonymous_id)
      from analytics.events e
      join first_seen f using (anonymous_id)
      cross join params p
      where e.event_name = 'page_viewed'
        and e.occurred_at >= p.week_start
        and f.first_seen_at < p.week_start
    ),
    'weekly_returning_share', (
      select case
        when count(distinct e.anonymous_id) = 0 then 0
        else round(
          100.0 * count(distinct e.anonymous_id) filter (where f.first_seen_at < p.week_start)
          / count(distinct e.anonymous_id)
        )::int
      end
      from analytics.events e
      join first_seen f using (anonymous_id)
      cross join params p
      where e.event_name = 'page_viewed' and e.occurred_at >= p.week_start
    ),
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
      from analytics.events e cross join params p
      where e.event_name = 'pathway_started' and e.occurred_at >= p.week_start
    ),
    'weekly_pathway_completion_sessions', (
      select count(distinct e.session_id)
      from analytics.events e cross join params p
      where e.event_name = 'pathway_completed' and e.occurred_at >= p.week_start
    ),
    'weekly_app_transition_sessions', (
      select count(distinct e.session_id)
      from analytics.events e cross join params p
      where e.event_name = 'app_link_clicked' and e.occurred_at >= p.week_start
    ),
    'weekly_internal_sessions', (
      select count(*) from first_touch ft cross join params p
      where ft.first_event_at >= p.week_start and ft.source_label like 'Internal /%'
    ),
    'tracking_days', (
      select coalesce(greatest(1, ceil(extract(epoch from (now() - min(occurred_at))) / 86400.0))::int, 0)
      from analytics.events
    ),
    'trend_ready', (
      select coalesce(min(occurred_at) <= now() - interval '14 days', false)
      from analytics.events
    ),
    'seven_day_cohort_size', (select count(*) from cohort7),
    'seven_day_returned', (select count(*) from cohort7_return where returned),
    'seven_day_return_rate', (
      select case
        when count(*) = 0 then null
        else round(100.0 * count(*) filter (where returned) / count(*))::int
      end
      from cohort7_return
    ),
    'thirty_day_cohort_size', (select count(*) from cohort30),
    'thirty_day_returned', (select count(*) from cohort30_return where returned),
    'thirty_day_return_rate', (
      select case
        when count(*) = 0 then null
        else round(100.0 * count(*) filter (where returned) / count(*))::int
      end
      from cohort30_return
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
select analytics.dashboard_snapshot() || jsonb_build_object(
  'v2', jsonb_build_object(
    'metrics', (select value from v2_metrics),
    'acquisition', coalesce((
      select jsonb_agg(jsonb_build_object(
        'source', source_label,
        'sessions', sessions,
        'engagedSessions', engaged_sessions,
        'completionSessions', completion_sessions,
        'appSessions', app_sessions,
        'studyRate', study_rate,
        'completionRate', completion_rate,
        'appRate', app_rate
      ))
      from acquisition
    ), '[]'::jsonb),
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
  )
);
$$;

revoke all on function analytics.dashboard_snapshot_v2() from public, anon, authenticated;
grant execute on function analytics.dashboard_snapshot_v2() to service_role;
