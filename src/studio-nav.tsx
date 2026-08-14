"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BarChart3, Bell, BookOpen, FileClock, FileText, Film, Headphones, HeartPulse, Inbox, Instagram, Layers3, ListFilter, Mail, Menu, Route, Send, Settings, Sparkles, UserCog, Users, X } from "lucide-react";
import { hasStudioPermission, type StudioPermission, type StudioRole } from "@/studio-permissions";

export const studioNavSections: Array<{ label: string; items: Array<{ href: string; label: string; icon: typeof BarChart3; permission: StudioPermission; exact?: boolean }> }> = [
  { label: "Workspace", items: [
    { href: "/admin", label: "Overview", icon: BarChart3, permission: "view_workspace", exact: true },
    { href: "/admin/growth", label: "Growth Hub", icon: Sparkles, permission: "view_workspace" },
    { href: "/admin/notifications", label: "Notifications", icon: Bell, permission: "view_notifications" }
  ]},
  { label: "Relationships", items: [
    { href: "/admin/people", label: "People", icon: Users, permission: "view_people" },
    { href: "/admin/segments", label: "Segments", icon: ListFilter, permission: "view_segments" },
    { href: "/admin/inbox", label: "Inbox", icon: Inbox, permission: "view_inbox" },
    { href: "/admin/journeys", label: "Journeys", icon: Route, permission: "view_journeys" }
  ]},
  { label: "Publishing", items: [
    { href: "/admin/pathways", label: "Pathway publishing", icon: Route, permission: "view_content" },
    { href: "/admin/audio", label: "Pathway audio", icon: Headphones, permission: "manage_content" },
    { href: "/admin/video-studio", label: "Video Studio", icon: Film, permission: "manage_content" },
    { href: "/admin/video-producer", label: "Video Producer", icon: Sparkles, permission: "manage_content" },
    { href: "/admin/carousel-studio", label: "Carousel Studio", icon: Layers3, permission: "manage_content" },
    { href: "/admin/content", label: "Website content", icon: FileText, permission: "view_content" },
    { href: "/admin/app-content", label: "App content", icon: BookOpen, permission: "view_content" }
  ]},
  { label: "Distribution", items: [
    { href: "/admin/publish", label: "Channel Publishing", icon: Send, permission: "view_distribution" },
    { href: "/admin/broadcasts", label: "Broadcasts", icon: Mail, permission: "view_distribution" },
    { href: "/admin/social", label: "Social automations", icon: Instagram, permission: "view_distribution" },
    { href: "/admin/analytics", label: "Analytics", icon: BarChart3, permission: "view_analytics" }
  ]},
  { label: "System", items: [
    { href: "/admin/health", label: "Health", icon: HeartPulse, permission: "view_health" },
    { href: "/admin/audit", label: "Audit Log", icon: FileClock, permission: "view_audit" },
    { href: "/admin/team", label: "Team & roles", icon: UserCog, permission: "manage_team" },
    { href: "/admin/setup", label: "Setup", icon: Settings, permission: "manage_integrations" }
  ]}
];

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavigationSections({ role, onNavigate, mobile = false }: { role: StudioRole; onNavigate?: () => void; mobile?: boolean }) {
  const pathname = usePathname();
  return <>
    {studioNavSections.map((section) => {
      const visibleItems = section.items.filter((item) => hasStudioPermission(role, item.permission));
      if (!visibleItems.length) return null;
      return <div className={mobile ? "studio-mobile-nav-section" : "studio-nav-group"} key={section.label}>
        <div className="admin-nav-section">{section.label}</div>
        <div className={mobile ? "studio-mobile-nav-items" : undefined}>
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href, item.exact);
            return <Link onClick={onNavigate} className={active ? "is-active" : ""} aria-current={active ? "page" : undefined} href={item.href} key={item.href}><Icon size={17}/><span>{item.label}</span></Link>;
          })}
        </div>
      </div>;
    })}
  </>;
}

export function StudioNav({ role }: { role: StudioRole }) {
  return <NavigationSections role={role}/>;
}

export function StudioMobileNav({ role }: { role: StudioRole }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  return <div className="studio-mobile-nav-root">
    <button type="button" className="studio-mobile-menu-button" onClick={() => setOpen(true)} aria-label="Open Studio navigation" aria-expanded={open}><Menu size={20}/></button>
    {open ? <>
      <button type="button" className="studio-mobile-nav-backdrop" onClick={() => setOpen(false)} aria-label="Close navigation"/>
      <aside className="studio-mobile-nav-drawer" aria-label="Studio navigation">
        <div className="studio-mobile-nav-head"><div><strong>Studio</strong><span>Navigate workspace</span></div><button type="button" onClick={() => setOpen(false)} aria-label="Close navigation"><X size={20}/></button></div>
        <div className="studio-mobile-nav-scroll"><NavigationSections role={role} mobile onNavigate={() => setOpen(false)}/></div>
        <div className="studio-mobile-nav-footer"><Link href="/" onClick={() => setOpen(false)}>View public site</Link></div>
      </aside>
    </> : null}
  </div>;
}
