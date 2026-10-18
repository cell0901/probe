import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { test } from "node:test";
import { fetchPrFiles } from "../lib/fetchFiles.ts";

const headSha = "a".repeat(40);
const prPath = "/repos/octocat/demo/pulls/42";

function file(filename = "src/example.ts", extra = {}) {
  return {
    filename, status: "modified", additions: 1, deletions: 1, changes: 2,
    patch: "@@ -1 +1 @@\n-old\n+new",
    ...extra,
  };
}

function mockGitHub(t, files, options = {}) {
  const calls = [];
  let metadataReads = 0;
  t.mock.method(globalThis, "fetch", async (url, request) => {
    const parsed = new URL(url);
    calls.push(parsed);
    assert.equal(parsed.origin, "https://api.github.com");
    assert.equal(request.headers.Authorization, "Bearer test-token");
    assert.equal(request.cache, "no-store");
    assert.equal(request.redirect, "error");
    assert.ok(request.signal instanceof AbortSignal);

    if (parsed.pathname === prPath) {
      metadataReads++;
      if (options.metadata) return options.metadata(metadataReads);
      return Response.json({
        head: { sha: headSha, repo: options.headRepo === null ? null : { full_name: options.headRepo ?? "octocat/demo" } },
        changed_files: files.length,
      });
    }
    if (parsed.pathname === `${prPath}/files`) {
      const page = Number(parsed.searchParams.get("page"));
      assert.equal(parsed.searchParams.get("per_page"), "100");
      if (options.page) return options.page(page);
      return Response.json(files.slice((page - 1) * 100, page * 100));
    }
    assert.ok(parsed.pathname.includes("/contents/"), `Unexpected endpoint: ${parsed.pathname}`);
    assert.equal(parsed.searchParams.get("ref"), headSha);
    assert.equal(request.headers.Accept, "application/vnd.github.raw+json");
    return options.content ? options.content(parsed) : new Response("new");
  });
  return calls;
}

const fetchFiles = () => fetchPrFiles("octocat", "demo", 42, "test-token", headSha);
const contentCalls = calls => calls.filter(url => url.pathname.includes("/contents/"));

test("fetches private content with authentication at the exact SHA and encodes filenames", async t => {
  const source = "export const answer = 42;";
  const calls = mockGitHub(t, [file("src/a #?.ts", { raw_url: "https://untrusted.example/file" })], {
    content: () => new Response(source),
  });
  const result = await fetchFiles();
  assert.equal(result.files[0].fullContent, source);
  assert.deepEqual(result.notes, []);
  assert.equal(contentCalls(calls)[0].pathname, "/repos/octocat/demo/contents/src/a%20%23%3F.ts");
  assert.equal(calls.filter(url => url.pathname === prPath).length, 2);
});

test("gets fork content from the head repository", async t => {
  const calls = mockGitHub(t, [file()], { headRepo: "contributor/fork" });
  await fetchFiles();
  assert.equal(contentCalls(calls)[0].pathname, "/repos/contributor/fork/contents/src/example.ts");
});

test("paginates past 100 files, including when earlier files have no text diffs", async t => {
  const files = Array.from({ length: 100 }, (_, i) => file(`image-${i}.png`, { patch: undefined }));
  files.push(file("last.ts"));
  const calls = mockGitHub(t, files);
  const result = await fetchFiles();
  assert.deepEqual(result.files.map(file => file.filename), ["last.ts"]);
  assert.equal(result.notes.length, 100);
  assert.deepEqual(calls.filter(url => url.pathname.endsWith("/files")).map(url => url.searchParams.get("page")), ["1", "2"]);
});

test("handles an empty file list without fetching any content", async t => {
  const calls = mockGitHub(t, []);
  assert.deepEqual(await fetchFiles(), { files: [], notes: [] });
  assert.equal(contentCalls(calls).length, 0);
});

