import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CircleDashed, FolderKanban, Route, Send } from "lucide-react";
import { getStudioPermission } from "@/auth";
import { hasStudioPermission } from "@/studio-permissions";
import { listPathwayPublishingSummaries } from "@/pathway-publishing";
import { createPathwayProject } from "./actions";

export default async function PathwayPublishingPage() {
  const permission = await getStudioPermission("view_content");
  if (!permission.allowed && permission.access.state !== "unconfigured") redirect("/admin");
  const canManage = permission.access.state === "unconfigured" || hasStudioPermission(permission.access.role, "manage_content");
  const summaries = await listPathwayPublishingSummaries();
  const projects = summaries.filter((item) => item.started && item.profile?.campaign_status !== "archived");
  const active = projects.filter((item) => item.profile?.campaign_status === "active").length;
  const withAutomation = projects.filter((item) => item.profile?.social_automation_id).length;
  const collections = Array.from(new Set(summaries.map((item) => item.pathway.collection)));

  return <>
    <div className="studio-page-heading pathway-library-heading">
      <div>
        <span className="eyebrow">Pathway publishing</span>
        <h1>Projects</h1>
        <p className="admin-lede">A project is the distribution work around one existing Apostolic Guide Pathway. Start with the Pathway, then build its YouTube, Instagram, TikTok, Facebook, downloads, messaging, and published links here.</p>
      </div>
      {canManage ? <a className="button button-crimson pathway-heading-action" href="#new-project">Start project</a> : null}
    </div>

    <div className="studio-kpi-grid studio-kpi-grid-four pathway-library-kpis">
      <div className="studio-kpi"><Route size={18}/><span>Live pathways</span><strong>{summaries.length}</strong><small>Canonical studies available</small></div>
      <div className="studio-kpi"><FolderKanban size={18}/><span>Projects started</span><strong>{projects.length}</strong><small>Distribution workspaces</small></div>
      <div className="studio-kpi"><CircleDashed size={18}/><span>Active campaigns</span><strong>{active}</strong><small>Currently distributing</small></div>
      <div className="studio-kpi"><Send size={18}/><span>Meta flows linked</span><strong>{withAutomation}</strong><small>Keyword messaging connected</small></div>
    </div>

    <section className="admin-card studio-list-card pathway-project-list">
      <div className="studio-section-head">
        <div><span className="section-kicker">Projects</span><h2>Current distribution projects</h2></div>
        <p>Only Pathways you have actually started appear here. The full 20-pathway library stays available below.</p>
      </div>
      {projects.length ? <div className="content-library">
        {projects.map((item) => {
          const status = item.profile?.campaign_status ?? "planning";
          return <Link className="content-library-row pathway-project-row" href={`/admin/pathways/${item.pathway.slug}`} key={item.pathway.slug}>
            <div>
              <span className="content-kind">{item.pathway.collection}</span>
              <strong>{item.pathway.title}</strong>
              <small>{item.assets.length} assets · {item.publishedAssets} published · {item.completion}% publishing progress{item.profile?.primary_keyword ? ` · keyword ${item.profile.primary_keyword}` : ""}</small>
            </div>
            <div className="content-row-end">
              {item.socialAutomationName ? <span className="status-pill">Meta linked</span> : null}
              <span className={status === "complete" ? "status-pill" : status === "active" ? "status-pill status-pending" : "status-pill status-muted"}>{status}</span>
              <ArrowRight size={18}/>
            </div>
          </Link>;
        })}
      </div> : <div className="empty-state pathway-project-empty"><FolderKanban size={22}/><strong>No projects started yet.</strong><p>Choose a live Pathway below. Studio will create its distribution workspace without changing the Pathway itself.</p></div>}
    </section>

    <section className="admin-card pathway-project-picker-card" id="new-project">
      <div className="pathway-project-picker-bar">
        <div><span className="section-kicker">Start project</span><strong>Choose from the 20 live Pathways</strong><small>The dropdown matches the current public Pathway library.</small></div>
        {canManage ? <form action={createPathwayProject} className="pathway-project-picker-form">
          <select name="pathway_slug" defaultValue="" required aria-label="Choose a Pathway">
            <option value="" disabled>Select a Pathway…</option>
            {collections.map((collection) => <optgroup label={collection} key={collection}>
              {summaries.filter((item) => item.pathway.collection === collection).map((item) => <option value={item.pathway.slug} key={item.pathway.slug}>{item.pathway.title}{item.started ? " · started" : ""}</option>)}
            </optgroup>)}
          </select>
          <button className="button button-crimson" type="submit">Start project <ArrowRight size={16}/></button>
        </form> : <div className="role-readonly-note"><strong>Read-only access</strong><p>Your role can review projects but cannot start a new one.</p></div>}
      </div>
      <p className="pathway-picker-help"><strong>Pathway ≠ project.</strong> The Pathway is the study people read. The project is the content and distribution package you create around it.</p>
    </section>
  </>;
}
