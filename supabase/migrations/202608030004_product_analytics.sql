-- First-party, privacy-restrained product analytics.

begin;

create schema if not exists analytics;

create table if not exists analytics.events (
  id uuid primary key default gen_random_uuid(),
  event_name text not null check (
    event_name in (
      'page_viewed',
      'topic_opened',
      'answer_opened',
      'article_opened',
      'scripture_opened',
      'search_submitted',
      'search_result_opened',
      'search_no_results',
      'article_completed',
      'pathway_started',
      'pathway_step_completed',
      'app_link_clicked',
      'content_shared'
    )
  ),
  occurred_at timestamptz not null default now(),
  session_id uuid not null,
  anonymous_id uuid not null,
  user_id uuid references auth.users(id) on delete set null,
  content_item_id uuid references content.items(id) on delete set null,
  page_path text not null,
  referrer_host text,
  source text not null check (source in ('WEBSITE', 'APP', 'ADMIN')),
  device_class text not null default 'unknown'
    check (device_class in ('mobile', 'tablet', 'desktop', 'unknown')),
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_occurred_at_idx
on analytics.events (occurred_at desc);

create index if not exists analytics_events_name_time_idx
on analytics.events (event_name, occurred_at desc);

create index if not exists analytics_events_content_time_idx
on analytics.events (content_item_id, occurred_at desc)
where content_item_id is not null;

create index if not exists analytics_events_anonymous_idx
on analytics.events (anonymous_id, occurred_at desc);

create table if not exists analytics.content_metrics_daily (
  metric_date date not null,
  content_item_id uuid not null references content.items(id) on delete cascade,
  views integer not null default 0,
  unique_sessions integer not null default 0,
  completed_reads integer not null default 0,
  shares integer not null default 0,
  app_clicks integer not null default 0,
  average_active_seconds numeric not null default 0,
  average_scroll_percent numeric not null default 0,
  primary key (metric_date, content_item_id)
);


create or replace function analytics.ingest_event(
  p_event_name text,
  p_session_id uuid,
  p_anonymous_id uuid,
  p_page_path text,
  p_referrer_host text,
  p_source text,
  p_device_class text,
  p_properties jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent_count integer;
begin
  select count(*)
  into recent_count
  from analytics.events
  where session_id = p_session_id
    and occurred_at > now() - interval '1 hour';

  if recent_count >= 240 then
    return false;
  end if;

  insert into analytics.events (
    event_name,
    session_id,
    anonymous_id,
    page_path,
    referrer_host,
    source,
    device_class,
    properties
  ) values (
    p_event_name,
    p_session_id,
    p_anonymous_id,
    p_page_path,
    p_referrer_host,
    p_source,
    p_device_class,
    coalesce(p_properties, '{}'::jsonb)
  );

  return true;
end;
$$;

revoke all on function analytics.ingest_event(
  text, uuid, uuid, text, text, text, text, jsonb
) from public, anon, authenticated;

grant execute on function analytics.ingest_event(
  text, uuid, uuid, text, text, text, text, jsonb
) to service_role;

alter table analytics.events enable row level security;
alter table analytics.content_metrics_daily enable row level security;

-- Browser clients never write directly. The server ingestion route uses the service role.
revoke all on schema analytics from anon, authenticated;
revoke all on all tables in schema analytics from anon, authenticated;

-- Editors can read reporting data through authenticated server requests.
grant usage on schema analytics to authenticated;
grant select on analytics.events, analytics.content_metrics_daily to authenticated;

drop policy if exists "editors read analytics events" on analytics.events;
create policy "editors read analytics events"
on analytics.events for select
to authenticated
using (
  platform.current_user_has_role(array['editor', 'publisher', 'admin'])
);

drop policy if exists "editors read analytics rollups" on analytics.content_metrics_daily;
create policy "editors read analytics rollups"
on analytics.content_metrics_daily for select
to authenticated
using (
  platform.current_user_has_role(array['editor', 'publisher', 'admin'])
);

commit;
