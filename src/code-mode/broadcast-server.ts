import "server-only";
import {createServiceClient} from "../supabase";
import {emailCodeSchema,emailCodeRender,type EmailCodeDocument} from "./broadcast";
import {textDoctrineSource,assertDoctrineApproved,doctrineContentHash} from "../doctrine-gate";
type Service=NonNullable<ReturnType<typeof createServiceClient>>;
export function broadcastDoctrineSource(id:string,doc:EmailCodeDocument){
 const render=emailCodeRender(doc),campaign=doc.campaign;
 return textDoctrineSource("broadcast",id,{subject:campaign.subject,preview:campaign.previewText,body:render.text});
}
export async function getBroadcastCodeDraft(service:Service,id:string,ownerId:string){
 const row=await service.from("studio_broadcast_code_drafts").select("*").eq("id",id).eq("owner_id",ownerId).eq("status","draft").maybeSingle();
 if(row.error)throw new Error(row.error.message);
 if(!row.data)throw new Error("Broadcast Code Mode draft not found.");
 return {...row.data,document:emailCodeSchema.parse(row.data.document)};
}
export async function approvedBroadcastCode(service:Service,id:string,ownerId:string){
 const row=await getBroadcastCodeDraft(service,id,ownerId);
 const src=broadcastDoctrineSource(id,row.document);
 await assertDoctrineApproved(service,src);
 return {...row,contentHash:doctrineContentHash(src)};
}
