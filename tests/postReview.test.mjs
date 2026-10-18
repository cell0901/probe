import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { postReview } from "../lib/postReview.ts";
import { handleWebhook } from "../lib/webhook.ts";

const info = {
  owner: "octocat", repo: "demo", prNumber: 42, installionId: 123,
  prTitle: "Fix a bug", prAuthor: "contributor", prBody: "",
  headSha: "a".repeat(40),
};

const files = [{
  filename: "src/example.ts",
  patch: [
    "@@ -10,3 +10,4 @@",
    " context",
    "-old line",
    "+replacement",
    "+extra line",
    " last context",
    "@@ -30 +31 @@",
    "-old line",
    "+new line",
    "\\ No newline at end of file",
  ].join("\n"),
}];

function issue(line, file = "src/example.ts") {
  return { severity: "major", file, line, issue: `Issue at ${line}`, suggestion: "Fix it" };
}

function review(issues = []) {
  return { status: "COMMENT", summary: "Review summary", issues, improvements: [] };
}

function captureReview(t) {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push({ url, options, body: JSON.parse(options.body) });
    return Response.json({ id: 1 }, { status: 201 });
  });
  return requests;
}

test("posts on the supplied commit with a valid right-side comment and readable body", async t => {
  const requests = captureReview(t);
  await postReview("test-token", info, review([issue(11)]), files);
  assert.equal(requests.length, 1);
  const { url, options, body } = requests[0];
  assert.equal(url, "https://api.github.com/repos/octocat/demo/pulls/42/reviews");
  assert.equal(options.method, "POST");
  assert.equal(options.headers.Authorization, "Bearer test-token");
  assert.equal(body.commit_id, info.headSha);
  assert.equal(body.event, "COMMENT");
  assert.match(body.body, /Review summary/);
  assert.deepEqual(body.comments, [{
    path: "src/example.ts", line: 11, side: "RIGHT",
    body: "**MAJOR**: Issue at 11\n\n💡 **Suggestion**: Fix it",
  }]);
});

test("validates added and context lines across hunks using new-file line numbers", async t => {
  const requests = captureReview(t);
  await postReview("test-token", info,
    review([9, 10, 11, 12, 13, 14, 30, 31, 32].map(line => issue(line))), files);
  assert.deepEqual(requests[0].body.comments.map(comment => comment.line), [10, 11, 12, 13, 31]);
});

test("skips invalid paths and line numbers but keeps their issues in the summary", async t => {
  const requests = captureReview(t);
  const issues = [
    issue(11, "unknown.ts"), issue(11, "image.png"),
    issue(undefined), issue(null), issue("11"), issue(11.5),
    issue(0), issue(-1), issue(1000), issue(11),
  ];
  await postReview("test-token", info, review(issues), [...files, { filename: "image.png" }, null]);
  assert.deepEqual(requests[0].body.comments.map(comment => comment.line), [11]);
  for (const finding of issues) assert.ok(requests[0].body.body.includes(finding.issue));
});

test("limits comments to the first 20 valid locations after filtering", async t => {
  const requests = captureReview(t);
  const largeFile = [{
    filename: "src/example.ts",
    patch: "@@ -0,0 +1,25 @@\n" + Array.from({ length: 25 }, () => "+new line").join("\n"),
  }];
  const issues = [issue(1, "unknown.ts"), ...Array.from({ length: 25 }, (_, i) => issue(i + 1))];
  await postReview("test-token", info, review(issues), largeFile);
  assert.deepEqual(requests[0].body.comments.map(comment => comment.line),
    Array.from({ length: 20 }, (_, i) => i + 1));
  assert.ok(requests[0].body.body.includes("Issue at 25"));
});

test("posts a summary even when no inline location is safe", async t => {
  const requests = captureReview(t);
  const deletedFile = [{ filename: "removed.ts", patch: "@@ -1,2 +0,0 @@\n-old\n-old" }];
  const result = review([issue(1, "removed.ts")]);
  result.improvements.push({ file: "removed.ts", line: 1, suggestion: "Check the callers" });
  await postReview("test-token", info, result, deletedFile);
  assert.deepEqual(requests[0].body.comments, []);
  assert.match(requests[0].body.body, /Issue at 1/);
  assert.match(requests[0].body.body, /Check the callers/);
});

test("preserves the existing review event policy", async t => {
  const requests = captureReview(t);
  for (const status of ["APPROVE", "REQUEST_CHANGES", "COMMENT"]) {
    await postReview("test-token", info, { ...review(), status }, []);
  }
  assert.deepEqual(requests.map(request => request.body.event), ["APPROVE", "COMMENT", "COMMENT"]);
});

test("requires a commit SHA rather than silently posting on the latest commit", async t => {
  const requests = captureReview(t);
  await assert.rejects(postReview("test-token", { ...info, headSha: undefined }, review(), []),
    /without the commit SHA/);
  assert.equal(requests.length, 0);
});

test("GitHub rejections and network failures reject the posting operation", async t => {
  for (const status of [403, 422, 500]) {
    const fetchMock = t.mock.method(globalThis, "fetch", async () =>
      new Response("private upstream details", { status }));
    await assert.rejects(postReview("test-token", info, review(), files), {
      message: `Failed to post GitHub review (HTTP ${status})`,
    });
    assert.equal(fetchMock.mock.callCount(), 1);
    fetchMock.mock.restore();
  }
  t.mock.method(globalThis, "fetch", async () => { throw new Error("Network unavailable"); });
  await assert.rejects(postReview("test-token", info, review(), files), /Network unavailable/);
});

test("a rejected GitHub review reaches the webhook as a failure", async t => {
  t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 422 }));
  t.mock.method(console, "error", () => {});
  const secret = "test-secret";
  const body = JSON.stringify({
    action: "opened",
    repository: { name: info.repo, owner: { login: info.owner } },
    installation: { id: info.installionId },
    pull_request: {
      number: info.prNumber, title: info.prTitle, body: info.prBody,
      user: { login: info.prAuthor }, head: { sha: info.headSha },
    },
  });
  const req = new Request("http://localhost/api/webhook", {
    method: "POST", body,
    headers: {
      "x-github-event": "pull_request",
      "x-hub-signature-256": `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`,
    },
  });
  const response = await handleWebhook(req, secret,
    prInfo => postReview("test-token", prInfo, review(), files));
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Review failed" });
});
