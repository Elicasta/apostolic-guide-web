import assert from "node:assert/strict";
import test from "node:test";
import { currentRenderSet, nextAvailablePublishingSlot } from "../src/creative-publishing";

test("next available slot respects browser timezone offset", () => {
  const now = new Date("2026-08-16T14:00:00.000Z"); // 10:00 AM at UTC-4, getTimezoneOffset = 240
  const next = nextAvailablePublishingSlot({ now, timezoneOffsetMinutes: 240, occupiedIso: [] });
  assert.equal(next, "2026-08-16T17:00:00.000Z"); // 1:00 PM local
});

test("next available slot skips an occupied publishing slot", () => {
  const now = new Date("2026-08-16T14:00:00.000Z");
  const next = nextAvailablePublishingSlot({
    now,
    timezoneOffsetMinutes: 240,
    occupiedIso: ["2026-08-16T17:00:00.000Z"]
  });
  assert.equal(next, "2026-08-16T22:30:00.000Z");
});

test("current render set never substitutes stale Creative Project renders", () => {
  const links = [
    { frame_id: "a", sort_order: 0, created_at: "2026-08-16T10:00:00Z", asset: { public_url: "https://blob/a-old.png", metadata: { projectStateVersion: 2 } } },
    { frame_id: "a", sort_order: 0, created_at: "2026-08-16T11:00:00Z", asset: { public_url: "https://blob/a.png", metadata: { projectStateVersion: 3 } } },
    { frame_id: "b", sort_order: 1, created_at: "2026-08-16T11:00:00Z", asset: { public_url: "https://blob/b.png", metadata: { projectStateVersion: 3 } } }
  ];
  const current = currentRenderSet(links, 3, 2);
  assert.equal(current.length, 2);
  assert.equal(current[0].asset?.public_url, "https://blob/a.png");
});

test("current render set fails closed when one frame is missing", () => {
  const links = [
    { frame_id: "a", sort_order: 0, created_at: "2026-08-16T11:00:00Z", asset: { public_url: "https://blob/a.png", metadata: { projectStateVersion: 4 } } }
  ];
  assert.deepEqual(currentRenderSet(links, 4, 2), []);
});
