alter table public.inbox_conversations
  drop constraint if exists inbox_conversations_platform_check;
alter table public.inbox_conversations
  add constraint inbox_conversations_platform_check check (platform in ('instagram','website'));

alter table public.inbox_messages
  drop constraint if exists inbox_messages_platform_check;
alter table public.inbox_messages
  add constraint inbox_messages_platform_check check (platform in ('instagram','website'));

create or replace function public.notify_studio_inbound_message() returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.direction = 'inbound' then
    insert into public.studio_notifications(type,severity,title,detail,href,person_id,entity_type,entity_id,dedupe_key,created_at)
    values(
      'inbox_message',
      'info',
      case when new.platform = 'website' then 'New website form' else 'New Instagram message' end,
      case when new.platform = 'website' then 'A new form submission is waiting in Inbox.' else 'A new message is waiting in Inbox.' end,
      '/admin/inbox/'||new.conversation_id,
      new.person_id,
      'inbox_conversation',
      new.conversation_id::text,
      'inbox:'||coalesce(new.external_event_id,new.id::text),
      coalesce(new.sent_at,now())
    ) on conflict (dedupe_key) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.notify_studio_inbound_message() from public, anon, authenticated;
grant execute on function public.notify_studio_inbound_message() to service_role;
