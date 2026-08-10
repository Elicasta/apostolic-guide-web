import assert from "node:assert/strict";
import test from "node:test";
import { hasStudioPermission, permissionsForRole } from "../src/studio-permissions";

test("owner and admin can manage the workspace", () => {
  for (const role of ["owner", "admin"] as const) {
    assert.equal(hasStudioPermission(role, "manage_team"), true);
    assert.equal(hasStudioPermission(role, "manage_integrations"), true);
    assert.equal(hasStudioPermission(role, "manage_content"), true);
    assert.equal(hasStudioPermission(role, "manage_inbox"), true);
  }
});

test("editor can publish and distribute but cannot read private Inbox or manage team", () => {
  assert.equal(hasStudioPermission("editor", "manage_content"), true);
  assert.equal(hasStudioPermission("editor", "manage_distribution"), true);
  assert.equal(hasStudioPermission("editor", "view_inbox"), false);
  assert.equal(hasStudioPermission("editor", "manage_team"), false);
});

test("moderator owns relationship operations without publishing access", () => {
  assert.equal(hasStudioPermission("moderator", "manage_people"), true);
  assert.equal(hasStudioPermission("moderator", "manage_inbox"), true);
  assert.equal(hasStudioPermission("moderator", "manage_journeys"), true);
  assert.equal(hasStudioPermission("moderator", "manage_content"), false);
  assert.equal(hasStudioPermission("moderator", "manage_distribution"), false);
});

test("viewer permissions remain read only", () => {
  const permissions = permissionsForRole("viewer");
  assert.equal(permissions.some((permission) => permission.startsWith("manage_")), false);
  assert.equal(hasStudioPermission("viewer", "view_people"), true);
  assert.equal(hasStudioPermission("viewer", "view_analytics"), true);
});
