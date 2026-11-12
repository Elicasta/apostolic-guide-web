import {NextResponse} from "next/server";
import {getStudioPermission} from "@/auth";
import {createServiceClient} from "@/supabase";
import {listVideoProducerBrands} from "@/video-producer-brand-server";
import {isSelectableVideoProducerBrand,videoProducerBrandProfileSchema} from "@/video-producer-brand-profiles";
export const runtime="nodejs";
export async function GET(){
  const {access,allowed}=await getStudioPermission("manage_content");
  if(!allowed||access.state!=="allowed")return NextResponse.json({error:"Forbidden"},{status:403});
  const service=createServiceClient();if(!service)return NextResponse.json({error:"Database unavailable"},{status:503});
  try{return NextResponse.json({profiles:await listVideoProducerBrands(service)});}
  catch(e){return NextResponse.json({error:e instanceof Error?e.message:"Could not load brands"},{status:503});}
}
export async function POST(request:Request){
  const {access,allowed}=await getStudioPermission("manage_content");
  if(!allowed||access.state!=="allowed"||!access.user)return NextResponse.json({error:"Forbidden"},{status:403});
  const input=await request.json().catch(()=>null);
  const result=videoProducerBrandProfileSchema.safeParse(input);
  if(!result.success||!isSelectableVideoProducerBrand(result.data))
    return NextResponse.json({error:"Invalid or forbidden brand profile. Cornerstone channels cannot be registered."},{status:400});
  const service=createServiceClient();if(!service)return NextResponse.json({error:"Database unavailable"},{status:503});
  const profile=result.data;
  if(profile.config.logo.assetId){
    const lookup=await service.from("video_producer_graphic_assets")
      .select("id,active,storage_provider,storage_locator,content_type,size_bytes")
      .eq("id",profile.config.logo.assetId).maybeSingle();
    if(lookup.error)return NextResponse.json({error:lookup.error.message},{status:500});
    const image=lookup.data;
    if(!image?.active||image.storage_provider!=="vercel_blob"||!image.storage_locator||
      !["image/png","image/jpeg","image/webp"].includes(image.content_type)||
      Number(image.size_bytes)<1||Number(image.size_bytes)>2*1024*1024)
      return NextResponse.json({error:"Select an active private PNG, JPEG or WebP brand logo under 2 MB from the graphics library."},{status:400});
  }
  const saved=await service.from("video_producer_brand_profiles").upsert({
    slug:profile.slug,name:profile.name,active:profile.active,config:profile.config,
    updated_by:access.user.id,updated_at:new Date().toISOString()
  },{onConflict:"slug"}).select("slug,name,active,config").single();
  if(saved.error)return NextResponse.json({error:saved.error.message},{status:500});
  return NextResponse.json({profile:saved.data});
}
