import {NextResponse} from "next/server";
import {getStudioPermission} from "@/auth";
import {createServiceClient} from "@/supabase";
import {createPrivateBlobDownloadUrl} from "@/video-producer-server";
import {z} from "zod";
export const runtime="nodejs";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const {access,allowed}=await getStudioPermission("manage_content");
 if(!allowed||access.state!=="allowed"||!access.user)return NextResponse.json({error:"Forbidden"},{status:403});
 const {id}=await params;
 if(!z.string().uuid().safeParse(id).success)return NextResponse.json({error:"Invalid graphic ID"},{status:400});
 const service=createServiceClient();if(!service)return NextResponse.json({error:"Database unavailable"},{status:503});
 const row=await service.from("video_producer_graphic_assets").select("storage_locator,storage_provider,content_type,size_bytes")
  .eq("id",id).eq("active",true).maybeSingle();
 if(row.error)return NextResponse.json({error:row.error.message},{status:500});
 const item=row.data;
 if(!item||item.storage_provider!=="vercel_blob"||!item.storage_locator||
    !["image/png","image/webp","image/jpeg"].includes(item.content_type)||
    Number(item.size_bytes)>5*1024*1024||Number(item.size_bytes)<1)
  return NextResponse.json({error:"Graphic not available"},{status:404});
 try{
  const signed=await createPrivateBlobDownloadUrl(item.storage_locator,60*1000);
  const upstream=await fetch(signed,{cache:"no-store",signal:AbortSignal.timeout(20000)});
  if(!upstream.ok)return NextResponse.json({error:"Graphic could not be read"},{status:502});
  const bytes=await upstream.arrayBuffer();
  if(bytes.byteLength>5*1024*1024||bytes.byteLength<1)return NextResponse.json({error:"Invalid graphic size"},{status:413});
  return new Response(bytes,{headers:{"content-type":item.content_type,"cache-control":"private, max-age=60","x-content-type-options":"nosniff"}});
 }catch{return NextResponse.json({error:"Could not load graphic"},{status:502})}
}
