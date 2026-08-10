"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Bell, BookOpen, FileText, Inbox, Instagram, ListFilter, Mail, Route, Settings, Sparkles, Users } from "lucide-react";

const sections = [
  { label: "Workspace", items: [
    { href: "/admin", label: "Overview", icon: BarChart3, exact: true },
    { href: "/admin/growth", label: "Growth Hub", icon: Sparkles },
    { href: "/admin/notifications", label: "Notifications", icon: Bell }
  ]},
  { label: "Relationships", items: [
    { href: "/admin/people", label: "People", icon: Users },
    { href: "/admin/segments", label: "Segments", icon: ListFilter },
    { href: "/admin/inbox", label: "Inbox", icon: Inbox },
    { href: "/admin/journeys", label: "Journeys", icon: Route }
  ]},
  { label: "Publishing", items: [
    { href: "/admin/content", label: "Website content", icon: FileText },
    { href: "/admin/app-content", label: "App content", icon: BookOpen }
  ]},
  { label: "Distribution", items: [
    { href: "/admin/broadcasts", label: "Broadcasts", icon: Mail },
    { href: "/admin/social", label: "Social automations", icon: Instagram },
    { href: "/admin/analytics", label: "Analytics", icon: BarChart3 }
  ]},
  { label: "System", items: [
    { href: "/admin/setup", label: "Setup", icon: Settings }
  ]}
] as const;

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function StudioNav() {
  const pathname = usePathname();
  return <>
    {sections.map((section) => <div className="studio-nav-group" key={section.label}>
      <div className="admin-nav-section">{section.label}</div>
      {section.items.map((item) => {
        const Icon = item.icon;
        const active = isActive(pathname, item.href, "exact" in item ? item.exact : false);
        return <Link className={active ? "is-active" : ""} aria-current={active ? "page" : undefined} href={item.href} key={item.href}><Icon size={17}/><span>{item.label}</span></Link>;
      })}
    </div>)}
  </>;
}
