import Link from "next/link";
import { redirect } from "next/navigation";
import { getStudioPermission } from "@/auth";
import { getSocialPublishingCredentialStatus } from "@/social-publishing-integrations";
import { ThreadsSingleComposer } from "@/threads-single-composer";
import { ThreadsPublishingSuite } from "@/threads-publishing-suite";

export default async function AdminThreadsStudioPage() {
  const { access, allowed } = await getStudioPermission("manage_distribution");
  if (!allowed || access.state !== "allowed") redirect("/admin");
  const statuses = await getSocialPublishingCredentialStatus().catch(() => []);
  const threads = statuses.find((status) => status.platform === "threads");
  const connected = Boolean(threads?.accountAuthorized);

  return (
    <div className="threads-studio-page">
      <div className="studio-page-heading">
        <div>
          <span className="eyebrow">Distribution · Threads</span>
          <h1>Threads Studio</h1>
          <p className="admin-lede">Create one post, plan the week, run theology review, schedule approved copy, and keep prayer/news drafts in a separate human-reviewed lane.</p>
        </div>
        <div className={connected ? "threads-connection-state is-connected" : "threads-connection-state"}><span>{connected ? "Connected" : "Not connected"}</span>{threads?.accountLabel ? <strong>{threads.accountLabel}</strong> : null}</div>
      </div>
      {!connected ? <div className="admin-notice threads-connection-notice"><strong>Threads publishing is not authorized yet.</strong><span>Sol generation, theology checks and the calendar still work. Add the Threads app credentials + user token in Setup before using Publish now.</span><Link className="button" href="/admin/setup#social-publishing">Open Setup</Link></div> : null}
      <div className="threads-studio-primary">
        <ThreadsSingleComposer connected={connected}/>
      </div>
      <ThreadsPublishingSuite/>
    </div>
  );
}
