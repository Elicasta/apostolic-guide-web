import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { createCreativeCheckpoint, creativeProjectFromRow, creativeProjectUpdatePayload, loadCreativeProject } from "@/creative-project-server";
import { pathwayBySlug } from "@/pathway-catalog";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";
export const maxDuration = 120;

const requestSchema = z.object({
  projectId: z.string().uuid(),
  scope: z.enum(["all", "unified", "frame"]).default("all"),
  frameId: z.string().trim().max(100).optional(),
  instruction: z.string().trim().max(2000).optional().default("")
}).superRefine((value, ctx) => {
  if (value.scope === "frame" && !value.frameId) ctx.addIssue({ code: "custom", message: "Choose a frame." });
});

const outputSchema = z.object({
  frameCaptions: z.array(z.object({ index: z.number().int().min(1).max(20), caption: z.string().max(2200), altText: z.string().max(1000) })).max(20),
  unifiedCaption: z.string().max(10000),
  rationale: z.string().max(600)
});

function responseSchema(minItems: number, maxItems: number) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["frameCaptions", "unifiedCaption", "rationale"],
    properties: {
      frameCaptions: {
        type: "array",
        minItems,
        maxItems,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["index", "caption", "altText"],
          properties: {
            index: { type: "integer", minimum: 1, maximum: 20 },
            caption: { type: "string", maxLength: 2200 },
            altText: { type: "string", maxLength: 1000 }
          }
        }
      },
      unifiedCaption: { type: "string", maxLength: 10000 },
      rationale: { type: "string", maxLength: 600 }
    }
  } as const;
}

