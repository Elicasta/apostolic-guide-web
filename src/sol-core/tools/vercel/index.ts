import { z } from "zod";
import type { SolTool } from "../types";

function token() {
  const value = process.env.VERCEL_TOKEN?.trim();
  if (!value) throw new Error("VERCEL_TOKEN is not configured.");
  return value;
}

function headers() {
  return { authorization: `Bearer ${token()}`, "content-type": "application/json" };
}

const deployInput = z.object({ project: z.string().min(1), teamId: z.string().min(1), ref: z.string().min(1).max(200), repoId: z.number().int().positive(), target: z.enum(["preview","production"]).default("preview") });
const deployOutput = z.object({ id: z.string(), url: z.string(), readyState: z.string(), target: z.string(), artifacts: z.array(z.object({ type: z.string(), title: z.string(), storageType: z.literal("url"), location: z.string(), metadata: z.record(z.string(), z.unknown()), verificationStatus: z.enum(["pending","passed","failed"]) })) });
export const solVercelDeployTool: SolTool<z.infer<typeof deployInput>, z.infer<typeof deployOutput>> = {
  name: "vercel.deploy",
  description: "Create a Vercel deployment from an explicit GitHub ref. Production deployment authority is separately approval-gated by the runtime.",
  inputSchema: deployInput,
  outputSchema: deployOutput,
  permissions: ["deploy"],
  supportedEnvironments: ["development","preview","production"],
  idempotency: "required",
  async execute(input, context) {
    try {
      const response = await fetch(`https://api.vercel.com/v13/deployments?teamId=${encodeURIComponent(input.teamId)}`, {
        method: "POST", headers: headers(), cache: "no-store", signal: context.signal,
        body: JSON.stringify({ name: input.project, target: input.target === "production" ? "production" : undefined, gitSource: { type: "github", repoId: input.repoId, ref: input.ref } })
      });
      const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (!response.ok) throw new Error(typeof (payload.error as Record<string, unknown> | undefined)?.message === "string" ? String((payload.error as Record<string, unknown>).message) : `Vercel deployment failed (${response.status}).`);
      const url = payload.url ? `https://${String(payload.url)}` : "";
      return { ok: true, data: { id: String(payload.id || ""), url, readyState: String(payload.readyState || payload.state || "QUEUED"), target: input.target, artifacts: [{ type: "deployment", title: `${input.project} ${input.target} deployment`, storageType: "url", location: url || `https://vercel.com/${input.teamId}/${input.project}`, metadata: { deploymentId: payload.id, ref: input.ref, target: input.target }, verificationStatus: "pending" }] } };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Vercel deployment failed.";
      return { ok: false, error: { code: /VERCEL_TOKEN|auth/i.test(message) ? "AUTH_REQUIRED" : "DEPLOY_FAILED", message, retryable: /429|timeout|5\d\d/i.test(message) } };
    }
  }
};

const verifyInput = z.object({ deploymentId: z.string().min(1), teamId: z.string().min(1), expectedStatus: z.number().int().min(100).max(599).default(200) });
const verifyOutput = z.object({ deploymentId: z.string(), ready: z.boolean(), state: z.string(), url: z.string().nullable(), httpStatus: z.number().int().nullable(), passed: z.boolean() });
export const solVercelVerifyTool: SolTool<z.infer<typeof verifyInput>, z.infer<typeof verifyOutput>> = {
  name: "vercel.verifyDeployment",
  description: "Verify a Vercel deployment reached READY and responds with the expected HTTP status.",
  inputSchema: verifyInput,
  outputSchema: verifyOutput,
  permissions: ["read"],
  supportedEnvironments: ["development","preview","production"],
  idempotency: "not_required",
  async execute(input, context) {
    try {
      const response = await fetch(`https://api.vercel.com/v13/deployments/${encodeURIComponent(input.deploymentId)}?teamId=${encodeURIComponent(input.teamId)}`, { headers: { authorization: `Bearer ${token()}` }, cache: "no-store", signal: context.signal });
      const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (!response.ok) throw new Error(`Vercel deployment lookup failed (${response.status}).`);
      const state = String(payload.readyState || payload.state || "UNKNOWN");
      const url = payload.url ? `https://${String(payload.url)}` : null;
      let httpStatus: number | null = null;
      if (state === "READY" && url) {
        const site = await fetch(url, { method: "GET", redirect: "follow", cache: "no-store", signal: context.signal });
        httpStatus = site.status;
      }
      const passed = state === "READY" && httpStatus === input.expectedStatus;
      return { ok: true, data: { deploymentId: input.deploymentId, ready: state === "READY", state, url, httpStatus, passed }, observations: { state, httpStatus } };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Deployment verification failed.";
      return { ok: false, error: { code: /VERCEL_TOKEN|auth/i.test(message) ? "AUTH_REQUIRED" : "DEPLOY_VERIFY_FAILED", message, retryable: /429|timeout|5\d\d/i.test(message) } };
    }
  }
};
