import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CheckCircle2, CircleDashed, ExternalLink, Route, Send } from "lucide-react";
import { getStudioPermission } from "@/auth";
import { listPathwayPublishingSummaries } from "@/pathway-publishing";

export default async function PathwayPublishingPage() {
  const permission = await getStudioPermission("view_content");
  if (!permission.allowed && permission.access.state !== "unconfigured") redirect("/admin");
  const summaries = await listPathwayPublishingSummaries();
  const active = summaries.filter((item) => item.profile?.campaign_status === "active").length;
  const withAssets = summaries.filter((item) => item.assets.length > 0).length;
  const completed = summaries.filter((item) => item.profile?.campaign_status === "complete").length;
  const withAutomation = summaries.filter((item) => item.profile?.social_automation_id).length;

  return <>
    <span className="eyebrow">Pathway publishing</span>
    <div className="admin-page-heading">
      <div>
        <h1>Pathway control panel</h1>
        <p className="admin-lede">Track every asset around the Pathways already published on Apostolic Guide. The live pathway definitions stay canonical. This workspace tracks production, links, CTA messaging, and distribution.</p>
      </div>
    </div>

    <div className="publishing-metrics">
      <div><Route size={18}/><strong>{summaries.length}</strong><span>Live pathways</span></div>
      <div><CircleDashed size={18}/><strong>{active}</strong><span>Active campaigns</span></div>
      <div><CheckCircle2 size={18}/><strong>{withAssets}</strong><span>With assets</span></div>
      <div><Send size={18}/><strong>{withAutomation}</strong><span>Meta flows linked</span></div>
    </div>

    <section className="admin-card publishing-card">
      <div className="card-heading">
        <div><span className="section-kicker">Library</span><h2>Current Pathways</h2></div>
        <p>{completed} campaign{completed === 1 ? "" : "s"} marked complete. Open a Pathway to attach videos, Reels, carousels, PDFs, source files, published links, and its Instagram keyword automation.</p>
      </div>
      <div className="content-library">
        {summaries.map((item) => {
          const status = item.profile?.campaign_status ?? "planning";
          return <Link className="content-library-row" href={`/admin/pathways/${item.pathway.slug}`} key={item.pathway.slug}>
            <div>
              <span className="content-kind">{item.pathway.level}</span>
              <strong>{item.pathway.title}</strong>
              <small>{item.assets.length} assets · {item.publishedAssets} published · {item.completion}% complete{item.profile?.primary_keyword ? ` · keyword ${item.profile.primary_keyword}` : ""}</small>
            </div>
            <div className="content-row-end">
              {item.socialAutomationName ? <span className="status-pill">Meta linked</span> : null}
              <span className={status === "complete" ? "status-pill" : status === "active" ? "status-pill status-pending" : "status-pill status-muted"}>{status}</span>
              <ArrowRight size={18}/>
            </div>
          </Link>;
        })}
      </div>
    </section>

    <section className="admin-card publishing-card">
      <div className="card-heading"><div><span className="section-kicker">System</span><h2>One Pathway, one distribution package</h2></div></div>
      <p className="admin-lede">Website and app remain the destination. Studio tracks the YouTube teaching, short-form clips, graphics, downloads, messaging keyword, and publication URLs around that Pathway. Instagram automations remain managed by the existing Social Automations system.</p>
      <div className="admin-inline-actions"><Link className="admin-button secondary" href="/admin/social">Open Social Automations <ExternalLink size={15}/></Link></div>
    </section>
  </>;
}
