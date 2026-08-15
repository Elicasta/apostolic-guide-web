import { redirect } from "next/navigation";
import { Bot, Eye, MessageCircleReply, ShieldCheck, TriangleAlert } from "lucide-react";
import { getStudioPermission } from "@/auth";
import { APOSTOLIC_DOCTRINE_LOCK } from "@/comment-guide";
import { CommentGuideManager } from "@/comment-guide-manager";
import { getCommentGuideDashboard } from "@/comment-guide-runtime";
import { allPathways } from "@/pathway-catalog";
import { getInstagramConnection } from "@/social-messaging";
import { hasStudioPermission } from "@/studio-permissions";

export default async function CommentGuidePage() {
  const permission = await getStudioPermission("view_distribution");
  if (!permission.allowed && permission.access.state !== "unconfigured") redirect("/admin");
  const canManage = permission.access.state === "unconfigured" || hasStudioPermission(permission.access.role, "manage_distribution");
  const [dashboard, instagram] = await Promise.all([getCommentGuideDashboard(), getInstagramConnection()]);

  return <>
    <div className="studio-page-heading comment-guide-heading"><div><span className="eyebrow">Instagram · Sol first</span><h1>Comment Guide</h1><p className="admin-lede">Every comment is read before anything happens. Warm comments get a human reply, questions get one calm Scripture-first answer, keyword requests enter the existing guide handoff, and contention never becomes a comment war.</p></div><div className={`comment-guide-mode-badge is-${dashboard.settings.mode}`}><Bot size={17}/><span><strong>{dashboard.settings.mode}</strong><small>GPT-5.6 Sol</small></span></div></div>

    <div className="publishing-metrics comment-guide-metrics">
      <div><Eye size={18}/><strong>{dashboard.metrics.receivedToday}</strong><span>Read today</span></div>
      <div><MessageCircleReply size={18}/><strong>{dashboard.metrics.repliedToday}</strong><span>Replied today</span></div>
      <div><ShieldCheck size={18}/><strong>{dashboard.metrics.shadowedToday}</strong><span>Shadow checked</span></div>
      <div><TriangleAlert size={18}/><strong>{dashboard.metrics.failed}</strong><span>Failed safely</span></div>
    </div>

    <CommentGuideManager dashboard={dashboard} canManage={canManage} openAIConfigured={Boolean(process.env.OPENAI_API_KEY?.trim())} instagramConfigured={instagram.configured}/>

    <section className="admin-card comment-guide-doctrine-card">
      <div className="card-heading"><div><span className="section-kicker">Doctrine lock</span><h2>The boundary Sol cannot leave</h2></div><p>Both Sol passes receive this fixed Apostolic position. A separate validator then checks the final words and cited verses before scheduling.</p></div>
      <div className="comment-guide-doctrine-grid">{APOSTOLIC_DOCTRINE_LOCK.map((rule) => <div key={rule}><ShieldCheck size={16}/><p>{rule}</p></div>)}</div>
      <div className="comment-guide-pathways"><div><span className="section-kicker">Approved destinations</span><strong>{allPathways.length} current Pathways</strong></div><div>{allPathways.map((pathway) => <span key={pathway.slug}>{pathway.title}</span>)}</div></div>
    </section>
  </>;
}
