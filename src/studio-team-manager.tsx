"use client";

import { useState } from "react";
import { Plus, Shield, Trash2, UserPlus } from "lucide-react";
import type { StudioMember, StudioRole } from "@/studio-roles";
import { STUDIO_ROLE_DESCRIPTIONS, STUDIO_ROLE_LABELS } from "@/studio-roles";

const roles: StudioRole[] = ["owner","admin","editor","moderator","viewer"];

export function StudioTeamManager({ members, currentUserId, currentRole }: { members: StudioMember[]; currentUserId: string; currentRole: StudioRole }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StudioRole>("viewer");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const canAssignOwner = currentRole === "owner";

  async function mutate(payload: unknown, busyKey: string) {
    setBusy(busyKey); setMessage("");
    const response = await fetch("/api/admin/team", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => ({}));
    setBusy("");
    if (!response.ok) { setMessage(result.error ?? "Could not update team access."); return false; }
    setMessage("Saved.");
    window.setTimeout(() => window.location.reload(), 250);
    return true;
  }

  return <div className="team-layout">
    <section className="admin-card team-members-card">
      <div className="studio-section-head"><div><span className="section-kicker">Access</span><h2>Studio members</h2></div><span>{members.length} {members.length === 1 ? "member" : "members"}</span></div>
      <div className="team-list">{members.map((member) => {
        const self = member.user_id === currentUserId;
        const ownerProtected = member.role === "owner" && currentRole !== "owner";
        return <div className="team-row" key={member.id}>
          <div className="team-avatar">{member.email.slice(0,1).toUpperCase()}</div>
          <div className="team-person"><strong>{member.email}</strong><span>{self ? "You · " : ""}{member.last_sign_in_at ? `Last signed in ${new Date(member.last_sign_in_at).toLocaleDateString()}` : "Invitation pending or never signed in"}</span></div>
          <div className="team-role-copy"><strong>{STUDIO_ROLE_LABELS[member.role]}</strong><span>{STUDIO_ROLE_DESCRIPTIONS[member.role]}</span></div>
          <select aria-label={`Role for ${member.email}`} value={member.role} disabled={Boolean(busy) || ownerProtected || (self && member.role === "owner" && members.filter((item) => item.role === "owner").length === 1)} onChange={(event) => mutate({ action: "role", memberId: member.id, role: event.target.value }, `role:${member.id}`)}>
            {roles.filter((value) => canAssignOwner || value !== "owner").map((value) => <option value={value} key={value}>{STUDIO_ROLE_LABELS[value]}</option>)}
          </select>
          <button className="team-remove" type="button" title="Remove Studio access" disabled={Boolean(busy) || self || ownerProtected} onClick={() => { if (window.confirm(`Remove Studio access for ${member.email}?`)) mutate({ action: "remove", memberId: member.id }, `remove:${member.id}`); }}><Trash2 size={16}/></button>
        </div>;
      })}</div>
    </section>

    <aside className="admin-card team-invite-card">
      <div className="team-invite-icon"><UserPlus size={20}/></div>
      <span className="section-kicker">Invite</span>
      <h2>Add a Studio member</h2>
      <p>Invite someone by email and choose the access they should receive. Supabase Auth sends the invitation.</p>
      <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com"/></label>
      <label>Role<select value={role} onChange={(event) => setRole(event.target.value as StudioRole)}>{roles.filter((value) => canAssignOwner || value !== "owner").map((value) => <option value={value} key={value}>{STUDIO_ROLE_LABELS[value]}</option>)}</select></label>
      <small>{STUDIO_ROLE_DESCRIPTIONS[role]}</small>
      <button className="button button-crimson" type="button" disabled={Boolean(busy) || !email.trim()} onClick={async () => { if (await mutate({ action: "invite", email: email.trim(), role }, "invite")) setEmail(""); }}><Plus size={16}/> Invite member</button>
      {message ? <div className="team-message">{message}</div> : null}
    </aside>

    <section className="admin-card team-role-reference">
      <div className="studio-section-head"><div><span className="section-kicker">Permissions</span><h2>Role reference</h2></div><Shield size={18}/></div>
      <div className="team-role-grid">{roles.map((value) => <div key={value}><strong>{STUDIO_ROLE_LABELS[value]}</strong><p>{STUDIO_ROLE_DESCRIPTIONS[value]}</p></div>)}</div>
    </section>
  </div>;
}
