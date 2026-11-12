import { NextResponse } from "next/server";
import { assertDoctrineApproved } from "@/doctrine-gate";
import { videoProducerDoctrineSource } from "@/video-producer-doctrine";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";
import {getVideoProducerBrand} from "@/video-producer-brand-server";
import {requiresVideoProducerDoctrineGate,requiresVideoProducerPathway} from "@/video-producer-brand-profiles";
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
    .select("id,parent_project_id,mode,status,brand_profile,rnnoise_mix,source_duration,source_range_start,source_range_end,edit_plan,camera_plan,audio_plan,director_metadata,transcript,transcript_text,pathway_slug,updated_at")
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

  if (project.data.status !== "planned" && project.data.status !== "draft") {
    return NextResponse.json({ error: "Only editable Producer drafts can be approved." }, { status: 409 });
  }
  let brand;
  try {brand=await getVideoProducerBrand(service,project.data.brand_profile||"apostolic-guide");}
  catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Brand unavailable"},{status:409});}
  if(requiresVideoProducerPathway(brand,project.data.mode)&&!project.data.pathway_slug)
   return NextResponse.json({error:"An Apostolic Guide podcast needs a pathway before approval."},{status:409});
  if(brand.slug==="in-the-now"&&!(project.data.director_metadata as Record<string,unknown>|null)?.kineticSceneV2)
   return NextResponse.json({error:"Save the In the Now brand preset in Kinetic Video Code Mode before approving. Only saved scenes can be rendered."},{status:409});
  try {
    if(requiresVideoProducerDoctrineGate(brand)){
    const source = videoProducerDoctrineSource(project.data);
    await assertDoctrineApproved(service, source);
    }
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Doctrine check unavailable. Approval blocked."
    }, { status: 409 });
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
      audio_plan: project.data.audio_plan as VideoProducerAudioPlan | null,
      brand_profile:brand.slug,brand_config:brand.config,
      scene_document:(project.data.director_metadata as Record<string,unknown>|null)?.kineticSceneV2??null,
      rnnoise_mix:project.data.rnnoise_mix
    });
    const now = new Date().toISOString();
    const update = await service.from("video_producer_projects").update({
      status: "approved",
      approval_fingerprint: production.fingerprint,
      approved_at: now,
      updated_by: access.user.id
    }).eq("id", project.data.id).eq("updated_at", project.data.updated_at)
      .in("status", ["draft", "planned"]).select("*").maybeSingle();
    if (update.error) return NextResponse.json({ error: update.error.message }, { status: 500 });
    if (!update.data) return NextResponse.json({ error: "Video changed during approval. Reopen Review and run the doctrine check again." }, { status: 409 });
    return NextResponse.json({ project: update.data, fingerprint: production.fingerprint, multicam: production.usesMulticam });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Production state is not approvable." }, { status: 409 });
  }
}
