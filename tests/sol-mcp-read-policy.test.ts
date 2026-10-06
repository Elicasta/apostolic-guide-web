import test from "node:test";
import assert from "node:assert/strict";
import { decideSolReadTool, SOL_MCP_READ_TOOLS } from "../src/sol-control-policy";
import type { StudioRole } from "../src/studio-permissions";

const roles: StudioRole[] = ["owner", "admin", "editor", "moderator", "viewer"];

test("MCP read tool allowlist is exact and never includes mutation or model execution", () => {
  assert.deepEqual([...SOL_MCP_READ_TOOLS], [
    "get_workspace_status", "get_content_inventory", "get_people_journey_status",
    "get_forge_status", "list_creative_projects", "list_proposals", "list_runs"
  ]);
  for (const tool of [
    "set_mode", "scan_workspace", "run_proposal", "dismiss_proposal",
    "cancel_run", "retry_run", "ask_sol", "prepare_approve_sol_proposal",
    "commit_approve_sol_proposal", "send_dm", "publish_now",
    "get_current_screen", "__proto__"
  ]) {
    for (const role of roles) {
      const decision = decideSolReadTool({ role, tool });
      assert.equal(decision.allow, false, role + " " + tool);
    }
  }
});

test("read policy enforces Studio roles without a second MCP role model", () => {
  for (const role of roles) {
    for (const tool of SOL_MCP_READ_TOOLS) {
      const allowed = role === "owner" || role === "admin" ||
        (role === "editor" && ["get_workspace_status", "get_content_inventory", "get_forge_status", "list_creative_projects"].includes(tool)) ||
        (role === "moderator" && ["get_workspace_status", "get_people_journey_status"].includes(tool)) ||
        (role === "viewer" && tool === "get_workspace_status");
      const decision = decideSolReadTool({ role, tool });
      assert.equal(decision.allow, allowed, role + " " + tool);
    }
  }
  for (const tool of SOL_MCP_READ_TOOLS) {
    assert.equal(decideSolReadTool({ role: null, tool }).allow, false);
  }
});

test("Owner/Admin proposal and run reads are explicit until redaction is implemented", () => {
  for (const tool of ["list_runs", "list_proposals"]) {
    for (const role of ["editor", "moderator", "viewer"] as const) {
      const result = decideSolReadTool({ role, tool });
      assert.equal(result.allow, false);
      assert.equal(result.allow ? "" : result.code, "ROLE");
    }
  }
});
