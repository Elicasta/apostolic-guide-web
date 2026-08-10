export type StudioRole = "owner" | "admin" | "editor" | "moderator" | "viewer";
export type StudioPermission =
  | "view_workspace"
  | "view_people"
  | "manage_people"
  | "view_inbox"
  | "manage_inbox"
  | "view_journeys"
  | "manage_journeys"
  | "view_segments"
  | "manage_segments"
  | "view_content"
  | "manage_content"
  | "view_distribution"
  | "manage_distribution"
  | "view_analytics"
  | "view_notifications"
  | "view_health"
  | "manage_integrations"
  | "manage_team";

export const STUDIO_ROLE_LABELS: Record<StudioRole, string> = {
  owner: "Owner", admin: "Admin", editor: "Editor", moderator: "Moderator", viewer: "Viewer"
};

export const STUDIO_ROLE_DESCRIPTIONS: Record<StudioRole, string> = {
  owner: "Full control, including team roles and integrations.",
  admin: "Full day-to-day administration, including team management.",
  editor: "Publish and manage website/app content and distribution.",
  moderator: "Manage people, Inbox follow-up, segments, and journeys.",
  viewer: "Read-only access to workspace, people, and analytics."
};

const ROLE_PERMISSIONS: Record<StudioRole, StudioPermission[]> = {
  owner: ["view_workspace","view_people","manage_people","view_inbox","manage_inbox","view_journeys","manage_journeys","view_segments","manage_segments","view_content","manage_content","view_distribution","manage_distribution","view_analytics","view_notifications","view_health","manage_integrations","manage_team"],
  admin: ["view_workspace","view_people","manage_people","view_inbox","manage_inbox","view_journeys","manage_journeys","view_segments","manage_segments","view_content","manage_content","view_distribution","manage_distribution","view_analytics","view_notifications","view_health","manage_integrations","manage_team"],
  editor: ["view_workspace","view_people","view_segments","view_content","manage_content","view_distribution","manage_distribution","view_analytics","view_notifications"],
  moderator: ["view_workspace","view_people","manage_people","view_inbox","manage_inbox","view_journeys","manage_journeys","view_segments","manage_segments","view_analytics","view_notifications"],
  viewer: ["view_workspace","view_people","view_segments","view_content","view_distribution","view_analytics","view_notifications"]
};

export function permissionsForRole(role: StudioRole) { return ROLE_PERMISSIONS[role]; }
export function hasStudioPermission(role: StudioRole | null | undefined, permission: StudioPermission) { return Boolean(role && ROLE_PERMISSIONS[role]?.includes(permission)); }
export function normalizeStudioRole(value: unknown): StudioRole | null { return ["owner","admin","editor","moderator","viewer"].includes(String(value)) ? String(value) as StudioRole : null; }
