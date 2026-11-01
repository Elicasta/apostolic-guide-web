import { redirect } from "next/navigation";
import { getStudioPermission } from "@/auth";
import { hasStudioPermission } from "@/studio-permissions";
import { EditorialEngineClient } from "@/editorial-engine-client";
export default async function ContentEnginePage() {
  const { access, allowed } = await getStudioPermission("view_distribution");
  if (!allowed || access.state !== "allowed") redirect("/admin");
  return <EditorialEngineClient canManage={hasStudioPermission(access.role!, "manage_content")}/>;
}
