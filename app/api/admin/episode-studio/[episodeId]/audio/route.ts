import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getStudioPermission } from "@/auth";
import { concatenatePcm16Segments, MAX_PATHWAY_AUDIO_SCRIPT_CHARS, PATHWAY_TTS_INSTRUCTIONS, pcm16MonoToWav, resolveTtsSpeed, splitNarrationForTts } from "@/pathway-audio-render";
import { masterPathwayPcm16Mono, PATHWAY_MASTERING_PROFILE } from "@/pathway-audio-mastering";
import { createServiceClient } from "@/supabase";

export const runtime = "nodejs";
export const maxDuration = 300;

type Speaker = { name: string; role?: string };
type Turn = { speakerIndex: number; text: string };

function cleanSpeakers(value: unknown): Speaker[] {
  if (!Array.isArray(value)) return [{ name: "Cedar", role: "host" }];
  const speakers = value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    if (!name) return [];
    return [{ name, role: typeof record.role === "string" ? record.role : undefined }];
  });
  return speakers.length ? speakers.slice(0, 4) : [{ name: "Cedar", role: "host" }];
}

function splitTurns(script: string, speakers: Speaker[]): Turn[] {
  if (speakers.length <= 1) return [{ speakerIndex: 0, text: script.trim() }];
  const names = speakers.map((speaker) => speaker.name.toLowerCase());
  const turns: Turn[] = [];
  let activeIndex = 0;
  let active: string[] = [];
  const flush = () => {
    const text = active.join("\n").trim();
    if (text) turns.push({ speakerIndex: activeIndex, text });
    active = [];
  };

  for (const rawLine of script.split(/\r?\n/)) {
    const line = rawLine.trim();
    const match = /^([^:]{1,60}):\s*(.*)$/.exec(line);
    if (match) {
      const candidate = match[1].trim().toLowerCase();
      const index = names.findIndex((name) => candidate === name || candidate.startsWith(`${name} `));
      if (index >= 0) {
        flush();
        activeIndex = index;
        if (match[2].trim()) active.push(match[2].trim());
        continue;
      }
    }
    active.push(rawLine);
  }
  flush();
  return turns.length ? turns : [{ speakerIndex: 0, text: script.trim() }];
}

function voiceMapFor(speakers: Speaker[]) {
  const defaults = [
    process.env.OPENAI_TTS_VOICE?.trim() || "cedar",
    process.env.OPENAI_TTS_EPISODE_GUEST_VOICE?.trim() || "coral",
    process.env.OPENAI_TTS_EPISODE_GUEST2_VOICE?.trim() || "onyx",
    process.env.OPENAI_TTS_EPISODE_GUEST3_VOICE?.trim() || "sage"
  ];
  return Object.fromEntries(speakers.map((speaker, index) => [speaker.name, defaults[index] || defaults[0]]));
}

