import { redirect } from "next/navigation";
import { getAdminAccess } from "@/auth";
import { allPathways } from "@/pathway-catalog";
import NewEpisodeForm from "./new-episode-form";
import "../../studio.css";

export const dynamic = "force-dynamic";

export default async function NewStudioEpisodePage() {
  const access = await getAdminAccess();
  if (access.state === "signed_out") redirect("/login");
  if (access.state !== "allowed" || !["owner", "admin", "editor"].includes(access.role ?? "")) redirect("/");
  return <NewEpisodeForm pathways={allPathways.map((item) => ({ slug: item.slug, title: item.title, summary: item.summary }))} />;
}
