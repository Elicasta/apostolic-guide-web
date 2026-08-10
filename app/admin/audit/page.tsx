import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock3, FileClock, Filter } from "lucide-react";
import { getStudioPermission } from "@/auth";
import { listStudioAudit, studioAuditActionLabel } from "@/studio-audit";

const resources = [
  ["", "All activity"],
  ["person", "People"],
  ["inbox_conversation", "Inbox"],
  ["journey", "Journeys"],
  ["segment", "Segments"],
  ["content", "Publishing"],
  ["broadcast", "Broadcasts"],
  ["social_automation", "Social"],
  ["studio_member", "Team"]
] as const;

function metadataSummary(metadata: Record<string, unknown>) {
  const priorityKeys = ["email", "role", "status", "tag", "title", "name", "action", "channel", "kind", "journey_name"];
  const pairs = priorityKeys
    .filter((key) => metadata[key] !== undefined && metadata[key] !== null && String(metadata[key]).trim())
    .slice(0, 3)
    .map((key) => `${key.replaceAll("_", " ")}: ${String(metadata[key])}`);
  return pairs.join(" · ");
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ resource?: string }> }) {
  const { access, allowed } = await getStudioPermission("view_audit");
  if (!allowed || access.state !== "allowed") redirect("/admin");

  const params = await searchParams;
  const resource = resources.some(([value]) => value === params.resource) ? (params.resource || null) : null;
  const events = await listStudioAudit({ limit: 150, resourceType: resource });

  return <main className="admin-page audit-page">
    <section className="admin-page-header">
      <div>
        <span className="admin-eyebrow">System</span>
        <h1>Audit Log</h1>
        <p>Privileged Studio actions recorded with the operator, resource, and time.</p>
      </div>
      <div className="audit-header-stat"><FileClock size={18}/><strong>{events.length}</strong><span>recent events</span></div>
    </section>

    <section className="audit-filter-bar" aria-label="Audit filters">
      <Filter size={16}/>
      {resources.map(([value, label]) => <Link className={(resource ?? "") === value ? "is-active" : ""} href={value ? `/admin/audit?resource=${encodeURIComponent(value)}` : "/admin/audit"} key={value || "all"}>{label}</Link>)}
    </section>

    <section className="admin-card audit-card">
      <div className="studio-section-head"><div><span className="section-kicker">Recorded activity</span><h2>{resource ? resources.find(([value]) => value === resource)?.[1] : "All activity"}</h2></div><span>Newest first</span></div>
      {events.length ? <div className="audit-list">{events.map((event) => {
        const summary = metadataSummary(event.metadata ?? {});
        return <article className="audit-row" key={event.id}>
          <div className="audit-dot" aria-hidden="true"/>
          <div className="audit-main">
            <div className="audit-action"><strong>{studioAuditActionLabel(event.action)}</strong><span className="studio-chip">{event.resource_type.replaceAll("_", " ")}</span></div>
            <div className="audit-meta">{summary ? <span>{summary}</span> : null}{event.resource_id ? <code>{event.resource_id.slice(0, 8)}</code> : null}</div>
          </div>
          <div className="audit-actor"><strong>{event.actor_email ?? "Unknown operator"}</strong><span><Clock3 size={13}/>{new Date(event.created_at).toLocaleString()}</span></div>
        </article>;
      })}</div> : <div className="studio-empty-state"><FileClock size={22}/><strong>No audit activity yet</strong><p>Privileged actions performed in Studio will appear here.</p></div>}
    </section>
  </main>;
}
