insert into public.people (email, status, source, source_detail, email_subscriber_id, first_seen_at, last_seen_at, created_at, updated_at)
select lower(trim(email)),
       case when status = 'subscribed' then 'subscriber' else 'inactive' end,
       coalesce(nullif(source,''),'website'),
       'email_subscriber',
       id,
       coalesce(consented_at, created_at, now()),
       coalesce(last_signup_at, updated_at, created_at, now()),
       coalesce(created_at, now()),
       now()
from public.email_subscribers
where email is not null
on conflict (lower(email)) where email is not null do update
set status = excluded.status,
    email_subscriber_id = excluded.email_subscriber_id,
    last_seen_at = greatest(public.people.last_seen_at, excluded.last_seen_at),
    updated_at = now();

create or replace function public.sync_email_subscriber_to_person()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.people (email, status, source, source_detail, email_subscriber_id, first_seen_at, last_seen_at, updated_at)
  values (
    lower(trim(new.email)),
    case when new.status = 'subscribed' then 'subscriber' else 'inactive' end,
    coalesce(nullif(new.source,''),'website'),
    'email_subscriber',
    new.id,
    coalesce(new.consented_at, new.created_at, now()),
    coalesce(new.last_signup_at, new.updated_at, now()),
    now()
  )
  on conflict (lower(email)) where email is not null do update
  set status = excluded.status,
      email_subscriber_id = excluded.email_subscriber_id,
      source = case when public.people.source = 'unknown' then excluded.source else public.people.source end,
      last_seen_at = greatest(public.people.last_seen_at, excluded.last_seen_at),
      updated_at = now();
  return new;
end;
$$;

drop trigger if exists email_subscriber_people_sync on public.email_subscribers;
create trigger email_subscriber_people_sync
after insert or update of email,status,last_signup_at,updated_at on public.email_subscribers
for each row execute function public.sync_email_subscriber_to_person();
