import { execFileSync } from "node:child_process";

const ref = process.env.VERCEL_GIT_COMMIT_REF ?? "";
const message = process.env.VERCEL_GIT_COMMIT_MESSAGE ?? "";
const previousSha = process.env.VERCEL_GIT_PREVIOUS_SHA ?? "";
const currentSha = process.env.VERCEL_GIT_COMMIT_SHA ?? "HEAD";

function continueBuild(reason) {
  console.log(`[vercel-build] build: ${reason}`);
  process.exit(1);
}

function ignoreBuild(reason) {
  console.log(`[vercel-build] skip: ${reason}`);
  process.exit(0);
}

// Production must always build, even if a commit message is marked to skip previews.
if (ref === "main") {
  continueBuild("production branch");
}

// AI/code agents can make remote checkpoint commits without paying for a full
// preview build. The final reviewable commit must omit this marker.
if (/\[(?:skip vercel|vercel skip)\]/i.test(message)) {
  ignoreBuild("commit explicitly marked [skip vercel]");
}

// VERCEL_GIT_PREVIOUS_SHA is populated when an Ignored Build Step is configured.
// If it is unavailable, fail open and build rather than accidentally suppressing
// a useful preview.
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
