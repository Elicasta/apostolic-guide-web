import { redirect } from "next/navigation";
import { getStudioPermission } from "@/auth";
import { VideoProducerEpisodeStudio } from "@/video-producer-episode-studio";

export default async function AdminVideoProducerEpisodesPage() {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") redirect("/admin");
  return <VideoProducerEpisodeStudio/>;
}
