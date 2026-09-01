import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, ExternalLink, Home, LogOut, Plus } from "lucide-react";
import { getAdminAccess } from "@/auth";
import { StudioMobileNav, StudioNav } from "@/studio-nav";
import { StudioCommandPalette } from "@/studio-command-palette";
import { StudioStandaloneBottomNav } from "@/studio-standalone-nav";
import { STUDIO_ROLE_LABELS, type StudioRole } from "@/studio-permissions";
import { getNotificationUnreadCount } from "@/studio-notifications";
import "./admin-surface-isolation.css";
import "./publishing.css";
import "./campaign-intelligence.css";
import "./social-messaging.css";
import "./comment-guide.css";
import "./growth.css";
import "./people.css";
import "./journeys.css";
import "./relationship.css";
import "./relationship-intelligence.css";
import "./inbox.css";
import "./segments.css";
import "./notifications.css";
import "./studio-system.css";
import "./system.css";
import "./system-polish.css";
import "./audit.css";
import "./study-intelligence.css";
import "./intelligence.css";
import "./analytics-v3.css";
import "./pathway-projects.css";
import "./pathway-audio.css";
import "./video-studio.css";
import "./video-studio-auto.css";
import "./video-publishing-kit.css";
import "./social-publishing-credentials.css";
import "./video-studio-review.css";
import "./channel-publishing.css";
import "./ai-clips-v2.css";
import "./video-producer.css";
import "./video-producer-flow.css";
import "./video-producer-episode-studio.css";
import "./episode-studio-lane.css";
import "./pathway-asset-ingest.css";
import "./pathway-source-asset.css";
import "./sol-operator.css";
import "./sol-jarvis.css";
import "./sol-control.css";
import "./sol-v4-forge.css";
import "./sol-manager-v4.css";
import "./sol-manager-v4-fixes.css";
import "./carousel-studio.css";
import "./creative-studio.css";
import "./creative-studio-controls.css";
import "./creative-template-system.css";
import "./carousel-persistent-artwork.css";
import "./threads-studio-polish.css";
import "./content-calendar-polish.css";
import "./master-publishing.css";
import "./master-publishing-guided.css";
import "./natural-voice-check.css";
import "./carousel-library-final-polish.css";
import "./carousel-mobile-workflow-cleanup.css";
import "./production-mobile-regression-fix.css";
import "./publishing-mobile-app.css";
import "./studio-mobile-spacing-audit.css";
import "./studio-mobile-social-people.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Apostolic Guide Studio",
  applicationName: "Apostolic Guide Studio",
  manifest: "/studio-manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "AG Studio",
    statusBarStyle: "black-translucent"
  },
  formatDetection: { telephone: false },
  icons: { apple: "/icons/icon-192.png" }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f6f7f7"
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const access = await getAdminAccess();
  if (access.state === "signed_out") redirect("/login");
  if (access.state === "forbidden") redirect("/");
  const configured = access.state !== "unconfigured";
  const role: StudioRole = access.state === "allowed" && access.role ? access.role : "owner";
  const unreadNotifications = configured ? await getNotificationUnreadCount() : 0;

  return (
    <div className="admin-layout">
      <header className="admin-header">
        <Link className="studio-brand" href="/admin" aria-label="Apostolic Guide Studio home">
          <span className="studio-brand-mark">AG</span>
          <span className="studio-brand-copy"><strong>Apostolic Guide</strong><small>Studio</small></span>
        </Link>
        <div className="studio-header-actions">
          <StudioCommandPalette role={role}/>
          <span className="studio-user-email">{access.user?.email ?? "Local setup mode"}<small>{STUDIO_ROLE_LABELS[role]}</small></span>
          <Link className="studio-notification-link" href="/admin/notifications" aria-label={`${unreadNotifications} unread notifications`}><Bell size={17}/>{unreadNotifications > 0 ? <span>{unreadNotifications > 99 ? "99+" : unreadNotifications}</span> : null}</Link>
          <Link className="studio-view-site" href="/" target="_blank"><Home size={16}/> Visit site <ExternalLink size={14}/></Link>
          <Link className="studio-new-project" href="/admin/pathways#new-project"><Plus size={16}/><span>New Project</span></Link>
          <StudioMobileNav role={role}/>
        </div>
      </header>
      <div className="admin-shell">
        <nav className="admin-nav" aria-label="Admin navigation">
          <StudioNav role={role}/>
          <div className="studio-nav-group studio-nav-account">
            <form action="/auth/signout" method="post"><button className="admin-signout" type="submit"><LogOut size={17}/><span>Sign out</span></button></form>
          </div>
        </nav>
        <div className="admin-main">
          {!configured && <div className="admin-notice"><strong>Setup mode.</strong> Add Supabase environment variables before using authentication or publishing.</div>}
          {children}
        </div>
      </div>
      <StudioStandaloneBottomNav role={role}/>
    </div>
  );
}
