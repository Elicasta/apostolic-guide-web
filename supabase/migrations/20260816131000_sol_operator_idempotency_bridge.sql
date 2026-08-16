-- Compatibility bridge while the three current operator recipes migrate onto SOL Runtime.
alter table public.sol_operator_runs add column if not exists idempotency_key text;
alter table public.sol_operator_runs add column if not exists execution_generation integer not null default 1;

create unique index if not exists sol_operator_runs_idempotency_generation_uidx
  on public.sol_operator_runs(idempotency_key, execution_generation)
  where idempotency_key is not null;

create index if not exists sol_operator_runs_active_recipe_idx
  on public.sol_operator_runs(recipe_key, pathway_slug, status, updated_at desc);
