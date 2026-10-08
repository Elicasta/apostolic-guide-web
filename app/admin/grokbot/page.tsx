import { redirect } from "next/navigation";
import { getStudioPermission } from "@/auth";
import { GrokbotWorkbench } from "@/grokbot-workbench";
import { allPathways } from "@/pathway-catalog";
import { isSupabaseServiceConfigured } from "@/supabase";

export const dynamic = "force-dynamic";

export default async function GrokbotPage() {
  const permission = await getStudioPermission("view_workspace");
  const localSetup = permission.access.state === "unconfigured";
  if (!permission.allowed && !localSetup) redirect("/admin");

  return <div>
    <div className="studio-page-heading">
      <div>
        <span className="eyebrow">Workspace</span>
        <h1>Grokbot</h1>
        <p className="admin-lede">A Studio workbench for registered actions. It can read Pathways, save a private 14-day plan, keep scratch notes, and link private Pathway Assets. It cannot publish, send, activate, or enroll.</p>
      </div>
    </div>
    <GrokbotWorkbench
      pathways={allPathways.map((pathway) => ({ slug: pathway.slug, title: pathway.title }))}
      persistenceConfigured={isSupabaseServiceConfigured()}
    />
  </div>;
}
