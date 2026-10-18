import { GoogleGenAI } from "@google/genai";
import type { PRinfo } from "./reviewer";
import type { Review } from "./postReview";

interface ReviewFile {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  patch?: string;
  fullContent: string;
}

export async function getLLMReview(files: (ReviewFile | null)[], prInfo: PRinfo): Promise<Review> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");

  const reviewPrompt = `You are an expert senior-level code reviewer. Review the following Pull Request in depth.

**Title**: ${prInfo.prTitle}
**Description**: ${prInfo.prBody || 'No description provided'}
**Author**: ${prInfo.prAuthor}

## Files Changed

${files.filter(file => file !== null).map(f => `
### File: \`${f.filename}\` (${f.status})
**Changes**: +${f.additions} / -${f.deletions}

**Diff**:
\`\`\`diff
${f.patch || 'No diff available'}
\`\`\`

**Full Content**:
\`\`\`
${f.fullContent}
\`\`\`
`).join('\n---\n')}

## What you must provide

1. **Summary (≤ 100 words)**  
   - Concisely describe what changed.  
   - Mention modifications to exported function signatures, public APIs, global variables, or anything affecting external behavior.

2. **Overall Assessment**  
   - Code quality, architecture, readability, maintainability.

3. **Issues Found**  
   - List problems with severity (\`critical\`, \`major\`, \`minor\`).  
   - Include file + line number.  
   - Be specific and actionable.

4. **Suggestions for Improvement**  
   - Better approaches, refactoring ideas, naming improvements, missing tests, etc.

## Response Format (JSON)

\`\`\`json
{
  "status": "APPROVE" | "REQUEST_CHANGES" | "COMMENT",
  "summary": "≤ 100-word summary of changes",
  "issues": [
    {
      "severity": "critical" | "major" | "minor",
      "file": "filename",
      "line": 10,
      "issue": "description",
      "suggestion": "how to fix"
    }
  ],
  "improvements": [
    {
      "file": "filename",
      "line": 10,
      "suggestion": "better approach"
    }
  ]
}
\`\`\`

Line numbers must be positive integers. Omit line when no precise location is available.
IMPORTANT: Respond with ONLY the JSON object. No explanations, no markdown, no preamble.`;

  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: reviewPrompt,
    config: { responseMimeType: "application/json" },
  });

  const finishReason = response.candidates?.[0]?.finishReason;
  if (finishReason && finishReason !== "STOP") {
    throw new Error("Gemini did not finish the review");
  }

  // Let API and validation errors reach the webhook; never return a partial review.
  return parseReview(response.text);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasValidLocation(value: Record<string, unknown>) {
  return isText(value.file) && (value.line === undefined ||
    (typeof value.line === "number" && Number.isSafeInteger(value.line) && value.line > 0));
}

function isReview(value: unknown): value is Review {
  return isObject(value) &&
    typeof value.status === "string" &&
    ["APPROVE", "REQUEST_CHANGES", "COMMENT"].includes(value.status) &&
    isText(value.summary) &&
    Array.isArray(value.issues) && value.issues.every(issue =>
      isObject(issue) && hasValidLocation(issue) &&
      typeof issue.severity === "string" &&
      ["critical", "major", "minor"].includes(issue.severity) &&
      isText(issue.issue) && isText(issue.suggestion)) &&
    Array.isArray(value.improvements) && value.improvements.every(improvement =>
      isObject(improvement) && hasValidLocation(improvement) && isText(improvement.suggestion));
}

export function parseReview(text: string | undefined): Review {
  if (!isText(text)) throw new Error("Gemini returned an empty review");

  // Remove only an outer code fence; preserve backticks inside suggestions.
  const cleaned = text.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, "$1");
  let review: unknown;
  try {
    review = JSON.parse(cleaned);
  } catch {
    throw new Error("Gemini returned invalid JSON");
  }

  if (!isReview(review)) throw new Error("Gemini returned an invalid review structure");
  return review;
}
