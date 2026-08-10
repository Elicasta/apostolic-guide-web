import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3, BookOpen, FileText, Home, Instagram, LogOut, Mail, Route, Settings, Sparkles, Users } from "lucide-react";
import { getAdminAccess } from "@/auth";
import "./publishing.css";
import "./campaign-intelligence.css";
import "./social-messaging.css";
import "./growth.css";
import "./people.css";
import "./journeys.css";
import "./relationship.css";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const access = await getAdminAccess();
  if (access.state === "signed_out") redirect("/login");
  if (access.state === "forbidden") redirect("/");
  const configured = access.state !== "unconfigured";

  return (
    <div className="admin-layout">
      <header className="admin-header">
        <div><strong>APOSTOLIC GUIDE</strong><span>Studio</span></div>
        <div><span>{access.user?.email ?? "Local setup mode"}</span><Link href="/"><Home size={17} /> View site</Link></div>
      </header>
      <div className="admin-shell">
        <nav className="admin-nav" aria-label="Admin navigation">
          <Link href="/admin"><BarChart3 size={17} /> Overview</Link>
          <Link href="/admin/growth"><Sparkles size={17} /> Growth Hub</Link>
          <Link href="/admin/people"><Users size={17} /> People</Link>
          <Link href="/admin/journeys"><Route size={17} /> Journeys</Link>
          <Link href="/admin/content"><FileText size={17} /> Website content</Link>
          <Link href="/admin/app-content"><BookOpen size={17} /> App content</Link>
          <Link href="/admin/broadcasts"><Mail size={17} /> Broadcasts</Link>
          <Link href="/admin/social"><Instagram size={17} /> Social automations</Link>
          <Link href="/admin/analytics"><BarChart3 size={17} /> Analytics</Link>
          <Link href="/admin/setup"><Settings size={17} /> Setup</Link>
          <form action="/auth/signout" method="post"><button className="admin-signout" type="submit"><LogOut size={17} /> Sign out</button></form>
        </nav>
        <div className="admin-main">
          {!configured && <div className="admin-notice"><strong>Setup mode.</strong> Add Supabase environment variables before using authentication or publishing.</div>}
          {children}
        </div>
      </div>
    </div>
  );
}
