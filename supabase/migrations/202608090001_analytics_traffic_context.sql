begin;

alter table analytics.events
  add column if not exists country_code text,
  add column if not exists region text,
  add column if not exists city text,
  add column if not exists user_agent text,
  add column if not exists browser text,
  add column if not exists os text,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content text,
  add column if not exists utm_term text;

create index if not exists analytics_events_referrer_time_idx
on analytics.events (referrer_host, occurred_at desc)
where referrer_host is not null;

create index if not exists analytics_events_country_time_idx
on analytics.events (country_code, occurred_at desc)
where country_code is not null;

create index if not exists analytics_events_source_time_idx
on analytics.events (utm_source, occurred_at desc)
where utm_source is not null;

commit;
