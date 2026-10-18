const GITHUB_API_URL = "https://api.github.com";
const PAGE_SIZE = 100;
const MAX_LISTED_FILES = 3_000; // GitHub's limit for the PR files endpoint.
const MAX_REVIEW_FILES = 30;
const MAX_DIFF_BYTES = 20_000;
const MAX_FILE_BYTES = 50_000;
const MAX_REVIEW_BYTES = 200_000;

interface GitHubFile {
  filename: string;
  status: string;
  patch?: string;
  additions: number;
  deletions: number;
  changes: number;
}

interface GitHubPullRequest {
  head: { sha: string; repo: { full_name: string } | null };
  changed_files: number;
}

export interface ReviewFile extends GitHubFile {
  fullContent: string;
}

export interface FetchedFiles {
  files: ReviewFile[];
  notes: string[];
}

interface FileContent {
  fullContent: string;
  bytes: number;
  note?: string;
}

function githubRequest(url: string, token: string, accept = "application/vnd.github+json") {
  return fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: accept },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
}

async function getPullRequest(url: string, token: string, headSha: string) {
  const response = await githubRequest(url, token);
  if (!response.ok) {
    throw new Error(`Failed to fetch pull request (HTTP ${response.status})`);
  }

  const pr: GitHubPullRequest = await response.json();
  if (pr?.head?.sha !== headSha) {
    throw new Error("Pull request changed since this webhook was sent");
  }
  if (!Number.isSafeInteger(pr.changed_files) || pr.changed_files < 0) {
    throw new Error("GitHub returned an invalid changed-file count");
  }
  return pr;
}

function isGitHubFile(value: unknown): value is GitHubFile {
  if (typeof value !== "object" || value === null) return false;
  const file = value as Record<string, unknown>;
  return typeof file.filename === "string" && file.filename.length > 0 &&
    typeof file.status === "string" &&
    (file.patch === undefined || typeof file.patch === "string") &&
    [file.additions, file.deletions, file.changes].every(count =>
      typeof count === "number" && Number.isSafeInteger(count) && count >= 0);
}

async function listChangedFiles(prUrl: string, token: string) {
  const files: GitHubFile[] = [];
  for (let page = 1; page <= MAX_LISTED_FILES / PAGE_SIZE; page++) {
    const response = await githubRequest(`${prUrl}/files?per_page=${PAGE_SIZE}&page=${page}`, token);
    if (!response.ok) {
      throw new Error(`Failed to fetch changed files (HTTP ${response.status})`);
    }

    const pageFiles: unknown = await response.json();
    if (!Array.isArray(pageFiles) || pageFiles.length > PAGE_SIZE || !pageFiles.every(isGitHubFile)) {
      throw new Error("GitHub returned an invalid file list");
    }
    files.push(...pageFiles);
    if (pageFiles.length < PAGE_SIZE) break;
  }
  return files;
}

// Stop downloading as soon as the limit is reached, even without Content-Length.
async function readLimitedText(response: Response, limit: number): Promise<string | null> {
  if (Number(response.headers.get("content-length")) > limit) {
    await response.body?.cancel();
    return null;
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const content = Buffer.concat(chunks);
  // A text diff normally means text content, but don't send binary bytes to Gemini.
  if (content.includes(0)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(content);
  } catch {
    return null;
  }
}

function diffOnly(reason: string): FileContent {
  const note = `Full content omitted: ${reason}. Review the diff only.`;
  return { fullContent: note, bytes: 0, note };
}

async function fetchFileContent(
  file: GitHubFile,
  headRepoPath: string | undefined,
  headSha: string,
  token: string,
  limit: number,
): Promise<FileContent> {
  if (file.status === "removed") {
    return { fullContent: "File was deleted; review the diff only.", bytes: 0 };
  }
  if (!headRepoPath) return diffOnly("the source repository is unavailable");
  if (limit === 0) return diffOnly("the review budget was reached");

  const filePath = file.filename.split("/").map(encodeURIComponent).join("/");
  const url = `${GITHUB_API_URL}/repos/${headRepoPath}/contents/${filePath}?ref=${encodeURIComponent(headSha)}`;
  const response = await githubRequest(url, token, "application/vnd.github.raw+json");
  if (response.status === 404 || response.status === 410) {
    await response.body?.cancel();
    return diffOnly("content is unavailable at this commit");
  }
  if (!response.ok) {
    throw new Error(`Failed to fetch file content (HTTP ${response.status})`);
  }

  const content = await readLimitedText(response, limit);
  if (content === null) {
    return diffOnly("content is not UTF-8 text or exceeds the file/review size limit");
  }
  return { fullContent: content, bytes: Buffer.byteLength(content, "utf8") };
}

export async function fetchPrFiles(
  owner: string,
  repo: string,
  prNumber: number,
  token: string,
  headSha: string,
): Promise<FetchedFiles> {
  if (!token) throw new Error("Missing GitHub installation token");
  if (!headSha) throw new Error("Missing pull request commit SHA");

  const repoPath = `${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const prUrl = `${GITHUB_API_URL}/repos/${repoPath}/pulls/${prNumber}`;
  const pr = await getPullRequest(prUrl, token, headSha);
  const changedFiles = await listChangedFiles(prUrl, token);

  // The files endpoint follows the current PR head, so check it again after pagination.
  await getPullRequest(prUrl, token, headSha);
  if (changedFiles.length !== Math.min(pr.changed_files, MAX_LISTED_FILES)) {
    throw new Error("GitHub returned an incomplete file list");
  }

  const files: ReviewFile[] = [];
  const selectedFiles: GitHubFile[] = [];
  const notes: string[] = [];
  let reviewBytes = 0;
  if (pr.changed_files > MAX_LISTED_FILES) {
    notes.push(`${pr.changed_files - MAX_LISTED_FILES} files could not be listed because of GitHub's 3,000-file limit.`);
  }

  // Fork PRs need content from the source repository, pinned to the webhook's SHA.
  const headRepo = pr.head.repo?.full_name;
  const headRepoPath = headRepo?.split("/").map(encodeURIComponent).join("/");

  for (const file of changedFiles) {
    if (!file.patch) {
      notes.push(`${file.filename}: skipped because no text diff is available (binary or omitted by GitHub).`);
      continue;
    }
    if (selectedFiles.length >= MAX_REVIEW_FILES) {
      notes.push(`${file.filename}: skipped because the ${MAX_REVIEW_FILES}-file review limit was reached.`);
      continue;
    }

    const diffBytes = Buffer.byteLength(file.patch, "utf8");
    if (diffBytes > MAX_DIFF_BYTES) {
      notes.push(`${file.filename}: skipped because its diff exceeds ${MAX_DIFF_BYTES / 1_000} KB.`);
      continue;
    }
    if (reviewBytes + diffBytes > MAX_REVIEW_BYTES) {
      notes.push(`${file.filename}: skipped because the ${MAX_REVIEW_BYTES / 1_000} KB review budget was reached.`);
      continue;
    }
    reviewBytes += diffBytes;
    selectedFiles.push(file);
  }

  // Reserve space for all selected diffs before spending the rest on full-file context.
  for (const file of selectedFiles) {
    const contentLimit = Math.min(MAX_FILE_BYTES, MAX_REVIEW_BYTES - reviewBytes);
    const content = await fetchFileContent(file, headRepoPath, headSha, token, contentLimit);
    files.push({ ...file, fullContent: content.fullContent });
    reviewBytes += content.bytes;
    if (content.note) notes.push(`${file.filename}: ${content.note}`);
  }

  return { files, notes };
}
