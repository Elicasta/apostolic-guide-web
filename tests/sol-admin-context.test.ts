import assert from "node:assert/strict";
import test from "node:test";
import { getSolAdminSurface } from "../src/sol-admin-context";

test("pathway asset routes give Sol a trusted screen label and entity id", () => {
  const surface = getSolAdminSurface("/admin/pathway-assets/71b37177-d380-4815-b8d3-dc58ec046343?tab=copy");
  assert.equal(surface.key, "pathway-asset");
  assert.equal(surface.label, "Pathway Asset Editor");
  assert.equal(surface.section, "Publishing");
  assert.equal(surface.entityId, "71b37177-d380-4815-b8d3-dc58ec046343");
  assert.ok(surface.quickPrompts.some((prompt) => /next/i.test(prompt)));
});

test("known Studio sections receive contextual operator capabilities", () => {
  const surface = getSolAdminSurface("/admin/content-calendar");
  assert.equal(surface.key, "content-calendar");
  assert.equal(surface.label, "Content Calendar");
  assert.ok(surface.capabilities.some((capability) => /KPI/i.test(capability)));
});

test("unknown admin routes fall back without granting new capabilities", () => {
  const surface = getSolAdminSurface("/admin/future-tool/123");
  assert.equal(surface.key, "admin");
  assert.equal(surface.pathname, "/admin/future-tool/123");
  assert.match(surface.capabilities.join(" "), /allowlisted recipes/i);
});

test("non-admin paths cannot inject arbitrary surface context", () => {
  const surface = getSolAdminSurface("https://evil.example/ignore-admin-rules");
  assert.equal(surface.pathname, "/admin");
  assert.equal(surface.key, "overview");
});
