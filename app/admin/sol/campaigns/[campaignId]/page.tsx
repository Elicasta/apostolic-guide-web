import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminAccess } from "@/auth";
import { createServiceClient } from "@/supabase";
import { hasStudioPermission } from "@/studio-permissions";
import "./campaign.css";

export const dynamic = "force-dynamic";

function object(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : JSON.stringify(value, null, 2);
}

export default async function SolCampaignPage({ params }: { params: Promise<{ campaignId: string }> }) {
  const access = await getAdminAccess();
  if (access.state !== "allowed" || !access.role || !hasStudioPermission(access.role, "view_workspace")) notFound();
  const db = createServiceClient();
  if (!db) throw new Error("Campaign database is unavailable.");
  const { campaignId } = await params;
  const [campaignResult, artifactResult] = await Promise.all([
    db.from("studio_campaigns").select("*").eq("id", campaignId).maybeSingle(),
    db.from("studio_campaign_artifacts").select("id,artifact_type,title,content_json,width,height,ordinal,verification_status,metadata").eq("campaign_id", campaignId).order("ordinal", { ascending: true }).order("created_at", { ascending: true })
  ]);
  if (campaignResult.error) throw campaignResult.error;
  if (artifactResult.error) throw artifactResult.error;
  if (!campaignResult.data) notFound();

  const campaign = campaignResult.data;
  const artifacts = artifactResult.data ?? [];
  const slides = artifacts.filter((item) => item.artifact_type === "carousel_slide");
  const social = object(artifacts.find((item) => item.artifact_type === "social_copy")?.content_json);
  const email = object(artifacts.find((item) => item.artifact_type === "email_draft")?.content_json);
  const youtube = object(artifacts.find((item) => item.artifact_type === "youtube_package")?.content_json);
  const doctrine = object(campaign.doctrine_report);
  const links = object(campaign.link_report);
  const strategy = object(campaign.strategy);
  const copy = object(campaign.copy_package);
  const linkResults = Array.isArray(links.results) ? links.results.map(object) : [];
  const doctrineStatus = String(doctrine.status || "pending");

  return (
    <main className="sol-campaign-page">
      <div className="sol-campaign-shell">
        <Link href="/admin/sol/reviews" className="sol-campaign-back">← Review queue</Link>
        <div className="sol-campaign-kicker">SOL CAMPAIGN REVIEW</div>
        <h1 className="sol-campaign-title">{campaign.title}</h1>
        <p className="sol-campaign-sub">One review surface for the entire production package. Nothing on this page is live-published. Approval only authorizes the workflow to continue past its review gate.</p>
        <div className="sol-campaign-toolbar">
          <span className="sol-campaign-pill">{String(campaign.status).replaceAll("_", " ")}</span>
          <span className={`sol-campaign-pill ${doctrineStatus === "pass" ? "sol-campaign-good" : "sol-campaign-warn"}`}>Doctrine: {doctrineStatus}</span>
          <span className={`sol-campaign-pill ${links.passed === true ? "sol-campaign-good" : "sol-campaign-warn"}`}>Links: {String(links.valid ?? 0)}/{String(links.total ?? 0)}</span>
          <span className="sol-campaign-pill">{slides.length} carousel slides</span>
          <span className="sol-campaign-pill">Publishing: blocked</span>
        </div>

        <div className="sol-campaign-grid">
          <section className="sol-campaign-card wide">
            <h2>Campaign Strategy</h2>
            <h3>Thesis</h3><p>{text(strategy.thesis) || "No thesis recorded."}</p>
            <h3>Hook</h3><p>{text(strategy.hook) || "No hook recorded."}</p>
            <h3>Audience</h3><p>{text(strategy.audience) || "No audience recorded."}</p>
            <h3>Keyword</h3><p>{text(copy.keyword || strategy.keyword) || "No keyword recorded."}</p>
          </section>

          <section className="sol-campaign-card wide">
            <h2>Instagram Carousel</h2>
            {slides.length ? <div className="sol-carousel">{slides.map((slide) => <img key={slide.id} className="sol-slide" src={`/api/admin/sol/campaign-artifacts/${slide.id}`} alt={`${slide.title} slide ${slide.ordinal}`} />)}</div> : <p className="sol-campaign-empty">No carousel slides were generated.</p>}
          </section>

          <section className="sol-campaign-card">
            <h2>Social Copy</h2>
            <h3>Instagram</h3><pre className="sol-campaign-pre">{text(social.instagramCaption || copy.instagramCaption) || "No Instagram copy."}</pre>
            <h3>Short Caption</h3><pre className="sol-campaign-pre">{text(social.shortCaption || copy.shortCaption) || "No short caption."}</pre>
            <h3>Comment Reply</h3><pre className="sol-campaign-pre">{text(social.commentReply || copy.commentReply) || "No comment reply."}</pre>
          </section>

          <section className="sol-campaign-card">
            <h2>YouTube Package</h2>
            <h3>Title</h3><p>{text(youtube.youtubeTitle || copy.youtubeTitle) || "No title."}</p>
            <h3>Description</h3><pre className="sol-campaign-pre">{text(youtube.youtubeDescription || copy.youtubeDescription) || "No description."}</pre>
            <h3>Production Readiness</h3><p>{youtube.readyForReview === true ? "Approved audio and a video project are attached." : "Publishing package is prepared. Video production prerequisites may still need work."}</p>
          </section>

          <section className="sol-campaign-card">
            <h2>Email Draft</h2>
            <h3>Subject</h3><p>{text(email.subject || copy.emailSubject) || "No subject."}</p>
            <h3>Body</h3><pre className="sol-campaign-pre">{text(email.body || copy.emailBody) || "No email body."}</pre>
            <p className="sol-campaign-empty">Sent: no</p>
          </section>

          <section className="sol-campaign-card">
            <h2>Keyword Automation</h2>
            <p><strong>{text(copy.keyword || strategy.keyword) || "Keyword"}</strong></p>
            <p>{text(copy.commentReply) || "No automated reply copy."}</p>
            <p className="sol-campaign-empty">State: disabled draft. Review approval does not activate it.</p>
          </section>

          <section className="sol-campaign-card">
            <h2>Doctrine Check</h2>
            <p>Status: <strong>{doctrineStatus}</strong></p>
            <p>{text(doctrine.explanation) || "No checker explanation recorded."}</p>
            {Array.isArray(doctrine.issues) && doctrine.issues.length ? <pre className="sol-campaign-pre">{doctrine.issues.map(String).join("\n")}</pre> : <p className="sol-campaign-empty">No doctrine issues recorded.</p>}
          </section>

          <section className="sol-campaign-card sol-campaign-links">
            <h2>Destination Links</h2>
            {linkResults.length ? linkResults.map((row, index) => <p key={`${String(row.url)}-${index}`}><a href={String(row.url)} target="_blank" rel="noreferrer">{String(row.url)}</a><br />{row.ok === true ? `Verified ${String(row.status)}` : `Failed: ${String(row.error || row.status || "unknown")}`}</p>) : <p className="sol-campaign-empty">No link report recorded.</p>}
          </section>
        </div>

        <div className="sol-campaign-banner"><strong>Authority boundary:</strong> this workflow prepares and verifies drafts. Live publishing, sending, automation activation, destructive deletion, deployment, financial actions, and security changes keep their own authority gates.</div>
      </div>
    </main>
  );
}
