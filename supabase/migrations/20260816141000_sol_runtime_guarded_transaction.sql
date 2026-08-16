create or replace function public.sol_runtime_apply_transaction(p_operations jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  op jsonb;
  applied integer := 0;
  kind text;
  values_json jsonb;
begin
  if jsonb_typeof(p_operations) <> 'array' then
    raise exception 'operations must be a JSON array';
  end if;
  if jsonb_array_length(p_operations) > 100 then
    raise exception 'too many operations';
  end if;

  for op in select value from jsonb_array_elements(p_operations) loop
    kind := op->>'kind';
    values_json := coalesce(op->'values', '{}'::jsonb);

    if kind = 'event' then
      insert into public.sol_runtime_events(run_id, task_id, event_type, message, details)
      values (
        nullif(values_json->>'run_id','')::uuid,
        nullif(values_json->>'task_id','')::uuid,
        coalesce(nullif(values_json->>'event_type',''), 'runtime.transaction'),
        coalesce(values_json->>'message',''),
        coalesce(values_json->'details','{}'::jsonb)
      );
    elsif kind = 'metric' then
      insert into public.sol_runtime_metrics(run_id, metric_key, value, metadata)
      values (
        nullif(values_json->>'run_id','')::uuid,
        coalesce(nullif(values_json->>'metric_key',''), 'runtime.transaction'),
        coalesce(nullif(values_json->>'value','')::numeric, 0),
        coalesce(values_json->'metadata','{}'::jsonb)
      );
    else
      raise exception 'unsupported transaction operation kind: %', kind;
    end if;
    applied := applied + 1;
  end loop;

  return applied;
end;
$$;

revoke execute on function public.sol_runtime_apply_transaction(jsonb) from public, anon, authenticated;
grant execute on function public.sol_runtime_apply_transaction(jsonb) to service_role;
