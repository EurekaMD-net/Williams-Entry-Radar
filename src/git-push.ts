/**
 * git-push.ts — Push weekly results CSV to GitHub
 *
 * Uses GitHub REST API directly (no local git needed).
 * Pattern: GET file SHA → PUT with new content (base64).
 * Safe for repeated runs — updates the file if it already exists.
 *
 * Env vars required:
 *   GH_TOKEN       — GitHub personal access token (repo scope)
 *   GH_REPO        — owner/repo  e.g. "EurekaMD-net/Williams-Entry-Radar"
 */

import fs from "fs";
import path from "path";

const GH_TOKEN = process.env.GH_TOKEN ?? "";
const GH_REPO = process.env.GH_REPO ?? "EurekaMD-net/Williams-Entry-Radar";
const API_BASE = "https://api.github.com";

interface GHFileResponse {
  sha: string;
  content: string;
}

/**
 * Push a local file to GitHub under the given repo path.
 * Creates or updates the file.
 */
export async function pushFileToGitHub(
  localPath: string,
  repoPath: string,
  commitMessage: string
): Promise<boolean> {
  if (!GH_TOKEN) {
    console.log("[git-push] GH_TOKEN not set — skipping GitHub push");
    return false;
  }

  const content = fs.readFileSync(localPath, "utf-8");
  const contentB64 = Buffer.from(content, "utf-8").toString("base64");

  const headers = {
    Authorization: `Bearer ${GH_TOKEN}`,
    "Content-Type": "application/json",
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "williams-entry-radar/1.0",
  };

  // GET current SHA (needed if file exists — otherwise create)
  let sha: string | undefined;
  try {
    const getRes = await fetch(`${API_BASE}/repos/${GH_REPO}/contents/${repoPath}`, { headers });
    if (getRes.ok) {
      const data = (await getRes.json()) as GHFileResponse;
      sha = data.sha;
    }
  } catch {
    // file doesn't exist yet — that's fine
  }

  const body: Record<string, unknown> = {
    message: commitMessage,
    content: contentB64,
    branch: "main",
  };
  if (sha) body.sha = sha;

  const putRes = await fetch(`${API_BASE}/repos/${GH_REPO}/contents/${repoPath}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(body),
  });

  if (!putRes.ok) {
    const err = await putRes.text();
    console.error(`[git-push] GitHub API error: ${putRes.status} — ${err}`);
    return false;
  }

  console.log(`[git-push] Pushed ${path.basename(localPath)} → ${GH_REPO}/${repoPath} ✓`);
  return true;
}

/**
 * Push weekly radar results CSV + signals log to GitHub.
 * Called at end of scheduler run.
 */
export async function pushWeeklyResults(
  csvPath: string,
  weekLabel: string,
  signalsMdPath?: string
): Promise<void> {
  const csvFilename = path.basename(csvPath);
  await pushFileToGitHub(
    csvPath,
    `results/${csvFilename}`,
    `radar: weekly results ${weekLabel}`
  );

  if (signalsMdPath && fs.existsSync(signalsMdPath)) {
    await pushFileToGitHub(
      signalsMdPath,
      "signals.md",
      `radar: update signals log ${weekLabel}`
    );
  }
}
