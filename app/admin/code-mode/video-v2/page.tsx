import {redirect} from "next/navigation";
import {getStudioPermission} from "@/auth";
import {VideoKineticCodeEditor} from "@/code-mode/video-kinetic-editor";
export default async function VideoCodeModeV2Page(){
 const {access,allowed}=await getStudioPermission("manage_content");
 if(!allowed||access.state!=="allowed")redirect("/admin");
 return <main className="admin-page"><div className="studio-page-heading"><h1>Kinetic Video Code Mode</h1><p>V2 scene editing and frame-stepped preview. Export is not yet connected.</p></div><VideoKineticCodeEditor/></main>;
}
