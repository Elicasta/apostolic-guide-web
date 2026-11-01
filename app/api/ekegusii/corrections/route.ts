import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { pathwayBySlug } from "@/pathway-catalog";
import { bibleSourcedEkegusiiSeed } from "@/ekegusii-language-audit";
import { createServiceClient } from "@/supabase";
import { recordWebsiteContactSubmission } from "@/inbox";

export const runtime = "nodejs";

const schema = z.object({
  pathwaySlug: z.string().regex(/^[a-z0-9-]{2,100}$/),
  stepIndex: z.number().int().min(0).max(149),
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(320),
  location: z.string().trim().max(160),
  title: z.string().trim().max(400),
  explanation: z.string().trim().max(6000),
  hook: z.string().trim().max(2400),
  notes: z.string().trim().max(3000),
  website: z.string().optional().default(""),
});

export async function POST(request: NextRequest) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 24_000) return NextResponse.json({ ok: false, message: "Submission exceeds the size limit." }, { status: 413 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, message: "Check the correction fields." }, { status: 400 });
  const input = parsed.data;
  // Honeypot: do not accept automated webform submissions.
  if (input.website) return NextResponse.json({ ok: true });
  const pathway = pathwayBySlug(input.pathwaySlug);
  const source = pathway?.steps[input.stepIndex];
  if (!pathway || !source) return NextResponse.json({ ok: false, message: "Unknown teaching step." }, { status: 404 });
  const baseline = bibleSourcedEkegusiiSeed(input.pathwaySlug).steps?.[String(input.stepIndex)];
  if (!input.notes && (!input.title || input.title === baseline?.title)
      && (!input.explanation || input.explanation === baseline?.explanation)
      && (!input.hook || input.hook === baseline?.hook)) {
    return NextResponse.json({ ok: false, message: "Please change the translation or explain the correction before submitting." }, { status: 400 });
  }
  const service = createServiceClient();
  if (!service) return NextResponse.json({ ok: false, message: "The review inbox is not configured." }, { status: 503 });
  const { data, error } = await service.from("ekegusii_corrections").insert({
    pathway_slug: input.pathwaySlug, step_index: input.stepIndex, scripture_reference: source.reference,
    reviewer_name: input.name, reviewer_email: input.email.toLowerCase(), reviewer_location: input.location,
    proposed_title: input.title, proposed_explanation: input.explanation, proposed_hook: input.hook,
    reviewer_notes: input.notes, status: "submitted",
  }).select("id").single();
  if (error || !data) {
    console.error("Ekegusii correction storage error:", error?.code);
    return NextResponse.json({ ok: false, message: "Unable to save the correction. Please try again." }, { status: 503 });
  }
  // Existing Studio Inbox remains notified; the structured correction is
  // safely retained even if Inbox integration is temporarily unavailable.
  try {
    const referenceId = "EK-" + data.id.slice(0, 8).toUpperCase();
    const stored = await recordWebsiteContactSubmission({
      referenceId, name: input.name, email: input.email, location: input.location || "Not provided",
      category: "Content or source correction",
      context: "Ekegusii: " + input.pathwaySlug + " / step " + (input.stepIndex + 1),
      path: "/ekegusii/pathways/" + input.pathwaySlug,
      question: [
        "Ekegusii correction " + referenceId,
        "Scripture: " + source.reference,
        "Review in Studio: /admin/ekegusii-reviews/" + data.id,
        "Reviewer notes: " + input.notes.slice(0, 1200),
      ].join("\n"),
    });
    if (stored?.conversationId) await service.from("ekegusii_corrections").update({ inbox_conversation_id: stored.conversationId }).eq("id", data.id);
  } catch (cause) {
    console.error("Ekegusii inbox notification failed", cause instanceof Error ? cause.message : "unknown error");
  }
  return NextResponse.json({ ok: true, referenceId: "EK-" + data.id.slice(0, 8).toUpperCase(), message: "Correction saved for editorial review." });
}
