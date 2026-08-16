import { z } from "zod";
import type { SolTool } from "../types";

function authHeaders() {
  const token = process.env.SOL_GITHUB_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim();
  return { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "user-agent": "SOL-Runtime/1.0", ...(token ? { authorization: `Bearer ${token}` } : {}) };
}

const inputSchema = z.object({ repo: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/), ref: z.string().min(1).max(200) });
const outputSchema = z.object({ repo: z.string(), ref: z.string(), sha: z.string(), state: z.enum(["success","failure","pending","unknown"]), statuses: z.array(z.object({ context: z.string(), state: z.string(), targetUrl: z.string().nullable() })) });
export const solGithubStatusTool: SolTool<z.infer<typeof inputSchema>, z.infer<typeof outputSchema>> = {
  name: "github.status",
  description: "Resolve a GitHub ref and read its combined CI/deployment status.",
  inputSchema,
  outputSchema,
  permissions: ["read"],
  supportedEnvironments: ["development","preview","production"],
  idempotency: "not_required",
  async execute(input) {
    try {
      const [owner, repo] = input.repo.split("/");
      const commitResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(input.ref)}`, { headers: authHeaders(), cache: "no-store" });
      const commit = await commitResponse.json().catch(() => ({})) as Record<string, unknown>;
      if (!commitResponse.ok) throw new Error(typeof commit.message === "string" ? commit.message : `Unable to resolve ${input.ref}.`);
      const sha = String(commit.sha || "");
      const statusResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits/${sha}/status`, { headers: authHeaders(), cache: "no-store" });
      const payload = await statusResponse.json().catch(() => ({})) as Record<string, unknown>;
      if (!statusResponse.ok) throw new Error(typeof payload.message === "string" ? payload.message : "Unable to load GitHub status.");
      const raw = Array.isArray(payload.statuses) ? payload.statuses : [];
      const statuses = raw.map((item) => {
        const row = item as Record<string, unknown>;
        return { context: String(row.context || "unknown"), state: String(row.state || "unknown"), targetUrl: typeof row.target_url === "string" ? row.target_url : null };
      });
      const rawState = String(payload.state || "unknown");
      const state = rawState === "success" ? "success" : rawState === "failure" || rawState === "error" ? "failure" : rawState === "pending" ? "pending" : "unknown";
      return { ok: true, data: { repo: input.repo, ref: input.ref, sha, state, statuses }, observations: { statusCount: statuses.length, state } };
    } catch (error) {
      return { ok: false, error: { code: "GITHUB_STATUS_FAILED", message: error instanceof Error ? error.message : "GitHub status failed.", retryable: false } };
    }
  }
};
