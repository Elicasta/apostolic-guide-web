import { AppContentEditor } from "@/app-content-editor";
import { getAdminAccess } from "@/auth";
import { createServiceClient } from "@/supabase";
import { Boxes, CheckCircle2, Database, ShieldCheck } from "lucide-react";

type AppRecord = { id: string; source_content_item_id: string; entity_type: string; entity_id: string; status: string; record_version: number; updated_at: string; };

export default async function AdminAppContentPage() {
  const access = await getAdminAccess();
  const supabase = access.state === "allowed" ? createServiceClient() : null;
  let records: AppRecord[] = [];
  let sources: { id: string; title: string; kind: string }[] = [];
  let appSchemaReady = false;
  if (supabase) {
    const result = await supabase.schema("app_content").from("records").select("id,source_content_item_id,entity_type,entity_id,status,record_version,updated_at").order("updated_at", { ascending: false }).limit(100);
    if (!result.error) { records = result.data ?? []; appSchemaReady = true; }
    const sourceResult = await supabase.schema("content").from("items").select("id,title,kind").is("deleted_at", null).in("kind", ["scripture_entry", "pathway", "objection", "topic"]).order("title");
    sources = sourceResult.data ?? [];
  }
  const published = records.filter((record) => record.status === "published").length;

  return (
    <>
      <span className="eyebrow">App publishing</span>
      <h1>App content</h1>
      <p className="admin-lede">Control the validated content packages consumed by <strong>app.apostolicguide.com</strong>. Website publishing stays independent.</p>
      <div className="publishing-metrics"><div><Boxes size={18} /><strong>{records.length}</strong><span>Projections</span></div><div><CheckCircle2 size={18} /><strong>{published}</strong><span>Published</span></div><div><Database size={18} /><strong>{sources.length}</strong><span>Eligible sources</span></div></div>

      <div className={appSchemaReady ? "system-status system-status-ready" : "system-status"}><ShieldCheck size={21} /><div><strong>{appSchemaReady ? "App publishing database is ready" : "App publishing is not ready yet"}</strong><p>{appSchemaReady ? "The shared app-content schema is installed. Publish only content that matches the current app reader format." : "The shared app-content schema has not been installed in this environment. Publishing stays disabled until it is available."}</p></div></div>

      <section className="admin-card publishing-card"><div className="card-heading"><div><span className="section-kicker">Projection editor</span><h2>Publish to the app</h2></div><p>Select canonical content, validate its app payload, and control its runtime status.</p></div>{sources.length && appSchemaReady ? <AppContentEditor sources={sources} /> : <div className="empty-state"><Database size={24} /><strong>No app-compatible source content yet.</strong><p>Create or migrate a Scripture entry, pathway, objection, or topic before publishing it to the app.</p></div>}</section>
      <section className="admin-card publishing-card"><div className="card-heading"><div><span className="section-kicker">Runtime library</span><h2>Current projections</h2></div><p>Versioned records currently prepared for the Apostolic Guide app.</p></div>{records.length ? <div className="content-library">{records.map((record) => <div className="content-library-row" key={record.id}><div><span className="content-kind">{record.entity_type}</span><strong>{record.entity_id}</strong><small>Version {record.record_version} · Updated {new Date(record.updated_at).toLocaleDateString()}</small></div><div className="content-row-end"><span className={record.status === "published" ? "status-pill" : "status-pill status-pending"}>{record.status}</span></div></div>)}</div> : <div className="empty-state"><Boxes size={24} /><strong>No app projections yet.</strong><p>When app-ready content is published, its current runtime version will appear here.</p></div>}</section>
    </>
  );
}
