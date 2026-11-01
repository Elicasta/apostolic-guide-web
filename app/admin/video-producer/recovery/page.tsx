import { redirect } from "next/navigation";
import { getStudioPermission } from "@/auth";
import { VideoProducerRecovery } from "@/video-producer-recovery";

export default async function VideoProducerRecoveryPage() {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") redirect("/admin");
  return <VideoProducerRecovery/>;
}
