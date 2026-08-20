import { execFileSync } from "node:child_process";

const ref = process.env.VERCEL_GIT_COMMIT_REF ?? "";
const message = process.env.VERCEL_GIT_COMMIT_MESSAGE ?? "";
const previousSha = process.env.VERCEL_GIT_PREVIOUS_SHA ?? "";
const currentSha = process.env.VERCEL_GIT_COMMIT_SHA ?? "HEAD";

const SKIP_MARKER = /\[(?:skip vercel|vercel skip)\]/i;
const PREVIEW_MARKER = /\[(?:deploy preview|vercel build|build preview)\]/i;
const COST_CONTROLLED_BRANCH_PREFIXES = ["edit/"];

function continueBuild(reason) {
  console.log(`[vercel-build] build: ${reason}`);
  process.exit(1);
}

function ignoreBuild(reason) {
  console.log(`[vercel-build] skip: ${reason}`);
  process.exit(0);
}

function isCostControlledBranch(branch) {
  return COST_CONTROLLED_BRANCH_PREFIXES.some((prefix) => branch.startsWith(prefix));
}

// Production stays explicit and safe: every main commit deploys.
// Multi-commit work should happen on an edit/* branch and merge once approved.
if (ref === "main") {
  continueBuild("production branch");
}

if (SKIP_MARKER.test(message)) {
  ignoreBuild("commit explicitly marked [skip vercel]");
}

// edit/* branches are the default lane for large AI-assisted edits.
// They can receive as many remote commits as needed without paying for a Vercel
// build each time. Only an explicit final review checkpoint creates a preview.
if (isCostControlledBranch(ref)) {
  if (PREVIEW_MARKER.test(message)) {
    continueBuild("explicit preview checkpoint for cost-controlled edit branch");
  }

  ignoreBuild(
    "cost-controlled edit branch; add [deploy preview] only for the final review checkpoint",
  );
}

// VERCEL_GIT_PREVIOUS_SHA is populated when an Ignored Build Step is configured.
// If it is unavailable on a normal feature branch, fail open and build rather
// than accidentally suppressing a useful preview.
if (!previousSha) {
  continueBuild("no previous successful deployment SHA available");
}

try {
  const changedFiles = execFileSync(
    "git",
    ["diff", "--name-only", previousSha, currentSha],
    { encoding: "utf8" },
  )
    .split("\n")
    .map((file) => file.trim())
    .filter(Boolean);

  const deploymentRelevant = changedFiles.filter((file) => {
    if (file === "AGENTS.md") return false;
    if (file.startsWith("docs/")) return false;
    if (file.startsWith(".github/")) return false;
    if (/\.md$/i.test(file)) return false;
    return true;
  });

  if (changedFiles.length > 0 && deploymentRelevant.length === 0) {
    ignoreBuild("only documentation or CI metadata changed");
  }

  continueBuild(
    deploymentRelevant.length > 0
      ? `${deploymentRelevant.length} deployment-relevant file(s) changed`
      : "no safe skip rule matched",
  );
} catch (error) {
  console.log(
    `[vercel-build] diff check failed; building safely: ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exit(1);
}
