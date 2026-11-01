-- Persistent Creative Projects are now the only source of truth for visual work.
-- The old Sol carousel_topic_pack recipe wrote disconnected pathway_assets.
-- Expire work that has not started so a stale proposal cannot bypass Creative Studio.

update public.sol_operator_proposals
set status = 'expired', updated_at = now()
where recipe_key = 'carousel_topic_pack'
  and status in ('pending', 'approved');

update public.sol_operator_runs
set status = 'cancelled',
    error = 'Legacy carousel topic pack retired. Start visual work in Creative Studio.',
    completed_at = now(),
    lease_expires_at = null,
    worker_id = null
where recipe_key = 'carousel_topic_pack'
  and status in ('queued', 'retrying', 'stalled');
