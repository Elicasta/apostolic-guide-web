import { redirect } from "next/navigation";
import { AppContentEditor, type AppContentSource } from "@/app-content-editor";
import { syncCanonicalPathwaySources } from "@/app-content-sources";
import { getStudioPermission } from "@/auth";
import { hasStudioPermission } from "@/studio-permissions";
import { createServiceClient } from "@/supabase";
import { AlertTriangle, Boxes, CheckCircle2, Database, ShieldCheck } from "lucide-react";

type AppRecord = { id: string; source_content_item_id: string; entity_type: string; entity_id: string; status: string; record_version: number; updated_at: string; };

export default async function AdminAppContentPage() {
  const permission = await getStudioPermission("view_content");
  if (!permission.allowed && permission.access.state !== "unconfigured") redirect("/admin");
  const canManage = permission.access.state === "unconfigured" || hasStudioPermission(permission.access.role, "manage_content");
  const supabase = permission.access.state === "allowed" ? createServiceClient() : null;
  let records: AppRecord[] = [];
  let sources: AppContentSource[] = [];
  let appSchemaReady = false;
  let infrastructureError = "";

  if (supabase) {
    const result = await supabase.schema("app_content").from("records")
      .select("id,source_content_item_id,entity_type,entity_id,status,record_version,updated_at")
      .order("updated_at", { ascending: false })
      .limit(100);
    if (result.error) {
      infrastructureError = result.error.message;
    } else {
      records = result.data ?? [];
      appSchemaReady = true;
    }

    if (appSchemaReady) {
      try {
        const canonicalPathways = await syncCanonicalPathwaySources();
        const sourceResult = await supabase.schema("content").from("items")
          .select("id,title,kind,slug")
          .is("deleted_at", null)
          .in("kind", ["scripture_entry", "objection", "topic"])
          .order("title");
        if (sourceResult.error) throw new Error(sourceResult.error.message);
        const extraSources: AppContentSource[] = (sourceResult.data ?? []).map((source) => ({
          id: String(source.id),
          title: String(source.title),
          kind: String(source.kind),
          entityId: String(source.slug || ""),
          entityType: source.kind === "scripture_entry" ? "scripture" : source.kind === "objection" ? "objection" : "category"
        }));
        sources = [...canonicalPathways, ...extraSources];
      } catch (error) {
        infrastructureError = error instanceof Error ? error.message : "Canonical app sources could not be loaded.";
        appSchemaReady = false;
      }
    }
  } else if (permission.access.state === "allowed") {
    infrastructureError = "Supabase service access is not configured.";
  }

  const published = records.filter((record) => record.status === "published").length;

  return (
    <>
      <span className="eyebrow">App publishing</span>
      <h1>App content</h1>
      <p className="admin-lede">Control the validated content packages consumed by <strong>app.apostolicguide.com</strong>. Website publishing stays independent.</p>
      <div className="publishing-metrics"><div><Boxes size={18} /><strong>{records.length}</strong><span>Projections</span></div><div><CheckCircle2 size={18} /><strong>{published}</strong><span>Published</span></div><div><Database size={18} /><strong>{sources.length}</strong><span>Eligible sources</span></div></div>

      <div className={appSchemaReady ? "system-status system-status-ready" : "system-status"}>{appSchemaReady ? <ShieldCheck size={21} /> : <AlertTriangle size={21} />}<div><strong>{appSchemaReady ? "App publishing database is ready" : "App publishing needs attention"}</strong><p>{appSchemaReady ? "The 20 canonical Pathways are synchronized from the live Pathway catalog and are ready to become versioned app projections." : infrastructureError || "The app-content database is unavailable. Publishing is disabled until the underlying error is fixed."}</p></div></div>

      {canManage ? <section className="admin-card publishing-card"><div className="card-heading"><div><span className="section-kicker">Projection editor</span><h2>Publish to the app</h2></div><p>Select canonical content, validate its app payload, and control its runtime status.</p></div>{sources.length && appSchemaReady ? <AppContentEditor sources={sources} /> : <div className="empty-state"><Database size={24} /><strong>No app-compatible source content is available.</strong><p>{infrastructureError || "Canonical sources will appear here when the database is ready."}</p></div>}</section> : <section className="admin-card role-readonly-note"><strong>Read-only access</strong><p>Your Studio role can review app projections but cannot publish or change them.</p></section>}
      <section className="admin-card publishing-card"><div className="card-heading"><div><span className="section-kicker">Runtime library</span><h2>Current projections</h2></div><p>Versioned records currently prepared for the Apostolic Guide app.</p></div>{records.length ? <div className="content-library">{records.map((record) => <div className="content-library-row" key={record.id}><div><span className="content-kind">{record.entity_type}</span><strong>{record.entity_id}</strong><small>Version {record.record_version} · Updated {new Date(record.updated_at).toLocaleDateString()}</small></div><div className="content-row-end"><span className={record.status === "published" ? "status-pill" : "status-pill status-pending"}>{record.status}</span></div></div>)}</div> : <div className="empty-state"><Boxes size={24} /><strong>No app projections yet.</strong><p>Choose a canonical source above. The first saved projection will appear here immediately.</p></div>}</section>
    </>
  );
}
