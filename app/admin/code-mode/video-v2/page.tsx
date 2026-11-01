import {redirect} from "next/navigation";
import {getStudioPermission} from "@/auth";
import {VideoKineticCodeEditor} from "@/code-mode/video-kinetic-editor";
export default async function VideoCodeModeV2Page({searchParams}:{searchParams:Promise<{project?:string;projectId?:string;scene?:string;kind?:string}>}){
 const {access,allowed}=await getStudioPermission("manage_content");
 if(!allowed||access.state!=="allowed")redirect("/admin");
 const q=await searchParams;
 return <main className="admin-page"><div className="studio-page-heading"><h1>Kinetic Video Code Mode</h1><p>Video V2 scene editing with reversible draft saves and frame-stepped preview.</p></div>
 <VideoKineticCodeEditor initialId={q.projectId||q.project||""} initialKind={q.kind==="studio"?"studio":"producer"} initialScene={q.scene||""}/></main>;
}