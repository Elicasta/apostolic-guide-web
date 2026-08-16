-- Temporary/defensive guard: visual work belongs to persistent Creative Projects.
-- Keep historical carousel_topic_pack rows readable, but never allow this legacy
-- recipe to become actionable again unless the guard is deliberately removed.

create or replace function public.expire_legacy_carousel_sol_proposal()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.recipe_key = 'carousel_topic_pack' then
    new.status := 'expired';
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists sol_operator_proposals_expire_legacy_carousel on public.sol_operator_proposals;
create trigger sol_operator_proposals_expire_legacy_carousel
before insert or update on public.sol_operator_proposals
for each row execute function public.expire_legacy_carousel_sol_proposal();

update public.sol_operator_proposals
set status = 'expired', updated_at = now()
where recipe_key = 'carousel_topic_pack'
  and status in ('pending', 'approved');
