"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Activity, BarChart3, Bell, BookOpen, Bot, FileClock, FileText, HeartHandshake, Inbox, Instagram, ListFilter, Mail, MessageCircle, Route, Search, Send, Settings, ShieldCheck, Sparkles, UserCog, Users, type LucideIcon } from "lucide-react";
import { hasStudioPermission, type StudioPermission, type StudioRole } from "@/studio-permissions";

type SearchResult = {
  id: string;
  label: string;
  description: string;
  type: "person" | "article" | "answer" | "topic" | "pathway" | "scripture" | "journey";
  href: string;
};

type PaletteItem = SearchResult & { Icon: LucideIcon };

type StaticCommand = {
  id: string;
  label: string;
  description: string;
  href: string;
  permission: StudioPermission;
  Icon: LucideIcon;
};

const staticCommands: StaticCommand[] = [
  { id: "overview", label: "Overview", description: "Open the Studio dashboard", href: "/admin", permission: "view_workspace", Icon: BarChart3 },
  { id: "sol", label: "Sol Content Operator", description: "Review gaps, approvals, runs, and KPI pace", href: "/admin/sol", permission: "view_workspace", Icon: Bot },
  { id: "growth", label: "Growth Hub", description: "Growth and channel overview", href: "/admin/growth", permission: "view_workspace", Icon: Sparkles },
  { id: "people", label: "People", description: "Search relationship profiles", href: "/admin/people", permission: "view_people", Icon: Users },
  { id: "segments", label: "Segments", description: "Open live and custom audiences", href: "/admin/segments", permission: "view_segments", Icon: ListFilter },
  { id: "inbox", label: "Inbox", description: "Open conversations and follow-up", href: "/admin/inbox", permission: "view_inbox", Icon: Inbox },
  { id: "journeys", label: "Journeys", description: "Open relationship journeys", href: "/admin/journeys", permission: "view_journeys", Icon: Route },
  { id: "website-content", label: "Website content", description: "Open publishing workspace", href: "/admin/content", permission: "view_content", Icon: FileText },
  { id: "app-content", label: "App content", description: "Open shared app content", href: "/admin/app-content", permission: "view_content", Icon: BookOpen },
  { id: "episode-studio", label: "Episode Studio", description: "Move an episode through Script, Audio, Video, and Publish", href: "/admin/episode-studio", permission: "manage_content", Icon: FileText },
  { id: "publishing", label: "Publishing", description: "Open the master outbound publishing desk", href: "/admin/publishing", permission: "view_distribution", Icon: Send },
  { id: "threads-studio", label: "Threads Studio", description: "Create and theology-check Threads before publishing", href: "/admin/threads-studio", permission: "view_distribution", Icon: MessageCircle },
  { id: "broadcasts", label: "Broadcasts", description: "Create and review email broadcasts", href: "/admin/broadcasts", permission: "view_distribution", Icon: Mail },
  { id: "social", label: "Social automations", description: "Instagram automation controls", href: "/admin/social", permission: "view_distribution", Icon: Instagram },
  { id: "analytics", label: "Analytics", description: "Open traffic and study analytics", href: "/admin/analytics", permission: "view_analytics", Icon: Activity },
  { id: "notifications", label: "Notifications", description: "Open Studio activity alerts", href: "/admin/notifications", permission: "view_notifications", Icon: Bell },
  { id: "health", label: "Health dashboard", description: "Check production services", href: "/admin/health", permission: "view_health", Icon: HeartHandshake },
  { id: "audit", label: "Audit Log", description: "Review privileged Studio actions", href: "/admin/audit", permission: "view_audit", Icon: FileClock },
  { id: "team", label: "Team & roles", description: "Manage Studio members and permissions", href: "/admin/team", permission: "manage_team", Icon: UserCog },
  { id: "setup", label: "Setup", description: "Open Studio configuration", href: "/admin/setup", permission: "manage_integrations", Icon: Settings }
];

function iconForType(type: SearchResult["type"]): LucideIcon {
  if (type === "person") return Users;
  if (type === "journey") return Route;
  if (type === "pathway") return ListFilter;
  if (type === "scripture") return BookOpen;
  if (type === "article") return FileText;
  if (type === "answer") return ShieldCheck;
  return Sparkles;
}

export function StudioCommandPalette({ role }: { role: StudioRole }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [remoteResults, setRemoteResults] = useState<SearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  const allowedCommands = useMemo(() => staticCommands.filter((command) => hasStudioPermission(role, command.permission)), [role]);
  const localCommands = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return allowedCommands;
    return allowedCommands.filter((command) => `${command.label} ${command.description}`.toLowerCase().includes(needle));
  }, [allowedCommands, query]);

  const items: PaletteItem[] = useMemo(() => [
    ...localCommands.map((command) => ({ id: `command:${command.id}`, label: command.label, description: command.description, type: "topic" as const, href: command.href, Icon: command.Icon })),
    ...remoteResults.map((result) => ({ ...result, Icon: iconForType(result.type) }))
  ], [localCommands, remoteResults]);

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    const needle = query.trim();
    if (needle.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/admin/command-search?q=${encodeURIComponent(needle)}`, { signal: controller.signal });
        const data = await response.json().catch(() => ({ results: [] }));
        if (response.ok) setRemoteResults(Array.isArray(data.results) ? data.results : []);
      } catch (error) {
        if ((error as Error)?.name !== "AbortError") setRemoteResults([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query]);

  function go(item: PaletteItem) {
    setOpen(false);
    setQuery("");
    setRemoteResults([]);
    router.push(item.href);
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (!items.length) return;
    if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((index) => (index + 1) % items.length); }
    if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((index) => (index - 1 + items.length) % items.length); }
    if (event.key === "Enter") { event.preventDefault(); go(items[Math.min(activeIndex, items.length - 1)]); }
  }

  function onQueryChange(value: string) {
    setQuery(value);
    setActiveIndex(0);
    if (value.trim().length < 2) {
      setRemoteResults([]);
      setLoading(false);
    }
  }

  return <>
    <button className="studio-command-trigger" type="button" onClick={() => setOpen(true)} aria-label="Open command palette"><Search size={15}/><span>Search Studio</span><kbd>⌘K</kbd></button>
    {open ? <div className="command-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setOpen(false); }}>
      <div className="command-panel" role="dialog" aria-modal="true" aria-label="Studio command palette">
        <div className="command-search"><Search size={18}/><input ref={inputRef} value={query} onChange={(event) => onQueryChange(event.target.value)} onKeyDown={onKeyDown} placeholder="Search people, Scripture, pathways, journeys, or commands…"/><kbd>ESC</kbd></div>
        <div className="command-results">
          {!query.trim() ? <div className="command-group-label">Navigate</div> : <div className="command-group-label">{loading ? "Searching…" : "Results"}</div>}
          {items.length ? items.map((item, index) => {
            const Icon = item.Icon;
            return <button className={`command-result${index === activeIndex ? " is-active" : ""}`} type="button" key={item.id} onMouseEnter={() => setActiveIndex(index)} onClick={() => go(item)}>
              <span className="command-result-icon"><Icon size={15}/></span>
              <span className="command-result-copy"><strong>{item.label}</strong><span>{item.description}</span></span>
              <span className="command-result-type">{item.id.startsWith("command:") ? "Go" : item.type}</span>
            </button>;
          }) : <div className="command-empty">{loading ? "Searching Apostolic Guide…" : "No matching people, content, journeys, or commands."}</div>}
        </div>
        <div className="command-footer"><span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><kbd>↵</kbd> open <kbd>esc</kbd> close</span></div>
      </div>
    </div> : null}
  </>;
}
