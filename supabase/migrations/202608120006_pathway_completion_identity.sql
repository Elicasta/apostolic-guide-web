begin;

alter table analytics.events drop constraint if exists events_event_name_check;
alter table analytics.events add constraint events_event_name_check check (
  event_name in (
    'page_viewed','presence_heartbeat','topic_opened','answer_opened','article_opened','scripture_opened',
    'search_submitted','search_result_opened','search_no_results','article_completed','pathway_started',
    'pathway_step_completed','pathway_completed','app_link_clicked','content_shared','audio_started','audio_progress','audio_completed'
  )
);

create or replace view public.pathway_completion_metrics
with (security_invoker = true)
as
with normalized as (
  select
    e.*,
    coalesce(
      nullif(e.properties ->> 'pathwaySlug', ''),
      nullif(e.properties ->> 'contentKey', ''),
      case when split_part(e.page_path, '?', 1) like '/pathways/%'
        then nullif(split_part(split_part(e.page_path, '?', 1), '/', 3), '')
      end
    ) as pathway_slug,
    case
      when e.event_name = 'pathway_completed' then true
      when e.event_name = 'audio_completed' then true
      when e.event_name = 'pathway_step_completed'
        and coalesce(e.properties ->> 'stepNumber', '') ~ '^[0-9]+$'
        and coalesce(e.properties ->> 'stepCount', '') ~ '^[0-9]+$'
        and (e.properties ->> 'stepNumber')::int >= (e.properties ->> 'stepCount')::int
        then true
      else false
    end as is_completion,
    case
      when e.event_name = 'audio_completed' then 'audio'
      when e.event_name = 'pathway_completed' and e.properties ->> 'completionMethod' = 'audio' then 'audio'
      when e.event_name = 'pathway_completed' and e.properties ->> 'completionMethod' = 'reading' then 'reading'
      when e.event_name = 'pathway_step_completed'
        and coalesce(e.properties ->> 'stepNumber', '') ~ '^[0-9]+$'
        and coalesce(e.properties ->> 'stepCount', '') ~ '^[0-9]+$'
        and (e.properties ->> 'stepNumber')::int >= (e.properties ->> 'stepCount')::int
        then 'reading'
      else null
    end as completion_method
  from analytics.events e
  where e.event_name in (
    'pathway_started','pathway_step_completed','pathway_completed','audio_started','audio_progress','audio_completed'
  )
), scoped as (
  select * from normalized where pathway_slug is not null
)
select
  pathway_slug,
  count(*) filter (where event_name = 'pathway_started')::bigint as page_starts,
  count(*) filter (where event_name = 'audio_started')::bigint as audio_starts,
  count(distinct session_id) filter (where event_name in ('pathway_started','audio_started'))::bigint as unique_start_sessions,
  count(distinct anonymous_id) filter (where event_name in ('pathway_started','audio_started'))::bigint as unique_visitors,
  count(distinct person_id) filter (where person_id is not null and event_name in ('pathway_started','audio_started','pathway_step_completed','pathway_completed','audio_progress','audio_completed'))::bigint as known_people,
  count(distinct session_id) filter (where is_completion)::bigint as completions,
  count(distinct session_id) filter (where is_completion and completion_method = 'reading')::bigint as reading_completions,
  count(distinct session_id) filter (where is_completion and completion_method = 'audio')::bigint as audio_completions,
  count(distinct person_id) filter (where person_id is not null and is_completion)::bigint as known_completers,
  coalesce(sum(case
    when event_name = 'audio_progress'
      and coalesce(properties ->> 'deltaListenedSeconds', '') ~ '^[0-9]+(?:\.[0-9]+)?$'
      and (properties ->> 'deltaListenedSeconds')::numeric > 0
      and (properties ->> 'deltaListenedSeconds')::numeric < 300
      then (properties ->> 'deltaListenedSeconds')::numeric
    else 0 end), 0)::numeric as listened_seconds,
  case
    when count(distinct session_id) filter (where event_name in ('pathway_started','audio_started')) = 0 then 0
    else least(100, round(
      count(distinct session_id) filter (where is_completion)::numeric
      / count(distinct session_id) filter (where event_name in ('pathway_started','audio_started'))::numeric * 100
    ))::int
  end as completion_rate,
  max(occurred_at) as last_activity_at
