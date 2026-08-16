import { z } from "zod";
import type { SolTool } from "../types";

function token() {
  return process.env.SOL_GITHUB_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim() || "";
}

function headers(write = false) {
  const value: Record<string, string> = { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "SOL-Runtime/1.0" };
  const auth = token();
  if (auth) value.authorization = `Bearer ${auth}`;
  if (write && !auth) throw new Error("SOL_GITHUB_TOKEN or GITHUB_TOKEN is required for GitHub mutations.");
  return value;
}

function repoParts(repo: string) {
  const match = repo.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (!match) throw new Error("Repository must be owner/name.");
  return { owner: match[1], name: match[2] };
}

async function githubJson(url: string, init: RequestInit = {}, write = false) {
  const response = await fetch(url, { ...init, headers: { ...headers(write), ...(init.headers || {}) }, cache: "no-store" });
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof data.message === "string" ? `GitHub: ${data.message}` : `GitHub request failed (${response.status}).`);
  return data;
}

const readInput = z.object({ repo: z.string(), path: z.string().min(1).max(1000), ref: z.string().max(200).optional() });
const readOutput = z.object({ repo: z.string(), path: z.string(), ref: z.string().nullable(), sha: z.string(), content: z.string(), size: z.number().int().nonnegative() });
export const solGithubReadTool: SolTool<z.infer<typeof readInput>, z.infer<typeof readOutput>> = {
  name: "github.read", description: "Read a UTF-8 file from a GitHub repository.", inputSchema: readInput, outputSchema: readOutput,
  permissions: ["read"], supportedEnvironments: ["local","development","preview","production"], idempotency: "not_required",
  async execute(input) {
    try {
      const { owner, name } = repoParts(input.repo);
      const suffix = input.ref ? `?ref=${encodeURIComponent(input.ref)}` : "";
      const data = await githubJson(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/contents/${input.path.split("/").map(encodeURIComponent).join("/")}${suffix}`);
      if (data.type !== "file" || typeof data.content !== "string") throw new Error("GitHub path is not a file.");
      const content = Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf8");
      return { ok: true, data: { repo: input.repo, path: input.path, ref: input.ref ?? null, sha: String(data.sha || ""), content, size: Number(data.size) || Buffer.byteLength(content) } };
    } catch (error) {
      return { ok: false, error: { code: "GITHUB_READ_FAILED", message: error instanceof Error ? error.message : "GitHub read failed.", retryable: false } };
    }
  }
};

const branchInput = z.object({ repo: z.string(), branch: z.string().regex(/^[A-Za-z0-9._\/-]+$/), from: z.string().max(200).default("main") });
const branchOutput = z.object({ repo: z.string(), branch: z.string(), sha: z.string(), reused: z.boolean() });
export const solGithubBranchTool: SolTool<z.infer<typeof branchInput>, z.infer<typeof branchOutput>> = {
  name: "github.branch", description: "Create or reuse a GitHub branch from an existing ref.", inputSchema: branchInput, outputSchema: branchOutput,
  permissions: ["write"], supportedEnvironments: ["development","preview","production"], idempotency: "required",
  async execute(input) {
    try {
      const { owner, name } = repoParts(input.repo);
      const base = await githubJson(`https://api.github.com/repos/${owner}/${name}/git/ref/heads/${encodeURIComponent(input.from)}`);
      const sha = String((base.object as Record<string, unknown> | undefined)?.sha || "");
      if (!sha) throw new Error(`Unable to resolve base ref ${input.from}.`);
      const existing = await fetch(`https://api.github.com/repos/${owner}/${name}/git/ref/heads/${encodeURIComponent(input.branch)}`, { headers: headers(), cache: "no-store" });
      if (existing.ok) return { ok: true, data: { repo: input.repo, branch: input.branch, sha, reused: true } };
      const created = await githubJson(`https://api.github.com/repos/${owner}/${name}/git/refs`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ref: `refs/heads/${input.branch}`, sha }) }, true);
      return { ok: true, data: { repo: input.repo, branch: input.branch, sha: String((created.object as Record<string, unknown> | undefined)?.sha || sha), reused: false } };
    } catch (error) {
      return { ok: false, error: { code: "GITHUB_BRANCH_FAILED", message: error instanceof Error ? error.message : "GitHub branch failed.", retryable: false } };
    }
  }
};

