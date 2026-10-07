import { hasStudioPermission, type StudioRole, type StudioPermission } from "./studio-permissions";
import type { SolMode } from "./sol-operator-engine";

export type SolControlAction =
  | "chat" | "scan" | "settings" | "approve" | "dismiss"
  | "retry" | "cancel" | "agent_approval" | "stop";
export type SolPolicyCode = "ROLE" | "HARD_LOCK" | "SOL_STOPPED" | "SOL_PAUSED" | "MODE" | "CONFIRM_REQUIRED";
export type SolPolicyDecision = { allow: true } | { allow: false; code: SolPolicyCode; message: string };

const CONTROL_ROLES = new Set<StudioRole>(["owner", "admin"]);
const MUTATION_ROLES = new Set<StudioRole>(["owner", "admin", "editor"]);
const MODE_ORDER: Record<SolMode, number> = { watch: 0, assist: 1, trusted: 2 };

export function solKillSwitchEnabled(raw = process.env.SOL_KILL_SWITCH) {
  return /^(true|1|yes|on)$/i.test((raw ?? "").trim());
}

/** Used by UI, chat, cron and future MCP adapters. The server makes every decision. */
export function decideSolControl(input: {
  role: StudioRole | null;
  action: SolControlAction;
  enabled: boolean;
  mode: SolMode;
  killSwitch?: boolean;
  nextEnabled?: boolean;
  nextMode?: SolMode;
  acknowledged?: boolean;
  via?: "page" | "chat" | "cron" | "mcp";
}): SolPolicyDecision {
  const { role, action, enabled, mode } = input;
  const killed = input.killSwitch ?? solKillSwitchEnabled();
  const deny = (code: SolPolicyCode, message: string): SolPolicyDecision => ({ allow: false, code, message });
  const allow: SolPolicyDecision = { allow: true };

  if (!role) return deny("ROLE", "Your account cannot access Sol.");
  if (action === "chat") return allow;
  if (action === "stop") {
    return CONTROL_ROLES.has(role) ? allow : deny("ROLE", "Only an Owner or Admin can stop Sol.");
  }
  if (action === "settings") {
    if (!CONTROL_ROLES.has(role)) return deny("ROLE", "Only an Owner or Admin can change Sol settings.");
    const nextMode = input.nextMode ?? mode;
    const nextEnabled = input.nextEnabled ?? enabled;
    if (killed && nextEnabled) return deny("SOL_STOPPED", "Sol is stopped by the administrator. Turn off SOL_KILL_SWITCH before enabling execution.");
    if (input.via === "chat" || input.via === "mcp") {
      if (nextEnabled && !enabled) return deny("HARD_LOCK", "Enable Sol from its admin page, not from chat or MCP.");
      if (MODE_ORDER[nextMode] > MODE_ORDER[mode]) return deny("HARD_LOCK", "Raise Sol's mode from its admin page.");
    }
    if (nextMode === "trusted" && role !== "owner") return deny("ROLE", "Only the Owner may control Trusted mode.");
    if (nextMode === "trusted" && (mode !== "trusted" || (nextEnabled && !enabled))) {
      if (input.via !== "page" || input.acknowledged !== true) {
        return deny("CONFIRM_REQUIRED", "Trusted mode requires your explicit confirmation on the Sol page.");
      }
    }
    return allow;
  }
  if (action === "cancel") {
    return MUTATION_ROLES.has(role) ? allow : deny("ROLE", "You do not have permission to cancel Sol work.");
  }
  if (!MUTATION_ROLES.has(role)) return deny("ROLE", "Your role cannot change Sol work.");
  if (killed) return deny("SOL_STOPPED", "Sol is stopped by the administrator. Read-only chat remains available.");
  if (action === "scan" && !enabled) return deny("SOL_PAUSED", "Sol is paused. Use the read-only Studio overview instead.");
  if (action === "scan") return allow;
  if (!enabled) return deny("SOL_PAUSED", "Sol is paused. It can answer questions but cannot change work.");
  if (mode === "watch") return deny("MODE", "Watch mode only reads and proposes. Switch to Assist for approvals.");
  return allow;
}

export const SOL_HARD_LOCKED_ACTIONS = new Set([
  "publish_now", "send_dm", "send_email", "send_broadcast",
  "enroll_person", "activate_automation", "approve_narration",
  "edit_canonical_doctrine", "edit_canonical_pathway", "change_team_role",
  "change_channel_credentials", "mark_stale_as_current"
]);

export function decideSolHardLock(action: string): SolPolicyDecision {
  return SOL_HARD_LOCKED_ACTIONS.has(action)
    ? { allow: false, code: "HARD_LOCK", message: "Sol cannot perform that action in any mode." }
    : { allow: true };
}

/**
 * Read-only MCP v1: tool names and permissions are shared with Sol Core.
 * This function does not validate OAuth tokens: validate the token and
 * resolve the Studio role on the server before calling it.
 *
 * A paused Sol or an active kill switch must not prevent permitted reads.
 * Proposal and run details are Owner/Admin-only until a redacted per-role
 * representation exists (their inputs may contain sensitive contact data).
 */
export const SOL_MCP_READ_TOOLS = [
  "get_workspace_status",
  "get_content_inventory",
  "get_people_journey_status",
  "get_forge_status",
  "list_creative_projects",
  "list_proposals",
  "list_runs"
] as const;

export type SolMcpReadTool = (typeof SOL_MCP_READ_TOOLS)[number];

const SOL_MCP_READ_REQUIREMENTS: Record<SolMcpReadTool, readonly StudioPermission[]> = {
  get_workspace_status: ["view_workspace"],
  get_content_inventory: ["view_content"],
  get_people_journey_status: ["view_people", "view_journeys"],
  get_forge_status: ["view_content"],
  list_creative_projects: ["view_content"],
  list_proposals: ["view_workspace"],
  list_runs: ["view_workspace"]
};

export function decideSolReadTool(input: {
  role: StudioRole | null;
  tool: string;
}): SolPolicyDecision {
  if (!input.role) return { allow: false, code: "ROLE", message: "Sign in with a Studio account to read Sol data." };
  if (!Object.prototype.hasOwnProperty.call(SOL_MCP_READ_REQUIREMENTS, input.tool)) {
    return { allow: false, code: "HARD_LOCK", message: "This MCP tool is not on the read-only allowlist." };
  }
  const name = input.tool as SolMcpReadTool;
  if ((name === "list_proposals" || name === "list_runs") && !CONTROL_ROLES.has(input.role)) {
    return { allow: false, code: "ROLE", message: "Only an Owner or Admin can read unredacted Sol work details." };
  }
  if (!SOL_MCP_READ_REQUIREMENTS[name].every(permission => hasStudioPermission(input.role, permission))) {
    return { allow: false, code: "ROLE", message: "Your Studio role cannot read this information." };
  }
  return { allow: true };
}
