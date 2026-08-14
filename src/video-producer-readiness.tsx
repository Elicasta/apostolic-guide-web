import "server-only";
import { CheckCircle2, CircleAlert, CircleHelp, Database, Film, Github, HardDrive, Sparkles } from "lucide-react";
import { createServiceClient } from "./supabase";
import { videoProducerRendererCredentials } from "./video-producer-server";

type ReadinessState = "ready" | "warning" | "error";

type ReadinessItem = {
  label: string;
  detail: string;
  state: ReadinessState;
  icon: typeof Database;
};

async function checkActionsTranscriptionSecret(repository: string, token: string) {
  if (!repository || !token) return { state: "error" as const, detail: "Render bridge is not connected." };
  try {
    const response = await fetch(`https://api.github.com/repos/${repository}/actions/secrets?per_page=100`, {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "user-agent": "apostolic-guide-video-producer-readiness",
        "x-github-api-version": "2022-11-28"
      },
      cache: "no-store"
    });
    if (response.ok) {
      const payload = await response.json() as { secrets?: { name?: string }[] };
      const configured = payload.secrets?.some((secret) => secret.name === "OPENAI_API_KEY");
      return configured
        ? { state: "ready" as const, detail: "GitHub Actions OPENAI_API_KEY is configured." }
        : { state: "error" as const, detail: "Add OPENAI_API_KEY to GitHub Actions repository secrets." };
    }
    if (response.status === 403 || response.status === 404) {
      return { state: "warning" as const, detail: "Actions secret cannot be inspected with the render token. Verify OPENAI_API_KEY once in GitHub Actions." };
    }
    return { state: "warning" as const, detail: `GitHub secret check returned ${response.status}; verify the Actions transcription secret manually.` };
  } catch {
    return { state: "warning" as const, detail: "GitHub secret check was unavailable; verify the Actions transcription secret manually." };
  }
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

  const blobReady = Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
  items.push({
    label: "Private media storage",
    detail: blobReady ? "Vercel Blob write token is present for multipart source uploads and private masters." : "Connect a private Vercel Blob store so BLOB_READ_WRITE_TOKEN is available.",
    state: blobReady ? "ready" : "error",
    icon: HardDrive
  });

  const openAiReady = Boolean(process.env.OPENAI_API_KEY?.trim());
  const directorModel = process.env.OPENAI_VIDEO_PRODUCER_MODEL?.trim() || process.env.OPENAI_VIDEO_DIRECTOR_MODEL?.trim() || "gpt-5.6-sol";
  items.push({
    label: "Sol Edit Director",
    detail: openAiReady ? `OpenAI connected · ${directorModel}` : "OPENAI_API_KEY is not configured in the app environment.",
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
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${rendererToken}`,
          "user-agent": "apostolic-guide-video-producer-readiness",
          "x-github-api-version": "2022-11-28"
        },
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

  const workerSecret = await checkActionsTranscriptionSecret(rendererRepository, rendererToken);
  items.push({ label: "Transcription worker", detail: workerSecret.detail, state: workerSecret.state, icon: Film });

  const blocking = items.filter((item) => item.state === "error").length;
  const warnings = items.filter((item) => item.state === "warning").length;
  const ready = blocking === 0;

  return (
    <section className="fixed bottom-4 right-4 z-[60] w-[min(390px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-white/10 bg-[#090c12]/95 text-white shadow-2xl shadow-black/50 backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[.18em] text-white/35">Video Producer system</div>
          <div className="mt-0.5 text-sm font-bold">{ready ? "Ready for a real source" : `${blocking} setup item${blocking === 1 ? "" : "s"} blocking production`}</div>
        </div>
        {ready ? <CheckCircle2 className="text-emerald-400" size={20}/> : <CircleAlert className="text-[#ff6269]" size={20}/>} 
      </div>
      <div className="max-h-[46vh] overflow-y-auto p-2">
        {items.map((item) => {
          const Icon = item.icon;
          const Status = item.state === "ready" ? CheckCircle2 : item.state === "warning" ? CircleHelp : CircleAlert;
          const statusClass = item.state === "ready" ? "text-emerald-400" : item.state === "warning" ? "text-amber-300" : "text-[#ff6269]";
          return (
            <div key={item.label} className="flex gap-3 rounded-xl px-3 py-2.5 hover:bg-white/[0.035]">
              <div className="mt-0.5 rounded-lg border border-white/8 bg-white/[0.04] p-1.5 text-white/55"><Icon size={14}/></div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs font-bold"><Status size={13} className={statusClass}/>{item.label}</div>
                <div className="mt-1 text-[11px] leading-4 text-white/42">{item.detail}</div>
              </div>
            </div>
          );
        })}
      </div>
      {(warnings > 0 || blocking > 0) && <div className="border-t border-white/8 px-4 py-2.5 text-[10px] leading-4 text-white/35">This panel never displays secret values. Reload after changing infrastructure settings.</div>}
    </section>
  );
}
