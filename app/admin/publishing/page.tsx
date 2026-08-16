import { redirect } from "next/navigation";
import { getStudioPermission } from "@/auth";
import { CreativePublishingClient } from "@/creative-publishing-client";

export default async function AdminPublishingPage({ searchParams }: { searchParams: Promise<{ projectId?: string }> }) {
  const { access, allowed } = await getStudioPermission("view_distribution");
  if (!allowed || access.state !== "allowed") redirect("/admin");
  const query = await searchParams;
  return <CreativePublishingClient initialProjectId={query.projectId ?? null}/>;
}
