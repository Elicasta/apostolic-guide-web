import { redirect } from "next/navigation";
import { getStudioPermission } from "@/auth";
import { hasStudioPermission } from "@/studio-permissions";
import { getWelcomeAutomation, listWelcomeDeliveries } from "@/email-automations";
import { WelcomeAutomationEditor } from "@/email-automation-editor";

export const dynamic = "force-dynamic";
export default async function EmailAutomationsPage() {
  const permission = await getStudioPermission("view_distribution");
  if (!permission.allowed && permission.access.state !== "unconfigured") redirect("/admin");
  const [initial, deliveries] = await Promise.all([getWelcomeAutomation(), listWelcomeDeliveries()]);
  const canManage = permission.access.state === "allowed" && hasStudioPermission(permission.access.role, "manage_distribution");
  return <>
    <span className="eyebrow">Audience</span>
    <h1>Email Automations</h1>
    <p className="admin-lede">Set up messages that send because a person takes an action. Start with the welcome email; Broadcasts are still for one-time campaigns.</p>
    <WelcomeAutomationEditor initial={initial} deliveries={deliveries} canManage={canManage}/>
  </>;
}
