-- SOL Runtime V1 security hardening.
-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. These RPCs are
-- SECURITY DEFINER and mutate durable runtime state, so they must never be
-- callable from anon/authenticated clients.

revoke execute on function public.sol_runtime_claim_tasks(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.sol_runtime_unblock_tasks(uuid) from public, anon, authenticated;
revoke execute on function public.sol_runtime_create_run(jsonb, jsonb, text, boolean) from public, anon, authenticated;

-- The trigger helper is not part of the public runtime API either.
revoke execute on function public.sol_runtime_touch_updated_at() from public, anon, authenticated;

grant execute on function public.sol_runtime_claim_tasks(text, integer, integer) to service_role;
grant execute on function public.sol_runtime_unblock_tasks(uuid) to service_role;
grant execute on function public.sol_runtime_create_run(jsonb, jsonb, text, boolean) to service_role;
