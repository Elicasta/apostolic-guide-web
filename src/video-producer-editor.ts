import { z } from "zod";
import {
  buildKeepSegments,
  type VideoProducerEditPlan,
  type VideoProducerCut,
} from "./video-producer";

export type ProducerScene = {
  id: string;
  start: number;
  end: number;
  text: string;
};
export type EditorDocument = {
  plan: VideoProducerEditPlan;
  lockedScenes: string[];
};
export type EditorHistory = {
  past: EditorDocument[];
  present: EditorDocument;
  future: EditorDocument[];
};

// Scenes partition LOCAL source time. A child reel's root offset belongs only to playback.
export function buildProducerScenes(
  segments: { start: number; end: number; text: string }[],
  duration: number,
): ProducerScene[] {
  if (!Number.isFinite(duration) || duration <= 0) return [];
  const rows = segments
    .filter(
      (s) =>
        Number.isFinite(s.start) &&
        Number.isFinite(s.end) &&
        s.end > 0 &&
        s.start < duration,
    )
    .sort((a, b) => a.start - b.start);
  const scenes: ProducerScene[] = [];
  let start = 0;
  let text: string[] = [];
  for (const row of rows) {
    if (row.start - start >= 10 && text.length) {
      scenes.push({
        id: `scene-${Math.round(start * 1000)}`,
        start,
        end: row.start,
        text: text.join(" "),
      });
      start = row.start;
      text = [];
    }
    text.push(row.text.trim());
  }
  if (text.length)
    scenes.push({
      id: `scene-${Math.round(start * 1000)}`,
      start,
      end: duration,
      text: text.join(" "),
    });
  if (!scenes.length) {
    for (let t = 0; t < duration; t += 12)
      scenes.push({
        id: `scene-${t * 1000}`,
        start: t,
        end: Math.min(duration, t + 12),
        text: "Recording",
      });
  }
  return scenes;
}

export function sceneKeepRanges(
  plan: VideoProducerEditPlan,
  scene: ProducerScene,
) {
  return buildKeepSegments(plan.cuts, plan.sourceDuration)
    .map((r) => ({
      start: Math.max(scene.start, r.start),
      end: Math.min(scene.end, r.end),
    }))
    .filter((r) => r.end > r.start);
}

// Replace only cuts inside the scene, splitting a cut that crosses its boundary.
export function replaceSceneCuts(
  plan: VideoProducerEditPlan,
  scene: ProducerScene,
  inside: VideoProducerCut[],
) {
  const outside = plan.cuts.flatMap((cut) => {
    if (cut.end <= scene.start || cut.start >= scene.end) return [cut];
    return [
      ...(cut.start < scene.start
        ? [{ ...cut, id: `${cut.id}-left`, end: scene.start }]
        : []),
      ...(cut.end > scene.end
        ? [{ ...cut, id: `${cut.id}-right`, start: scene.end }]
        : []),
    ];
  });
  return { ...plan, cuts: [...outside, ...inside] };
}

export function trimProducerScene(
  plan: VideoProducerEditPlan,
  scene: ProducerScene,
  start: number,
  end: number,
) {
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < scene.start ||
    end > scene.end ||
    end - start < 0.1
  )
    return plan;
  const interior = plan.cuts
    .filter((c) => !c.id.startsWith(`trim-${scene.id}-`))
    .map((c) => ({
      ...c,
      start: Math.max(scene.start, c.start),
      end: Math.min(scene.end, c.end),
    }))
    .filter((c) => c.end > c.start);
  return replaceSceneCuts(plan, scene, [
    ...interior,
    ...(start > scene.start
      ? [
          {
            id: `trim-${scene.id}-in`,
            start: scene.start,
            end: start,
            reason: "Scene trim",
          },
        ]
      : []),
    ...(end < scene.end
      ? [
          {
            id: `trim-${scene.id}-out`,
            start: end,
            end: scene.end,
            reason: "Scene trim",
          },
        ]
      : []),
  ]);
}

