import assert from "node:assert/strict";
import test from "node:test";
import { appPayloadSchemas } from "../src/app-content-contracts";
import { pathwayAppPayload } from "../src/app-content-sources";
import { allPathways } from "../src/pathway-catalog";

test("all 20 live Pathways produce valid App Content pathway payloads", () => {
  assert.equal(allPathways.length, 20);
  const ids = new Set<string>();

  for (const pathway of allPathways) {
    const payload = pathwayAppPayload(pathway);
    const parsed = appPayloadSchemas.pathway.safeParse(payload);
    assert.equal(parsed.success, true, parsed.success ? undefined : `${pathway.title}: ${parsed.error.message}`);
    assert.equal(payload.id, pathway.slug);
    assert.equal(payload.slug, pathway.slug);
    assert.equal(payload.title, pathway.title);
    assert.equal(payload.steps.length, pathway.steps.length);
    assert.ok(payload.steps.every((step, index) => step.order === index + 1));
    assert.equal(ids.has(payload.id), false, `Duplicate app pathway id: ${payload.id}`);
    ids.add(payload.id);
  }
});

test("canonical App Content pathway payloads preserve the live teaching order", () => {
  const jesusIsGod = allPathways.find((pathway) => pathway.slug === "jesus-is-god");
  assert.ok(jesusIsGod);
  const payload = pathwayAppPayload(jesusIsGod);
  assert.deepEqual(payload.steps.map((step) => step.heading), jesusIsGod.steps.map((step) => step.title));
  assert.deepEqual(payload.steps.map((step) => step.explanation), jesusIsGod.steps.map((step) => step.explanation));
});
