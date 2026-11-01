import assert from "node:assert/strict";
import test from "node:test";
import {
  LOCKED_PERMISSIONS_POLICY,
  MEDIA_CAPTURE_PERMISSIONS_POLICY,
  permissionsPolicyForPaths
} from "../src/security-headers";

test("public pages keep camera and microphone disabled", () => {
  for (const path of ["/", "/pathways/god-is-one", "/admin", "/studio", "/output/session", "/guest"]) {
    assert.equal(permissionsPolicyForPaths([path]), LOCKED_PERMISSIONS_POLICY);
  }
});

test("studio live and guest routes can capture camera and microphone", () => {
  for (const path of [
    "/studio/sessions/session-1",
    "/sessions/session-1",
    "/guest/invite-token"
  ]) {
    assert.equal(permissionsPolicyForPaths([path]), MEDIA_CAPTURE_PERMISSIONS_POLICY);
  }
});

test("a studio-host rewrite still allows capture when only the public path needs it", () => {
  assert.equal(
    permissionsPolicyForPaths(["/sessions/session-1", "/studio/sessions/session-1"]),
    MEDIA_CAPTURE_PERMISSIONS_POLICY
  );
  assert.equal(permissionsPolicyForPaths(["/", null]), LOCKED_PERMISSIONS_POLICY);
});
