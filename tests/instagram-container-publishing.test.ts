import assert from "node:assert/strict";
import test from "node:test";
import { publishReadyInstagramContainer } from "../src/instagram-container-publishing";

const api = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json" }
});

function fixture(statuses: Array<string | undefined>, publishResponses: Array<Response | Error> = [api({ id: "post-1" })]) {
  let polls = 0, publishes = 0, checkpoints = 0;
  const actions: string[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/media_publish")) {
      publishes += 1;
      actions.push("publish");
      const response = publishResponses.shift() ?? api({ id: "post-1" });
      if (response instanceof Error) throw response;
      return response;
    }
    assert.equal(init?.method, undefined);
    polls += 1;
    return api({ status_code: statuses.shift() });
  }) as typeof fetch;
  const options = {
    base: "https://graph.instagram.com/v24.0",
    userId: "account-1",
    containerId: "container-1",
    accessToken: "test-token",
    deadlineAt: Date.now() + 100_000,
    fetcher,
    sleep: async () => {},
    beforePublish: async () => { checkpoints += 1; actions.push("checkpoint"); },
    afterPublish: async () => { actions.push("ack"); },
    maxChecks: 5
  };
  return { options, metrics: () => ({ polls, publishes, checkpoints, actions }) };
}

test("missing status is never mistaken for FINISHED; polls until explicitly ready", async () => {
  const f = fixture([undefined, "IN_PROGRESS", "FINISHED"]);
  assert.equal(await publishReadyInstagramContainer(f.options), "post-1");
  assert.deepEqual(f.metrics(), { polls: 3, publishes: 1, checkpoints: 1, actions: ["checkpoint", "publish", "ack"] });
});

test("processing ERROR and EXPIRED stop before any publish", async () => {
  for (const status of ["ERROR", "EXPIRED"]) {
    const f = fixture([status]);
    await assert.rejects(publishReadyInstagramContainer(f.options), new RegExp(status));
    assert.equal(f.metrics().publishes, 0);
  }
});

test("IN_PROGRESS timeout never publishes", async () => {
  const f = fixture(Array(6).fill("IN_PROGRESS"));
  await assert.rejects(publishReadyInstagramContainer(f.options), /did not reach FINISHED/);
  assert.equal(f.metrics().publishes, 0);
  assert.equal(f.metrics().checkpoints, 0);
});

test("PUBLISHED container stops to avoid duplicate posts", async () => {
  const f = fixture(["PUBLISHED"]);
  await assert.rejects(publishReadyInstagramContainer(f.options), /already PUBLISHED/);
  assert.equal(f.metrics().publishes, 0);
});

test("definite Meta not-ready rejection checks same container and retries", async () => {
  const f = fixture(["FINISHED", "IN_PROGRESS", "FINISHED"], [
    api({ error: { message: "Media ID is not available", code: 9007, error_subcode: 2207027 } }, 400),
    api({ id: "post-2" })
  ]);
  assert.equal(await publishReadyInstagramContainer(f.options), "post-2");
  assert.equal(f.metrics().publishes, 2);
  assert.equal(f.metrics().checkpoints, 1);
  assert.deepEqual(f.metrics().actions, ["checkpoint", "publish", "publish", "ack"]);
});

test("unknown publish outcome never retries, including network failure or missing media ID", async () => {
  for (const response of [new Error("network timeout"), api({}), api({ error: { message: "Rate limit", code: 4 } }, 429)]) {
    const f = fixture(["FINISHED"], [response]);
    await assert.rejects(publishReadyInstagramContainer(f.options));
    assert.equal(f.metrics().publishes, 1);
    assert.equal(f.metrics().checkpoints, 1);
  }
});

test("failed durable checkpoint blocks first external publish", async () => {
  const f = fixture(["FINISHED"]);
  await assert.rejects(publishReadyInstagramContainer({
    ...f.options, beforePublish: async () => { throw new Error("DB offline"); }
  }), /DB offline/);
  assert.equal(f.metrics().publishes, 0);
});

test("failed acknowledgment persistence does not issue another publish", async () => {
  const f = fixture(["FINISHED"]);
  await assert.rejects(publishReadyInstagramContainer({
    ...f.options, afterPublish: async () => { throw new Error("DB offline"); }
  }), /DB offline/);
  assert.equal(f.metrics().publishes, 1);
});
