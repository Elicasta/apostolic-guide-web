-- Sol PR 1A: use existing tables; no parallel Sol schema.
-- Apply to Preview database before deploying the matching code.
begin;

alter table public.sol_operator_settings
  add column if not exists changed_by uuid references auth.users(id) on delete set null,
  add column if not exists stopped_at timestamptz,
  add column if not exists stopped_by uuid references auth.users(id) on delete set null;

alter table public.sol_agent_approvals
  add column if not exists expires_at timestamptz not null default (now() + interval '15 minutes');

update public.sol_agent_approvals
set expires_at = created_at + interval '15 minutes'
where expires_at > created_at + interval '15 minutes' + interval '1 second'
   or expires_at < created_at;

update public.sol_agent_approvals
set status = 'expired'
where status = 'pending' and expires_at <= now();

create or replace function public.audit_sol_operator_settings_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  -- A Stop action records one dedicated sol.stop audit row in its transaction.
  if new.changed_by is not null
     and new.stopped_at is not distinct from old.stopped_at
     and (new.enabled is distinct from old.enabled or new.mode is distinct from old.mode
       or new.weekly_targets is distinct from old.weekly_targets) then
    perform public.record_studio_audit(
      new.changed_by, 'sol.settings_updated', 'sol_operator', null,
      jsonb_build_object('before', jsonb_build_object('enabled', old.enabled, 'mode', old.mode),
                         'after', jsonb_build_object('enabled', new.enabled, 'mode', new.mode))
    );
  end if;
  return new;
end;
$$;
drop trigger if exists sol_settings_audit on public.sol_operator_settings;
create trigger sol_settings_audit after update on public.sol_operator_settings
for each row execute function public.audit_sol_operator_settings_change();

create or replace function public.audit_sol_proposal_decision()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'approved' and old.status in ('pending','failed') and new.approved_by is not null then
    perform public.record_studio_audit(
      new.approved_by, 'sol.proposal_approved', 'sol_proposal', new.id,
      jsonb_build_object('recipe_key', new.recipe_key, 'from_status', old.status)
    );
  elsif new.status = 'dismissed' and old.status = 'pending' and new.dismissed_by is not null then
    perform public.record_studio_audit(new.dismissed_by, 'sol.proposal_dismissed', 'sol_proposal', new.id,
      jsonb_build_object('recipe_key', new.recipe_key));
  end if;
  return new;
end;
$$;
drop trigger if exists sol_proposal_decision_audit on public.sol_operator_proposals;
create trigger sol_proposal_decision_audit after update of status on public.sol_operator_proposals
for each row execute function public.audit_sol_proposal_decision();

create or replace function public.audit_sol_agent_approval()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if old.status = 'pending' and new.status in ('approved','rejected') and new.resolved_by is not null then
    perform public.record_studio_audit(new.resolved_by, 'sol.agent_approval_' || new.status, 'sol_agent_approval', new.id,
      jsonb_build_object('tool_name', new.tool_name));
  end if;
  return new;
end;
$$;
drop trigger if exists sol_agent_approval_audit on public.sol_agent_approvals;
create trigger sol_agent_approval_audit after update of status on public.sol_agent_approvals
for each row execute function public.audit_sol_agent_approval();

-- Lock the settings row when creating runs so Stop cannot race with a new queued job.
create or replace function public.guard_sol_run_enqueue()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_enabled boolean; v_mode text;
begin
  select enabled, mode into v_enabled, v_mode from public.sol_operator_settings
  where workspace_key = 'apostolic-guide' for share;
  if coalesce(v_enabled, false) = false or v_mode = 'watch' then
    raise exception 'Sol execution is paused: cannot queue new jobs';
  end if;
  return new;
end;
$$;
drop trigger if exists sol_guard_run_enqueue on public.sol_operator_runs;
create trigger sol_guard_run_enqueue before insert on public.sol_operator_runs
for each row execute function public.guard_sol_run_enqueue();

-- Retrying, reopening or claiming an older run must obey the same stop barrier.
drop trigger if exists sol_guard_run_reactivate on public.sol_operator_runs;
create trigger sol_guard_run_reactivate before update of status on public.sol_operator_runs
for each row when (old.status is distinct from new.status and new.status in ('queued','retrying','running'))
execute function public.guard_sol_run_enqueue();

-- Atomic kill switch: changes state, cancels jobs/approvals, and audits or rolls back.
create or replace function public.stop_sol_operator(p_actor_user_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare v_runs integer := 0; v_approvals integer := 0; v_time timestamptz := now();
begin
  if p_actor_user_id is null then raise exception 'Actor required'; end if;
  update public.sol_operator_settings set
    enabled = false, stopped_at = v_time, stopped_by = p_actor_user_id, changed_by = p_actor_user_id
  where workspace_key = 'apostolic-guide';
  if not found then raise exception 'Sol settings row is missing'; end if;

  update public.sol_operator_runs set
    status = 'cancelled', current_step = null, completed_at = v_time,
    next_retry_at = null, lease_expires_at = null, worker_id = null
  where status in ('queued','running','retrying','waiting_review');
  get diagnostics v_runs = row_count;

  update public.sol_agent_approvals set
    status = 'rejected', resolved_at = v_time, resolved_by = p_actor_user_id
  where status = 'pending';
  get diagnostics v_approvals = row_count;

  perform public.record_studio_audit(p_actor_user_id, 'sol.stop', 'sol_operator', null,
    jsonb_build_object('cancelled_runs', v_runs, 'cancelled_approvals', v_approvals,
                       'stopped_at', v_time, 'via', 'page'));
  return jsonb_build_object('cancelled_runs', v_runs, 'cancelled_approvals', v_approvals, 'stopped_at', v_time);
end;
$$;

revoke all on function public.stop_sol_operator(uuid) from public, anon, authenticated;
grant execute on function public.stop_sol_operator(uuid) to service_role;
commit;
