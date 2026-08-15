import { redirect } from "next/navigation";
import { getStudioPermission } from "@/auth";
import { VideoProducerReelsLibrary } from "@/video-producer-reels-library";

export default async function VideoProducerReelsPage() {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") redirect("/admin");
  return <VideoProducerReelsLibrary/>;
}
