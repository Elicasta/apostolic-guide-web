import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, BookOpen, MonitorPlay, Smartphone } from "lucide-react";
import { getStudioPermission } from "@/auth";

export default async function AdminTeleprompterPage() {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed") redirect("/admin");

  return <>
    <span className="eyebrow">Create</span>
    <div className="studio-page-heading">
      <div>
        <h1>Teleprompter</h1>
        <p className="admin-lede">Write and present recording scripts from Apostolic Guide Studio. Use the iPad as the reading surface and your phone as the perfectly synchronized remote.</p>
      </div>
      <Link className="button" href="/teleprompter/library"><BookOpen size={16}/> Open script library</Link>
    </div>

    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "16px", marginTop: "24px" }}>
      <Link className="admin-card" href="/teleprompter/library" style={{ display: "grid", gap: "12px", textDecoration: "none" }}>
        <BookOpen size={22}/>
        <div><span className="section-kicker">Author</span><h2>Script library</h2><p>Write, edit, duplicate, and choose the script you want to present.</p></div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontWeight: 700 }}>Open library <ArrowRight size={15}/></span>
      </Link>

      <Link className="admin-card" href="/teleprompter" target="_blank" style={{ display: "grid", gap: "12px", textDecoration: "none" }}>
        <MonitorPlay size={22}/>
        <div><span className="section-kicker">iPad</span><h2>Presentation display</h2><p>Open the full-screen reading surface and create a live session for your recording.</p></div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontWeight: 700 }}>Launch display <ArrowRight size={15}/></span>
      </Link>

      <Link className="admin-card" href="/teleprompter/control" target="_blank" style={{ display: "grid", gap: "12px", textDecoration: "none" }}>
        <Smartphone size={22}/>
        <div><span className="section-kicker">Phone</span><h2>Remote control</h2><p>Join the display session from any network and control sections, theme, font size, and lock state.</p></div>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontWeight: 700 }}>Open remote <ArrowRight size={15}/></span>
      </Link>
    </div>

    <section className="admin-card" style={{ marginTop: "20px" }}>
      <span className="section-kicker">Private Studio tool</span>
      <h2>Protected by your Apostolic Guide admin login</h2>
      <p>The library, iPad display, phone remote, and session checkpoint API all require the same authenticated Studio account. The presentation itself stays full-screen and free of Admin navigation chrome.</p>
    </section>
  </>;
}
