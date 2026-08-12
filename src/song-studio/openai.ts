type OpenAIUsage = {
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  input_tokens_details?: Record<string, unknown>;
  output_tokens_details?: Record<string, unknown>;
  [key: string]: unknown;
};

type ResponsesPayload = {
  id?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  usage?: OpenAIUsage;
};

export type StructuredSongResponse<T> = {
  data: T;
  responseId: string | null;
  usage: OpenAIUsage;
  model: string;
};

function extractOutputText(payload: ResponsesPayload) {
  return (payload.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === "output_text" && typeof part.text === "string")
    .map((part) => part.text!.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

export async function runSongStructuredResponse<T>({
  apiKey,
  prompt,
  schema,
  schemaName,
  model = process.env.OPENAI_SONG_MODEL || "gpt-5.6-sol",
  maxOutputTokens = 5000
}: {
  apiKey: string;
  prompt: string;
  schema: Record<string, unknown>;
  schemaName: string;
  model?: string;
  maxOutputTokens?: number;
}): Promise<StructuredSongResponse<T>> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      store: false,
      input: prompt,
      max_output_tokens: maxOutputTokens,
      text: {
        format: {
          type: "json_schema",
          name: schemaName,
          strict: true,
          schema
        }
      }
    })
  });

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 1600);
    throw new Error(`OpenAI song request failed (${response.status}): ${detail || response.statusText}`);
  }

  const payload = await response.json() as ResponsesPayload;
  const outputText = extractOutputText(payload);
  if (!outputText) throw new Error("The song model returned no structured output.");

  let data: T;
  try {
    data = JSON.parse(outputText) as T;
  } catch {
    throw new Error("The song model returned malformed structured output.");
  }

  return {
    data,
    responseId: payload.id ?? null,
    usage: payload.usage ?? {},
    model
  };
}

const scoreProperties = Object.fromEntries([
  "doctrinal_fidelity",
  "scripture_grounding",
  "christ_centeredness",
  "oneness_integrity",
  "biblical_language",
  "congregational_singability",
  "hook_memorability",
  "lyrical_originality",
  "worship_orientation",
  "cliche_resistance",
  "structural_cohesion",
  "suno_readiness"
].map((key) => [key, { type: "integer", minimum: 0, maximum: 100 }]));

export const SONG_WRITE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string", minLength: 1 },
    lyrics: { type: "string", minLength: 80 },
    theological_center: { type: "string", minLength: 1 },
    scripture_references: { type: "array", items: { type: "string" } },
    suno_style_prompt: { type: "string" },
    production_notes: { type: "string" },
    negative_style_notes: { type: "array", items: { type: "string" } },
    bpm_min: { type: "integer", minimum: 40, maximum: 220 },
    bpm_max: { type: "integer", minimum: 40, maximum: 220 },
    editorial_summary: { type: "string" }
  },
  required: [
    "title", "lyrics", "theological_center", "scripture_references", "suno_style_prompt",
    "production_notes", "negative_style_notes", "bpm_min", "bpm_max", "editorial_summary"
  ]
};

export const SONG_EVALUATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    scores: {
      type: "object",
      additionalProperties: false,
      properties: scoreProperties,
      required: Object.keys(scoreProperties)
    },
    strengths: { type: "array", items: { type: "string" } },
    issues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          severity: { type: "string", enum: ["blocker", "warning", "note"] },
          category: { type: "string", enum: [...Object.keys(scoreProperties), "general"] },
          line: { type: "string" },
          note: { type: "string" },
          suggested_direction: { type: "string" }
        },
        required: ["severity", "category", "line", "note", "suggested_direction"]
      }
    },
    scripture_references: { type: "array", items: { type: "string" } },
    theological_notes: { type: "array", items: { type: "string" } }
  },
  required: ["scores", "strengths", "issues", "scripture_references", "theological_notes"]
};

export const SUNO_PREP_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    style_prompt: { type: "string", minLength: 1 },
    production_notes: { type: "string" },
    negative_style_notes: { type: "array", items: { type: "string" } },
    bpm_min: { type: "integer", minimum: 40, maximum: 220 },
    bpm_max: { type: "integer", minimum: 40, maximum: 220 }
  },
  required: ["style_prompt", "production_notes", "negative_style_notes", "bpm_min", "bpm_max"]
};
