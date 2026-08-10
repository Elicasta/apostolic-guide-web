"use client";

import { AlertTriangle, CheckCircle2, CircleAlert, Inbox, Mail, Route, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { StudioNotification } from "@/studio-notifications";

function iconFor(type: string) {
  if (type === "inbox_message") return <Inbox size={17}/>;
  if (type === "subscriber") return <UserPlus size={17}/>;
  if (type.includes("journey")) return <Route size={17}/>;
  if (type.includes("broadcast")) return <Mail size={17}/>;
  if (type.includes("failure")) return <AlertTriangle size={17}/>;
  return <CircleAlert size={17}/>;
}

export function NotificationCenter({ notifications, unreadCount }: { notifications: StudioNotification[]; unreadCount: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function markRead(id: number) {
    await fetch("/api/admin/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "read", id }), keepalive: true }).catch(() => null);
  }

  async function open(notification: StudioNotification) {
    if (!notification.read_at) await markRead(notification.id);
    if (notification.href) router.push(notification.href);
    else router.refresh();
  }

  async function markAll() {
    setBusy(true);
    await fetch("/api/admin/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "read_all" }) });
    setBusy(false);
    router.refresh();
  }

  return <section className="admin-card notification-center-card">
    <div className="studio-section-head"><div><span className="section-kicker">Activity center</span><h2>Notifications</h2></div>{unreadCount ? <button className="button button-outline" type="button" onClick={markAll} disabled={busy}><CheckCircle2 size={15}/>{busy ? "Updating…" : "Mark all read"}</button> : <span>All caught up</span>}</div>
    {notifications.length ? <div className="notification-list">{notifications.map((notification) => <button className={`notification-row${notification.read_at ? "" : " is-unread"}`} type="button" key={notification.id} onClick={() => open(notification)}>
      <span className={`notification-icon notification-${notification.severity}`}>{iconFor(notification.type)}</span>
      <span className="notification-copy"><strong>{notification.title}</strong><small>{notification.detail ?? "Apostolic Guide Studio activity"}</small><time>{new Date(notification.created_at).toLocaleString()}</time></span>
      {!notification.read_at ? <span className="notification-dot" aria-label="Unread"/> : null}
    </button>)}</div> : <div className="empty-state"><CheckCircle2 size={26}/><strong>No notifications yet.</strong><p>New conversations, subscribers, journey handoffs, completions, and delivery failures will appear here automatically.</p></div>}
  </section>;
}
