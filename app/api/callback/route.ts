import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server.js";

function redirect(req: NextRequest, path: string) {
  const response = NextResponse.redirect(new URL(path, req.url));
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  // Clear the temporary cookie on both success and failure.
  response.cookies.set("probe_oauth_state", "", {
    httpOnly: true,
    secure: req.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const state = params.get("state") ?? "";
  const expectedState = req.cookies.get("probe_oauth_state")?.value ?? "";

  // Check state before exchanging a code or trusting any callback parameters.
  if (
    !/^[a-f0-9]{64}$/.test(state) ||
    !/^[a-f0-9]{64}$/.test(expectedState) ||
    !timingSafeEqual(Buffer.from(state), Buffer.from(expectedState))
  ) {
    return redirect(req, "/login?error=invalid_state");
  }

  if (params.has("error")) {
    return redirect(req, "/login?error=authorization_failed");
  }
  const code = params.get("code");
  if (!code) {
    return redirect(req, "/login?error=missing_code");
  }

  const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return redirect(req, "/login?error=not_configured");
  }

  try {
    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    const data: unknown = await response.json();
    // GitHub can return an OAuth error even with HTTP 200.
    if (!response.ok || !isObject(data) || data.error ||
        typeof data.access_token !== "string" || !data.access_token) {
      return redirect(req, "/login?error=authorization_failed");
    }

    // Use the token only on the server. Do not log it or put it in a cookie/URL.
    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${data.access_token}`,
        Accept: "application/vnd.github+json",
      },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    const user: unknown = await userResponse.json();
    if (!userResponse.ok || !isObject(user) ||
        typeof user.id !== "number" || !Number.isSafeInteger(user.id) || user.id <= 0 ||
        typeof user.login !== "string" || !user.login) {
      return redirect(req, "/login?error=authorization_failed");
    }

    // The bot uses installation tokens for reviews; no user token is retained.
    return redirect(req, "/dashboard");
  } catch {
    return redirect(req, "/login?error=authorization_failed");
  }
}
