import { redirect } from "next/navigation";
import { getStudioPermission } from "@/auth";
import { VideoProducerMasterDownload } from "@/video-producer-master-download";
import { VideoProducerProjectLibrary } from "@/video-producer-project-library";
import { VideoProducerReadiness } from "@/video-producer-readiness";
import { VideoProducerStudio } from "@/video-producer-studio";
import { VideoProducerUploadRecovery } from "@/video-producer-upload-recovery";

export default async function AdminVideoProducerPage() {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") redirect("/admin");
  return (
    <>
      <span className="video-producer-page-marker" hidden />
      <VideoProducerUploadRecovery />
      <VideoProducerProjectLibrary />
      <VideoProducerStudio />
      <VideoProducerMasterDownload />
      <VideoProducerReadiness />
    </>
  );
}
