import "server-only";
import { buildPathwayNarration, hashAudioText, pathwayNarrationHash } from "./pathway-audio";
import { masterPathwayPcm16Mono, PATHWAY_MASTERING_PROFILE } from "./pathway-audio-mastering";
import { concatenatePcm16Segments, MAX_PATHWAY_AUDIO_SCRIPT_CHARS, PATHWAY_TTS_INSTRUCTIONS, pcm16MonoToWav, resolveTtsSpeed, splitNarrationForTts } from "./pathway-audio-render";
import { buildPathwayAudioScriptPrompt } from "./pathway-audio-script";
import { runPathwayAudioScriptCheck } from "./pathway-audio-script-checker";
import { pathwayBySlug } from "./pathway-catalog";
import { createServiceClient } from "./supabase";

const MAX_GENERATED_SCRIPT_CHARS = 4096;
type Service = NonNullable<ReturnType<typeof createServiceClient>>;

type ResponsePayload = {
  output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
};

function extractOutputText(payload: ResponsePayload) {
  return (payload.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === "output_text" && typeof part.text === "string")
    .map((part) => part.text!.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function optionalActor(row: Record<string, unknown>, key: string, actorUserId?: string | null) {
  if (actorUserId) row[key] = actorUserId;
  return row;
}

export async function ensureForgeAudioScript(input: { pathwaySlug: string; actorUserId?: string | null }) {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  const pathway = pathwayBySlug(input.pathwaySlug);
  if (!pathway) throw new Error("Pathway not found.");
  const sourceHash = pathwayNarrationHash(pathway);
  const existing = await service.from("pathway_audio_scripts")
    .select("script_text,source_hash,script_hash,status,checker_status,checked_script_hash,checker_result")
    .eq("pathway_slug", pathway.slug)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data?.script_hash && existing.data.source_hash === sourceHash) {
    return {
      generated: false,
      sourceHash,
      scriptHash: String(existing.data.script_hash),
      status: String(existing.data.status),
      checkerStatus: existing.data.checker_status ? String(existing.data.checker_status) : null,
      checkedScriptHash: existing.data.checked_script_hash ? String(existing.data.checked_script_hash) : null,
      checkerResult: existing.data.checker_result ?? {}
    };
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured for Forge audio scripting.");
  const source = buildPathwayNarration(pathway);
  const model = process.env.OPENAI_SCRIPT_MODEL?.trim() || "gpt-5-mini";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model, input: buildPathwayAudioScriptPrompt(source), max_output_tokens: 2600 })
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 800);
    throw new Error(`Forge narration generation failed (${response.status}).${detail ? ` ${detail}` : ""}`);
  }
  const scriptText = extractOutputText(await response.json() as ResponsePayload);
  if (scriptText.length < 100) throw new Error("Forge returned an empty or incomplete narration script.");
  if (scriptText.length > MAX_GENERATED_SCRIPT_CHARS) throw new Error(`Forge narration is ${scriptText.length.toLocaleString()} characters; shorten it below ${MAX_GENERATED_SCRIPT_CHARS.toLocaleString()} before review.`);

  const scriptHash = hashAudioText(scriptText);
  const checkerModel = process.env.OPENAI_SCRIPT_CHECK_MODEL?.trim() || model;
  let check = null;
  let checkerError: string | null = null;
  try {
    check = await runPathwayAudioScriptCheck({ apiKey, model: checkerModel, source, scriptText });
  } catch (error) {
    checkerError = error instanceof Error ? error.message : "Script checker failed.";
  }
  const now = new Date().toISOString();
  const row = optionalActor({
    pathway_slug: pathway.slug,
    script_text: scriptText,
    source_hash: sourceHash,
    script_hash: scriptHash,
    status: "draft",
    model,
    generated_at: now,
    approved_at: null,
    approved_by: null,
    checker_status: check?.verdict ?? null,
    checker_model: check ? checkerModel : null,
    checked_script_hash: check ? scriptHash : null,
    checker_result: check ?? {},
    checked_at: check ? now : null,
    updated_at: now
  }, "generated_by", input.actorUserId);
  const saved = await service.from("pathway_audio_scripts").upsert(row, { onConflict: "pathway_slug" }).select("script_hash,status,checker_status,checked_script_hash,checker_result").single();
  if (saved.error) throw saved.error;
  return {
    generated: true,
    sourceHash,
    scriptHash: String(saved.data.script_hash),
    status: String(saved.data.status),
    checkerStatus: saved.data.checker_status ? String(saved.data.checker_status) : null,
    checkedScriptHash: saved.data.checked_script_hash ? String(saved.data.checked_script_hash) : null,
    checkerResult: saved.data.checker_result ?? {},
    checkerError
  };
}

