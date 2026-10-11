import Link from "next/link";
import { redirect } from "next/navigation";
import { getStudioPermission } from "@/auth";
import { SolLiveRoom } from "@/sol-live-room";
import { solLivePayloadFromApi } from "@/sol-live-room-model";
import { getSolAgentTeamSnapshot } from "@/sol-agent-team";
import { getSolOperatorSnapshot, listRecentSolActivity } from "@/sol-operator";

export const dynamic = "force-dynamic";

export default async function SolOperatorPage() {
  const permission = await getStudioPermission("view_workspace");
  const localSetup = permission.access.state === "unconfigured";
  if (!permission.allowed && !localSetup) redirect("/admin");

  const [snapshot, team, recentActivity] = await Promise.all([
    getSolOperatorSnapshot(),
    getSolAgentTeamSnapshot().catch(() => null),
    listRecentSolActivity()
  ]);
  const initial = solLivePayloadFromApi({ ...snapshot, team, recentActivity });
  if (!initial) redirect("/admin");
  const canStop = permission.access.role === "owner" || permission.access.role === "admin";

  return <div className="sol-v3-control-page">
    <div className="studio-page-heading sol-workspace-heading">
      <div>
        <span className="eyebrow">Apostolic Guide operations</span>
        <h1>Sol</h1>
        <p className="admin-lede">This room follows real worker, queue, review, and priority state. Motion tracks those changes. The floating Sol manager stays available here and keeps the existing Stop, mode, and hard-lock gates.</p>
      </div>
      <Link href="/admin/grokbot">Open Grokbot</Link>
    </div>
    <SolLiveRoom initial={initial} canStop={canStop}/>
  </div>;
}
