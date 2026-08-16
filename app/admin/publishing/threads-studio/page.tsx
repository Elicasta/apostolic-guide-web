import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getStudioPermission } from "@/auth";
import { ThreadsSingleComposer } from "@/threads-single-composer";
import { ThreadsPublishingSuite } from "@/threads-publishing-suite";

export default async function AdminPublishingThreadsStudioPage() {
  const { access, allowed } = await getStudioPermission("manage_distribution");
  if (!allowed || access.state !== "allowed") redirect("/admin");

  return (
    <div className="threads-studio-page">
      <div className="studio-page-heading">
        <div>
          <span className="eyebrow">Publishing · Threads Studio</span>
          <h1>Threads Studio</h1>
          <p className="admin-lede">Create, edit, and theology-check Threads here. Approved copy moves into Publishing already selected for final posting or scheduling.</p>
        </div>
        <Link className="button" href="/admin/publishing?view=threads"><ArrowLeft size={15}/> Back to Publishing</Link>
      </div>
      <div className="threads-studio-primary">
        <ThreadsSingleComposer/>
      </div>
      <ThreadsPublishingSuite/>
    </div>
  );
}
