"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Layers3, MessageCircleMore, Send, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { hasStudioPermission, type StudioPermission, type StudioRole } from "@/studio-permissions";

type StandaloneNavigator = Navigator & { standalone?: boolean };
type BottomItem = {
  href: string;
  label: string;
  icon: typeof House;
  permission: StudioPermission;
  active: (pathname: string) => boolean;
};

const createRoutes = ["/admin/app/create", "/admin/carousel-studio", "/admin/threads-studio", "/admin/episode-studio", "/admin/audio", "/admin/video-producer", "/admin/video-studio"];
const socialRoutes = ["/admin/app/socials", "/admin/social", "/admin/comment-guide", "/admin/analytics"];
const peopleRoutes = ["/admin/app/people", "/admin/people", "/admin/inbox", "/admin/broadcasts", "/admin/journeys", "/admin/segments", "/admin/notifications"];

const items: BottomItem[] = [
  { href: "/admin/app", label: "Home", icon: House, permission: "view_workspace", active: (pathname) => pathname === "/admin/app" },
  { href: "/admin/app/create", label: "Create", icon: Layers3, permission: "manage_content", active: (pathname) => createRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`)) },
  { href: "/admin/publishing", label: "Publish", icon: Send, permission: "view_distribution", active: (pathname) => pathname.startsWith("/admin/publishing") },
  { href: "/admin/app/socials", label: "Socials", icon: MessageCircleMore, permission: "view_distribution", active: (pathname) => socialRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`)) },
  { href: "/admin/app/people", label: "People", icon: Users, permission: "view_people", active: (pathname) => peopleRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`)) }
];

function detectStandalone(media: MediaQueryList) {
  const iosStandalone = typeof navigator !== "undefined" && Boolean((navigator as StandaloneNavigator).standalone);
  return media.matches || iosStandalone;
}

export function StudioStandaloneBottomNav({ role }: { role: StudioRole }) {
  const pathname = usePathname() || "/admin";
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(display-mode: standalone)");
    const update = () => {
      const next = detectStandalone(media);
      setStandalone(next);
      document.documentElement.classList.toggle("studio-standalone", next);
    };
    update();
    media.addEventListener?.("change", update);
    return () => {
      media.removeEventListener?.("change", update);
      document.documentElement.classList.remove("studio-standalone");
    };
  }, []);

  if (!standalone || typeof document === "undefined") return null;
  const visible = items.filter((item) => hasStudioPermission(role, item.permission));

  return createPortal(
    <nav className="studio-standalone-bottom-nav" aria-label="Studio app navigation">
      {visible.map((item) => {
        const Icon = item.icon;
        const active = item.active(pathname);
        return <Link key={item.href} href={item.href} className={active ? "is-active" : ""} aria-current={active ? "page" : undefined}>
          <Icon size={20}/>
          <span>{item.label}</span>
        </Link>;
      })}
    </nav>,
    document.body
  );
}