export async function forgeAudioGateState(pathwaySlug: string) {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  const pathway = pathwayBySlug(pathwaySlug);
  if (!pathway) throw new Error("Pathway not found.");
  const sourceHash = pathwayNarrationHash(pathway);
  const [script, audio] = await Promise.all([
    service.from("pathway_audio_scripts").select("script_hash,source_hash,status,checker_status,checked_script_hash").eq("pathway_slug", pathway.slug).maybeSingle(),
    service.from("pathway_audio_assets").select("audio_url,content_hash").eq("pathway_slug", pathway.slug).maybeSingle()
  ]);
  if (script.error) throw script.error;
  if (audio.error) throw audio.error;
  const scriptCurrent = Boolean(script.data?.script_hash && script.data.source_hash === sourceHash);
  const approved = scriptCurrent && script.data?.status === "approved";
  const doctrinePassed = Boolean(approved && script.data?.checker_status === "passed" && script.data?.checked_script_hash === script.data?.script_hash);
  const audioReady = Boolean(doctrinePassed && audio.data?.audio_url && audio.data?.content_hash === script.data?.script_hash);
  return {
    sourceHash,
    scriptHash: script.data?.script_hash ? String(script.data.script_hash) : null,
    scriptCurrent,
    approved,
    doctrinePassed,
    audioReady
  };
}

