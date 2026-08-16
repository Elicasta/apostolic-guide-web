import Link from "next/link";
import { redirect } from "next/navigation";
import { getStudioPermission } from "@/auth";
import { getSolRuntimeArtifacts } from "@/sol-runtime-dashboard";
import { SolRuntimeNav } from "../runtime-nav";
import "../runtime-pages.css";

export const dynamic = "force-dynamic";

export default async function SolRuntimeArtifactsPage() {
  const permission = await getStudioPermission("view_workspace");
  if (!permission.allowed && permission.access.state !== "unconfigured") redirect("/admin");
  const artifacts = await getSolRuntimeArtifacts(240);
  return <main className="sol-runtime-page">
    <SolRuntimeNav />
    <header className="sol-runtime-heading">
      <div><span className="sol-runtime-kicker">Production outputs</span><h1>Artifacts</h1><p>Everything SOL registers as an output stays attached to the run and task that produced it, with verification state and exact location.</p></div>
    </header>
    {artifacts.length ? <div className="sol-runtime-artifacts">{artifacts.map((artifact) => <article className="sol-runtime-artifact" key={artifact.id}>
      <small>{artifact.type} · {artifact.verification_status}</small>
      <h3>{artifact.title}</h3>
      <p>{artifact.storage_type}</p>
      <div className="sol-runtime-actions">
        <Link href={`/admin/sol/runs/${artifact.run_id}`}>Open run</Link>
        {String(artifact.location || "").startsWith("/") ? <Link href={String(artifact.location)}>Open artifact</Link> : null}
      </div>
      <p><small>{new Date(artifact.created_at).toLocaleString()}</small></p>
    </article>)}</div> : <div className="sol-runtime-empty">No runtime artifacts yet.</div>}
  </main>;
}
