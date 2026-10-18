import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server.js";

export async function GET(req: NextRequest) {
  const state = randomBytes(32).toString("hex");
  const url = new URL("https://github.com/apps/probe-01/installations/new");
  url.searchParams.set("state", state);

  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "no-store");
  response.cookies.set("probe_oauth_state", state, {
    httpOnly: true,
    secure: req.nextUrl.protocol === "https:",
    sameSite: "lax", // Allow the cookie when GitHub redirects back to Probe.
    path: "/",
    maxAge: 10 * 60,
  });
  return response;
}
