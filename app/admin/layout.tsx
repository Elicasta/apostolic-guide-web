import Link from "next/link";
import { redirect } from "next/navigation";
import { Home, LogOut } from "lucide-react";
import { getAdminAccess } from "@/auth";
import { StudioNav } from "@/studio-nav";
import "./publishing.css";
import "./campaign-intelligence.css";
import "./social-messaging.css";
import "./growth.css";
import "./people.css";
import "./journeys.css";
import "./relationship.css";
import "./inbox.css";
import "./studio-system.css";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const access = await getAdminAccess();
  if (access.state === "signed_out") redirect("/login");
  if (access.state === "forbidden") redirect("/");
  const configured = access.state !== "unconfigured";

  return (
    <div className="admin-layout">
      <header className="admin-header">
        <Link className="studio-brand" href="/admin" aria-label="Apostolic Guide Studio home">
          <span className="studio-brand-mark">AG</span>
          <span className="studio-brand-copy"><strong>Apostolic Guide</strong><small>Studio</small></span>
        </Link>
        <div className="studio-header-actions"><span className="studio-user-email">{access.user?.email ?? "Local setup mode"}</span><Link className="studio-view-site" href="/"><Home size={16} /> View site</Link></div>
      </header>
      <div className="admin-shell">
        <nav className="admin-nav" aria-label="Admin navigation">
          <StudioNav />
          <div className="studio-nav-group studio-nav-account">
            <form action="/auth/signout" method="post"><button className="admin-signout" type="submit"><LogOut size={17} /><span>Sign out</span></button></form>
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
