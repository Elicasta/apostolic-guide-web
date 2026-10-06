import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decideSolControl, decideSolHardLock, SOL_HARD_LOCKED_ACTIONS, solKillSwitchEnabled } from "../src/sol-control-policy";
import type { StudioRole } from "../src/studio-permissions";
import type { SolMode } from "../src/sol-operator-engine";

const roles: StudioRole[] = ["owner", "admin", "editor", "moderator", "viewer"];
const modes: SolMode[] = ["watch", "assist", "trusted"];
const via = ["page", "chat", "cron", "mcp"] as const;

test("hard locks reject every banned action regardless of surface, actor or mode", () => {
  for (const action of SOL_HARD_LOCKED_ACTIONS) {
    assert.deepEqual(decideSolHardLock(action), { allow: false, code: "HARD_LOCK", message: "Sol cannot perform that action in any mode." });
  }
  assert.deepEqual(decideSolHardLock("list_proposals"), { allow: true });
  for (const role of roles) for (const mode of modes) for (const source of via) {
    const result = decideSolControl({ action: "approve", role, enabled: true, mode, via: source, killSwitch: true });
    assert.equal(result.allow, false, role + " " + mode + " " + source);
  }
});

test("only owner/admin may stop or change settings; editors can review in Assist", () => {
  for (const role of roles) {
    const stop = decideSolControl({ action: "stop", role, enabled: true, mode: "assist", killSwitch: false });
    const settings = decideSolControl({ action: "settings", role, enabled: true, mode: "assist", nextMode: "watch", via: "page", killSwitch: false });
    assert.equal(stop.allow, role === "owner" || role === "admin");
    assert.equal(settings.allow, role === "owner" || role === "admin");
    const approval = decideSolControl({ action: "approve", role, enabled: true, mode: "assist", killSwitch: false });
    assert.equal(approval.allow, role === "owner" || role === "admin" || role === "editor");
  }
});

test("mode, pause and environment kill are fail closed", () => {
  for (const mode of modes) {
    for (const action of ["approve", "dismiss", "retry", "agent_approval", "scan"] as const) {
      assert.equal(decideSolControl({ role: "owner", action, mode, enabled: false, killSwitch: false }).allow, false);
      assert.equal(decideSolControl({ role: "owner", action, mode, enabled: true, killSwitch: true }).allow, false);
    }
  }
  assert.equal(decideSolControl({ role: "owner", action: "scan", mode: "watch", enabled: true, killSwitch: false }).allow, true);
  assert.equal(decideSolControl({ role: "owner", action: "approve", mode: "watch", enabled: true, killSwitch: false }).allow, false);
  assert.equal(decideSolControl({ role: "owner", action: "cancel", mode: "watch", enabled: false, killSwitch: true }).allow, true);
  assert.equal(decideSolControl({ role: "viewer", action: "chat", mode: "watch", enabled: false, killSwitch: true }).allow, true);
});

test("Trusted mode requires a page confirmation from Owner only", () => {
  for (const role of roles) for (const source of via) {
    for (const acknowledged of [false, true]) {
      const decision = decideSolControl({
        role, action: "settings", enabled: true, mode: "assist",
        nextMode: "trusted", nextEnabled: true, acknowledged, via: source, killSwitch: false
      });
      assert.equal(decision.allow, role === "owner" && source === "page" && acknowledged === true);
    }
  }
  assert.equal(decideSolControl({
    role: "owner", action: "settings", mode: "trusted", enabled: false,
    nextMode: "trusted", nextEnabled: true, via: "page", acknowledged: false, killSwitch: false
  }).allow, false);
  assert.equal(decideSolControl({
    role: "admin", action: "settings", mode: "assist", enabled: true,
    nextMode: "watch", nextEnabled: true, via: "mcp", killSwitch: false
  }).allow, true);
  assert.equal(decideSolControl({
    role: "owner", action: "settings", mode: "watch", enabled: false,
    nextMode: "assist", nextEnabled: true, via: "chat", killSwitch: false
  }).allow, false);
});

test("kill switch recognizes deployment values and denies restart", () => {
  for (const value of ["true", "TRUE", "yes", "on", "1"]) assert.equal(solKillSwitchEnabled(value), true);
  for (const value of ["", "false", "0", "no"]) assert.equal(solKillSwitchEnabled(value), false);
  assert.equal(decideSolControl({
    role: "owner", action: "settings", mode: "assist", enabled: false,
    nextEnabled: true, nextMode: "assist", via: "page", killSwitch: true
  }).allow, false);
});

test("stop, proposal decision and approval transitions are audited inside SQL transactions", () => {
  const sql = readFileSync("supabase/migrations/20261006180000_sol_pr1a_guardrails.sql", "utf8");
  assert.match(sql, /create or replace function public.stop_sol_operator/);
  assert.match(sql, /perform public.record_studio_audit\(p_actor_user_id, 'sol.stop'/);
  assert.match(sql, /create trigger sol_proposal_decision_audit/);
  assert.match(sql, /create trigger sol_agent_approval_audit/);
  assert.match(sql, /create trigger sol_guard_run_enqueue/);
  const memory = readFileSync("src/sol-agent-memory.ts", "utf8");
  assert.match(memory, /\.gt\("expires_at", now\)\.select\("id"\)/);
  const operator = readFileSync("src/sol-operator.ts", "utf8");
  assert.match(operator, /\.in\("status", \["pending", "failed"\]\)\.select\("id"\)/);
});