export function editHistory(
  history: EditorHistory,
  next: EditorDocument | "undo" | "redo",
): EditorHistory {
  if (next === "undo") {
    const previous = history.past.at(-1);
    return previous
      ? {
          past: history.past.slice(0, -1),
          present: previous,
          future: [history.present, ...history.future],
        }
      : history;
  }
  if (next === "redo") {
    const future = history.future[0];
    return future
      ? {
          past: [...history.past, history.present].slice(-50),
          present: future,
          future: history.future.slice(1),
        }
      : history;
  }
  return JSON.stringify(next) === JSON.stringify(history.present)
    ? history
    : {
        past: [...history.past, history.present].slice(-50),
        present: next,
        future: [],
      };
}

const id = z.string().min(1).max(180);
const time = z.number().finite().min(0).max(86400);
export const producerEditorPlanSchema = z
  .object({
    version: z.literal(2),
    mode: z.enum(["podcast", "reels"]),
    sourceDuration: time.positive(),
    cuts: z
      .array(
        z.object({
          id,
          start: time,
          end: time,
          reason: z.string().max(1000).optional(),
        }),
      )
      .max(2000),
    overlays: z
      .array(
        z.object({
          id,
          kind: z.enum([
            "scripture",
            "pathway",
            "lower-third",
            "chapter",
            "statement",
            "kinetic",
            "quote",
            "cta",
          ]),
          start: time,
          duration: time.positive(),
          title: z.string().min(1).max(1000),
          body: z.string().max(4000).optional(),
          reference: z.string().max(300).optional(),
          animation: z
            .enum(["fade", "rise", "slide", "pop", "wipe", "none"])
            .optional(),
          placement: z
            .enum(["top", "center", "lower-third", "full-frame"])
            .optional(),
          treatment: z
            .enum([
              "impact",
              "split",
              "strike",
              "band",
              "stack",
              "question-stack",
            ])
            .optional(),
        }),
      )
      .max(200),
    motion: z
      .array(
        z.object({
          id,
          kind: z.enum(["punch-in", "reframe", "emphasis", "b-roll"]),
          start: time,
          duration: time.positive(),
          intensity: z.enum(["subtle", "medium", "strong"]).optional(),
          note: z.string().max(2000).optional(),
          transform: z
            .object({
              focusX: z.number().min(0).max(1),
              focusY: z.number().min(0).max(1),
              scale: z.number().min(1).max(2),
            })
            .optional(),
        }),
      )
      .max(1000),
    music: z
      .array(
        z.object({
          id,
          trackId: id,
          start: time,
          end: time,
          gainDb: z.number().min(-60).max(0),
          duckUnderVoice: z.boolean(),
        }),
      )
      .max(20),
    captions: z.object({
      enabled: z.boolean(),
      style: z.enum(["kinetic-clean", "word-pop", "editorial", "minimal"]),
      animation: z.enum(["pop", "rise", "highlight", "none"]),
      maxWordsPerCard: z.number().int().min(1).max(20),
      position: z.enum(["lower", "center"]),
      highlightCurrentWord: z.boolean(),
    }),
    audioPreset: z.enum(["ag-voice-clean", "ag-voice-punch", "none"]),
    colorPreset: z.enum(["ag-studio", "ag-warm", "ag-clean", "none"]),
    intro: z.boolean(),
    outro: z.boolean(),
  })
  .superRefine((plan, ctx) => {
    for (const list of [plan.cuts, plan.overlays, plan.motion, plan.music]) {
      if (new Set(list.map((x) => x.id)).size !== list.length)
        ctx.addIssue({ code: "custom", message: "Duplicate edit IDs." });
      for (const cue of list) {
        const end = "end" in cue ? cue.end : cue.start + cue.duration;
        if (end <= cue.start || end > plan.sourceDuration + 0.001)
          ctx.addIssue({
            code: "custom",
            message: "An edit falls outside the source.",
          });
      }
    }
    if (!buildKeepSegments(plan.cuts, plan.sourceDuration).length)
      ctx.addIssue({
        code: "custom",
        message: "Keep at least one part of the recording.",
      });
  });

export const producerEditorSaveSchema = z.object({
  projectId: z.string().uuid(),
  expectedUpdatedAt: z.string().min(1).max(64),
  plan: producerEditorPlanSchema,
  lockedScenes: z.array(id).max(2000),
});
