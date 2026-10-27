import { redirect } from "next/navigation";
import Link from "next/link";
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
      <p><Link className="button" href="/admin/code-mode?tool=video">Open Code Mode · Video Producer JSON</Link></p>
      <VideoProducerDashboard />
      <VideoProducerReadiness />
    </>
  );
}
