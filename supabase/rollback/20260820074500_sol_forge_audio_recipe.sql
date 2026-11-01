begin;

-- Remove only Forge audio operator ledger rows. Approved narration and rendered
-- Pathway audio assets remain intact because they are normal production data.
delete from public.sol_operator_runs
where recipe_key = 'pathway_audio_stage';

delete from public.sol_operator_proposals
where recipe_key = 'pathway_audio_stage';

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

commit;