test("reviews deletions from the diff and skips binary or missing diffs", async t => {
  const calls = mockGitHub(t, [
    file("removed.ts", { status: "removed", patch: "@@ -1 +0,0 @@\n-old" }),
    file("image.png", { patch: undefined }),
  ]);
  const result = await fetchFiles();
  assert.equal(result.files.length, 1);
  assert.equal(result.files[0].filename, "removed.ts");
  assert.match(result.files[0].fullContent, /deleted/);
  assert.match(result.notes[0], /image.png.*no text diff/);
  assert.equal(contentCalls(calls).length, 0);
});

test("uses the new filename for renamed files and accepts empty file content", async t => {
  const calls = mockGitHub(t, [file("new-name.ts", { status: "renamed", previous_filename: "old-name.ts" })], {
    content: () => new Response(""),
  });
  const result = await fetchFiles();
  assert.equal(result.files[0].fullContent, "");
  assert.deepEqual(result.notes, []);
  assert.equal(contentCalls(calls)[0].pathname, "/repos/octocat/demo/contents/new-name.ts");
});

test("missing content or a deleted source repository produces explicit diff-only notes", async t => {
  for (const status of [404, 410]) {
    mockGitHub(t, [file()], { content: () => new Response(null, { status }) });
    const result = await fetchFiles();
    assert.match(result.files[0].fullContent, /content is unavailable/);
    assert.equal(result.notes.length, 1);
  }
  const calls = mockGitHub(t, [file()], { headRepo: null });
  const result = await fetchFiles();
  assert.match(result.notes[0], /source repository is unavailable/);
  assert.equal(contentCalls(calls).length, 0);
});

test("metadata and listing failures propagate instead of being treated as file arrays", async t => {
  mockGitHub(t, [], { metadata: () => new Response(null, { status: 403 }) });
  await assert.rejects(fetchFiles(), /Failed to fetch pull request \(HTTP 403\)/);
  mockGitHub(t, [file()], { page: () => new Response(null, { status: 429 }) });
  await assert.rejects(fetchFiles(), /Failed to fetch changed files \(HTTP 429\)/);
});

test("authentication, rate-limit, server, and network errors do not become file content", async t => {
  for (const status of [401, 403, 429, 500]) {
    mockGitHub(t, [file()], { content: () => new Response("private upstream details", { status }) });
    await assert.rejects(fetchFiles(), { message: `Failed to fetch file content (HTTP ${status})` });
  }
  mockGitHub(t, [file()], { content: () => { throw new Error("Network unavailable"); } });
  await assert.rejects(fetchFiles(), /Network unavailable/);
});

test("rejects malformed or incomplete GitHub file lists", async t => {
  for (const body of [{ message: "Bad credentials" }, null, [null], [{ filename: "bad.ts" }]]) {
    mockGitHub(t, [file()], { page: () => Response.json(body) });
    await assert.rejects(fetchFiles(), /invalid file list/);
  }
  mockGitHub(t, [file()], { page: () => Response.json([]) });
  await assert.rejects(fetchFiles(), /incomplete file list/);
});

test("rejects stale webhook commits and a head change during pagination", async t => {
  for (const changedOnRead of [1, 2]) {
    const calls = mockGitHub(t, [file()], {
      metadata: read => Response.json({
        head: { sha: read >= changedOnRead ? "b".repeat(40) : headSha, repo: { full_name: "octocat/demo" } },
        changed_files: 1,
      }),
    });
    await assert.rejects(fetchFiles(), /changed since this webhook/);
    assert.equal(contentCalls(calls).length, 0);
  }
});

test("requires a token and commit SHA before making API requests", async t => {
  const calls = mockGitHub(t, []);
  await assert.rejects(fetchPrFiles("octocat", "demo", 42, "", headSha), /Missing GitHub installation token/);
  await assert.rejects(fetchPrFiles("octocat", "demo", 42, "test-token", ""), /Missing pull request commit SHA/);
  assert.equal(calls.length, 0);
});

