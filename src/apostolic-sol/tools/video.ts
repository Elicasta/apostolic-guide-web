import { z } from "zod";
import { createServiceClient } from "../../supabase";
import type { SolTool } from "../../sol-core/tools/types";

const pathwaySchema = z.object({ slug: z.string(), title: z.string() }).passthrough();
const copySchema = z.object({ youtubeTitle: z.string(), youtubeDescription: z.string() }).passthrough();
const inputSchema = z.object({ pathway: pathwaySchema, campaignId: z.string().uuid(), copy: copySchema });
const outputSchema = z.object({ id: z.string().uuid(), route: z.string(), artifacts: z.array(z.object({ type: z.string(), title: z.string(), storageType: z.literal("database"), location: z.string(), metadata: z.record(z.string(), z.unknown()), verificationStatus: z.enum(["pending","passed","failed"]) })) });

function service() {
  const client = createServiceClient();
  if (!client) throw new Error("Apostolic Guide database is not configured.");
  return client;
}

export const apostolicVideoPrepareTool: SolTool<z.infer<typeof inputSchema>, z.infer<typeof outputSchema>> = {
  name: "apostolic.video.prepare",
  description: "Prepare a YouTube package from approved audio and existing video assets without publishing.",
  inputSchema,
  outputSchema,
  permissions: ["write"],
  supportedEnvironments: ["development","preview","production"],
  idempotency: "required",
  async execute(input) {
    try {
      const db = service();
      const [audio, script, project, renders] = await Promise.all([
        db.from("pathway_audio_assets").select("audio_url,content_hash").eq("pathway_slug", input.pathway.slug).maybeSingle(),
        db.from("pathway_audio_scripts").select("script_hash,status,checker_status,checked_script_hash").eq("pathway_slug", input.pathway.slug).maybeSingle(),
        db.from("pathway_video_projects").select("id,audio_content_hash,updated_at").eq("pathway_slug", input.pathway.slug).maybeSingle(),
        db.from("pathway_video_renders").select("id,status,format,output_url,storage_path,completed_at").eq("pathway_slug", input.pathway.slug).order("requested_at", { ascending: false }).limit(10)
      ]);
      if (audio.error) throw audio.error;
      if (script.error) throw script.error;
      if (project.error) throw project.error;
      if (renders.error) throw renders.error;

      const approvedAudio = Boolean(
        audio.data?.audio_url &&
        script.data?.status === "approved" &&
        script.data?.checker_status === "passed" &&
        script.data?.checked_script_hash === script.data?.script_hash &&
        audio.data?.content_hash === script.data?.script_hash
      );
      const completedRenders = (renders.data ?? []).filter((row) => row.status === "completed" && (row.output_url || row.storage_path));
      const content = {
        youtubeTitle: input.copy.youtubeTitle,
        youtubeDescription: input.copy.youtubeDescription,
        approvedAudioAvailable: approvedAudio,
        audioUrl: approvedAudio ? audio.data?.audio_url : null,
        videoProjectId: project.data?.id ?? null,
        videoProjectAlignedToAudio: Boolean(project.data?.audio_content_hash && project.data.audio_content_hash === audio.data?.content_hash),
        completedRenders,
        readyForReview: approvedAudio && Boolean(project.data?.id),
        published: false
      };

      const existing = await db.from("studio_campaign_artifacts").select("id").eq("campaign_id", input.campaignId).eq("artifact_type", "youtube_package").limit(1).maybeSingle();
      if (existing.error) throw existing.error;
      let id = existing.data?.id ? String(existing.data.id) : "";
      if (id) {
        const update = await db.from("studio_campaign_artifacts").update({ title: `${input.pathway.title} YouTube package`, content_json: content, verification_status: "passed" }).eq("id", id);
        if (update.error) throw update.error;
      } else {
        const insert = await db.from("studio_campaign_artifacts").insert({
          campaign_id: input.campaignId,
          pathway_slug: input.pathway.slug,
          artifact_type: "youtube_package",
          title: `${input.pathway.title} YouTube package`,
          mime_type: "application/json",
          content_json: content,
          verification_status: "passed"
        }).select("id").single();
        if (insert.error) throw insert.error;
        id = String(insert.data.id);
      }
      const route = `/admin/sol/campaigns/${input.campaignId}`;
      return { ok: true, data: { id, route, artifacts: [{ type: "youtube_package", title: `${input.pathway.title} YouTube package`, storageType: "database", location: route, metadata: { campaignId: input.campaignId, artifactId: id, approvedAudioAvailable: approvedAudio, completedRenderCount: completedRenders.length, published: false }, verificationStatus: "passed" }] } };
    } catch (error) {
      return { ok: false, error: { code: "VIDEO_PREPARE_FAILED", message: error instanceof Error ? error.message : "Video package failed.", retryable: false } };
    }
  }
};
