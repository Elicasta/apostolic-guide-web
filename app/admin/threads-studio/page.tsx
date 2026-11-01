import Link from "next/link";
import { redirect } from "next/navigation";
import { Send } from "lucide-react";
import { getStudioPermission } from "@/auth";
import { ThreadsStudioWorkspace } from "@/threads-studio-workspace";

export default async function AdminThreadsStudioPage() {
  const { access, allowed } = await getStudioPermission("manage_distribution");
  if (!allowed || access.state !== "allowed") redirect("/admin");

  return (
    <div className="threads-studio-page">
      <div className="studio-page-heading">
        <div>
          <span className="eyebrow">Create · Threads Studio</span>
          <h1>Threads Studio</h1>
          <p className="admin-lede">Create, edit, and theology-check Threads here. Approved copy moves into Master Publishing already selected for final posting or scheduling.</p>
        </div>
        <Link className="button" href="/admin/publishing?view=threads"><Send size={15}/> Publishing</Link>
      </div>
      <ThreadsStudioWorkspace/>
    </div>
  );
}
