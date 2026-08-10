create or replace function public.sync_email_subscriber_to_person()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_person_id uuid;
  normalized_email text := lower(trim(new.email));
begin
  insert into public.people (email, status, source, source_detail, email_subscriber_id, first_seen_at, last_seen_at, updated_at)
  values (
    normalized_email,
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
      updated_at = now()
  returning id into target_person_id;

  insert into public.person_identities(person_id,provider,provider_user_id,email,is_primary,verified_at,updated_at)
  values(target_person_id,'email',normalized_email,normalized_email,true,coalesce(new.consented_at,new.created_at,now()),now())
  on conflict(provider,provider_user_id) do update
    set person_id=excluded.person_id,email=excluded.email,updated_at=now();

  return new;
end;
$$;
