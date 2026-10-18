import { reivewerPr } from "@/lib/reviewer";
import { handleWebhook } from "@/lib/webhook";

export async function POST(req: Request) {
  return handleWebhook(req, process.env.GITHUB_WEBHOOK_SECRET, reivewerPr);
}
