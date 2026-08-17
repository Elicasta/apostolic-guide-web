import assert from "node:assert/strict";
import test from "node:test";
import { currentRenderSet } from "../src/creative-publishing";

function link(input: {
  frame: string;
  order: number;
  version: number;
  created: string;
  url?: string;
}) {
  return {
    frame_id: input.frame,
    sort_order: input.order,
    created_at: input.created,
    asset: {
      public_url: input.url ?? `https://example.test/${input.frame}-${input.version}.png`,
      metadata: { projectStateVersion: input.version }
    }
  };
}

test("currentRenderSet restores the complete saved render set and prefers the newest duplicate per frame", () => {
  const renders = currentRenderSet([
    link({ frame: "slide-1", order: 0, version: 7, created: "2026-08-17T20:00:00.000Z", url: "https://example.test/old-slide-1.png" }),
    link({ frame: "slide-1", order: 0, version: 7, created: "2026-08-17T20:01:00.000Z", url: "https://example.test/new-slide-1.png" }),
    link({ frame: "slide-2", order: 1, version: 7, created: "2026-08-17T20:00:30.000Z" }),
    link({ frame: "slide-1", order: 0, version: 6, created: "2026-08-17T19:59:00.000Z", url: "https://example.test/stale-slide-1.png" })
  ], 7, 2);

  assert.equal(renders.length, 2);
  assert.equal(renders[0]?.asset?.public_url, "https://example.test/new-slide-1.png");
  assert.equal(renders[1]?.frame_id, "slide-2");
});

test("currentRenderSet refuses an incomplete or stale render set", () => {
  assert.deepEqual(currentRenderSet([
    link({ frame: "slide-1", order: 0, version: 4, created: "2026-08-17T20:00:00.000Z" }),
    link({ frame: "slide-2", order: 1, version: 3, created: "2026-08-17T20:00:00.000Z" })
  ], 4, 2), []);
});
