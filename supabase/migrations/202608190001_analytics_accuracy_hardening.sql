create index if not exists analytics_events_event_anonymous_idx
  on analytics.events (event_name, anonymous_id)
  where anonymous_id is not null;

create index if not exists analytics_events_event_session_idx
  on analytics.events (event_name, session_id)
  where session_id is not null;

create or replace function analytics.dashboard_snapshot()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
with
pathway_events as (
  select
    e.event_name,
    e.session_id,
    e.anonymous_id,
    e.person_id,
    e.page_path,
    e.properties,
    coalesce(
      nullif(e.properties ->> 'pathwaySlug', ''),
      nullif(e.properties ->> 'contentKey', ''),
      case
        when split_part(e.page_path, '?', 1) like '/pathways/%'
          then nullif(split_part(split_part(e.page_path, '?', 1), '/', 3), '')
        else null
      end
    ) as slug,
    coalesce(
      case when jsonb_typeof(e.properties -> 'stepNumber') = 'number' then (e.properties ->> 'stepNumber')::numeric end,
      case when jsonb_typeof(e.properties -> 'stepIndex') = 'number' then (e.properties ->> 'stepIndex')::numeric + 1 end
    ) as step_number,
    case when jsonb_typeof(e.properties -> 'stepCount') = 'number' then (e.properties ->> 'stepCount')::numeric end as step_count,
    case when jsonb_typeof(e.properties -> 'positionSeconds') = 'number' then (e.properties ->> 'positionSeconds')::numeric end as position_seconds,
    case when jsonb_typeof(e.properties -> 'durationSeconds') = 'number' then (e.properties ->> 'durationSeconds')::numeric end as duration_seconds
  from analytics.events e
  where e.event_name in (
    'pathway_started',
    'pathway_step_completed',
    'pathway_completed',
    'audio_started',
    'audio_progress',
    'audio_completed'
  )
),
pathway_facts as (
  select
    p.*,
    case
      when p.event_name in ('pathway_completed', 'audio_completed') then 1::numeric
      when p.event_name = 'pathway_step_completed' and p.step_number is not null and p.step_count > 0
        then least(1::numeric, greatest(0::numeric, p.step_number / p.step_count))
      when p.event_name = 'audio_progress' and p.position_seconds is not null and p.duration_seconds > 0
        then least(1::numeric, greatest(0::numeric, p.position_seconds / p.duration_seconds))
      else 0::numeric
    end as progress,
    (
      p.event_name in ('pathway_completed', 'audio_completed')
      or (p.event_name = 'pathway_step_completed' and p.step_number is not null and p.step_count > 0 and p.step_number >= p.step_count)
    ) as is_completion,
    (
      (p.event_name = 'pathway_completed' and p.properties ->> 'completionMethod' = 'reading')
      or (p.event_name = 'pathway_step_completed' and p.step_number is not null and p.step_count > 0 and p.step_number >= p.step_count)
    ) as is_reading_completion,
    (
      p.event_name = 'audio_completed'
      or (p.event_name = 'pathway_completed' and p.properties ->> 'completionMethod' = 'audio')
    ) as is_audio_completion,
    (
      p.event_name = 'pathway_step_completed'
      and p.step_number is not null
      and p.step_count > 0
      and p.step_number >= p.step_count
    ) as is_final_step
  from pathway_events p
  where p.slug is not null
),
pathway_session_progress as (
  select
    slug,
    session_id,
    max(progress) as progress,
    bool_or(is_completion) as completed,
    bool_or(is_reading_completion) as reading_completed,
    bool_or(is_audio_completion) as audio_completed,
    bool_or(is_final_step) as reached_final_step
  from pathway_facts
  where session_id is not null
  group by slug, session_id
),
pathway_denominator_sessions as (
  select distinct p.slug, p.session_id
  from pathway_facts p
  where p.session_id is not null
    and (
      p.event_name in ('pathway_started', 'audio_started')
      or not exists (
        select 1
        from pathway_facts s
        where s.slug = p.slug
          and s.event_name in ('pathway_started', 'audio_started')
          and s.session_id is not null
      )
    )
),
pathway_completion_people as (
  select distinct slug, person_id
  from pathway_facts
  where is_completion and person_id is not null
),
app_pathway_counts as (
  select slug, count(*)::bigint as value
  from (
    select
      case
        when nullif(e.properties ->> 'origin', '') like 'website-pathway-%'
          then substring(e.properties ->> 'origin' from length('website-pathway-') + 1)
        when split_part(e.page_path, '?', 1) like '/pathways/%'
          then nullif(split_part(split_part(e.page_path, '?', 1), '/', 3), '')
        else null
      end as slug
    from analytics.events e
    where e.event_name = 'app_link_clicked'
  ) x
  where slug is not null
  group by slug
),
pathway_rollup as (
  select
    p.slug,
    count(*) filter (where p.event_name = 'pathway_started')::bigint as starts,
    count(*) filter (where p.event_name = 'audio_started')::bigint as audio_starts,
    count(*) filter (where p.event_name = 'pathway_step_completed')::bigint as observed_steps
  from pathway_facts p
  group by p.slug
),
pathway_rows as (
  select
    r.slug,
    r.starts,
    r.audio_starts,
    (select count(*)::bigint from pathway_denominator_sessions d where d.slug = r.slug) as unique_sessions,
    r.observed_steps,
    (select count(*)::bigint from pathway_session_progress s where s.slug = r.slug and s.reached_final_step) as reached_final_step,
    (select count(*)::bigint from pathway_session_progress s where s.slug = r.slug and s.completed) as completions,
    (select count(*)::bigint from pathway_session_progress s where s.slug = r.slug and s.reading_completed) as reading_completions,
    (select count(*)::bigint from pathway_session_progress s where s.slug = r.slug and s.audio_completed) as audio_completions,
    (select count(*)::bigint from pathway_completion_people p where p.slug = r.slug) as known_completers,
    coalesce((
      select round(avg(s.progress) * 100)::integer
      from pathway_session_progress s
      join pathway_denominator_sessions d on d.slug = s.slug and d.session_id = s.session_id
      where s.slug = r.slug
    ), 0) as average_progress,
    coalesce((select a.value from app_pathway_counts a where a.slug = r.slug), 0)::bigint as app_transitions
  from pathway_rollup r
),
pathway_rows_final as (
  select
    p.*,
    case
      when p.unique_sessions > 0 then least(100, round((p.completions::numeric / p.unique_sessions::numeric) * 100)::integer)
      else 0
    end as completion_rate
  from pathway_rows p
),
article_events as (
  select
    e.event_name,
    e.session_id,
    e.page_path,
    coalesce(
      nullif(e.properties ->> 'contentKey', ''),
      case
        when split_part(e.page_path, '?', 1) like '/articles/%'
          then nullif(split_part(split_part(e.page_path, '?', 1), '/', 3), '')
        else null
      end
    ) as slug
  from analytics.events e
  where e.event_name in ('article_opened', 'article_completed')
),
app_article_counts as (
  select
    nullif(split_part(split_part(e.page_path, '?', 1), '/', 3), '') as slug,
    count(*)::bigint as value
  from analytics.events e
  where e.event_name = 'app_link_clicked'
    and split_part(e.page_path, '?', 1) like '/articles/%'
  group by 1
),
article_rows as (
  select
    a.slug,
    count(*) filter (where a.event_name = 'article_opened')::bigint as opens,
    count(distinct a.session_id) filter (where a.event_name = 'article_opened' and a.session_id is not null)::bigint as unique_sessions,
    count(distinct a.session_id) filter (where a.event_name = 'article_completed' and a.session_id is not null)::bigint as completions,
    coalesce((select x.value from app_article_counts x where x.slug = a.slug), 0)::bigint as app_transitions
  from article_events a
  where a.slug is not null
  group by a.slug
),
article_rows_final as (
  select
    a.*,
    case
      when a.unique_sessions > 0 then least(100, round((a.completions::numeric / a.unique_sessions::numeric) * 100)::integer)
      else 0
    end as completion_rate
  from article_rows a
),
event_counts as (
  select event_name as label, count(*)::bigint as value
  from analytics.events
  group by event_name
),
top_pages as (
  select split_part(page_path, '?', 1) as label, count(*)::bigint as value
  from analytics.events
  where event_name = 'page_viewed' and nullif(page_path, '') is not null
  group by 1
  order by value desc, label
  limit 12
),
traffic_sources as (
  select
    coalesce(nullif(utm_source, ''), nullif(regexp_replace(coalesce(referrer_host, ''), '^www\\.', '', 'i'), ''), 'Direct / unknown') as label,
    count(*)::bigint as value
  from analytics.events
  where event_name = 'page_viewed'
  group by 1
  order by value desc, label
  limit 12
),
devices as (
  select coalesce(nullif(device_class, ''), 'unknown') as label, count(*)::bigint as value
  from analytics.events
  where event_name = 'page_viewed'
  group by 1
  order by value desc, label
  limit 8
),
countries as (
  select coalesce(nullif(country_code, ''), 'Unknown') as label, count(*)::bigint as value
  from analytics.events
  where event_name = 'page_viewed'
  group by 1
  order by value desc, label
  limit 12
),
cities as (
  select
    coalesce(nullif(concat_ws(', ', nullif(city, ''), nullif(region, ''), nullif(country_code, '')), ''), 'Unknown') as label,
    count(*)::bigint as value
  from analytics.events
  where event_name = 'page_viewed'
  group by 1
  order by value desc, label
  limit 12
),
browsers as (
  select coalesce(nullif(browser, ''), 'Unknown') as label, count(*)::bigint as value
  from analytics.events
  where event_name = 'page_viewed'
  group by 1
  order by value desc, label
  limit 8
),
operating_systems as (
  select coalesce(nullif(os, ''), 'Unknown') as label, count(*)::bigint as value
  from analytics.events
  where event_name = 'page_viewed'
  group by 1
  order by value desc, label
  limit 8
),
campaigns as (
  select utm_campaign as label, count(*)::bigint as value
  from analytics.events
  where event_name = 'page_viewed' and nullif(utm_campaign, '') is not null
  group by 1
  order by value desc, label
  limit 12
),
mediums as (
  select utm_medium as label, count(*)::bigint as value
  from analytics.events
  where event_name = 'page_viewed' and nullif(utm_medium, '') is not null
  group by 1
  order by value desc, label
  limit 12
),
searches as (
  select trim(properties ->> 'query') as label, count(*)::bigint as value
  from analytics.events
  where event_name = 'search_submitted' and nullif(trim(properties ->> 'query'), '') is not null
  group by 1
  order by value desc, label
  limit 12
),
missing_searches as (
  select trim(properties ->> 'query') as label, count(*)::bigint as value
  from analytics.events
  where event_name = 'search_no_results' and nullif(trim(properties ->> 'query'), '') is not null
  group by 1
  order by value desc, label
  limit 12
),
app_origins as (
  select
    coalesce(nullif(properties ->> 'origin', ''), nullif(properties ->> 'placement', ''), nullif(page_path, ''), 'Unknown') as label,
    count(*)::bigint as value
  from analytics.events
  where event_name = 'app_link_clicked'
  group by 1
  order by value desc, label
  limit 12
),
metrics as (
  select
    count(*)::bigint as total_events,
    count(*) filter (where event_name = 'page_viewed')::bigint as page_views,
    count(distinct anonymous_id) filter (where event_name = 'page_viewed' and anonymous_id is not null)::bigint as unique_browsers,
    count(distinct session_id) filter (where event_name = 'page_viewed' and session_id is not null)::bigint as browser_sessions,
    count(distinct anonymous_id) filter (where event_name = 'presence_heartbeat' and anonymous_id is not null and occurred_at >= now() - interval '75 seconds')::bigint as active_browsers,
    count(distinct session_id) filter (where event_name = 'presence_heartbeat' and session_id is not null and occurred_at >= now() - interval '75 seconds')::bigint as active_sessions,
    count(*) filter (where event_name = 'app_link_clicked')::bigint as app_transition_events,
    count(distinct session_id) filter (where event_name = 'app_link_clicked' and session_id is not null)::bigint as app_transition_sessions,
    count(*) filter (where event_name = 'search_submitted')::bigint as searches,
    count(*) filter (where event_name = 'search_no_results')::bigint as missing_searches,
    count(*) filter (where event_name = 'article_completed')::bigint as article_completions,
    min(occurred_at) as first_event,
    max(occurred_at) as latest_event
  from analytics.events
),
pathway_totals as (
  select
    coalesce(sum(completions), 0)::bigint as pathway_completions,
    (select count(distinct person_id)::bigint from pathway_completion_people) as known_pathway_completers
  from pathway_rows_final
)
select jsonb_build_object(
  'metrics', (
    select to_jsonb(m) || jsonb_build_object(
      'pathway_completions', p.pathway_completions,
      'known_pathway_completers', p.known_pathway_completers
    )
    from metrics m cross join pathway_totals p
  ),
  'eventCounts', coalesce((select jsonb_agg(jsonb_build_array(label, value) order by value desc, label) from event_counts), '[]'::jsonb),
  'topPages', coalesce((select jsonb_agg(jsonb_build_array(label, value) order by value desc, label) from top_pages), '[]'::jsonb),
  'trafficSources', coalesce((select jsonb_agg(jsonb_build_array(label, value) order by value desc, label) from traffic_sources), '[]'::jsonb),
  'devices', coalesce((select jsonb_agg(jsonb_build_array(label, value) order by value desc, label) from devices), '[]'::jsonb),
  'countries', coalesce((select jsonb_agg(jsonb_build_array(label, value) order by value desc, label) from countries), '[]'::jsonb),
  'cities', coalesce((select jsonb_agg(jsonb_build_array(label, value) order by value desc, label) from cities), '[]'::jsonb),
  'browsers', coalesce((select jsonb_agg(jsonb_build_array(label, value) order by value desc, label) from browsers), '[]'::jsonb),
  'operatingSystems', coalesce((select jsonb_agg(jsonb_build_array(label, value) order by value desc, label) from operating_systems), '[]'::jsonb),
  'campaigns', coalesce((select jsonb_agg(jsonb_build_array(label, value) order by value desc, label) from campaigns), '[]'::jsonb),
  'mediums', coalesce((select jsonb_agg(jsonb_build_array(label, value) order by value desc, label) from mediums), '[]'::jsonb),
  'searches', coalesce((select jsonb_agg(jsonb_build_array(label, value) order by value desc, label) from searches), '[]'::jsonb),
  'missingSearches', coalesce((select jsonb_agg(jsonb_build_array(label, value) order by value desc, label) from missing_searches), '[]'::jsonb),
  'appOrigins', coalesce((select jsonb_agg(jsonb_build_array(label, value) order by value desc, label) from app_origins), '[]'::jsonb),
  'pathways', coalesce((
    select jsonb_agg(jsonb_build_object(
      'slug', slug,
      'starts', starts,
      'audioStarts', audio_starts,
      'uniqueSessions', unique_sessions,
      'observedSteps', observed_steps,
      'reachedFinalStep', reached_final_step,
      'completions', completions,
      'readingCompletions', reading_completions,
      'audioCompletions', audio_completions,
      'knownCompleters', known_completers,
      'completionRate', completion_rate,
      'averageProgress', average_progress,
      'appTransitions', app_transitions
    ) order by starts desc, audio_starts desc, completions desc, observed_steps desc, app_transitions desc)
    from pathway_rows_final
  ), '[]'::jsonb),
  'articles', coalesce((
    select jsonb_agg(jsonb_build_object(
      'slug', slug,
      'opens', opens,
      'uniqueSessions', unique_sessions,
      'completions', completions,
      'completionRate', completion_rate,
      'appTransitions', app_transitions
    ) order by opens desc, completions desc, app_transitions desc)
    from article_rows_final
  ), '[]'::jsonb)
);
$function$;

revoke all on function analytics.dashboard_snapshot() from public;
revoke all on function analytics.dashboard_snapshot() from anon;
revoke all on function analytics.dashboard_snapshot() from authenticated;
grant execute on function analytics.dashboard_snapshot() to service_role;
