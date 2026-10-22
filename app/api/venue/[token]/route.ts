import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/supabase";
import { resolveGuestInvite, setGuestMediaState, setGuestState } from "@/studio/guest-repository";
import { createStudioLiveKitToken, liveKitConfigured } from "@/studio/livekit";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const eventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("media"), state: z.enum(["offline","connecting","connected","reconnecting","failed"]) }),
  z.object({ type: z.literal("state"), state: z.enum(["green_room","disconnected"]) })
]);
type Guest = { id:string; episode_id:string; display_name:string; is_remote_venue:boolean };
async function authenticate(token:string) {
  if (token.length < 20 || token.length > 200) return null;
  const invite = await resolveGuestInvite(token);
  const guest = invite?.studio_episode_guests as Guest|undefined;
  return guest?.is_remote_venue && guest.episode_id === invite?.episode_id ? guest : null;
}
export async function GET(_request:Request,{params}:{params:Promise<{token:string}>}) {
  try {
    const { token } = await params;
    const guest = await authenticate(token);
    if (!guest) return NextResponse.json({error:"Venue invitation is invalid, expired, or revoked"},{status:404,headers});
    const db = createServiceClient();
    if (!db) throw new Error("Studio database is not configured");
    const {data:session,error} = await db.from("studio_sessions").select("id").eq("episode_id",guest.episode_id)
      .in("status",["created","green_room","active"])
      .order("created_at",{ascending:false}).limit(1).maybeSingle();
    if (error) throw error;
    const media = session ? createStudioLiveKitToken({
      episodeId:guest.episode_id,identity:`guest-${guest.id}`,
      name:guest.display_name,role:"guest",ttlSeconds:3600
    }):null;
    return NextResponse.json({
      venueName:guest.display_name,
      sessionId:session?.id??null,
      liveKitConfigured:liveKitConfigured(),
      media,
      programUrl:session?`/output/${session.id}?token=${encodeURIComponent(token)}&venue=1`:null
    },{headers});
  } catch {
    return NextResponse.json({error:"Unable to load venue configuration"},{status:503,headers});
  }
}
export async function POST(request:Request,{params}:{params:Promise<{token:string}>}) {
  const {token}=await params;
  const guest=await authenticate(token).catch(()=>null);
  if(!guest)return NextResponse.json({error:"Invalid venue invitation"},{status:404,headers});
  const input=eventSchema.safeParse(await request.json().catch(()=>null));
  if(!input.success)return NextResponse.json({error:"Invalid venue status"},{status:400,headers});
  try {
    if(input.data.type==="media")await setGuestMediaState(guest.id,input.data.state);
    else await setGuestState(guest.id,input.data.state);
    return NextResponse.json({ok:true},{headers});
  } catch {
    return NextResponse.json({error:"Unable to save venue status"},{status:503,headers});
  }
}
