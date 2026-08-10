import { redirect } from "next/navigation";
import { ShieldCheck, Users } from "lucide-react";
import { getStudioPermission } from "@/auth";
import { listStudioMembers } from "@/studio-roles";
import { StudioTeamManager } from "@/studio-team-manager";
import { STUDIO_ROLE_LABELS } from "@/studio-permissions";

export default async function TeamPage() {
  const { access, allowed } = await getStudioPermission("manage_team");
  if (!allowed || access.state !== "allowed" || !access.user || !access.role) redirect("/admin");
  const members = await listStudioMembers();

  return <>
    <span className="eyebrow">System</span>
    <div className="studio-page-heading">
      <div><h1>Team & roles</h1><p className="admin-lede">Control who can operate Apostolic Guide Studio and what each person is allowed to manage.</p></div>
      <span className="studio-role-badge"><ShieldCheck size={15}/>{STUDIO_ROLE_LABELS[access.role]}</span>
    </div>
    <div className="studio-kpi-grid studio-kpi-grid-three">
      <div className="studio-kpi"><Users size={19}/><span>Members</span><strong>{members.length}</strong><small>People with Studio access</small></div>
      <div className="studio-kpi"><ShieldCheck size={19}/><span>Owners + admins</span><strong>{members.filter((member) => member.role === "owner" || member.role === "admin").length}</strong><small>Workspace administrators</small></div>
      <div className="studio-kpi"><Users size={19}/><span>Operators</span><strong>{members.filter((member) => member.role === "editor" || member.role === "moderator").length}</strong><small>Editorial and relationship operators</small></div>
    </div>
    <StudioTeamManager members={members} currentUserId={access.user.id} currentRole={access.role}/>
  </>;
}