const commitInput = z.object({ repo: z.string(), branch: z.string(), path: z.string().min(1).max(1000), content: z.string().max(5_000_000), message: z.string().min(1).max(500), expectedSha: z.string().optional() });
const commitOutput = z.object({ repo: z.string(), branch: z.string(), path: z.string(), commitSha: z.string(), contentSha: z.string() });
export const solGithubCommitTool: SolTool<z.infer<typeof commitInput>, z.infer<typeof commitOutput>> = {
  name: "github.commit", description: "Create or update one UTF-8 repository file on an existing branch.", inputSchema: commitInput, outputSchema: commitOutput,
  permissions: ["write"], supportedEnvironments: ["development","preview","production"], idempotency: "required",
  async execute(input) {
    try {
      const { owner, name } = repoParts(input.repo);
      let sha = input.expectedSha;
      if (!sha) {
        const current = await fetch(`https://api.github.com/repos/${owner}/${name}/contents/${input.path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(input.branch)}`, { headers: headers(), cache: "no-store" });
        if (current.ok) {
          const data = await current.json() as Record<string, unknown>;
          sha = typeof data.sha === "string" ? data.sha : undefined;
        }
      }
      const data = await githubJson(`https://api.github.com/repos/${owner}/${name}/contents/${input.path.split("/").map(encodeURIComponent).join("/")}`, {
        method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: input.message, content: Buffer.from(input.content, "utf8").toString("base64"), branch: input.branch, ...(sha ? { sha } : {}) })
      }, true);
      return { ok: true, data: { repo: input.repo, branch: input.branch, path: input.path, commitSha: String((data.commit as Record<string, unknown> | undefined)?.sha || ""), contentSha: String((data.content as Record<string, unknown> | undefined)?.sha || "") } };
    } catch (error) {
      return { ok: false, error: { code: "GITHUB_COMMIT_FAILED", message: error instanceof Error ? error.message : "GitHub commit failed.", retryable: false } };
    }
  }
};

const prInput = z.object({ repo: z.string(), title: z.string().min(1).max(300), body: z.string().max(20_000).default(""), head: z.string(), base: z.string().default("main"), draft: z.boolean().default(true) });
const prOutput = z.object({ repo: z.string(), number: z.number().int(), url: z.string().url(), reused: z.boolean(), artifacts: z.array(z.object({ type: z.string(), title: z.string(), storageType: z.literal("url"), location: z.string(), metadata: z.record(z.string(), z.unknown()), verificationStatus: z.literal("passed") })) });
export const solGithubPullRequestTool: SolTool<z.infer<typeof prInput>, z.infer<typeof prOutput>> = {
  name: "github.pullRequest", description: "Create or reuse a pull request for a branch.", inputSchema: prInput, outputSchema: prOutput,
  permissions: ["write"], supportedEnvironments: ["development","preview","production"], idempotency: "required",
  async execute(input) {
    try {
      const { owner, name } = repoParts(input.repo);
      const existing = await githubJson(`https://api.github.com/repos/${owner}/${name}/pulls?state=open&head=${encodeURIComponent(`${owner}:${input.head}`)}&base=${encodeURIComponent(input.base)}`);
      const existingRows = Array.isArray(existing) ? existing : [];
      let pr: Record<string, unknown>;
      let reused = false;
      if (existingRows.length) { pr = existingRows[0] as Record<string, unknown>; reused = true; }
      else pr = await githubJson(`https://api.github.com/repos/${owner}/${name}/pulls`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: input.title, body: input.body, head: input.head, base: input.base, draft: input.draft }) }, true);
      const url = String(pr.html_url || "");
      return { ok: true, data: { repo: input.repo, number: Number(pr.number) || 0, url, reused, artifacts: [{ type: "github_pull_request", title: input.title, storageType: "url", location: url, metadata: { repo: input.repo, head: input.head, base: input.base, draft: input.draft }, verificationStatus: "passed" }] } };
    } catch (error) {
      return { ok: false, error: { code: "GITHUB_PR_FAILED", message: error instanceof Error ? error.message : "GitHub pull request failed.", retryable: false } };
    }
  }
};
