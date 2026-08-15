import { redirect } from "next/navigation";
import { getStudioPermission } from "@/auth";
import { VideoProducerReelsHandoff } from "@/video-producer-reels-handoff";
import { VideoProducerSequentialFlow, type VideoProducerStep } from "@/video-producer-sequential-flow";

const STEPS = new Set<VideoProducerStep>(["source", "produce", "finish", "review", "deliver"]);

export default async function VideoProducerProjectStepPage({ params }: { params: Promise<{ projectId: string; step: string }> }) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") redirect("/admin");
  const { projectId, step } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) redirect("/admin/video-producer");
  if (!STEPS.has(step as VideoProducerStep)) redirect(`/admin/video-producer/${projectId}/source`);
  return (
    <>
      <VideoProducerSequentialFlow projectId={projectId} step={step as VideoProducerStep}/>
      {step === "deliver" ? <VideoProducerReelsHandoff projectId={projectId}/> : null}
    </>
  );
}
