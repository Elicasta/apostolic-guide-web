begin;

-- Forge replaces the retired loose carousel workflow with persistent Creative
-- Projects. Keep historical carousel_topic_pack rows readable while permitting
-- the new safe-draft recipe in both the proposal and durable-run ledgers.

alter table public.sol_operator_proposals
  drop constraint if exists sol_operator_proposals_recipe_key_check;
alter table public.sol_operator_proposals
  add constraint sol_operator_proposals_recipe_key_check
  check (recipe_key in (
    'audio_to_youtube',
    'forge_carousel_stage',
    'carousel_topic_pack',
    'journey_automation_draft'
  ));

alter table public.sol_operator_runs
  drop constraint if exists sol_operator_runs_recipe_key_check;
alter table public.sol_operator_runs
  add constraint sol_operator_runs_recipe_key_check
  check (recipe_key in (
    'audio_to_youtube',
    'forge_carousel_stage',
    'carousel_topic_pack',
    'journey_automation_draft'
  ));

comment on constraint sol_operator_proposals_recipe_key_check on public.sol_operator_proposals is
  'Registered Sol recipes. carousel_topic_pack is historical only; Forge uses forge_carousel_stage for persistent carousel production.';
comment on constraint sol_operator_runs_recipe_key_check on public.sol_operator_runs is
  'Registered durable Sol execution recipes, including Forge persistent carousel staging.';

commit;
