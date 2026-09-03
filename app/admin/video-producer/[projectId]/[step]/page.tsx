import { redirect } from "next/navigation";
import { getStudioPermission } from "@/auth";
import { VideoProducerKineticReview } from "@/video-producer-kinetic-review";
import { VideoProducerMulticamPanel } from "@/video-producer-multicam-panel";
import { VideoProducerRegeneratePanel } from "@/video-producer-regenerate-panel";
import { VideoProducerReelsHandoff } from "@/video-producer-reels-handoff";
import { VideoProducerSequentialFlow, type VideoProducerStep } from "@/video-producer-sequential-flow";
import { VideoProducerVisualPassPanel } from "@/video-producer-visual-pass-panel";

const STEPS = new Set<VideoProducerStep>(["source", "produce", "finish", "review", "deliver"]);

export default async function VideoProducerProjectStepPage({ params }: { params: Promise<{ projectId: string; step: string }> }) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") redirect("/admin");
  const { projectId, step } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) redirect("/admin/video-producer");
  if (!STEPS.has(step as VideoProducerStep)) redirect(`/admin/video-producer/${projectId}/source`);
  return (
    <>
      {step === "source" ? <VideoProducerMulticamPanel projectId={projectId} mode="source"/> : null}
      <VideoProducerSequentialFlow projectId={projectId} step={step as VideoProducerStep}/>
      {step === "produce" ? <VideoProducerMulticamPanel projectId={projectId} mode="produce"/> : null}
      {step === "produce" ? <VideoProducerRegeneratePanel projectId={projectId}/> : null}
      {step === "finish" ? <VideoProducerVisualPassPanel projectId={projectId}/> : null}
      {step === "review" ? <VideoProducerKineticReview projectId={projectId}/> : null}
      {step === "deliver" ? <VideoProducerReelsHandoff projectId={projectId}/> : null}
    </>
  );
}
