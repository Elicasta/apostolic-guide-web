import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/supabase";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "apostolic-guide-web",
    supabaseConfigured: isSupabaseConfigured(),
    timestamp: new Date().toISOString()
  });
}
