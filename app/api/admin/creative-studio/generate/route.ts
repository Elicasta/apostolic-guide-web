import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { CAROUSEL_PROJECT_MODES, carouselModeDirection, type CarouselProjectMode } from "@/carousel-project-modes";
import { createCreativeCheckpoint, creativeProjectFromRow, creativeProjectUpdatePayload, loadCreativeProject } from "@/creative-project-server";
import { pathwayBySlug } from "@/pathway-catalog";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";
export const maxDuration = 120;

const requestSchema = z.object({
  projectId: z.string().uuid(),
  action: z.enum(["generate", "restructure", "regenerate_frame"]).default("generate"),
  instruction: z.string().trim().max(3000).optional().default(""),
  targetFrameCount: z.number().int().min(1).max(12).optional(),
  frameId: z.string().trim().max(100).optional()
}).superRefine((value, ctx) => {
  if (value.action === "regenerate_frame" && !value.frameId) ctx.addIssue({ code: "custom", message: "Choose a frame to regenerate." });
});

const frameSchema = z.object({
  role: z.enum(["hook", "scripture", "explanation", "support", "statement", "cta"]),
  headline: z.string().max(240),
  body: z.string().max(1400),
  scripture: z.string().max(180),
  overlayText: z.string().max(500),
  supportingNotes: z.string().max(1600),
  cta: z.string().max(500)
});
const outputSchema = z.object({
  rationale: z.string().max(800),
  frames: z.array(frameSchema).min(1).max(12)
});