function extractResponseText(value: unknown) {
  const response = value && typeof value === "object" ? value as Record<string, unknown> : {};
  if (typeof response.output_text === "string") return response.output_text;
  if (!Array.isArray(response.output)) return "";
  for (const item of response.output) {
    if (!item || typeof item !== "object") continue;
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const record = part as Record<string, unknown>;
      if (record.type === "output_text" && typeof record.text === "string") return record.text;
    }
  }
  return "";
}

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid caption request." }, { status: 400 });
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  try {
    const project = await loadCreativeProject(service, parsed.data.projectId);
    if (!project) return NextResponse.json({ error: "Creative Project not found." }, { status: 404 });
    if (["scheduled", "publishing"].includes(project.status)) return NextResponse.json({ error: "Unschedule this project before rewriting its publishing copy." }, { status: 409 });
    const pathway = pathwayBySlug(project.pathwaySlug);
    if (!pathway) return NextResponse.json({ error: "Pathway source was not found." }, { status: 404 });
    const activeIndex = parsed.data.frameId ? project.editorState.frames.findIndex((frame) => frame.id === parsed.data.frameId) : -1;
    if (parsed.data.scope === "frame" && activeIndex < 0) return NextResponse.json({ error: "Frame not found." }, { status: 404 });
    const desiredCaptions = parsed.data.scope === "unified" ? 0 : parsed.data.scope === "frame" ? 1 : project.editorState.frames.length;
    const frameContext = project.editorState.frames.map((frame, index) => [
      `FRAME ${index + 1} [${frame.role}]`,
      `Headline: ${frame.headline}`,
      `Body: ${frame.body}`,
      `Scripture: ${frame.scripture}`,
      `CTA: ${frame.cta}`
    ].join("\n")).join("\n\n");
    const scopeDirection = parsed.data.scope === "all"
      ? `Write one supporting caption and useful alt text for every frame. Return exactly ${project.editorState.frames.length} frameCaptions, indexed 1 through ${project.editorState.frames.length}. Then write the unified caption as a separate writing pass.`
      : parsed.data.scope === "frame"
        ? `Rewrite only frame ${activeIndex + 1}. Return exactly one frameCaptions item with index ${activeIndex + 1}. Keep the existing unified caption unchanged by returning it verbatim: ${JSON.stringify(project.unifiedCaption)}`
        : "Do not write frame captions. Write only the unified caption after understanding the entire creative sequence.";
    const model = process.env.OPENAI_CAROUSEL_MODEL?.trim() || "gpt-5.6-sol";
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        reasoning: { effort: "medium" },
        text: { verbosity: "low", format: { type: "json_schema", name: "creative_project_captions", strict: true, schema: responseSchema(desiredCaptions, desiredCaptions) } },
        input: [
          { role: "developer", content: [{ type: "input_text", text: [
            "You are Sol, the copy desk for Apostolic Guide.",
            `PROJECT: ${project.title}`,
            `PATHWAY: ${pathway.title}`,
            `INTENT: ${project.intent}`,
            `FORMAT: ${project.format}`,
            scopeDirection,
            "The unified caption is NOT a concatenation of the frame captions. Read the entire argument, then rewrite it as one natural continuous social caption.",
            "Frame captions support individual frames and may repeat the frame's Scripture reference when useful.",
            "Do not invent verse quotations or claims beyond the canonical Pathway context.",
            "Do not write fake engagement bait. Use the project's CTA only when it fits naturally.",
            "Alt text describes the information in the frame for accessibility. Do not add decorative assumptions that are not in the source.",
            `PROJECT CTA: ${project.cta || "None set"}`,
            `USER DIRECTION: ${parsed.data.instruction || "Write clear, direct copy that follows the Pathway."}`
          ].join("\n") }] },
          { role: "user", content: [{ type: "input_text", text: [
            `PATHWAY SUMMARY: ${pathway.summary}`,
            "CANONICAL PATHWAY STEPS:",
            ...pathway.steps.map((step, index) => `${index + 1}. ${step.reference} — ${step.title}: ${step.explanation}`),
            "CREATIVE SEQUENCE:",
            frameContext
          ].join("\n") }] }
        ]
      })
    });
    if (!response.ok) return NextResponse.json({ error: `Caption generation failed (${response.status}).`, detail: (await response.text().catch(() => "")).slice(0, 1200) }, { status: 502 });
    const outputText = extractResponseText(await response.json());
    if (!outputText) return NextResponse.json({ error: "Sol returned no structured caption output." }, { status: 502 });
    const output = outputSchema.parse(JSON.parse(outputText));
    if (output.frameCaptions.length !== desiredCaptions) return NextResponse.json({ error: "Sol returned the wrong number of frame captions." }, { status: 502 });

    const captionMap = new Map(output.frameCaptions.map((item) => [item.index, item]));
    const frames = project.editorState.frames.map((frame, index) => {
      const copy = captionMap.get(index + 1);
      return copy ? { ...frame, caption: copy.caption, altText: copy.altText } : frame;
    });
    const unifiedCaption = parsed.data.scope === "frame" ? project.unifiedCaption : output.unifiedCaption;
    const payload = creativeProjectUpdatePayload({
      title: project.title,
      pathwaySlug: project.pathwaySlug,
      pathwayTitle: project.pathwayTitle,
      intent: project.intent,
      format: project.format,
      destination: project.destination,
      editorState: { ...project.editorState, frames },
      unifiedCaption,
      cta: project.cta,
      tags: project.tags,
      status: "draft"
    });
    const now = new Date().toISOString();
    const saved = await service.from("studio_creative_projects").update({
      ...payload,
      status: "draft",
      state_version: project.stateVersion + 1,
      last_autosaved_at: now,
      updated_by: access.user.id,
      updated_at: now
    }).eq("id", project.id).select("*").single();
    if (saved.error) return NextResponse.json({ error: saved.error.message }, { status: 500 });
    const nextProject = creativeProjectFromRow(saved.data as Record<string, unknown>);
    const revision = await createCreativeCheckpoint(service, nextProject, access.user.id, { reason: "generation", changeSummary: parsed.data.scope === "all" ? "Generated per-frame captions and unified caption." : parsed.data.scope === "unified" ? "Regenerated unified caption." : `Regenerated caption for frame ${activeIndex + 1}.` });
    return NextResponse.json({ project: nextProject, revision, rationale: output.rationale, model });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Caption generation failed." }, { status: 500 });
  }
}
