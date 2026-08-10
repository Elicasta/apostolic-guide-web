import { Bell, CheckCircle2 } from "lucide-react";
import { listStudioNotifications } from "@/studio-notifications";
import { NotificationCenter } from "@/notification-center";

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const params = await searchParams;
  const unreadOnly = params.view === "unread";
  const [notifications, allUnread] = await Promise.all([
    listStudioNotifications({ unreadOnly, limit: 150 }),
    listStudioNotifications({ unreadOnly: true, limit: 500 })
  ]);

  return <>
    <span className="eyebrow">Workspace</span>
    <div className="studio-page-heading">
      <div><h1>Notifications</h1><p className="admin-lede">Conversations, subscribers, journey handoffs, completions, and delivery failures that need your attention.</p></div>
      <div className="notification-view-switch"><a className={!unreadOnly ? "is-active" : ""} href="/admin/notifications"><Bell size={14}/> All</a><a className={unreadOnly ? "is-active" : ""} href="/admin/notifications?view=unread"><CheckCircle2 size={14}/> Unread</a></div>
    </div>
    <NotificationCenter notifications={notifications} unreadCount={allUnread.length}/>
  </>;
}
