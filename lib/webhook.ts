import { createHmac, timingSafeEqual } from "node:crypto";
import type { PRinfo } from "./reviewer";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

// Only pass the fields we have checked to the reviewer.
function getPRInfo(data: Record<string, unknown>): PRinfo | null {
  const repo = data.repository;
  const pr = data.pull_request;
  const installation = data.installation;

  if (
    !isObject(repo) || !isObject(repo.owner) ||
    !isObject(pr) || !isObject(pr.user) || !isObject(pr.head) ||
    !isObject(installation) ||
    typeof repo.owner.login !== "string" || !repo.owner.login ||
    typeof repo.name !== "string" || !repo.name ||
    !isPositiveInteger(pr.number) || !isPositiveInteger(installation.id) ||
    typeof pr.title !== "string" ||
    typeof pr.user.login !== "string" || !pr.user.login ||
    typeof pr.head.sha !== "string" || !/^[a-f0-9]{40}$/i.test(pr.head.sha) ||
    (pr.body !== null && pr.body !== undefined && typeof pr.body !== "string")
  ) {
    return null;
  }

  return {
    owner: repo.owner.login,
    repo: repo.name,
    prNumber: pr.number,
    installionId: installation.id,
    prTitle: pr.title,
    prAuthor: pr.user.login,
    prBody: pr.body ?? "",
    headSha: pr.head.sha,
  };
}

export async function handleWebhook(
  req: Request,
  secret: string | undefined,
  reviewPR: (info: PRinfo) => Promise<void>,
) {
  if (!secret) {
    console.error("GITHUB_WEBHOOK_SECRET is not configured");
    return Response.json({ error: "Webhook is not configured" }, { status: 500 });
  }

  // Verify the original bytes before parsing JSON.
  const body = Buffer.from(await req.arrayBuffer());
  const signature = req.headers.get("x-hub-signature-256");
  if (!signature || !/^sha256=[a-f0-9]{64}$/i.test(signature)) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  const expected = createHmac("sha256", secret).update(body).digest();
  const received = Buffer.from(signature.slice(7), "hex");
  if (!timingSafeEqual(expected, received)) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  if (req.headers.get("x-github-event") !== "pull_request") {
    return Response.json({ received: true, ignored: true });
  }

  let data: unknown;
  try {
    data = JSON.parse(body.toString("utf8"));
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!isObject(data) || typeof data.action !== "string") {
    return Response.json({ error: "Invalid webhook payload" }, { status: 400 });
  }
  if (data.action !== "opened" && data.action !== "synchronize") {
    return Response.json({ received: true, ignored: true });
  }

  const info = getPRInfo(data);
  if (!info) {
    return Response.json({ error: "Invalid pull request payload" }, { status: 400 });
  }

  try {
    await reviewPR(info);
    return Response.json({ received: true });
  } catch {
    // Do not log payloads, source code, or tokens.
    console.error("Pull request review failed", {
      repository: `${info.owner}/${info.repo}`,
      prNumber: info.prNumber,
    });
    return Response.json({ error: "Review failed" }, { status: 500 });
  }
}
