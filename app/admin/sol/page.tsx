import { redirect } from "next/navigation";
import { getStudioPermission } from "@/auth";
import { SolOperatorWorkspace } from "@/sol-operator-client";
import { getSolOperatorSnapshot } from "@/sol-operator";
import { hasStudioPermission } from "@/studio-permissions";

export default async function SolOperatorPage() {
  const permission = await getStudioPermission("view_workspace");
  const localSetup = permission.access.state === "unconfigured";
  if (!permission.allowed && !localSetup) redirect("/admin");
  const snapshot = await getSolOperatorSnapshot();
  const canOperate = permission.access.state === "allowed" && hasStudioPermission(permission.access.role, "manage_content");
  return <>
    <div className="studio-page-heading sol-workspace-heading">
      <div><span className="eyebrow">Studio operations</span><h1>Sol Content Operator</h1><p className="admin-lede">AI interprets the work. Deterministic scans supply the facts. Registered recipes perform approved actions and stop at review gates.</p></div>
      <span className="studio-role-badge">Phase 1 · Controlled execution</span>
    </div>
    <SolOperatorWorkspace initialSnapshot={snapshot} canOperate={canOperate}/>
  </>;
}
