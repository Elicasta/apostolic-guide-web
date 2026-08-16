import { redirect } from "next/navigation";

export default function AdminContentCalendarPage() {
  redirect("/admin/publishing?view=calendar");
}
