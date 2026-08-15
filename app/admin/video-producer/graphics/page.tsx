import { redirect } from "next/navigation";
import { getStudioPermission } from "@/auth";
import { VideoProducerGraphicsLibrary } from "@/video-producer-graphics-library";

export default async function VideoProducerGraphicsPage() {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") redirect("/admin");
  return <VideoProducerGraphicsLibrary/>;
}
