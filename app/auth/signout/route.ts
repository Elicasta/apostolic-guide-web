import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/supabase";

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  if (supabase) await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", request.url), 303);
}
