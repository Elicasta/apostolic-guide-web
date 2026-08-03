import { AppContentEditor } from "@/app-content-editor";
import { getAdminAccess } from "@/auth";
import { createServiceClient } from "@/supabase";

type AppRecord = {
  id: string;
  source_content_item_id: string;
  entity_type: string;
  entity_id: string;
  status: string;
  record_version: number;
  updated_at: string;
};

export default async function AdminAppContentPage() {
  const access = await getAdminAccess();
  const supabase = access.state === "allowed" ? createServiceClient() : null;
  let records: AppRecord[] = [];
  let sources: { id: string; title: string; kind: string }[] = [];
  if (supabase) {
    const result = await supabase.schema("app_content").from("records")
      .select("id,source_content_item_id,entity_type,entity_id,status,record_version,updated_at")
      .order("updated_at", { ascending: false })
      .limit(100);
    records = result.data ?? [];
    const sourceResult = await supabase.schema("content").from("items")
      .select("id,title,kind")
      .is("deleted_at", null)
      .in("kind", ["scripture_entry", "pathway", "objection", "topic"])
      .order("title");
    sources = sourceResult.data ?? [];
  }

  return (
    <>
      <span className="eyebrow">Shared publishing</span>
      <h1>App content</h1>
      <p className="admin-lede">Publish validated runtime projections consumed by <strong>app.apostolicguide.com</strong>. Website and app status remain independent.</p>
      <div className="admin-notice"><strong>Cutover guard:</strong> publish app records only after Migration 001 and the app reader v2 are deployed. Imported app records remain private on the website.</div>
      <section className="admin-card"><h2>Publish projection</h2>{sources.length ? <AppContentEditor sources={sources} /> : <p>Create or migrate canonical app-compatible content before publishing a projection.</p>}</section>
      <section className="admin-card">
        <h2>Current projections</h2>
        {records.length ? <table className="admin-table"><thead><tr><th>Entity</th><th>Source UUID</th><th>Version</th><th>Status</th></tr></thead><tbody>{records.map((record) => <tr key={record.id}><td><strong>{record.entity_id}</strong><br /><small>{record.entity_type}</small></td><td><code>{record.source_content_item_id}</code></td><td>{record.record_version}</td><td><span className="status-pill">{record.status}</span></td></tr>)}</tbody></table> : <p>No app projection records are available. Install the shared content migration before cutover.</p>}
      </section>
    </>
  );
}
