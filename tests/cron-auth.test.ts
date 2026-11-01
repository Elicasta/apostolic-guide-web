import assert from "node:assert/strict";
import test from "node:test";
import { cronRequestAuthorized } from "../src/cron-auth";

const SECRET = "cron-secret-value";

function withSecret(fn: () => void) {
  const previous = process.env.CRON_SECRET;
  process.env.CRON_SECRET = SECRET;
  try {
    fn();
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  }
}

test("scheduled workers authorize only the exact bearer secret", () => {
  withSecret(() => {
    const allowed = new Request("https://www.apostolicguide.com/api/cron/publishing", {
      headers: { authorization: `Bearer ${SECRET}` }
    });
    const sameLength = new Request("https://www.apostolicguide.com/api/cron/publishing", {
      headers: { authorization: "Bearer wrong-secret-valu" }
    });
    const missing = new Request("https://www.apostolicguide.com/api/cron/publishing");
    const prefix = new Request("https://www.apostolicguide.com/api/cron/publishing", {
      headers: { authorization: `Bearer ${SECRET}-extra` }
    });

    assert.equal(cronRequestAuthorized(allowed), true);
    assert.equal(cronRequestAuthorized(sameLength), false);
    assert.equal(cronRequestAuthorized(missing), false);
    assert.equal(cronRequestAuthorized(prefix), false);
  });
});

test("cron authorization fails closed when the secret is not configured", () => {
  const previous = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  try {
    const request = new Request("https://www.apostolicguide.com/api/cron/publishing", {
      headers: { authorization: "Bearer anything" }
    });
    assert.equal(cronRequestAuthorized(request), false);
  } finally {
    if (previous === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previous;
  }
});
