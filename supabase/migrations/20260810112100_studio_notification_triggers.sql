create or replace function public.notify_studio_inbound_message() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.direction = 'inbound' then
    insert into public.studio_notifications(type,severity,title,detail,href,person_id,entity_type,entity_id,dedupe_key,created_at)
    values('inbox_message','info','New Instagram message','A new message is waiting in Inbox.','/admin/inbox/'||new.conversation_id,new.person_id,'inbox_conversation',new.conversation_id::text,'inbox:'||coalesce(new.external_event_id,new.id::text),coalesce(new.sent_at,now()))
    on conflict (dedupe_key) do nothing;
  end if;
  return new;
end;$$;
revoke all on function public.notify_studio_inbound_message() from public, anon, authenticated;

drop trigger if exists studio_notify_inbound_message on public.inbox_messages;
create trigger studio_notify_inbound_message after insert on public.inbox_messages for each row execute function public.notify_studio_inbound_message();

create or replace function public.notify_studio_subscriber() returns trigger language plpgsql security definer set search_path=public as $$
declare p_id uuid;
begin
  if new.status = 'subscribed' and (tg_op = 'INSERT' or old.status is distinct from 'subscribed') then
    select id into p_id from public.people where email = new.email limit 1;
    insert into public.studio_notifications(type,severity,title,detail,href,person_id,entity_type,entity_id,dedupe_key,created_at)
    values('subscriber','success','New subscriber',new.email,case when p_id is not null then '/admin/people/'||p_id else '/admin/people' end,p_id,'email_subscriber',new.id::text,'subscriber:'||new.id::text||':'||coalesce(extract(epoch from new.last_signup_at)::bigint::text,extract(epoch from now())::bigint::text),coalesce(new.last_signup_at,now()))
    on conflict (dedupe_key) do nothing;
  end if;
  return new;
end;$$;
revoke all on function public.notify_studio_subscriber() from public, anon, authenticated;

drop trigger if exists studio_notify_subscriber on public.email_subscribers;
create trigger studio_notify_subscriber after insert or update of status on public.email_subscribers for each row execute function public.notify_studio_subscriber();

create or replace function public.notify_studio_journey_state() returns trigger language plpgsql security definer set search_path=public as $$
declare j_name text;
begin
  if new.status is distinct from old.status and new.status in ('completed','paused') then
    select name into j_name from public.growth_journeys where id = new.journey_id;
    insert into public.studio_notifications(type,severity,title,detail,href,person_id,entity_type,entity_id,dedupe_key,created_at)
    values(
      case when new.status='completed' then 'journey_completed' else 'journey_follow_up' end,
      case when new.status='completed' then 'success' else 'warning' end,
      case when new.status='completed' then 'Journey completed' else 'Journey needs follow-up' end,
      coalesce(j_name,'Journey'),
      '/admin/people/'||new.person_id,
      new.person_id,
      'journey_enrollment',new.id::text,
      'journey:'||new.id::text||':'||new.status,
      now()
    ) on conflict (dedupe_key) do nothing;
  end if;
  return new;
end;$$;
revoke all on function public.notify_studio_journey_state() from public, anon, authenticated;

drop trigger if exists studio_notify_journey_state on public.growth_journey_enrollments;
create trigger studio_notify_journey_state after update of status on public.growth_journey_enrollments for each row execute function public.notify_studio_journey_state();

create or replace function public.notify_studio_social_failure() returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.delivery_status = 'failed' and (tg_op='INSERT' or old.delivery_status is distinct from 'failed') then
    insert into public.studio_notifications(type,severity,title,detail,href,person_id,entity_type,entity_id,dedupe_key,created_at)
    values('social_failure','error','Instagram automation failed',left(coalesce(new.error_code,'A social reply failed to send.'),240),'/admin/social',new.person_id,'social_event',new.id::text,'social:'||new.id::text||':failed',coalesce(new.event_at,now()))
    on conflict (dedupe_key) do nothing;
  end if;
  return new;
end;$$;
revoke all on function public.notify_studio_social_failure() from public, anon, authenticated;

drop trigger if exists studio_notify_social_failure on public.social_events;
create trigger studio_notify_social_failure after insert or update of delivery_status on public.social_events for each row execute function public.notify_studio_social_failure();

create or replace function public.notify_studio_campaign_failure() returns trigger language plpgsql security definer set search_path=public,analytics as $$
begin
  if new.status = 'failed' and (tg_op='INSERT' or old.status is distinct from 'failed') then
    insert into public.studio_notifications(type,severity,title,detail,href,entity_type,entity_id,dedupe_key,created_at)
    values('broadcast_failure','error','Broadcast failed',coalesce(new.title,new.name,new.subject,'Email broadcast'),'/admin/broadcasts','email_campaign',new.id::text,'broadcast:'||new.id::text||':failed',now())
    on conflict (dedupe_key) do nothing;
  end if;
  return new;
end;$$;
revoke all on function public.notify_studio_campaign_failure() from public, anon, authenticated;

drop trigger if exists studio_notify_campaign_failure on analytics.email_campaigns;
create trigger studio_notify_campaign_failure after insert or update of status on analytics.email_campaigns for each row execute function public.notify_studio_campaign_failure();
