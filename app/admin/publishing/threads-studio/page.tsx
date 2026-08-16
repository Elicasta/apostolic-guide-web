import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getStudioPermission } from "@/auth";
import { ThreadsStudioWorkspace } from "@/threads-studio-workspace";

export default async function AdminPublishingThreadsStudioPage() {
  const { access, allowed } = await getStudioPermission("manage_distribution");
  if (!allowed || access.state !== "allowed") redirect("/admin");

  return (
    <div className="threads-studio-page">
      <div className="studio-page-heading">
        <div>
          <span className="eyebrow">Publishing · Threads Studio</span>
          <h1>Threads Studio</h1>
          <p className="admin-lede">Create and review here. Approved copy opens in Publishing already selected for final posting or scheduling.</p>
        </div>
        <Link className="button" href="/admin/publishing?view=threads"><ArrowLeft size={15}/> Publishing</Link>
      </div>
      <ThreadsStudioWorkspace/>
    </div>
  );
}
