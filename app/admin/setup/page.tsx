import { redirect } from "next/navigation";
import { getStudioPermission } from "@/auth";
import { SocialPublishingCredentials } from "@/social-publishing-credentials";
import { ThreadsPublishingCredentials } from "@/threads-publishing-credentials";
import { VideoRendererCredentials } from "@/video-renderer-credentials";

const checks = [
  ["NEXT_PUBLIC_SUPABASE_URL", Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)],
  ["NEXT_PUBLIC_SUPABASE_ANON_KEY", Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)],
  ["SUPABASE_SERVICE_ROLE_KEY", Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY)],
  ["NEXT_PUBLIC_WEBSITE_URL", Boolean(process.env.NEXT_PUBLIC_WEBSITE_URL)],
  ["NEXT_PUBLIC_APP_URL", Boolean(process.env.NEXT_PUBLIC_APP_URL)]
] as const;

export default async function AdminSetupPage() {
  const permission = await getStudioPermission("manage_integrations");
  if (!permission.allowed && permission.access.state !== "unconfigured") redirect("/admin");
  return (
    <>
      <span className="eyebrow">Deployment readiness</span>
      <h1>Setup</h1>
      <p className="admin-lede">Manage the server configuration and channel credentials Apostolic Guide uses for publishing, authentication, analytics, and distribution.</p>

      <VideoRendererCredentials/>
      <SocialPublishingCredentials/>
      <ThreadsPublishingCredentials/>

      <section className="admin-card">
        <h2>Environment</h2>
        <table className="admin-table"><tbody>{checks.map(([name, ready]) => <tr key={name}><td><code>{name}</code></td><td><span className={ready ? "status-pill" : "status-pill status-pending"}>{ready ? "Ready" : "Missing"}</span></td></tr>)}</tbody></table>
      </section>
      <section className="admin-card">
        <h2>Launch order</h2>
        <ol className="admin-list"><li>Keep Supabase and Vercel production environment variables healthy.</li><li>Connect the Video Studio renderer so final MP4 jobs can run asynchronously.</li><li>Store channel app credentials here. Existing Instagram values are reused rather than duplicated.</li><li>Authorize YouTube, Instagram, Threads, and TikTok through their channel connection flows.</li><li>Render and review approved media assets.</li><li>Send reviewed packages through Channel Publishing.</li><li>Bring post IDs and performance back into Analytics.</li></ol>
      </section>
    </>
  );
}
