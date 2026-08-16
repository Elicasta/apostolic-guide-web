import { redirect } from "next/navigation";

export default function AdminChannelPublishingPage() {
  redirect("/admin/publishing?view=video");
}
