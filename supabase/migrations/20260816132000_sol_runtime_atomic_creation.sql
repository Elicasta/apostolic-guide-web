-- Atomically create a runtime run and its task graph, or reuse equivalent work.
create or replace function public.sol_runtime_create_run(
  p_run jsonb,
  p_tasks jsonb,
  p_idempotency_key text default null,
  p_force_run boolean default false
)
returns table(run_id uuid, reused boolean, execution_generation integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.sol_runtime_runs%rowtype;
  new_run_id uuid;
  generation integer := 1;
  task jsonb;
begin
  if p_idempotency_key is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));
    select * into existing
    from public.sol_runtime_runs
    where idempotency_key = p_idempotency_key
      and status in ('created','planning','queued','running','waiting_for_approval','retrying','repairing','completed')
    order by execution_generation desc, created_at desc
    limit 1;

    if existing.id is not null and not p_force_run then
      return query select existing.id, true, existing.execution_generation;
      return;
    end if;

    select coalesce(max(r.execution_generation), 0) + 1 into generation
    from public.sol_runtime_runs r
    where r.idempotency_key = p_idempotency_key;
  end if;

  insert into public.sol_runtime_runs (
    workspace_key,
    user_id,
    goal,
    intent,
    workflow_key,
    workflow_version,
    runtime_version,
    planner_version,
    environment,
    mode,
    status,
    input,
    output,
    idempotency_key,
    execution_generation
  ) values (
    coalesce(nullif(p_run->>'workspaceKey',''), 'apostolic-guide'),
    nullif(p_run->>'userId','')::uuid,
    p_run->>'goal',
    coalesce(p_run->'intent', '{}'::jsonb),
    nullif(p_run->>'workflowKey',''),
    nullif(p_run->>'workflowVersion','')::integer,
    coalesce(nullif(p_run->>'runtimeVersion','')::integer, 1),
    nullif(p_run->>'plannerVersion',''),
    coalesce(nullif(p_run->>'environment',''), 'production'),
    coalesce(nullif(p_run->>'mode',''), 'assist'),
    'queued',
    coalesce(p_run->'input', '{}'::jsonb),
    '{}'::jsonb,
    p_idempotency_key,
    generation
  ) returning id into new_run_id;

  for task in select value from jsonb_array_elements(coalesce(p_tasks, '[]'::jsonb)) loop
    insert into public.sol_runtime_tasks (
      run_id,
      task_key,
      name,
      tool_name,
      workflow_name,
      status,
      input,
      depends_on,
      permission,
      environment,
      idempotency_key,
      approval_type,
      verifier_name,
      retry_strategy,
      max_attempts,
      retry_base_delay_ms,
      retry_max_delay_ms,
      timeout_ms
    ) values (
      new_run_id,
      task->>'id',
      task->>'name',
      nullif(task->>'tool',''),
      nullif(task->>'workflow',''),
      case when jsonb_array_length(coalesce(task->'dependsOn', '[]'::jsonb)) = 0 then 'queued' else 'blocked' end,
      coalesce(task->'input', '{}'::jsonb),
      coalesce(array(select jsonb_array_elements_text(coalesce(task->'dependsOn', '[]'::jsonb))), '{}'),
      coalesce(nullif(task->>'permission',''), 'read'),
      coalesce(nullif(p_run->>'environment',''), 'production'),
      nullif(task->'idempotency'->>'key',''),
      nullif(task->'approval'->>'type',''),
      nullif(task->>'verifier',''),
      coalesce(nullif(task->'retryPolicy'->>'strategy',''), 'exponential'),
      coalesce(nullif(task->'retryPolicy'->>'maxAttempts','')::integer, 3),
      coalesce(nullif(task->'retryPolicy'->>'baseDelayMs','')::integer, 2000),
      coalesce(nullif(task->'retryPolicy'->>'maxDelayMs','')::integer, 60000),
      coalesce(nullif(task->>'timeoutMs','')::integer, 300000)
    );
  end loop;

  insert into public.sol_runtime_events(run_id, event_type, message, details)
  values (new_run_id, 'run.created', 'Runtime run created.', jsonb_build_object('idempotencyKey', p_idempotency_key, 'executionGeneration', generation));

  return query select new_run_id, false, generation;
end;
$$;

grant execute on function public.sol_runtime_create_run(jsonb, jsonb, text, boolean) to service_role;
