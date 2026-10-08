import { redirect } from "next/navigation";
import { getStudioPermission } from "@/auth";
import { GrokbotWorkbench } from "@/grokbot-workbench";

export const dynamic = "force-dynamic";

export default async function GrokbotPage() {
  const permission = await getStudioPermission("view_workspace");
  const localSetup = permission.access.state === "unconfigured";
  if (!permission.allowed && !localSetup) redirect("/admin");

  return <div>
    <div className="studio-page-heading">
      <div>
        <span className="eyebrow">Workspace</span>
        <h1>Grokbot</h1>
        <p className="admin-lede">A Studio workbench for registered actions. It can read Pathways, Sol, creative projects, the editorial preview, and the private feed queue. It cannot publish, send, activate, or enroll.</p>
      </div>
    </div>
    <GrokbotWorkbench/>
  </div>;
}
