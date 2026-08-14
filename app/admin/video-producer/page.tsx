import { redirect } from "next/navigation";
import { getStudioPermission } from "@/auth";
import { VideoProducerReadiness } from "@/video-producer-readiness";
import { VideoProducerStudio } from "@/video-producer-studio";

export default async function AdminVideoProducerPage() {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") redirect("/admin");
  return (
    <>
      <VideoProducerStudio />
      <VideoProducerReadiness />
    </>
  );
}
