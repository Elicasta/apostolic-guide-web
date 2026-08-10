alter table public.social_events
  add column if not exists person_id uuid references public.people(id) on delete set null,
  add column if not exists destination_url text;

create index if not exists social_events_person_id_idx on public.social_events(person_id);
create index if not exists people_attribution_token_idx on public.people(attribution_token);
create index if not exists person_browser_identities_person_id_idx on public.person_browser_identities(person_id);
