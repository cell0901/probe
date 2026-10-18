import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { handleWebhook } from "../lib/webhook.ts";

const secret = "test-webhook-secret";
const payload = {
  action: "opened",
  repository: { name: "demo", owner: { login: "octocat" } },
  installation: { id: 123 },
  pull_request: {
    number: 42,
    title: "Fix a bug 🐛",
    body: null,
    user: { login: "contributor" },
    head: { sha: "a".repeat(40) },
  },
};

function request(body = JSON.stringify(payload), overrides = {}) {
  return new Request("http://localhost/api/webhook", {
    method: "POST",
    body,
    headers: {
      "x-github-event": "pull_request",
      "x-hub-signature-256": `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`,
      ...overrides,
    },
  });
}

const mustNotReview = async () => assert.fail("Reviewer must not be called");

test("accepts GitHub's documented signature test vector", async () => {
  const req = request("Hello, World!", {
    "x-github-event": "ping",
    "x-hub-signature-256": "sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17",
  });
  const res = await handleWebhook(req, "It's a Secret to Everybody", mustNotReview);
  assert.equal(res.status, 200);
});

test("rejects missing, malformed, forged, and tampered signatures", async () => {
  for (const signature of ["", "sha256=abc", `sha256=${"0".repeat(64)}`, `sha256=${"z".repeat(64)}`]) {
    const res = await handleWebhook(request(undefined, {
      "x-hub-signature-256": signature,
    }), secret, mustNotReview);
    assert.equal(res.status, 401);
  }
  const req = request();
  const tampered = new Request(req.url, {
    method: "POST",
    headers: req.headers,
    body: JSON.stringify({ ...payload, action: "synchronize" }),
  });
  assert.equal((await handleWebhook(tampered, secret, mustNotReview)).status, 401);
});

test("fails closed when the webhook secret is missing", async () => {
  assert.equal((await handleWebhook(request(), undefined, mustNotReview)).status, 500);
});

test("ignores unrelated events and unsupported PR actions", async () => {
  for (const event of ["ping", "issues", "push"]) {
    const res = await handleWebhook(request(undefined, { "x-github-event": event }), secret, mustNotReview);
    assert.deepEqual(await res.json(), { received: true, ignored: true });
  }
  const res = await handleWebhook(request(JSON.stringify({ action: "closed" })), secret, mustNotReview);
  assert.deepEqual(await res.json(), { received: true, ignored: true });
});

test("rejects invalid JSON and incomplete or wrongly typed payloads", async () => {
  const invalid = [
    "{",
    "null",
    "[]",
    "{}",
    JSON.stringify({ action: "opened" }),
    JSON.stringify({ ...payload, repository: null }),
    JSON.stringify({ ...payload, installation: { id: "123" } }),
    JSON.stringify({ ...payload, pull_request: { ...payload.pull_request, number: -1 } }),
    JSON.stringify({ ...payload, pull_request: { ...payload.pull_request, body: {} } }),
    JSON.stringify({ ...payload, pull_request: { ...payload.pull_request, head: { sha: "invalid" } } }),
  ];
  for (const body of invalid) {
    assert.equal((await handleWebhook(request(body), secret, mustNotReview)).status, 400);
  }
});

test("reviews opened and synchronize events with normalized PR details", async () => {
  for (const action of ["opened", "synchronize"]) {
    const calls = [];
    const res = await handleWebhook(request(JSON.stringify({ ...payload, action })), secret, async info => {
      calls.push(info);
    });
    assert.equal(res.status, 200);
    assert.deepEqual(calls, [{
      owner: "octocat",
      repo: "demo",
      prNumber: 42,
      installionId: 123,
      prTitle: "Fix a bug 🐛",
      prAuthor: "contributor",
      prBody: "",
      headSha: "a".repeat(40),
    }]);
  }
});

test("returns a failure without exposing internal error details", async () => {
  const res = await handleWebhook(request(), secret, async () => {
    throw new Error("private error detail");
  });
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: "Review failed" });
});
