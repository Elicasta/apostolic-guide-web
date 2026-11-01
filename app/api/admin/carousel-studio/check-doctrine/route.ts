import { NextResponse } from "next/server";
import { z } from "zod";
import { getStudioPermission } from "@/auth";
import { pathwayBySlug } from "@/pathway-catalog";

export const runtime = "nodejs";
export const maxDuration = 90;

const slideSchema = z.object({
  id: z.string().max(12),
  kind: z.string().max(40),
  eyebrow: z.string().max(100),
  title: z.string().max(240),
  body: z.string().max(800),
  reference: z.string().max(120),
  secondaryReference: z.string().max(120).optional().default("")
});

const requestSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  mode: z.string().max(50),
  prompt: z.string().max(4000).optional().default(""),
  slides: z.array(slideSchema).min(1).max(20)
});

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["status", "summary", "issues"],
  properties: {
    status: { type: "string", enum: ["pass", "warning", "blocked"] },
    summary: { type: "string", maxLength: 400 },
    issues: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["severity", "category", "slideId", "quote", "explanation", "suggestion"],
        properties: {
          severity: { type: "string", enum: ["warning", "block"] },
          category: { type: "string", enum: ["oneness-theology", "scripture-fidelity", "source-fidelity", "lexical-claim", "overstatement", "clarity"] },
          slideId: { type: "string", maxLength: 12 },
          quote: { type: "string", maxLength: 220 },
          explanation: { type: "string", maxLength: 500 },
          suggestion: { type: "string", maxLength: 500 }
        }
      }
    }
  }
} as const;

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
  if (!parsed.success) return NextResponse.json({ error: "Invalid doctrine-check request." }, { status: 400 });

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });
  const model = process.env.OPENAI_SCRIPT_CHECK_MODEL?.trim() || process.env.OPENAI_CAROUSEL_MODEL?.trim() || "gpt-5.6-sol";
  const pathway = pathwayBySlug(parsed.data.slug);
  if (!pathway) return NextResponse.json({ error: "Pathway not found." }, { status: 404 });

  const source = [
    `PATHWAY: ${pathway.title}`,
    `SUMMARY: ${pathway.summary}`,
    ...pathway.steps.map((step, index) => `${index + 1}. ${step.reference} — ${step.title}: ${step.explanation}`)
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      reasoning: { effort: "medium" },
      text: { verbosity: "low", format: { type: "json_schema", name: "apostolic_guide_carousel_doctrine_check", strict: true, schema: RESPONSE_SCHEMA } },
      input: [
        {
          role: "developer",
          content: [{ type: "input_text", text: [
            "You are the Apostolic Guide editorial and doctrine checker for public social posts.",
            "Judge publication safety, not whether you personally prefer the wording.",
            "Apostolic Guide teaches one indivisible God, YHWH. The Father is the eternal Spirit. Jesus Christ is fully God manifested in genuine humanity. The Son is truly begotten/incarnate humanity, not an eternal second divine person. God's Word is God's own eternal self-expression, not a separate divine person. The Holy Spirit is the Spirit of the one God. Preserve real Father/Son distinctions without mask language.",
            "Check Scripture fidelity. Do not allow a reference to be presented as saying more than the supplied source or the biblical text warrants.",
            "Check source fidelity. A carousel may develop a requested word study or connection beyond the Pathway, but new historical, lexical, Greek/Hebrew, or doctrinal claims must be carefully qualified and not invented.",
            "Flag common lexical fallacies: deriving theology from an English gloss alone, claiming one Hebrew or Greek word always has one meaning, or treating etymology as the verse's meaning.",
            "Block direct doctrinal contradiction, false quotation, fabricated lexical fact, or materially misleading claim. Use warning for imprecision, overstatement, weak context, or wording likely to confuse.",
            "If the draft is faithful, say pass. Do not manufacture issues just to appear strict."
          ].join("\n") }]
        },
        {
          role: "user",
          content: [{ type: "input_text", text: [
            `CAROUSEL MODE: ${parsed.data.mode}`,
            `CREATIVE REQUEST: ${parsed.data.prompt || "none"}`,
            "CANONICAL PATHWAY CONTEXT:",
            source,
            "DRAFT SLIDES:",
            JSON.stringify(parsed.data.slides)
          ].join("\n\n") }]
        }
      ]
    })
  });

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 1200);
    return NextResponse.json({ error: `Doctrine checker failed (${response.status}).`, detail }, { status: 502 });
  }

  const result = await response.json();
  const output = extractResponseText(result);
  if (!output) return NextResponse.json({ error: "Doctrine checker returned no structured output." }, { status: 502 });
  try {
    return NextResponse.json({ review: JSON.parse(output), model });
  } catch {
    return NextResponse.json({ error: "Doctrine checker returned invalid structured output." }, { status: 502 });
  }
}
