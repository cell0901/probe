import assert from "node:assert/strict";
import process from "node:process";
import { test } from "node:test";
import { NextRequest } from "next/server.js";
import { GET as install } from "../app/api/install/route.ts";
import { GET as callback } from "../app/api/callback/route.ts";

const state = "a".repeat(64);
const token = "test-private-token";

function callbackRequest(query = `state=${state}&code=test-code`, cookie = state) {
  return new NextRequest(`https://probe.example/api/callback?${query}`, {
    headers: cookie ? { Cookie: `probe_oauth_state=${cookie}` } : {},
  });
}

function configure(t) {
  const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID = "test-client-id";
  process.env.GITHUB_CLIENT_SECRET = "test-client-secret";
  t.after(() => {
    for (const [name, value] of [
      ["NEXT_PUBLIC_GITHUB_CLIENT_ID", clientId],
      ["GITHUB_CLIENT_SECRET", clientSecret],
    ]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
}

function assertRedirect(response, path) {
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), `https://probe.example${path}`);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.match(response.headers.get("set-cookie"), /probe_oauth_state=;/);
  assert.match(response.headers.get("set-cookie"), /Max-Age=0/);
}

test("installation starts with fresh random state and a protected temporary cookie", async () => {
  const first = await install(new NextRequest("https://probe.example/api/install"));
  const second = await install(new NextRequest("https://probe.example/api/install"));
  const url = new URL(first.headers.get("location"));
  assert.equal(url.origin + url.pathname, "https://github.com/apps/probe-01/installations/new");
  const generated = url.searchParams.get("state");
  assert.match(generated, /^[a-f0-9]{64}$/);
  assert.notEqual(generated, new URL(second.headers.get("location")).searchParams.get("state"));
  assert.equal(first.cookies.get("probe_oauth_state").value, generated);
  const cookie = first.headers.get("set-cookie");
  for (const flag of [/HttpOnly/i, /Secure/i, /SameSite=Lax/i, /Max-Age=600/, /Path=\//]) {
    assert.match(cookie, flag);
  }
  assert.equal(first.headers.get("cache-control"), "no-store");
});

test("local HTTP setup can return the temporary cookie without HTTPS", async () => {
  const response = await install(new NextRequest("http://localhost:3000/api/install"));
  assert.doesNotMatch(response.headers.get("set-cookie"), /; Secure/i);
});

test("missing, malformed, mismatched, or expired state never calls GitHub", async t => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => assert.fail("Unexpected GitHub request"));
  for (const [query, cookie] of [
    ["code=test-code", state],
    [`state=${state}&code=test-code`, ""],
    [`state=${"b".repeat(64)}&code=test-code`, state],
    ["state=invalid&code=test-code", state],
    [`state=${state}&code=test-code`, "invalid"],
  ]) {
    assertRedirect(await callback(callbackRequest(query, cookie)), "/login?error=invalid_state");
  }
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("denied authorization and missing codes return clear errors without an exchange", async t => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => assert.fail("Unexpected GitHub request"));
  assertRedirect(await callback(callbackRequest(`state=${state}&error=access_denied`)), "/login?error=authorization_failed");
  assertRedirect(await callback(callbackRequest(`state=${state}`)), "/login?error=missing_code");
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("missing server credentials do not make an invalid token request", async t => {
  configure(t);
  delete process.env.GITHUB_CLIENT_SECRET;
  const fetchMock = t.mock.method(globalThis, "fetch", async () => assert.fail("Unexpected GitHub request"));
  assertRedirect(await callback(callbackRequest()), "/login?error=not_configured");
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("success keeps the token server-side and redirects to the setup guide", async t => {
  configure(t);
  const logs = ["log", "error", "warn"].map(method => t.mock.method(console, method, () => {}));
  const fetchMock = t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(options.cache, "no-store");
    assert.equal(options.redirect, "error");
    assert.ok(options.signal instanceof AbortSignal);
    if (url === "https://github.com/login/oauth/access_token") {
      assert.equal(options.method, "POST");
      assert.deepEqual(JSON.parse(options.body), {
        client_id: "test-client-id", client_secret: "test-client-secret", code: "test-code",
      });
      return Response.json({ access_token: token, refresh_token: "test-private-refresh" });
    }
    assert.equal(url, "https://api.github.com/user");
    assert.equal(options.headers.Authorization, `Bearer ${token}`);
    return Response.json({ id: 123, login: "octocat" });
  });
  const response = await callback(callbackRequest());
  assertRedirect(response, "/dashboard");
  assert.equal(fetchMock.mock.callCount(), 2);
  assert.doesNotMatch(JSON.stringify([...response.headers]), /test-private|test-client-secret|test-code/);
  assert.equal(await response.text(), "");
  for (const log of logs) assert.equal(log.mock.callCount(), 0);
});

test("failed exchanges, including HTTP 200 OAuth errors, never fetch a profile", async t => {
  configure(t);
  const responses = [
    () => Response.json({ error: "bad_verification_code" }),
    () => Response.json({ access_token: token }, { status: 401 }),
    () => Response.json({}),
    () => Response.json({ access_token: "" }),
    () => Response.json(null),
    () => new Response("not json", { status: 502 }),
  ];
  for (const response of responses) {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => response());
    assertRedirect(await callback(callbackRequest()), "/login?error=authorization_failed");
    assert.equal(fetchMock.mock.callCount(), 1);
    fetchMock.mock.restore();
  }
});

test("profile failures or malformed profiles do not complete onboarding", async t => {
  configure(t);
  for (const profile of [
    () => Response.json({ message: "Bad credentials" }, { status: 401 }),
    () => Response.json({ id: 123 }),
    () => Response.json({ id: -1, login: "octocat" }),
    () => Response.json(null),
    () => new Response("not json"),
  ]) {
    const fetchMock = t.mock.method(globalThis, "fetch", async url =>
      url === "https://github.com/login/oauth/access_token"
        ? Response.json({ access_token: token }) : profile());
    assertRedirect(await callback(callbackRequest()), "/login?error=authorization_failed");
    fetchMock.mock.restore();
  }
});

test("network errors do not expose tokens or exception details", async t => {
  configure(t);
  const log = t.mock.method(console, "error", () => {});
  t.mock.method(globalThis, "fetch", async () => { throw new Error(token); });
  const response = await callback(callbackRequest());
  assertRedirect(response, "/login?error=authorization_failed");
  assert.doesNotMatch(JSON.stringify([...response.headers]), /test-private-token/);
  assert.equal(log.mock.callCount(), 0);
});
