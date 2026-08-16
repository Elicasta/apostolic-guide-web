import type { SolTaskDefinition } from "../../types/runtime";
import type { SolWorkflowDefinition } from "../registry";

const retry = { maxAttempts: 3, strategy: "exponential" as const, baseDelayMs: 2_000, maxDelayMs: 60_000 };
const slowRetry = { maxAttempts: 6, strategy: "exponential" as const, baseDelayMs: 10_000, maxDelayMs: 120_000 };

function task(input: Partial<SolTaskDefinition> & Pick<SolTaskDefinition, "id" | "name" | "input" | "dependsOn" | "permission">): SolTaskDefinition {
  return { timeoutMs: 120_000, retryPolicy: retry, ...input };
}

export const researchAndReportWorkflow: SolWorkflowDefinition = {
  key: "research_and_report",
  version: 1,
  description: "Retrieve supplied sources in parallel, synthesize them with one bounded AI judgment, and generate a verified report file.",
  trusted: true,
  createTasks(input) {
    const query = String(input.query || "Research report");
    const urls = Array.isArray(input.urls) ? input.urls.map(String).filter(Boolean).slice(0, 12) : [];
    if (!urls.length) throw new Error("research_and_report requires at least one HTTPS URL.");
    const retrieval = urls.map((url, index) => task({ id: `source_${index + 1}`, name: `Retrieve source ${index + 1}`, tool: "browser.extract", input: { url, maxChars: 45_000, includeHtml: false }, dependsOn: [], permission: "read" }));
    const sections = urls.map((url, index) => ({ label: `SOURCE ${index + 1}: ${url}`, content: { $from: `source_${index + 1}.text` } }));
    return [
      ...retrieval,
      task({ id: "compose_sources", name: "Compose source packet", tool: "runtime.composeText", input: { title: `RESEARCH QUESTION\n${query}`, sections }, dependsOn: retrieval.map((item) => item.id), permission: "execute" }),
      task({ id: "write_report", name: "Write research report", tool: "ai.generateText", input: { instructions: "Write a source-grounded research report from the supplied source packet. Distinguish source facts from inference. Do not invent citations or claims not present in the packet. Use clear headings and concise prose.", prompt: { $from: "compose_sources.text" }, effort: "medium" }, dependsOn: ["compose_sources"], permission: "execute", verifier: "text.nonempty", timeoutMs: 180_000 }),
      task({ id: "save_report", name: "Save report", tool: "filesystem.write", input: { path: "report.md", content: { $from: "write_report.text" } }, dependsOn: ["write_report"], permission: "write", idempotency: { required: true, key: "report.md" } })
    ];
  }
};

export const testAndVerifySiteWorkflow: SolWorkflowDefinition = {
  key: "test_and_verify_site",
  version: 1,
  description: "Open a site, extract text, run deterministic assertions, capture a rendered screenshot when configured, and produce a verification report.",
  trusted: true,
  createTasks(input) {
    const url = String(input.url || "");
    if (!url) throw new Error("test_and_verify_site requires a URL.");
    const expectedStatus = Number(input.expectedStatus) || 200;
    const textIncludes = Array.isArray(input.textIncludes) ? input.textIncludes.map(String).slice(0, 20) : [];
    const textExcludes = Array.isArray(input.textExcludes) ? input.textExcludes.map(String).slice(0, 20) : [];
    return [
      task({ id: "capabilities", name: "Check browser capabilities", tool: "runtime.capabilities", input: {}, dependsOn: [], permission: "read" }),
      task({ id: "open", name: "Open site", tool: "browser.open", input: { url }, dependsOn: [], permission: "read" }),
      task({ id: "extract", name: "Extract site text", tool: "browser.extract", input: { url, maxChars: 25_000, includeHtml: false }, dependsOn: [], permission: "read" }),
      task({ id: "assert", name: "Run site assertions", tool: "browser.test", input: { url, expectedStatus, textIncludes, textExcludes }, dependsOn: [], permission: "read", verifier: "browser.assertions" }),
      task({ id: "screenshot", name: "Capture rendered screenshot", tool: "browser.screenshot", input: { url, width: 1440, height: 1200, fullPage: true }, dependsOn: ["capabilities"], condition: { task: "capabilities", path: "browserScreenshot", operator: "truthy" }, permission: "read", timeoutMs: 90_000 }),
      task({ id: "compose_report", name: "Compose verification report", tool: "runtime.composeText", input: { title: `SITE VERIFICATION\n${url}`, sections: [
        { label: "OPEN", content: { $from: "open" } },
        { label: "ASSERTIONS", content: { $from: "assert" } },
        { label: "EXTRACT", content: { $from: "extract.text" } },
        { label: "SCREENSHOT", content: { $from: "screenshot" } }
      ] }, dependsOn: ["open","extract","assert","screenshot"], permission: "execute" }),
      task({ id: "save_report", name: "Save verification report", tool: "filesystem.write", input: { path: "site-verification.txt", content: { $from: "compose_report.text" } }, dependsOn: ["compose_report"], permission: "write", idempotency: { required: true, key: "site-verification.txt" } })
    ];
  }
};

export const buildAndDeployWorkflow: SolWorkflowDefinition = {
  key: "build_and_deploy",
  version: 1,
  description: "Require green GitHub status, create an approval-gated Vercel deployment, and verify the deployed site before completion.",
  trusted: false,
  createTasks(input) {
    const repo = String(input.repo || "");
    const ref = String(input.ref || "");
    const project = String(input.project || "");
    const teamId = String(input.teamId || "");
    const repoId = Number(input.repoId);
    const target = input.target === "production" ? "production" : "preview";
    if (!repo || !ref || !project || !teamId || !Number.isInteger(repoId) || repoId <= 0) throw new Error("build_and_deploy requires repo, ref, project, teamId, and numeric repoId.");
    return [
      task({ id: "verify_ci", name: "Verify GitHub checks", tool: "github.status", input: { repo, ref }, dependsOn: [], permission: "read", verifier: "github.success", retryPolicy: slowRetry }),
      task({ id: "deploy", name: `Deploy ${target}`, tool: "vercel.deploy", input: { project, teamId, ref, repoId, target }, dependsOn: ["verify_ci"], permission: "deploy", approval: { required: true, type: "deploy" }, retryPolicy: retry, timeoutMs: 120_000, idempotency: { required: true, key: `${repo}:${ref}:${project}:${target}` } }),
      task({ id: "verify_deployment", name: "Verify deployment", tool: "vercel.verifyDeployment", input: { deploymentId: { $from: "deploy.id" }, teamId, expectedStatus: Number(input.expectedStatus) || 200 }, dependsOn: ["deploy"], permission: "read", verifier: "deployment.ready", retryPolicy: slowRetry, timeoutMs: 60_000 })
    ];
  }
};
