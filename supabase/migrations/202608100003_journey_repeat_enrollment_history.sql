alter table public.growth_journey_enrollments
  drop constraint if exists growth_journey_enrollments_journey_id_person_id_status_key;

create unique index if not exists growth_journey_enrollments_one_open_idx
  on public.growth_journey_enrollments(journey_id,person_id)
  where status in ('active','waiting','paused');
