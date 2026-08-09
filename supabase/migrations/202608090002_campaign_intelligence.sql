create table if not exists analytics.email_campaigns (
  id uuid primary key,
  resend_broadcast_id text unique,
  campaign_type text not null check (campaign_type in ('article','topic','answer','pathway','youtube','podcast','announcement')),
  audience text not null check (audience in ('general','content','media')),
  name text not null,
  subject text not null,
  title text not null,
  destination_url text not null,
  tracked_url text not null,
  status text not null default 'creating' check (status in ('creating','draft','scheduled','sending','sent','failed')),
  created_by text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists analytics.email_events (
  id bigint generated always as identity primary key,
  svix_id text not null unique,
  event_type text not null check (event_type in (
    'email.sent','email.delivered','email.delivery_delayed','email.opened','email.clicked',
    'email.bounced','email.complained','email.failed','email.suppressed'
  )),
  resend_broadcast_id text,
  campaign_id uuid references analytics.email_campaigns(id) on delete set null,
  email_id text not null,
  clicked_url text,
  reason text,
  event_at timestamptz not null,
  received_at timestamptz not null default now()
);

create table if not exists analytics.integration_secrets (
  name text primary key,
  secret text not null,
  updated_at timestamptz not null default now()
);

create index if not exists email_campaigns_created_idx
  on analytics.email_campaigns (created_at desc);

create index if not exists email_campaigns_resend_idx
  on analytics.email_campaigns (resend_broadcast_id)
  where resend_broadcast_id is not null;

create index if not exists email_events_campaign_idx
  on analytics.email_events (campaign_id, event_type, event_at desc);

create index if not exists email_events_broadcast_idx
  on analytics.email_events (resend_broadcast_id, event_type, event_at desc);

create index if not exists analytics_events_utm_campaign_idx
  on analytics.events (utm_campaign, event_name, occurred_at desc)
  where utm_campaign is not null;

alter table analytics.email_campaigns enable row level security;
alter table analytics.email_events enable row level security;
alter table analytics.integration_secrets enable row level security;

create or replace view analytics.email_campaign_intelligence
with (security_invoker = true)
as
select
  c.id,
  c.resend_broadcast_id,
  c.campaign_type,
  c.audience,
  c.name,
  c.subject,
  c.title,
  c.destination_url,
  c.tracked_url,
  c.status,
  c.created_at,
  c.sent_at,
  c.updated_at,
  coalesce(mail.sent, 0)::bigint as sent,
  coalesce(mail.delivered, 0)::bigint as delivered,
  coalesce(mail.opened, 0)::bigint as opened,
  coalesce(mail.clicked, 0)::bigint as clicked,
  coalesce(mail.click_events, 0)::bigint as click_events,
  coalesce(mail.bounced, 0)::bigint as bounced,
  coalesce(mail.complained, 0)::bigint as complained,
  coalesce(mail.failed, 0)::bigint as failed,
  coalesce(mail.suppressed, 0)::bigint as suppressed,
  coalesce(mail.delayed, 0)::bigint as delayed,
  coalesce(web.site_sessions, 0)::bigint as site_sessions,
  coalesce(web.site_visitors, 0)::bigint as site_visitors,
  coalesce(web.site_page_views, 0)::bigint as site_page_views,
  coalesce(web.article_completions, 0)::bigint as article_completions,
  coalesce(web.app_transitions, 0)::bigint as app_transitions
from analytics.email_campaigns c
left join (
  select
    campaign_id,
    count(distinct email_id) filter (where event_type = 'email.sent') as sent,
    count(distinct email_id) filter (where event_type = 'email.delivered') as delivered,
    count(distinct email_id) filter (where event_type = 'email.opened') as opened,
    count(distinct email_id) filter (where event_type = 'email.clicked') as clicked,
    count(*) filter (where event_type = 'email.clicked') as click_events,
    count(distinct email_id) filter (where event_type = 'email.bounced') as bounced,
    count(distinct email_id) filter (where event_type = 'email.complained') as complained,
    count(distinct email_id) filter (where event_type = 'email.failed') as failed,
    count(distinct email_id) filter (where event_type = 'email.suppressed') as suppressed,
    count(distinct email_id) filter (where event_type = 'email.delivery_delayed') as delayed
  from analytics.email_events
  where campaign_id is not null
  group by campaign_id
) mail on mail.campaign_id = c.id
left join (
  select
    utm_campaign,
    count(distinct session_id) as site_sessions,
    count(distinct anonymous_id) as site_visitors,
    count(*) filter (where event_name = 'page_viewed') as site_page_views,
    count(*) filter (where event_name = 'article_completed') as article_completions,
    count(*) filter (where event_name = 'app_link_clicked') as app_transitions
  from analytics.events
  where utm_campaign is not null and utm_medium = 'email'
  group by utm_campaign
) web on web.utm_campaign = c.id::text;

create or replace view analytics.email_campaign_link_rollups
with (security_invoker = true)
as
select
  campaign_id,
  clicked_url,
  count(*)::bigint as click_events,
  count(distinct email_id)::bigint as unique_clickers
from analytics.email_events
where campaign_id is not null
  and event_type = 'email.clicked'
  and clicked_url is not null
  and clicked_url <> ''
group by campaign_id, clicked_url;

comment on table analytics.email_campaigns is
  'Apostolic Guide broadcast ledger tying Resend broadcasts to first-party campaign attribution.';

comment on table analytics.email_events is
  'Verified, idempotent Resend delivery events. Recipient addresses and IP addresses are intentionally not retained.';

comment on table analytics.integration_secrets is
  'Server-only integration secrets used by verified webhook handlers. No client policies are defined.';

comment on view analytics.email_campaign_intelligence is
  'Unique email delivery/open/click metrics joined to first-party website sessions and app-transition events.';

grant usage on schema analytics to service_role;
grant select, insert, update, delete on analytics.email_campaigns to service_role;
grant select, insert, update, delete on analytics.email_events to service_role;
grant select, insert, update, delete on analytics.integration_secrets to service_role;
grant select on analytics.email_campaign_intelligence to service_role;
grant select on analytics.email_campaign_link_rollups to service_role;
grant usage, select on sequence analytics.email_events_id_seq to service_role;
