import { redirect } from "next/navigation";
import { getStudioPermission } from "@/auth";

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
      <p className="admin-lede">The repository runs without Supabase using the seeded launch library. Publishing, authentication, and first-party analytics require the production environment.</p>
      <section className="admin-card">
        <h2>Environment</h2>
        <table className="admin-table"><tbody>{checks.map(([name, ready]) => <tr key={name}><td><code>{name}</code></td><td><span className={ready ? "status-pill" : "status-pill status-pending"}>{ready ? "Ready" : "Missing"}</span></td></tr>)}</tbody></table>
      </section>
      <section className="admin-card">
        <h2>Launch order</h2>
        <ol className="admin-list"><li>Connect the GitHub repository to Vercel.</li><li>Add production environment variables.</li><li>Run migrations against a Supabase branch first.</li><li>Deploy the app reader.</li><li>Enable app publishing from this admin.</li><li>Point the apex domain to this Vercel project.</li></ol>
      </section>
    </>
  );
}
