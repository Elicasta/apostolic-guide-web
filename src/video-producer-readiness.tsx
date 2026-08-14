import "server-only";
import { CheckCircle2, ChevronDown, CircleAlert, CircleHelp, Database, Film, Github, HardDrive, Sparkles } from "lucide-react";
import { createServiceClient } from "./supabase";
import { videoProducerOpenAIKey, videoProducerRendererCredentials } from "./video-producer-server";

type ReadinessState = "ready" | "warning" | "error";

type ReadinessItem = {
  label: string;
  detail: string;
  state: ReadinessState;
  icon: typeof Database;
};

const githubHeaders = (token: string) => ({
  accept: "application/vnd.github+json",
  authorization: `Bearer ${token}`,
  "user-agent": "apostolic-guide-video-producer-readiness",
  "x-github-api-version": "2022-11-28"
});

async function checkDispatcher(repository: string, token: string) {
  if (!repository || !token) return { state: "error" as const, detail: "GitHub worker bridge is not connected." };
  try {
    const response = await fetch(`https://api.github.com/repos/${repository}/contents/.github/workflows/video-producer-dispatch.yml?ref=main`, {
      headers: githubHeaders(token),
      cache: "no-store"
    });
    if (response.ok) return { state: "ready" as const, detail: "Default-branch Video Producer dispatcher is installed." };
    if (response.status === 404) return { state: "error" as const, detail: "Install video-producer-dispatch.yml on the repository default branch." };
    return { state: "warning" as const, detail: `Dispatcher check returned ${response.status}; verify the default-branch workflow.` };
  } catch {
    return { state: "warning" as const, detail: "Dispatcher could not be checked; verify the default-branch workflow." };
  }
}

async function checkActionsTranscriptionSecret(repository: string, token: string) {
  if (!repository || !token) return { state: "error" as const, detail: "Render bridge is not connected." };
  try {
    const response = await fetch(`https://api.github.com/repos/${repository}/actions/secrets?per_page=100`, {
      headers: githubHeaders(token),
      cache: "no-store"
    });
    if (response.ok) {
      const payload = await response.json() as { secrets?: { name?: string }[] };
      const configured = payload.secrets?.some((secret) => secret.name === "VIDEO_PRODUCER_OPENAI_API_KEY");
      return configured
        ? { state: "ready" as const, detail: "GitHub Actions VIDEO_PRODUCER_OPENAI_API_KEY is configured." }
        : { state: "error" as const, detail: "Add VIDEO_PRODUCER_OPENAI_API_KEY to GitHub Actions repository secrets." };
    }
    if (response.status === 403 || response.status === 404) {
      return { state: "warning" as const, detail: "The render token cannot enumerate Actions secrets. The transcription readiness workflow verifies this credential without exposing its value." };
    }
    return { state: "warning" as const, detail: `GitHub secret check returned ${response.status}; verify the Actions transcription secret.` };
  } catch {
    return { state: "warning" as const, detail: "GitHub secret inspection was unavailable. The worker will still validate the credential when transcription runs." };
  }
}

function StatusRow({ item }: { item: ReadinessItem }) {
  const Icon = item.icon;
  const Status = item.state === "ready" ? CheckCircle2 : item.state === "warning" ? CircleHelp : CircleAlert;
  return (
    <div className={`vp-system-row vp-system-row--${item.state}`}>
      <span className="vp-system-icon"><Icon size={16}/></span>
      <div className="vp-system-copy">
        <div className="vp-system-label"><Status size={15}/><strong>{item.label}</strong></div>
        <p>{item.detail}</p>
      </div>
    </div>
  );
}