export async function renderForgeApprovedAudio(input: { pathwaySlug: string; actorUserId?: string | null }) {
  const service = createServiceClient();
  if (!service) throw new Error("Supabase service access is not configured.");
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured for Forge audio rendering.");
  const pathway = pathwayBySlug(input.pathwaySlug);
  if (!pathway) throw new Error("Pathway not found.");

  const scriptResult = await service.from("pathway_audio_scripts").select("script_text,source_hash,script_hash,status,checker_status,checked_script_hash").eq("pathway_slug", pathway.slug).maybeSingle();
  if (scriptResult.error) throw scriptResult.error;
  const script = scriptResult.data;
  if (!script || script.status !== "approved") throw new Error("Approve the narration script before Forge generates audio.");
  if (script.source_hash !== pathwayNarrationHash(pathway)) throw new Error("The Pathway changed after this narration script was created.");
  if (script.checker_status !== "passed" || script.checked_script_hash !== script.script_hash) throw new Error("The exact approved narration script has not passed doctrine review.");

  const narration = String(script.script_text).trim();
  const contentHash = hashAudioText(narration);
  if (contentHash !== script.script_hash) throw new Error("Approved narration hash mismatch. Save and approve the script again.");
  if (narration.length > MAX_PATHWAY_AUDIO_SCRIPT_CHARS) throw new Error(`Approved narration exceeds the ${MAX_PATHWAY_AUDIO_SCRIPT_CHARS.toLocaleString()} character render limit.`);

  const existing = await service.from("pathway_audio_assets").select("audio_url,storage_path,content_hash,model,voice,generated_at").eq("pathway_slug", pathway.slug).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data?.content_hash === contentHash && existing.data?.audio_url) {
    return { generated: false, asset: existing.data, segments: 0, mastering: PATHWAY_MASTERING_PROFILE };
  }

  const chunks = splitNarrationForTts(narration);
  if (!chunks.length) throw new Error("Approved narration is empty.");
  const model = process.env.OPENAI_TTS_MODEL?.trim() || "gpt-4o-mini-tts";
  const voice = process.env.OPENAI_TTS_VOICE?.trim() || "cedar";
  const speed = resolveTtsSpeed(process.env.OPENAI_TTS_SPEED);
  const pcmSegments: Buffer[] = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const speech = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model, voice, input: chunks[index], response_format: "pcm", speed, instructions: PATHWAY_TTS_INSTRUCTIONS })
    });
    if (!speech.ok) {
      const detail = (await speech.text().catch(() => "")).slice(0, 800);
      throw new Error(`Forge audio generation failed on segment ${index + 1}/${chunks.length} (${speech.status}).${detail ? ` ${detail}` : ""}`);
    }
    pcmSegments.push(Buffer.from(await speech.arrayBuffer()));
  }

  const mastered = masterPathwayPcm16Mono(concatenatePcm16Segments(pcmSegments));
  const wav = pcm16MonoToWav(mastered);
  const objectPath = `pathways/${pathway.slug}/${contentHash.slice(0, 16)}-${PATHWAY_MASTERING_PROFILE}-${Date.now().toString(36)}.wav`;
  const upload = await service.storage.from("pathway-audio").upload(objectPath, wav, { contentType: "audio/wav", cacheControl: "31536000", upsert: false });
  if (upload.error) throw upload.error;
  const publicUrl = service.storage.from("pathway-audio").getPublicUrl(objectPath).data.publicUrl;
  const row = optionalActor({
    pathway_slug: pathway.slug,
    audio_url: publicUrl,
    storage_path: objectPath,
    content_hash: contentHash,
    model,
    voice,
    generated_at: new Date().toISOString()
  }, "generated_by", input.actorUserId);
  const saved = await service.from("pathway_audio_assets").upsert(row, { onConflict: "pathway_slug" }).select("pathway_slug,audio_url,storage_path,content_hash,model,voice,generated_at").single();
  if (saved.error) {
    await service.storage.from("pathway-audio").remove([objectPath]);
    throw saved.error;
  }
  const previousStoragePath = existing.data?.storage_path ? String(existing.data.storage_path) : null;
  if (previousStoragePath && previousStoragePath !== objectPath) {
    const cleanup = await service.storage.from("pathway-audio").remove([previousStoragePath]);
    if (cleanup.error) console.error("Forge previous pathway audio cleanup failed", { pathway: pathway.slug, message: cleanup.error.message });
  }
  return { generated: true, asset: saved.data, segments: chunks.length, speed, mastering: PATHWAY_MASTERING_PROFILE };
}

export async function resumeApprovedForgeAudioRuns(serviceOverride?: Service) {
  const service = serviceOverride ?? createServiceClient();
  if (!service) return 0;
  const waiting = await service.from("sol_operator_runs")
    .select("id,pathway_slug,result")
    .eq("recipe_key", "pathway_audio_stage")
    .eq("status", "waiting_review")
    .order("updated_at", { ascending: true })
    .limit(20);
  if (waiting.error) throw waiting.error;
  let resumed = 0;
  for (const row of waiting.data ?? []) {
    const result = row.result && typeof row.result === "object" && !Array.isArray(row.result) ? row.result as Record<string, unknown> : {};
    if (result.requiresScriptApproval !== true || !row.pathway_slug) continue;
    const gate = await forgeAudioGateState(String(row.pathway_slug));
    if (!gate.approved || !gate.doctrinePassed || gate.audioReady) continue;
    const updated = await service.from("sol_operator_runs").update({
      status: "queued",
      completed_at: null,
      error: null,
      next_retry_at: null,
      lease_expires_at: null,
      heartbeat_at: null,
      worker_id: null
    }).eq("id", row.id).eq("status", "waiting_review");
    if (updated.error) throw updated.error;
    await service.from("sol_operator_events").insert({
      run_id: row.id,
      event_type: "review.gate_satisfied",
      detail: { gate: "audio_script_approval", pathway_slug: row.pathway_slug }
    });
    resumed += 1;
  }
  return resumed;
}
