import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";

function request(host: string) {
  return new NextRequest("https://www.apostolicguide.com/pathways/jesus-is-god", {
    headers: {
      host,
      "x-forwarded-host": host
    }
  });
}

test("app host is crawlable but explicitly excluded from search indexing", async () => {
  const response = await proxy(request("app.apostolicguide.com"));
  assert.equal(response.headers.get("x-robots-tag"), "noindex, follow");
});

test("app host detection tolerates case and a forwarded port", async () => {
  const response = await proxy(request("APP.APOSTOLICGUIDE.COM:443"));
  assert.equal(response.headers.get("x-robots-tag"), "noindex, follow");
});

test("public website remains indexable", async () => {
  const response = await proxy(request("www.apostolicguide.com"));
  assert.equal(response.headers.get("x-robots-tag"), null);
});

test("apex and studio hosts are not accidentally noindexed by app isolation", async () => {
  const apex = await proxy(request("apostolicguide.com"));
  const studio = await proxy(request("studio.apostolicguide.com"));

  assert.equal(apex.headers.get("x-robots-tag"), null);
  assert.equal(studio.headers.get("x-robots-tag"), null);
});