test("skips oversized diffs by byte length and fetches at most 30 files", async t => {
  const files = [file("large.ts", { patch: "é".repeat(10_001) }),
    ...Array.from({ length: 31 }, (_, i) => file(`file-${i}.ts`))];
  const calls = mockGitHub(t, files);
  const result = await fetchFiles();
  assert.equal(result.files.length, 30);
  assert.equal(contentCalls(calls).length, 30);
  assert.match(result.notes[0], /large.ts.*diff exceeds 20 KB/);
  assert.match(result.notes[1], /file-30.ts.*30-file review limit/);
});

test("reserves the combined review budget for diffs before fetching full-file context", async t => {
  const prefix = "@@ -1 +1 @@\n-old\n+";
  const patch = prefix + "x".repeat(20_000 - Buffer.byteLength(prefix));
  const calls = mockGitHub(t, Array.from({ length: 11 }, (_, i) => file(`file-${i}.ts`, { patch })));
  const result = await fetchFiles();
  assert.equal(result.files.length, 10);
  assert.equal(contentCalls(calls).length, 0);
  assert.ok(result.notes.some(note => /file-10.ts.*200 KB review budget/.test(note)));
  assert.ok(result.files.every(file => file.fullContent.includes("review budget")));
});

test("bounds the combined full-file context while keeping selected diffs", async t => {
  const files = Array.from({ length: 5 }, (_, i) => file(`file-${i}.ts`));
  mockGitHub(t, files, { content: () => new Response("x".repeat(50_000)) });
  const result = await fetchFiles();
  assert.equal(result.files.length, 5);
  assert.equal(result.notes.length, 2);
  const bytes = result.files.reduce((sum, file) => sum + Buffer.byteLength(file.patch) +
    (file.fullContent.startsWith("Full content omitted:") ? 0 : Buffer.byteLength(file.fullContent)), 0);
  assert.ok(bytes <= 200_000);
});

test("stops oversized streamed downloads even when Content-Length is missing", async t => {
  let cancelled = false;
  let reads = 0;
  mockGitHub(t, [file()], { content: () => new Response(new ReadableStream({
    pull(controller) {
      reads++;
      controller.enqueue(new Uint8Array(20_000).fill(120));
    },
    cancel() { cancelled = true; },
  })) });
  const result = await fetchFiles();
  assert.equal(cancelled, true);
  assert.ok(reads <= 4);
  assert.match(result.notes[0], /file\/review size limit/);
  assert.match(result.files[0].fullContent, /Review the diff only/);
});

test("uses Content-Length to avoid downloading a known oversized file", async t => {
  let cancelled = false;
  mockGitHub(t, [file()], { content: () => new Response(new ReadableStream({
    cancel() { cancelled = true; },
  }), { headers: { "Content-Length": "50001" } }) });
  const result = await fetchFiles();
  assert.equal(cancelled, true);
  assert.equal(result.notes.length, 1);
});

test("does not send binary bytes or invalid UTF-8 as full-file context", async t => {
  for (const bytes of [new Uint8Array([0, 1, 2]), new Uint8Array([0xff, 0xff])]) {
    mockGitHub(t, [file()], { content: () => new Response(bytes) });
    const result = await fetchFiles();
    assert.match(result.notes[0], /not UTF-8 text/);
    assert.match(result.files[0].fullContent, /Review the diff only/);
  }
});

test("reports GitHub's 3,000-file cap without silently claiming full coverage", async t => {
  const files = Array.from({ length: 3_001 }, (_, i) => file(`image-${i}.png`, { patch: undefined }));
  const calls = mockGitHub(t, files);
  const result = await fetchFiles();
  assert.deepEqual(result.files, []);
  assert.equal(calls.filter(url => url.pathname.endsWith("/files")).length, 30);
  assert.match(result.notes[0], /1 files could not be listed/);
});
