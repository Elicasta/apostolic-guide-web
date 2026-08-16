import "server-only";
import {
  apostolicCampaignConceptTool,
  apostolicCampaignCopyTool,
  apostolicCampaignCreateDraftTool,
  apostolicCampaignFinalizeTool,
  apostolicCarouselDeckTool,
  apostolicCarouselRenderTool,
  apostolicDoctrineCheckTool,
  apostolicDoctrineVerifySourceTool,
  apostolicEmailDraftTool,
  apostolicKeywordAutomationDraftTool,
  apostolicPathwayGetTool,
  apostolicSocialDraftTool,
  apostolicValidateLinksTool
} from "./apostolic-sol/tools";
import { apostolicVideoPrepareTool } from "./apostolic-sol/tools/video";
import { pathwayCampaignWorkflow } from "./apostolic-sol/workflows/pathway-campaign";
import { solAiGenerateJsonTool, solAiGenerateTextTool } from "./sol-core/tools/ai";
import { solBrowserExtractTool, solBrowserOpenTool, solBrowserScreenshotTool, solBrowserTestTool } from "./sol-core/tools/browser";
import { solDatabaseInsertTool, solDatabaseQueryTool, solDatabaseTransactionTool, solDatabaseUpdateTool } from "./sol-core/tools/database";
import { solFilesystemExistsTool, solFilesystemMoveTool, solFilesystemReadTool, solFilesystemWriteTool } from "./sol-core/tools/filesystem";
import { solGithubBranchTool, solGithubCommitTool, solGithubPullRequestTool, solGithubReadTool } from "./sol-core/tools/github";
import { solGithubStatusTool } from "./sol-core/tools/github/status";
import { solHttpRequestTool } from "./sol-core/tools/http/request";
import { SolToolRegistry } from "./sol-core/tools/registry";
import { solRuntimeCapabilitiesTool, solRuntimeComposeTextTool } from "./sol-core/tools/runtime";
import { solVercelDeployTool, solVercelVerifyTool } from "./sol-core/tools/vercel";
import {
  verifyBrowserAssertions,
  verifyCarouselRender,
  verifyDeploymentReady,
  verifyDoctrinePassed,
  verifyGithubSuccess,
  verifyLinksPassed,
  verifyNonEmptyText
} from "./sol-core/verification/common";
import { SolVerifierRegistry } from "./sol-core/verification/registry";
import { buildAndDeployWorkflow, researchAndReportWorkflow, testAndVerifySiteWorkflow } from "./sol-core/workflows/definitions/generic";
import { SolWorkflowRegistry } from "./sol-core/workflows/registry";

let tools: SolToolRegistry | null = null;
let verifiers: SolVerifierRegistry | null = null;
let workflows: SolWorkflowRegistry | null = null;

export function getSolRuntimeToolRegistry() {
  if (!tools) {
    tools = new SolToolRegistry()
      .register(solHttpRequestTool)
      .register(solFilesystemReadTool)
      .register(solFilesystemWriteTool)
      .register(solFilesystemMoveTool)
      .register(solFilesystemExistsTool)
      .register(solDatabaseQueryTool)
      .register(solDatabaseInsertTool)
      .register(solDatabaseUpdateTool)
      .register(solDatabaseTransactionTool)
      .register(solBrowserOpenTool)
      .register(solBrowserExtractTool)
      .register(solBrowserTestTool)
      .register(solBrowserScreenshotTool)
      .register(solGithubReadTool)
      .register(solGithubBranchTool)
      .register(solGithubCommitTool)
      .register(solGithubPullRequestTool)
      .register(solGithubStatusTool)
      .register(solAiGenerateTextTool)
      .register(solAiGenerateJsonTool)
      .register(solRuntimeCapabilitiesTool)
      .register(solRuntimeComposeTextTool)
      .register(solVercelDeployTool)
      .register(solVercelVerifyTool)
      .register(apostolicPathwayGetTool)
      .register(apostolicDoctrineVerifySourceTool)
      .register(apostolicCampaignConceptTool)
      .register(apostolicCampaignCopyTool)
      .register(apostolicCarouselDeckTool)
      .register(apostolicDoctrineCheckTool)
      .register(apostolicCampaignCreateDraftTool)
      .register(apostolicCarouselRenderTool)
      .register(apostolicSocialDraftTool)
      .register(apostolicEmailDraftTool)
      .register(apostolicVideoPrepareTool)
      .register(apostolicKeywordAutomationDraftTool)
      .register(apostolicValidateLinksTool)
      .register(apostolicCampaignFinalizeTool);
  }
  return tools;
}

export function getSolRuntimeVerifierRegistry() {
  if (!verifiers) {
    verifiers = new SolVerifierRegistry()
      .register("text.nonempty", verifyNonEmptyText)
      .register("browser.assertions", verifyBrowserAssertions)
      .register("github.success", verifyGithubSuccess)
      .register("deployment.ready", verifyDeploymentReady)
      .register("carousel.render", verifyCarouselRender)
      .register("doctrine.passed", verifyDoctrinePassed)
      .register("links.passed", verifyLinksPassed);
  }
  return verifiers;
}

export function getSolRuntimeWorkflowRegistry() {
  if (!workflows) {
    workflows = new SolWorkflowRegistry()
      .register(researchAndReportWorkflow)
      .register(testAndVerifySiteWorkflow)
      .register(buildAndDeployWorkflow)
      .register(pathwayCampaignWorkflow);
  }
  return workflows;
}

export function isSolRuntimeWorkflowTrusted(key: string | null, version: number | null) {
  if (!key || !version) return false;
  try {
    return getSolRuntimeWorkflowRegistry().get(key, version).trusted;
  } catch {
    return false;
  }
}
