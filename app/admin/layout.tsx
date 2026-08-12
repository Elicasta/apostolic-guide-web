import Link from "next/link";
import { redirect } from "next/navigation";
import { Bell, ExternalLink, Home, LogOut, Plus } from "lucide-react";
import { getAdminAccess } from "@/auth";
import { StudioMobileNav, StudioNav } from "@/studio-nav";
import { StudioCommandPalette } from "@/studio-command-palette";
import { STUDIO_ROLE_LABELS, type StudioRole } from "@/studio-permissions";
import { getNotificationUnreadCount } from "@/studio-notifications";
import "./publishing.css";
import "./campaign-intelligence.css";
import "./social-messaging.css";
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
import "./pathway-projects.css";
import "./pathway-audio.css";
import "./video-studio.css";

export const dynamic = "force-dynamic";

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
    </div>
  );
}
