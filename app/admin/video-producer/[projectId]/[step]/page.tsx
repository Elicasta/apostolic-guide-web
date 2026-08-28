import Link from "next/link";
import { redirect } from "next/navigation";
import { getStudioPermission } from "@/auth";
import { VideoProducerMulticamStudio } from "@/video-producer-multicam-studio";
import { VideoProducerRegeneratePanel } from "@/video-producer-regenerate-panel";
import { VideoProducerReelsHandoff } from "@/video-producer-reels-handoff";
import { VideoProducerSequentialFlow, type VideoProducerStep } from "@/video-producer-sequential-flow";

const STEPS = new Set<VideoProducerStep>(["source", "produce", "finish", "review", "deliver"]);

export default async function VideoProducerProjectStepPage({ params }: { params: Promise<{ projectId: string; step: string }> }) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") redirect("/admin");
  const { projectId, step } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) redirect("/admin/video-producer");
  if (step === "multicam") return <VideoProducerMulticamStudio projectId={projectId}/>;
  if (!STEPS.has(step as VideoProducerStep)) redirect(`/admin/video-producer/${projectId}/source`);
  return (
    <>
      <VideoProducerSequentialFlow projectId={projectId} step={step as VideoProducerStep}/>
      {step === "produce" ? <VideoProducerRegeneratePanel projectId={projectId}/> : null}
      {step === "deliver" ? <VideoProducerReelsHandoff projectId={projectId}/> : null}
      {step === "source" || step === "produce" ? (
        <Link href={`/admin/video-producer/${projectId}/multicam`} style={{ position: "fixed", right: 18, bottom: 18, zIndex: 80, borderRadius: 999, background: "#0d1e2d", color: "white", padding: "11px 15px", fontSize: 10, fontWeight: 900, letterSpacing: ".08em", textDecoration: "none", boxShadow: "0 14px 34px rgba(13,30,45,.2)" }}>
          MULTICAM + SYNC
        </Link>
      ) : null}
    </>
  );
}
