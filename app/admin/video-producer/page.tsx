import { redirect } from "next/navigation";
import { getStudioPermission } from "@/auth";
import { VideoProducerDashboard } from "@/video-producer-dashboard";
import { VideoProducerReadiness } from "@/video-producer-readiness";
import { VideoProducerUploadRecovery } from "@/video-producer-upload-recovery";

export default async function AdminVideoProducerPage() {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") redirect("/admin");
  return (
    <>
      <VideoProducerUploadRecovery />
      <VideoProducerDashboard />
      <VideoProducerReadiness />
    </>
  );
}
