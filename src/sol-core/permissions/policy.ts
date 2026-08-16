import type { SolEnvironment, SolMode, SolPermission } from "../types/runtime";

export type SolPermissionDecision = "allow" | "approval_required" | "deny";

const SENSITIVE = new Set<SolPermission>(["publish", "deploy", "delete", "financial", "security"]);

export function evaluateSolPermission(input: {
  mode: SolMode;
  permission: SolPermission;
  environment: SolEnvironment;
  workflowAllowlisted?: boolean;
}): SolPermissionDecision {
  const { mode, permission, workflowAllowlisted = false } = input;

  if (mode === "watch") return permission === "read" ? "allow" : "deny";
  if (SENSITIVE.has(permission)) return "approval_required";

  if (mode === "assist") {
    if (permission === "read") return "allow";
    return "approval_required";
  }

  if (permission === "read") return "allow";
  return workflowAllowlisted ? "allow" : "approval_required";
}

export function environmentAllowsTool(toolEnvironments: SolEnvironment[], requested: SolEnvironment) {
  return toolEnvironments.includes(requested);
}
