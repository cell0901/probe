import type { PRinfo } from "./reviewer";

interface ReviewIssue {
  severity: "critical" | "major" | "minor";
  file: string;
  line?: number;
  issue: string;
  suggestion: string;
}

export interface Review {
  status: "APPROVE" | "REQUEST_CHANGES" | "COMMENT";
  summary: string;
  issues: ReviewIssue[];
  improvements: { file: string; line?: number; suggestion: string }[];
}

interface FileDiff {
  filename: string;
  patch?: string;
}

// GitHub's RIGHT side uses new-file line numbers, including context lines.
function getCommentableLines(patch = "") {
  const lines = new Set<number>();
  let newLine = 0;
  let remainingLines = 0;

  for (const line of patch.split("\n")) {
    const hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (hunk) {
      newLine = Number(hunk[1]);
      remainingLines = Number(hunk[2] ?? 1);
    } else if (remainingLines > 0 && (line.startsWith("+") || line.startsWith(" "))) {
      lines.add(newLine);
      newLine++;
      remainingLines--;
    }
    // Deleted lines and "No newline at end of file" markers do not advance newLine.
  }

  return lines;
}

export async function postReview(
  token: string,
  info: PRinfo,
  review: Review,
  files: readonly (FileDiff | null)[],
  coverageNotes: readonly string[] = [],
) {
  if (!info.headSha) {
    throw new Error("Cannot post a review without the commit SHA");
  }

  const commentableLines = new Map<string, Set<number>>();
  for (const file of files) {
    if (file) commentableLines.set(file.filename, getCommentableLines(file.patch));
  }

  const comments = review.issues
    .filter(issue => typeof issue.line === "number" &&
      Number.isSafeInteger(issue.line) && issue.line > 0 &&
      commentableLines.get(issue.file)?.has(issue.line))
    .slice(0, 20)
    .map(issue => ({
      path: issue.file,
      line: issue.line,
      side: "RIGHT",
      body: `**${issue.severity.toUpperCase()}**: ${issue.issue}\n\n💡 **Suggestion**: ${issue.suggestion}`,
    }));

  // Keep every issue in the summary, even when it has no valid inline location.
  const body = `## 🤖 AI Code Review

${review.summary}
${coverageNotes.length > 0 ? `
### Review coverage
This is a partial review. Some files or full-file context were omitted:
${coverageNotes.slice(0, 20).map(note => `- ${note.slice(0, 300)}`).join('\n')}
${coverageNotes.length > 20 ? `- ${coverageNotes.length - 20} more coverage notes omitted.` : ''}
` : ''}

${review.issues.length > 0 ? `
### ⚠️ Issues Found
${review.issues.map(issue =>
  `- **[${issue.severity}]** \`${issue.file}${issue.line ? ':' + issue.line : ''}\` - ${issue.issue}`
).join('\n')}
` : ''}

${review.improvements.length > 0 ? `
### 💡 Suggestions
${review.improvements.map(improvement =>
  `- \`${improvement.file}${improvement.line ? ':' + improvement.line : ''}\` - ${improvement.suggestion}`
).join('\n')}
` : ''}
`;

  const response = await fetch(
    `https://api.github.com/repos/${info.owner}/${info.repo}/pulls/${info.prNumber}/reviews`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        body,
        commit_id: info.headSha,
        event: review.status === "APPROVE" && coverageNotes.length === 0 ? "APPROVE" : "COMMENT",
        comments,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to post GitHub review (HTTP ${response.status})`);
  }
}
