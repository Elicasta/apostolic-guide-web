import {redirect} from "next/navigation";
import {getStudioPermission} from "@/auth";
import {WholeItemCodeMode} from "@/code-mode/whole-item-client";
export default async function SharedCodeModePage({searchParams}:{searchParams:Promise<{tool?:string;id?:string;project?:string;projectId?:string;kind?:string;scene?:string}>}){
 const {access,allowed}=await getStudioPermission("manage_content");
 if(!allowed||access.state!=="allowed")redirect("/admin");
 const q=await searchParams;
 return <main className="admin-page"><div className="studio-page-heading"><h1>Shared Code Mode</h1><p>Apply complete JSON documents directly into existing Studio drafts. All review and publication controls stay separate.</p></div>
  <WholeItemCodeMode initialTool={q.tool} initialId={q.projectId||q.project||q.id} initialVideoKind={q.kind==="studio"?"studio":"producer"} initialScene={q.scene||""}/></main>;
}