export async function VideoProducerReadiness() {
  const service = createServiceClient();
  const items: ReadinessItem[] = [];

  if (!service) {
    items.push({ label: "Project database", detail: "Supabase service access is not configured.", state: "error", icon: Database });
  } else {
    const databaseProbe = await service.from("video_producer_projects").select("id", { count: "exact", head: true });
    items.push(databaseProbe.error
      ? { label: "Project database", detail: databaseProbe.error.message, state: "error", icon: Database }
      : { label: "Project database", detail: `${databaseProbe.count ?? 0} Video Producer project${databaseProbe.count === 1 ? "" : "s"} stored.`, state: "ready", icon: Database });
  }

  // Vercel injects the private Blob connection into each fresh deployment.
  const blobReady = Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
  items.push({
    label: "Private media storage",
    detail: blobReady
      ? "Private Vercel Blob storage is connected for source uploads and review masters."
      : "Video upload is disabled until a private Vercel Blob store is connected to this project.",
    state: blobReady ? "ready" : "error",
    icon: HardDrive
  });

  const openAiReady = Boolean(videoProducerOpenAIKey());
  const directorModel = process.env.OPENAI_VIDEO_PRODUCER_MODEL?.trim() || process.env.OPENAI_VIDEO_DIRECTOR_MODEL?.trim() || "gpt-5.6-sol";
  items.push({
    label: "Sol Edit Director",
    detail: openAiReady ? `Dedicated Video Producer OpenAI key connected · ${directorModel}` : "VIDEO_PRODUCER_OPENAI_API_KEY is not configured in the app environment.",
    state: openAiReady ? "ready" : "error",
    icon: Sparkles
  });

  let rendererToken = "";
  let rendererRepository = process.env.VIDEO_STUDIO_GITHUB_REPOSITORY?.trim() || "Elicasta/apostolic-guide-web";
  if (service) {
    try {
      const credentials = await videoProducerRendererCredentials(service);
      rendererToken = credentials.token;
      rendererRepository = credentials.repository;
    } catch {
      rendererToken = "";
    }
  }

  let bridgeState: ReadinessState = rendererToken ? "ready" : "error";
  let bridgeDetail = rendererToken ? `GitHub render bridge connected · ${rendererRepository}` : "Configure VIDEO_STUDIO_GITHUB_TOKEN or the existing encrypted integration secret.";
  if (rendererToken) {
    try {
      const probe = await fetch(`https://api.github.com/repos/${rendererRepository}`, {
        headers: githubHeaders(rendererToken),
        cache: "no-store"
      });
      if (!probe.ok) {
        bridgeState = "error";
        bridgeDetail = `Render token cannot access ${rendererRepository} (${probe.status}).`;
      }
    } catch {
      bridgeState = "warning";
      bridgeDetail = `Render token is configured for ${rendererRepository}, but GitHub could not be reached during this check.`;
    }
  }
  items.push({ label: "FFmpeg worker bridge", detail: bridgeDetail, state: bridgeState, icon: Github });

  const dispatcher = await checkDispatcher(rendererRepository, rendererToken);
  items.push({ label: "Worker dispatcher", detail: dispatcher.detail, state: dispatcher.state, icon: Github });

  const workerSecret = await checkActionsTranscriptionSecret(rendererRepository, rendererToken);
  items.push({ label: "Transcription worker", detail: workerSecret.detail, state: workerSecret.state, icon: Film });

  const blockers = items.filter((item) => item.state === "error");
  const warnings = items.filter((item) => item.state === "warning");
  const readyItems = items.filter((item) => item.state === "ready");
  const ready = blockers.length === 0;

  return (
    <section className="video-producer-system" aria-label="Video Producer system status">
      <details className="vp-system-details" open={!ready}>
        <summary className="vp-system-summary">
          <div>
            <span className="vp-system-eyebrow">System status</span>
            <strong>{ready ? "Ready for a real source" : `${blockers.length} setup item${blockers.length === 1 ? "" : "s"} blocking production`}</strong>
            <small>{ready ? "Upload, transcription, Sol and render infrastructure are available." : blockers[0]?.detail}</small>
          </div>
          <span className={ready ? "vp-system-summary-icon is-ready" : "vp-system-summary-icon is-error"}>
            {ready ? <CheckCircle2 size={22}/> : <CircleAlert size={22}/>}
            <ChevronDown size={17}/>
          </span>
        </summary>

        <div className="vp-system-body">
          {blockers.length > 0 && (
            <div className="vp-system-group">
              <div className="vp-system-group-title">Needs attention</div>
              {blockers.map((item) => <StatusRow key={item.label} item={item}/>) }
            </div>
          )}

          {warnings.length > 0 && (
            <div className="vp-system-group">
              <div className="vp-system-group-title">Informational</div>
              {warnings.map((item) => <StatusRow key={item.label} item={item}/>) }
            </div>
          )}

          <details className="vp-system-all-checks">
            <summary>Show {readyItems.length} passing system checks</summary>
            <div className="vp-system-passing-list">
              {readyItems.map((item) => <StatusRow key={item.label} item={item}/>) }
            </div>
          </details>

          <p className="vp-system-footnote">Secret values are never displayed here. Reload this page after changing infrastructure settings.</p>
        </div>
      </details>
    </section>
  );
}
