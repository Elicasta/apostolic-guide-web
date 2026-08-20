begin;

alter table public.sol_operator_proposals
  drop constraint if exists sol_operator_proposals_recipe_key_check;
alter table public.sol_operator_proposals
  add constraint sol_operator_proposals_recipe_key_check
  check (recipe_key in (
    'pathway_audio_stage',
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
    'pathway_audio_stage',
    'audio_to_youtube',
    'forge_carousel_stage',
    'carousel_topic_pack',
    'journey_automation_draft'
  ));

comment on constraint sol_operator_proposals_recipe_key_check on public.sol_operator_proposals is
  'Registered Sol recipes. Forge owns pathway_audio_stage and forge_carousel_stage safe-draft production.';
comment on constraint sol_operator_runs_recipe_key_check on public.sol_operator_runs is
  'Registered durable Sol execution recipes, including Forge audio and persistent carousel staging.';

commit;
