import { redirect } from "next/navigation";
import { getStudioPermission } from "@/auth";
import { ThreadsSingleComposer } from "@/threads-single-composer";
import { ThreadsPublishingSuite } from "@/threads-publishing-suite";

export default async function AdminThreadsStudioPage() {
  const { access, allowed } = await getStudioPermission("manage_distribution");
  if (!allowed || access.state !== "allowed") redirect("/admin");

  return (
    <div className="threads-studio-page">
      <div className="studio-page-heading">
        <div>
          <span className="eyebrow">Content · Threads</span>
          <h1>Threads Studio</h1>
          <p className="admin-lede">Create, edit, and theology-check Threads here. When a post is ready, send it to Master Publishing for final posting or scheduling.</p>
        </div>
      </div>
      <div className="threads-studio-primary">
        <ThreadsSingleComposer/>
      </div>
      <ThreadsPublishingSuite/>
    </div>
  );
}
