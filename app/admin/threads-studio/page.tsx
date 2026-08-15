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
          <span className="eyebrow">Distribution · Threads</span>
          <h1>Threads Studio</h1>
          <p className="admin-lede">Create one post, plan the week, run theology review, schedule approved copy, and keep prayer/news drafts in a separate human-reviewed lane.</p>
        </div>
      </div>
      <div className="threads-studio-primary">
        <ThreadsSingleComposer/>
      </div>
      <ThreadsPublishingSuite/>
    </div>
  );
}
