import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };
const idSchema = z.string().min(1).max(160).regex(/^[A-Za-z0-9_-]+$/);
const documentSchema = z.object({
  id: idSchema,
  title: z.string().trim().min(1).max(200),
  content: z.string().max(200000),
  expectedRevision: z.number().int().min(0),
});
const deletionSchema = z.object({
  id: idSchema,
  expectedRevision: z.number().int().positive(),
});

async function authorize() {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (allowed && access.state === "allowed") return null;
  return NextResponse.json(
    { error: access.state === "signed_out" ? "Authentication required." : "Forbidden." },
    { status: access.state === "signed_out" ? 401 : 403, headers: noStore },
  );
}

function unavailable() {
  return NextResponse.json({ error: "Document storage is not configured." }, { status: 503, headers: noStore });
}
function databaseError(operation: string, message: string) {
  console.error(`Teleprompter documents ${operation} failed`, message);
  return NextResponse.json({ error: "Cloud document operation failed." }, { status: 500, headers: noStore });
}
function conflicted() {
  return NextResponse.json({ error: "This document changed on another device. Your local copy was not overwritten.", code: "REVISION_CONFLICT" }, { status: 409, headers: noStore });
}

export async function GET(request: NextRequest) {
  const denied = await authorize();
  if (denied) return denied;
  const service = createServiceClient();
  if (!service) return unavailable();

  const historyId = request.nextUrl.searchParams.get("history");
  if (historyId !== null) {
    const parsed = idSchema.safeParse(historyId);
    if (!parsed.success) return NextResponse.json({ error: "Invalid document ID." }, { status: 400, headers: noStore });
    const { data, error } = await service
      .from("teleprompter_document_revisions")
      .select("document_id,revision,title,content,created_at")
      .eq("document_id", parsed.data)
      .order("revision", { ascending: false })
      .limit(100);
    if (error) return databaseError("history", error.message);
    return NextResponse.json({ revisions: data ?? [] }, { headers: noStore });
  }

  const downloadId = request.nextUrl.searchParams.get("download");
  if (downloadId !== null) {
    const parsed = idSchema.safeParse(downloadId);
    if (!parsed.success) return NextResponse.json({ error: "Invalid document ID." }, { status: 400, headers: noStore });
    const { data, error } = await service
      .from("teleprompter_documents")
      .select("title,content")
      .eq("id", parsed.data)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) return databaseError("download", error.message);
    if (!data) return NextResponse.json({ error: "Not found." }, { status: 404, headers: noStore });
    const filename = data.title.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 80) || "script";
    return new NextResponse(data.content, {
      headers: { ...noStore, "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}.md"`, "X-Content-Type-Options": "nosniff" },
    });
  }

  const { data, error } = await service
    .from("teleprompter_documents")
    .select("id,title,content,revision,created_at,updated_at,deleted_at")
    .order("updated_at", { ascending: false })
    .limit(250);
  if (error) return databaseError("list", error.message);
  return NextResponse.json({ documents: data ?? [] }, { headers: noStore });
}

export async function PUT(request: NextRequest) {
  const denied = await authorize();
  if (denied) return denied;
  if (Number(request.headers.get("content-length") || 0) > 230000) {
    return NextResponse.json({ error: "Document too large." }, { status: 413, headers: noStore });
  }
  let parsed: z.infer<typeof documentSchema>;
  try { parsed = documentSchema.parse(await request.json()); }
  catch { return NextResponse.json({ error: "Invalid document." }, { status: 400, headers: noStore }); }
  if (Buffer.byteLength(parsed.content, "utf8") > 200000) {
    return NextResponse.json({ error: "Document too large." }, { status: 413, headers: noStore });
  }

  const service = createServiceClient();
  if (!service) return unavailable();
  if (parsed.expectedRevision === 0) {
    const { data, error } = await service
      .from("teleprompter_documents")
      .insert({ id: parsed.id, title: parsed.title, content: parsed.content })
      .select("id,revision,updated_at")
      .single();
    if (error?.code === "23505") return conflicted();
    if (error) return databaseError("create", error.message);
    return NextResponse.json({ document: data }, { status: 201, headers: noStore });
  }
  const { data, error } = await service
    .from("teleprompter_documents")
    .update({ title: parsed.title, content: parsed.content })
    .eq("id", parsed.id)
    .eq("revision", parsed.expectedRevision)
    .is("deleted_at", null)
    .select("id,revision,updated_at")
    .maybeSingle();
  if (error) return databaseError("update", error.message);
  if (!data) return conflicted();
  return NextResponse.json({ document: data }, { headers: noStore });
}

export async function DELETE(request: NextRequest) {
  const denied = await authorize();
  if (denied) return denied;
  let input: z.infer<typeof deletionSchema>;
  try { input = deletionSchema.parse(await request.json()); }
  catch { return NextResponse.json({ error: "Invalid delete request." }, { status: 400, headers: noStore }); }
  const service = createServiceClient();
  if (!service) return unavailable();
  const { data, error } = await service
    .from("teleprompter_documents")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", input.id)
    .eq("revision", input.expectedRevision)
    .is("deleted_at", null)
    .select("revision")
    .maybeSingle();
  if (error) return databaseError("delete", error.message);
  if (!data) return conflicted();
  return NextResponse.json({ ok: true }, { headers: noStore });
}
