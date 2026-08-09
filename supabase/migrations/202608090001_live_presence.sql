begin;

alter table analytics.events
  drop constraint if exists events_event_name_check;

alter table analytics.events
  add constraint events_event_name_check check (
    event_name in (
      'page_viewed',
      'presence_heartbeat',
      'topic_opened',
      'answer_opened',
      'article_opened',
      'scripture_opened',
      'pathway_started',
      'pathway_step_completed',
      'search_submitted',
      'search_result_opened',
      'search_no_results',
      'article_completed',
      'app_link_clicked',
      'content_shared'
    )
  );

create index if not exists analytics_events_presence_time_idx
  on analytics.events (occurred_at desc, session_id)
  where event_name = 'presence_heartbeat';

commit;
