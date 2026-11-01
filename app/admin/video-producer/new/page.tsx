import { redirect } from "next/navigation";
import { getStudioPermission } from "@/auth";
import { VideoProducerNewProject } from "@/video-producer-new-project";

export default async function NewVideoProducerProjectPage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") redirect("/admin");
  const query = await searchParams;
  const mode = query.mode === "reels" ? "reels" : "podcast";
  return <VideoProducerNewProject initialMode={mode}/>;
}
