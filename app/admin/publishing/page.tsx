import { redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { getStudioPermission } from "@/auth";
import { CreativePublishingClient } from "@/creative-publishing-client";
import { getPublishingHealth } from "@/publishing-health";

export default async function AdminPublishingPage({ searchParams }: { searchParams: Promise<{ projectId?: string }> }) {
  const { access, allowed } = await getStudioPermission("view_distribution");
  if (!allowed || access.state !== "allowed") redirect("/admin");
  const [query, health] = await Promise.all([searchParams, getPublishingHealth()]);
  const failed = health.checks.filter((check) => !check.ok);

  return <>
    <section className="creative-studio-shell" style={{ paddingBottom: 0 }}>
      <div className={health.ok ? "creative-success-banner" : "creative-error-banner"}>
        {health.ok ? <CheckCircle2 size={18}/> : <AlertTriangle size={18}/>} 
        <div>
          <strong>{health.ok ? "Publishing runtime ready" : `${failed.length} publishing ${failed.length === 1 ? "dependency needs" : "dependencies need"} attention`}</strong>
          <div>{health.ok ? "Creative persistence, media storage, scheduler, content databases, and Instagram publishing passed the runtime preflight." : failed.map((check) => `${check.label}: ${check.detail}`).join(" · ")}</div>
        </div>
      </div>
    </section>
    <CreativePublishingClient initialProjectId={query.projectId ?? null}/>
  </>;
}
