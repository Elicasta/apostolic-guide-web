import { NextResponse } from "next/server";
import {videoSceneDocument} from "@/code-mode/video-scenes";
import {evaluateDoctrine,textDoctrineSource} from "@/doctrine-gate";
import {normalizeVideoProducerTranscript} from "@/video-producer-ai";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";
import { compileVideoProducerRenderPlan, type VideoProducerEditPlan } from "@/video-producer";
import type { VideoProducerAudioPlan, VideoProducerCameraPlan } from "@/video-producer-multicam";
import { resolveVideoProducerProductionState } from "@/video-producer-production-server";

export const runtime = "nodejs";

const schema = z.object({ projectId: z.string().uuid() });

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid approval request." }, { status: 400 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });
  const project = await service.from("video_producer_projects")
    .select("id,parent_project_id,mode,status,source_duration,source_range_start,source_range_end,edit_plan,camera_plan,audio_plan,director_metadata,transcript")
    .eq("id", parsed.data.projectId).is("deleted_at", null).maybeSingle();
  if (project.error) return NextResponse.json({ error: project.error.message }, { status: 500 });
  if (!project.data?.edit_plan || (project.data.mode !== "podcast" && project.data.mode !== "reels")) return NextResponse.json({ error: "Generate an edit plan before approval." }, { status: 409 });
  let plan: VideoProducerEditPlan;
  try {
    plan = project.data.edit_plan as VideoProducerEditPlan;
    const compiled = compileVideoProducerRenderPlan(plan);
    if (plan.version !== 2 || plan.mode !== project.data.mode || compiled.outputDuration <= 0 || !compiled.keepSegments.length) throw new Error("Edit plan is not renderable.");
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Edit plan is invalid." }, { status: 422 });
  }

  const meta=project.data.director_metadata&&typeof project.data.director_metadata==="object"?project.data.director_metadata as Record<string,unknown>:{};
  const rawScenes=meta.kineticSceneV2;
  if(rawScenes){
    if(project.data.status!=="planned"&&project.data.status!=="draft")return NextResponse.json({error:"Only editable Producer drafts can be approved."},{status:409});
    const parsedScenes=videoSceneDocument.safeParse(rawScenes);
    if(!parsedScenes.success||parsedScenes.data.kind!=="producer"||parsedScenes.data.id!==project.data.id)return NextResponse.json({error:"Video scene document is invalid or belongs to another project."},{status:422});
    const spoken=normalizeVideoProducerTranscript(project.data.transcript);
    const visible=parsedScenes.data.scenes.map((scene,index)=>"Scene "+(index+1)+": "+scene.html.replace(/<[^>]+>/g," ").replace(/\\s+/g," ").trim()).join("\n");
    try {
      const check=await evaluateDoctrine(textDoctrineSource("video_clip",project.data.id,{
        spoken_transcript:spoken.text, on_screen_graphics:visible,
        captions:spoken.words.map(word=>word.word).join(" ")
      }));
      if(check.review.status!=="pass")return NextResponse.json({error:"Video doctrine check did not pass. Review visible graphics, captions and spoken words.",issues:check.review.issues},{status:409});
    }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Doctrine check unavailable. Approval blocked."},{status:503});}
  }

  try {
    const production = await resolveVideoProducerProductionState(service, {
      id: project.data.id,
      parent_project_id: project.data.parent_project_id,
      mode: project.data.mode,
      source_duration: project.data.source_duration,
      source_range_start: project.data.source_range_start,
      source_range_end: project.data.source_range_end,
      edit_plan: plan,
      camera_plan: project.data.camera_plan as VideoProducerCameraPlan | null,
      audio_plan: project.data.audio_plan as VideoProducerAudioPlan | null
    });
    const now = new Date().toISOString();
    const update = await service.from("video_producer_projects").update({
      status: "approved",
      approval_fingerprint: production.fingerprint,
      approved_at: now,
      updated_by: access.user.id
    }).eq("id", project.data.id).select("*").single();
    if (update.error) return NextResponse.json({ error: update.error.message }, { status: 500 });
    return NextResponse.json({ project: update.data, fingerprint: production.fingerprint, multicam: production.usesMulticam });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Production state is not approvable." }, { status: 409 });
  }
}
