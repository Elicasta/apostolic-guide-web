create or replace function analytics.public_traffic_metrics_v2()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
with
params as (
  select now() as now_at, now() - interval '7 days' as week_start
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
    first_event_at,
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
public_first_seen as (
  select anonymous_id, min(occurred_at) as first_seen_at
  from public_events
  where anonymous_id is not null
  group by anonymous_id
),
public_browser_days as (
  select anonymous_id, count(distinct occurred_at::date) as active_days
  from public_events
  where anonymous_id is not null
  group by anonymous_id
),
cohort7 as (
  select f.anonymous_id, f.first_seen_at
  from public_first_seen f cross join params p
  where f.first_seen_at >= p.now_at - interval '15 days'
    and f.first_seen_at < p.now_at - interval '8 days'
),
cohort7_return as (
  select
    c.anonymous_id,
    exists (
      select 1
      from public_events e
      where e.anonymous_id = c.anonymous_id
        and e.occurred_at >= c.first_seen_at + interval '1 day'
        and e.occurred_at < c.first_seen_at + interval '8 days'
    ) as returned
  from cohort7 c
),
cohort30 as (
  select f.anonymous_id, f.first_seen_at
  from public_first_seen f cross join params p
  where f.first_seen_at >= p.now_at - interval '61 days'
    and f.first_seen_at < p.now_at - interval '31 days'
),
cohort30_return as (
  select
    c.anonymous_id,
    exists (
      select 1
      from public_events e
      where e.anonymous_id = c.anonymous_id
        and e.occurred_at >= c.first_seen_at + interval '1 day'
        and e.occurred_at < c.first_seen_at + interval '31 days'
    ) as returned
  from cohort30 c
)
select jsonb_build_object(
  'public_unique_browsers', (
    select count(distinct anonymous_id)
    from public_events
    where event_name = 'page_viewed'
  ),
  'public_browser_sessions', (
    select count(distinct session_id)
    from public_events
    where event_name = 'page_viewed'
  ),
  'returning_browsers', (
    select count(*) from public_browser_days where active_days >= 2
  ),
  'weekly_visitors', (
    select count(distinct e.anonymous_id)
    from public_events e cross join params p
    where e.event_name = 'page_viewed' and e.occurred_at >= p.week_start
  ),
  'weekly_sessions', (
    select count(distinct e.session_id)
    from public_events e cross join params p
    where e.event_name = 'page_viewed' and e.occurred_at >= p.week_start
  ),
  'weekly_new_browsers', (
    select count(distinct e.anonymous_id)
    from public_events e
    join public_first_seen f using (anonymous_id)
    cross join params p
    where e.event_name = 'page_viewed'
      and e.occurred_at >= p.week_start
      and f.first_seen_at >= p.week_start
  ),
  'weekly_returning_browsers', (
    select count(distinct e.anonymous_id)
    from public_events e
    join public_first_seen f using (anonymous_id)
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
    from public_events e
    join public_first_seen f using (anonymous_id)
    cross join params p
    where e.event_name = 'page_viewed' and e.occurred_at >= p.week_start
  ),
  'weekly_internal_sessions', (
    select count(*) from classified_sessions c cross join params p
    where c.is_internal and c.first_event_at >= p.week_start
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
  )
);
$$;

revoke all on function analytics.public_traffic_metrics_v2() from public, anon, authenticated;
grant execute on function analytics.public_traffic_metrics_v2() to service_role;
