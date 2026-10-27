import {NextResponse} from "next/server";
import {z} from "zod";
import {getStudioPermission} from "@/auth";
import {createServiceClient} from "@/supabase";
import {emailCodeSchema} from "@/code-mode/broadcast";
import {recordStudioAudit} from "@/studio-audit";
export const runtime="nodejs";
const saveSchema=z.object({name:z.string().trim().min(1).max(100),document:emailCodeSchema});
const deleteSchema=z.object({id:z.string().uuid()});
async function permitted(){
 const {access,allowed}=await getStudioPermission("manage_distribution");
 return allowed&&access.state==="allowed"&&access.user?access.user:null;
}
export async function GET(){
 const user=await permitted();if(!user)return NextResponse.json({error:"Forbidden"},{status:403});
 const service=createServiceClient();if(!service)return NextResponse.json({error:"Preset storage unavailable."},{status:503});
 const r=await service.from("studio_code_mode_presets").select("id,name,document,created_at").eq("tool","broadcast").eq("created_by",user.id).order("created_at",{ascending:false}).limit(50);
 if(r.error)return NextResponse.json({error:r.error.message},{status:503});
 return NextResponse.json({presets:(r.data||[]).map(row=>({...row,document:emailCodeSchema.parse(row.document)}))});
}
export async function POST(request:Request){
 const user=await permitted();if(!user)return NextResponse.json({error:"Forbidden"},{status:403});
 const p=saveSchema.safeParse(await request.json().catch(()=>null));if(!p.success)return NextResponse.json({error:p.error.issues[0]?.message||"Invalid preset."},{status:400});
 const service=createServiceClient();if(!service)return NextResponse.json({error:"Preset storage unavailable."},{status:503});
 const r=await service.from("studio_code_mode_presets").upsert({tool:"broadcast",created_by:user.id,name:p.data.name,document:p.data.document},{onConflict:"created_by,tool,name"}).select("id,name,document,created_at").single();
 if(r.error)return NextResponse.json({error:r.error.message},{status:409});
 await recordStudioAudit({actorUserId:user.id,action:"code_mode.broadcast.preset_saved",resourceType:"broadcast_preset",resourceId:r.data.id,metadata:{name:r.data.name}});
 return NextResponse.json({preset:r.data});
}
export async function DELETE(request:Request){
 const user=await permitted();if(!user)return NextResponse.json({error:"Forbidden"},{status:403});
 const p=deleteSchema.safeParse(await request.json().catch(()=>null));if(!p.success)return NextResponse.json({error:"Invalid preset ID."},{status:400});
 const service=createServiceClient();if(!service)return NextResponse.json({error:"Preset storage unavailable."},{status:503});
 const r=await service.from("studio_code_mode_presets").delete().eq("id",p.data.id).eq("created_by",user.id).eq("tool","broadcast").select("id").maybeSingle();
 if(r.error)return NextResponse.json({error:r.error.message},{status:409});
 if(!r.data)return NextResponse.json({error:"Preset not found."},{status:404});
 await recordStudioAudit({actorUserId:user.id,action:"code_mode.broadcast.preset_deleted",resourceType:"broadcast_preset",resourceId:p.data.id,metadata:{}});
 return NextResponse.json({deleted:true});
}
