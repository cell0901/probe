import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import process from "node:process";
import { test } from "node:test";
import { getLLMReview, parseReview } from "../lib/getLLMReview.ts";
import { postReview } from "../lib/postReview.ts";
import { handleWebhook } from "../lib/webhook.ts";

const validReview = {
  status: "COMMENT",
  summary: "The PR fixes a bug.",
  issues: [{
    severity: "major", file: "example.ts", line: 10,
    issue: "Missing null check", suggestion: "Check the value before reading it.",
  }],
  improvements: [{ file: "example.ts", line: 11, suggestion: "Add a regression test." }],
};

const info = {
  owner: "octocat", repo: "demo", prNumber: 42, installionId: 123,
  prTitle: "Fix a bug", prAuthor: "contributor", prBody: "", headSha: "a".repeat(40),
};

function configure(t) {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-gemini-key";
  t.after(() => {
    if (previous === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previous;
  });
}

function geminiResponse(text, finishReason = "STOP") {
  return Response.json({
    candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason }],
  });
}

test("accepts valid reviews and each supported status and severity", () => {
  for (const status of ["APPROVE", "REQUEST_CHANGES", "COMMENT"]) {
    for (const severity of ["critical", "major", "minor"]) {
      const review = { ...validReview, status, issues: [{ ...validReview.issues[0], severity }] };
      assert.deepEqual(parseReview(JSON.stringify(review)), review);
    }
  }
  assert.deepEqual(parseReview(JSON.stringify({ ...validReview, issues: [], improvements: [] })),
    { ...validReview, issues: [], improvements: [] });
});

test("accepts missing optional line numbers for summary-only feedback", () => {
  const review = structuredClone(validReview);
  delete review.issues[0].line;
  delete review.improvements[0].line;
  assert.deepEqual(parseReview(JSON.stringify(review)), review);
});

test("removes only outer JSON fences and preserves code inside suggestions", () => {
  const review = structuredClone(validReview);
  review.issues[0].suggestion = "Use this:\n```ts\nif (value) return value;\n```";
  for (const language of ["json", ""]) {
    assert.deepEqual(parseReview(`  \n\`\`\`${language}\n${JSON.stringify(review)}\n\`\`\`\n `), review);
  }
});

test("rejects empty, malformed, truncated, or explanatory responses without leaking text", () => {
  for (const text of [undefined, null, "", " \n "]) {
    assert.throws(() => parseReview(text), { message: "Gemini returned an empty review" });
  }
  for (const text of ["private source code", '{"status":"COMMENT"', `Here is the review: ${JSON.stringify(validReview)}`]) {
    assert.throws(() => parseReview(text), { message: "Gemini returned invalid JSON" });
  }
});

test("rejects wrong root types, missing fields, invalid enums, and non-array collections", () => {
  const invalid = [null, [], "review", 123, {},
    { ...validReview, status: "UNKNOWN" }, { ...validReview, status: ["APPROVE"] },
    { ...validReview, summary: " " }, { ...validReview, summary: 123 },
    { ...validReview, issues: null }, { ...validReview, issues: {} },
    { ...validReview, improvements: null }, { ...validReview, improvements: {} },
  ];
  for (const field of ["status", "summary", "issues", "improvements"]) {
    const review = structuredClone(validReview);
    delete review[field];
    invalid.push(review);
  }
  for (const review of invalid) {
    assert.throws(() => parseReview(JSON.stringify(review)), /invalid review structure/);
  }
});

test("validates every issue and improvement, including optional line numbers", () => {
  for (const collection of ["issues", "improvements"]) {
    const original = validReview[collection][0];
    const invalid = [null, [], "finding",
      { ...original, file: " " }, { ...original, file: 123 },
      { ...original, suggestion: "" }, { ...original, suggestion: {} },
      ...[null, "10", 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1].map(line => ({ ...original, line })),
    ];
    for (const field of ["file", "suggestion", ...(collection === "issues" ? ["severity", "issue"] : [])]) {
      const item = { ...original };
      delete item[field];
      invalid.push(item);
    }
    if (collection === "issues") {
      invalid.push({ ...original, severity: "high" }, { ...original, severity: ["major"] },
        { ...original, severity: 123 }, { ...original, issue: " " }, { ...original, issue: 123 });
    }
    for (const item of invalid) {
      // A bad later entry must not be hidden behind a valid first entry.
      const review = { ...validReview, [collection]: [original, item] };
      assert.throws(() => parseReview(JSON.stringify(review)), /invalid review structure/);
    }
  }
});

test("requests JSON output and returns a validated review without logging it", async t => {
  configure(t);
  const logs = ["log", "error", "warn"].map(method => t.mock.method(console, method, () => {}));
  const fetchMock = t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.match(String(url), /^https:\/\/generativelanguage\.googleapis\.com\//);
    const body = JSON.parse(options.body);
    assert.equal(body.generationConfig.responseMimeType, "application/json");
    return geminiResponse(JSON.stringify(validReview));
  });
  assert.deepEqual(await getLLMReview([], info), validReview);
  assert.equal(fetchMock.mock.callCount(), 1);
  for (const log of logs) assert.equal(log.mock.callCount(), 0);
});

test("rejects missing configuration before calling Gemini", async t => {
  configure(t);
  delete process.env.GEMINI_API_KEY;
  const fetchMock = t.mock.method(globalThis, "fetch", async () => assert.fail("Unexpected API request"));
  await assert.rejects(getLLMReview([], info), /GEMINI_API_KEY is not configured/);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("API errors propagate instead of returning undefined", async t => {
  configure(t);
  t.mock.method(globalThis, "fetch", async () => Response.json({
    error: { code: 400, message: "Invalid API request", status: "INVALID_ARGUMENT" },
  }, { status: 400 }));
  await assert.rejects(getLLMReview([], info), /Invalid API request/);
});

test("rejects incomplete, blocked, and empty responses", async t => {
  configure(t);
  for (const reason of ["MAX_TOKENS", "SAFETY"]) {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => geminiResponse(JSON.stringify(validReview), reason));
    await assert.rejects(getLLMReview([], info), /did not finish the review/);
    fetchMock.mock.restore();
  }
  t.mock.method(globalThis, "fetch", async () => Response.json({ candidates: [] }));
  await assert.rejects(getLLMReview([], info), /empty review/);
});

test("invalid Gemini output fails the webhook before any GitHub review is posted", async t => {
  configure(t);
  t.mock.method(console, "error", () => {});
  const fetchMock = t.mock.method(globalThis, "fetch", async url => {
    assert.match(String(url), /^https:\/\/generativelanguage\.googleapis\.com\//);
    return geminiResponse(JSON.stringify({ ...validReview, issues: null }));
  });
  const secret = "test-secret";
  const body = JSON.stringify({
    action: "opened", repository: { name: info.repo, owner: { login: info.owner } },
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
  const response = await handleWebhook(req, secret, async prInfo => {
    const review = await getLLMReview([], prInfo);
    await postReview("test-token", prInfo, review, []);
  });
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Review failed" });
  assert.equal(fetchMock.mock.callCount(), 1);
});