function responseSchema(minItems: number, maxItems: number) {
  return {
    type: "object",
    additionalProperties: false,
    required: ["rationale", "frames"],
    properties: {
      rationale: { type: "string", maxLength: 800 },
      frames: {
        type: "array",
        minItems,
        maxItems,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["role", "headline", "body", "scripture", "overlayText", "supportingNotes", "cta"],
          properties: {
            role: { type: "string", enum: ["hook", "scripture", "explanation", "support", "statement", "cta"] },
            headline: { type: "string", maxLength: 240 },
            body: { type: "string", maxLength: 1400 },
            scripture: { type: "string", maxLength: 180 },
            overlayText: { type: "string", maxLength: 500 },
            supportingNotes: { type: "string", maxLength: 1600 },
            cta: { type: "string", maxLength: 500 }
          }
        }
      }
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

function intentDirection(intent: string) {
  const directions: Record<string, string> = {
    information: "Explain the topic clearly and progressively. The user should understand the claim by the final frame.",
    teaching: "Teach the biblical sequence. Use Scripture as the structure rather than isolated slogans.",
    objection: "State the objection fairly, answer the actual tension, and move through the strongest relevant Scripture without dodging the hard text.",
    conversation: "Write for a real conversation. Keep each frame direct, human, and useful when someone is asking a sincere or challenging question.",
    invitation: "Move toward one clear response or next study action without manufacturing urgency.",
    quote: "Center one short statement and use only enough support to make its meaning clear.",
    scripture: "Make the Scripture reference and its immediate teaching point the center of the creative. Do not invent verse wording."
  };
  return directions[intent] || directions.information;
}

function formatDirection(format: string, exactCount: number | null) {
  if (format === "single") return "Create exactly one complete 4:5 Single Post frame. It must stand on its own.";
  if (format === "story") return exactCount
    ? `Create exactly ${exactCount} sequential 9:16 Story frames. Each frame should be fast to scan and the sequence should progress naturally.`
    : "Choose the smallest number of 9:16 Story frames needed to communicate the message correctly, normally 3 to 8. Do not pad the sequence.";
  return exactCount
    ? `Create exactly ${exactCount} 4:5 Carousel slides. Preserve a coherent swipe sequence.`
    : "Choose the smallest number of 4:5 Carousel slides needed to communicate the message correctly, normally 4 to 10. Do not default to eight and do not pad the sequence.";
}

function projectMode(value: unknown): CarouselProjectMode | null {
  return typeof value === "string" && CAROUSEL_PROJECT_MODES.includes(value as CarouselProjectMode) ? value as CarouselProjectMode : null;
}

export async function POST(request: Request) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid generation request." }, { status: 400 });
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  try {
    const project = await loadCreativeProject(service, parsed.data.projectId);
    if (!project) return NextResponse.json({ error: "Creative Project not found." }, { status: 404 });
    if (["scheduled", "publishing"].includes(project.status)) return NextResponse.json({ error: "Unschedule this project before changing its creative structure." }, { status: 409 });
    const pathway = pathwayBySlug(project.pathwaySlug);
    if (!pathway) return NextResponse.json({ error: "Pathway source was not found." }, { status: 404 });
    const generatedText = project.editorState.generatedText ?? {};
    const carouselMode = projectMode(generatedText.carouselMode);
    const savedTopic = typeof generatedText.topic === "string" ? generatedText.topic.trim().slice(0, 3000) : "";
    const userDirection = parsed.data.instruction.trim() || savedTopic || "Use the project context and make the strongest version.";
    const target = project.format === "single" ? 1 : parsed.data.action === "regenerate_frame" ? 1 : parsed.data.targetFrameCount ?? null;
    const minItems = target ?? (project.format === "story" ? 3 : 4);
    const maxItems = target ?? (project.format === "story" ? 8 : 10);
    const existingFrames = project.editorState.frames.map((frame, index) => `${index + 1}. [${frame.role}] ${frame.headline} | ${frame.scripture} | ${frame.body}`).join("\n");
    const activeFrame = parsed.data.frameId ? project.editorState.frames.find((frame) => frame.id === parsed.data.frameId) : null;
    if (parsed.data.action === "regenerate_frame" && !activeFrame) return NextResponse.json({ error: "Frame not found." }, { status: 404 });

    const actionDirection = parsed.data.action === "generate"
      ? "Build the creative from the source, saved topic, and project purpose."
      : parsed.data.action === "restructure"
        ? `Restructure the existing sequence according to the user's instruction. Preserve the argument, but do not preserve a weak structure merely because it already exists.\nEXISTING SEQUENCE:\n${existingFrames}`
        : `Rewrite only the selected frame so it fits the surrounding sequence. Return exactly one frame.\nSELECTED FRAME:\n${JSON.stringify(activeFrame)}\nFULL SEQUENCE FOR CONTEXT:\n${existingFrames}`;
    const pathwayContext = [
      `PATHWAY: ${pathway.title}`,
      `COLLECTION: ${pathway.collection}`,
      `SUMMARY: ${pathway.summary}`,
      "CANONICAL SCRIPTURE FLOW:",
      ...pathway.steps.map((step, index) => `${index + 1}. ${step.reference} — ${step.title}: ${step.explanation}`)
    ].join("\n");
    const model = process.env.OPENAI_CAROUSEL_MODEL?.trim() || "gpt-5.6-sol";
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model,
        reasoning: { effort: "medium" },
        text: { verbosity: "low", format: { type: "json_schema", name: "creative_project_frames", strict: true, schema: responseSchema(minItems, maxItems) } },
        input: [
          { role: "developer", content: [{ type: "input_text", text: [
            "You are Sol, the Scripture-first creative director inside Apostolic Guide.",
            "The Creative Project is already persistent. Never change its Pathway, purpose, or format unless the user explicitly requested a structural conversion elsewhere.",
            `PROJECT: ${project.title}`,
            `INTENT: ${project.intent}`,
            `FORMAT: ${project.format}`,
            carouselMode ? `CREATIVE PURPOSE: ${carouselMode}\n${carouselModeDirection(carouselMode)}` : "",
            savedTopic ? `SAVED TOPIC / ANGLE: ${savedTopic}` : "",
            intentDirection(project.intent),
            formatDirection(project.format, target),
            actionDirection,
            "CONTENT RULES:",
            "The selected Pathway is the controlling doctrinal and Scripture source. The user's topic or angle controls emphasis inside that boundary.",
            "Do not invent verse quotations. The source supplies references and teaching points, not full verse wording.",
            "Do not introduce a doctrinal angle that changes the selected purpose.",
            "One frame should do one job. Headlines should be short enough for mobile. Body copy should normally be 1–3 short sentences.",
            "Use scripture as a reference field. Supporting notes are editor notes, not public-facing copy.",
            "The last frame of a sequence should normally close the thread or give the next action. Do not add a CTA when the purpose does not need one.",
            "Do not use filler frames to reach a familiar social-media count."
          ].filter(Boolean).join("\n") }] },
          { role: "user", content: [{ type: "input_text", text: [pathwayContext, `USER DIRECTION: ${userDirection}`].join("\n\n") }] }
        ]
      })
    });
    if (!response.ok) return NextResponse.json({ error: `Creative generation failed (${response.status}).`, detail: (await response.text().catch(() => "")).slice(0, 1200) }, { status: 502 });
    const outputText = extractResponseText(await response.json());
    if (!outputText) return NextResponse.json({ error: "Sol returned no structured creative." }, { status: 502 });
    const output = outputSchema.parse(JSON.parse(outputText));
    if (target && output.frames.length !== target) return NextResponse.json({ error: `Sol returned ${output.frames.length} frames instead of ${target}. Regenerate rather than saving the wrong structure.` }, { status: 502 });

    let frames;
    if (parsed.data.action === "regenerate_frame" && activeFrame) {
      const generated = output.frames[0];
      frames = project.editorState.frames.map((frame) => frame.id === activeFrame.id ? {
        ...frame,
        ...generated,
        id: frame.id,
        order: frame.order,
        pathwayLink: frame.pathwayLink || `/pathways/${pathway.slug}`,
        caption: frame.caption,
        altText: frame.altText
      } : frame);
    } else {
      frames = output.frames.map((frame, index) => ({
        id: crypto.randomUUID(),
        order: index + 1,
        ...frame,
        pathwayLink: `/pathways/${pathway.slug}`,
        caption: "",
        altText: ""
      }));
    }
    const editorState = {
      ...project.editorState,
      frames,
      generatedText: {
        ...generatedText,
        lastRationale: output.rationale,
        lastAction: parsed.data.action,
        lastInstruction: userDirection,
        model
      }
    };
    const payload = creativeProjectUpdatePayload({
      title: project.title,
      pathwaySlug: project.pathwaySlug,
      pathwayTitle: project.pathwayTitle,
      intent: project.intent,
      format: project.format,
      destination: project.destination,
      editorState,
      unifiedCaption: project.unifiedCaption,
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
    const revision = await createCreativeCheckpoint(service, nextProject, access.user.id, {
      reason: parsed.data.action === "restructure" ? "structure_change" : "generation",
      changeSummary: parsed.data.action === "regenerate_frame" ? `Regenerated frame ${activeFrame?.order}.` : parsed.data.action === "restructure" ? `Restructured creative to ${frames.length} frames.` : `Generated ${frames.length} frames.`
    });
    return NextResponse.json({ project: nextProject, revision, rationale: output.rationale, model });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Creative generation failed." }, { status: 500 });
  }
}