from scoped
group by pathway_slug;

revoke all on public.pathway_completion_metrics from anon, authenticated;
grant select on public.pathway_completion_metrics to service_role;

create or replace view public.subscriber_pathway_progress
with (security_invoker = true)
as
with normalized as (
  select
    e.person_id,
    e.session_id,
    e.event_name,
    e.occurred_at,
    e.properties,
    coalesce(
      nullif(e.properties ->> 'pathwaySlug', ''),
      nullif(e.properties ->> 'contentKey', ''),
      case when split_part(e.page_path, '?', 1) like '/pathways/%'
        then nullif(split_part(split_part(e.page_path, '?', 1), '/', 3), '')
      end
    ) as pathway_slug,
    case
      when e.event_name = 'pathway_completed' then true
      when e.event_name = 'audio_completed' then true
      when e.event_name = 'pathway_step_completed'
        and coalesce(e.properties ->> 'stepNumber', '') ~ '^[0-9]+$'
        and coalesce(e.properties ->> 'stepCount', '') ~ '^[0-9]+$'
        and (e.properties ->> 'stepNumber')::int >= (e.properties ->> 'stepCount')::int
        then true
      else false
    end as is_completion,
    case
      when e.event_name = 'audio_completed' then 'audio'
      when e.event_name = 'pathway_completed' and e.properties ->> 'completionMethod' = 'audio' then 'audio'
      when e.event_name = 'pathway_completed' and e.properties ->> 'completionMethod' = 'reading' then 'reading'
      when e.event_name = 'pathway_step_completed'
        and coalesce(e.properties ->> 'stepNumber', '') ~ '^[0-9]+$'
        and coalesce(e.properties ->> 'stepCount', '') ~ '^[0-9]+$'
        and (e.properties ->> 'stepNumber')::int >= (e.properties ->> 'stepCount')::int
        then 'reading'
      else null
    end as completion_method
  from analytics.events e
  where e.person_id is not null
    and e.event_name in ('pathway_started','pathway_step_completed','pathway_completed','audio_started','audio_progress','audio_completed')
), grouped as (
  select
    person_id,
    pathway_slug,
    min(occurred_at) filter (where event_name in ('pathway_started','audio_started')) as first_started_at,
    max(occurred_at) as last_activity_at,
    min(occurred_at) filter (where is_completion) as completed_at,
    bool_or(is_completion) as is_completed,
    bool_or(is_completion and completion_method = 'reading') as completed_by_reading,
    bool_or(is_completion and completion_method = 'audio') as completed_by_audio,
    count(*) filter (where event_name = 'audio_started')::bigint as audio_starts,
    count(*) filter (where event_name = 'audio_completed')::bigint as audio_completions,
    count(*) filter (where event_name = 'pathway_step_completed')::bigint as observed_reading_steps,
    coalesce(sum(case
      when event_name = 'audio_progress'
        and coalesce(properties ->> 'deltaListenedSeconds', '') ~ '^[0-9]+(?:\.[0-9]+)?$'
        and (properties ->> 'deltaListenedSeconds')::numeric > 0
        and (properties ->> 'deltaListenedSeconds')::numeric < 300
        then (properties ->> 'deltaListenedSeconds')::numeric
      else 0 end), 0)::numeric as listened_seconds
  from normalized
  where pathway_slug is not null
  group by person_id, pathway_slug
)
select
  s.id as subscriber_id,
  p.id as person_id,
  s.email,
  s.status as subscriber_status,
  g.pathway_slug,
  g.first_started_at,
  g.last_activity_at,
  g.completed_at,
  g.is_completed,
  g.completed_by_reading,
  g.completed_by_audio,
  g.audio_starts,
  g.audio_completions,
  g.observed_reading_steps,
  g.listened_seconds
from grouped g
join public.people p on p.id = g.person_id
join public.email_subscribers s on s.id = p.email_subscriber_id;

revoke all on public.subscriber_pathway_progress from anon, authenticated;
grant select on public.subscriber_pathway_progress to service_role;

commit;
