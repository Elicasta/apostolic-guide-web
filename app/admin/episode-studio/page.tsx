import { redirect } from "next/navigation";
import Link from "next/link";
import { getStudioPermission } from "@/auth";
import { EpisodeDraftTools } from "@/episode-draft-tools";
import { EpisodeStudioLane } from "@/episode-studio-lane";

export default async function AdminEpisodeStudioPage() {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") redirect("/admin");
  return <><p><Link className="button" href="/admin/code-mode?tool=episode">Open Code Mode · Episode Scripts and Articles</Link></p><EpisodeStudioLane/><EpisodeDraftTools/></>;
}