export async function POST(_request: Request, context: { params: Promise<{ episodeId: string }> }) {
  const { access, allowed } = await getStudioPermission("manage_content");
  if (!allowed || access.state !== "allowed" || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { episodeId } = await context.params;
  const service = createServiceClient();
  if (!service) return NextResponse.json({ error: "Supabase service access is not configured." }, { status: 503 });

  const result = await service.from("video_producer_episode_scripts").select("*").eq("id", episodeId).maybeSingle();
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  if (!result.data) return NextResponse.json({ error: "Episode was not found." }, { status: 404 });
  const episode = result.data;
  if (!["approved", "exported"].includes(String(episode.status))) return NextResponse.json({ error: "Approve the episode after theology review before generating audio." }, { status: 409 });
  const review = episode.theology_review && typeof episode.theology_review === "object" ? episode.theology_review as Record<string, unknown> : null;
  if (review?.verdict !== "passed") return NextResponse.json({ error: "The current episode script must pass theology review before audio is generated." }, { status: 409 });

  const narration = String(episode.script_text || "").trim();
  if (!narration) return NextResponse.json({ error: "The approved episode script is empty." }, { status: 422 });
  if (narration.length > MAX_PATHWAY_AUDIO_SCRIPT_CHARS) return NextResponse.json({ error: `Episode script is ${narration.length.toLocaleString()} characters. The current long-form audio limit is ${MAX_PATHWAY_AUDIO_SCRIPT_CHARS.toLocaleString()} characters.` }, { status: 422 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 503 });

  const speakers = cleanSpeakers(episode.speakers);
  const voiceMap = voiceMapFor(speakers);
  const contentHash = createHash("sha256").update(narration).update(JSON.stringify(voiceMap)).digest("hex");
  if (episode.audio_url && episode.audio_content_hash === contentHash) return NextResponse.json({ episode, generated: false, format: "wav" });

  const turns = splitTurns(narration, speakers);
  const model = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
  const speed = resolveTtsSpeed(process.env.OPENAI_TTS_SPEED);
  const pcmSegments: Buffer[] = [];
  let requestCount = 0;

  for (const turn of turns) {
    const chunks = splitNarrationForTts(turn.text);
    const speaker = speakers[turn.speakerIndex] || speakers[0];
    const voice = voiceMap[speaker.name] || voiceMap[speakers[0].name];
    for (const chunk of chunks) {
      requestCount += 1;
      const speech = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model,
          voice,
          input: chunk,
          response_format: "pcm",
          speed,
          instructions: `${PATHWAY_TTS_INSTRUCTIONS}\nThis is an Apostolic Guide podcast episode. Read only the spoken words. Keep ${speaker.name}${speaker.role ? ` (${speaker.role})` : ""} natural and conversational. Do not read speaker labels, markdown, stage directions, or section headings aloud.`
        })
      });
      if (!speech.ok) {
        const detail = (await speech.text().catch(() => "")).slice(0, 1000);
        return NextResponse.json({ error: `Episode audio generation failed during voice segment ${requestCount} (${speech.status}).`, detail }, { status: 502 });
      }
      pcmSegments.push(Buffer.from(await speech.arrayBuffer()));
    }
  }

  let audio: Buffer;
  try {
    const combined = concatenatePcm16Segments(pcmSegments);
    audio = pcm16MonoToWav(masterPathwayPcm16Mono(combined));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Episode audio segments could not be mastered." }, { status: 502 });
  }

  const objectPath = `episodes/${episodeId}/${contentHash.slice(0, 16)}-${PATHWAY_MASTERING_PROFILE}-${Date.now().toString(36)}.wav`;
  const upload = await service.storage.from("pathway-audio").upload(objectPath, audio, { contentType: "audio/wav", cacheControl: "31536000", upsert: false });
  if (upload.error) return NextResponse.json({ error: upload.error.message }, { status: 500 });
  const publicUrl = service.storage.from("pathway-audio").getPublicUrl(objectPath).data.publicUrl;
  const previousPath = typeof episode.audio_storage_path === "string" ? episode.audio_storage_path : null;
  const saved = await service.from("video_producer_episode_scripts").update({
    audio_url: publicUrl,
    audio_storage_path: objectPath,
    audio_content_hash: contentHash,
    audio_model: model,
    audio_voice_map: voiceMap,
    audio_generated_at: new Date().toISOString(),
    updated_by: access.user.id
  }).eq("id", episodeId).select("*").single();
  if (saved.error) {
    await service.storage.from("pathway-audio").remove([objectPath]);
    return NextResponse.json({ error: saved.error.message }, { status: 500 });
  }
  if (previousPath && previousPath !== objectPath) {
    const cleanup = await service.storage.from("pathway-audio").remove([previousPath]);
    if (cleanup.error) console.error("episode audio cleanup failed", { episodeId, message: cleanup.error.message });
  }

  return NextResponse.json({ episode: saved.data, generated: true, requests: requestCount, turns: turns.length, format: "wav", mastering: PATHWAY_MASTERING_PROFILE });
}
