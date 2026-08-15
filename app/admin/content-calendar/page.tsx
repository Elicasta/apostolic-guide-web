import { redirect } from "next/navigation";
import { getStudioPermission } from "@/auth";
import { ContentCalendarStudio } from "@/content-calendar-studio";

export default async function AdminContentCalendarPage() {
  const { access, allowed } = await getStudioPermission("view_distribution");
  if (!allowed || access.state !== "allowed") redirect("/admin");
  return <ContentCalendarStudio/>;
}
