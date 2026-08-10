"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Bell, BookOpen, FileClock, FileText, HeartPulse, Inbox, Instagram, ListFilter, Mail, Route, Settings, Sparkles, UserCog, Users } from "lucide-react";
import { hasStudioPermission, type StudioPermission, type StudioRole } from "@/studio-permissions";

const sections: Array<{ label: string; items: Array<{ href: string; label: string; icon: typeof BarChart3; permission: StudioPermission; exact?: boolean }> }> = [
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
    { href: "/admin/content", label: "Website content", icon: FileText, permission: "view_content" },
    { href: "/admin/app-content", label: "App content", icon: BookOpen, permission: "view_content" }
  ]},
  { label: "Distribution", items: [
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

export function StudioNav({ role }: { role: StudioRole }) {
  const pathname = usePathname();
  return <>
    {sections.map((section) => {
      const visibleItems = section.items.filter((item) => hasStudioPermission(role, item.permission));
      if (!visibleItems.length) return null;
      return <div className="studio-nav-group" key={section.label}>
        <div className="admin-nav-section">{section.label}</div>
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href, item.exact);
          return <Link className={active ? "is-active" : ""} aria-current={active ? "page" : undefined} href={item.href} key={item.href}><Icon size={17}/><span>{item.label}</span></Link>;
        })}
      </div>;
    })}
  </>;
}
