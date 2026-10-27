import { NextResponse } from "next/server";
import { cronRequestAuthorized } from "@/cron-auth";
import { getMetaTokenHealth } from "@/meta-token-health";
export const runtime="nodejs";
export const maxDuration=60;
export async function GET(request:Request) {
 if(!process.env.CRON_SECRET?.trim())return NextResponse.json({error:"CRON_SECRET is not configured."},{status:503});
 if(!cronRequestAuthorized(request))return NextResponse.json({error:"Unauthorized"},{status:401});
 const results=await Promise.all([getMetaTokenHealth("instagram"),getMetaTokenHealth("threads")]);
 return NextResponse.json({ok:results.every(result=>["valid","missing"].includes(result.state)),checkedAt:new Date().toISOString(),results},
   {status:results.some(result=>result.state==="unavailable"||result.state==="expired")?503:200});
}
