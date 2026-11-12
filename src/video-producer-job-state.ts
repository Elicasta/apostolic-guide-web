export const VIDEO_PRODUCER_UPLOAD_STALE_MS = 6 * 60 * 60 * 1000;
export const VIDEO_PRODUCER_TRANSCRIPTION_STALE_MS = 2 * 60 * 60 * 1000;
// Render workers now heartbeat every ~10 seconds while FFmpeg is encoding. Three minutes
// without a heartbeat means the hosted runner is no longer trustworthy and should surface
// as retryable instead of looking alive for hours.
export const VIDEO_PRODUCER_RENDER_STALE_MS = 3 * 60 * 1000;
export const VIDEO_PRODUCER_QUEUED_RENDER_STALE_MS = 15 * 60 * 1000;

function timestamp(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isVideoProducerWorkerStale(value: unknown, timeoutMs: number, now = Date.now()) {
  const started = timestamp(value);
  return started != null && now - started > timeoutMs;
}

/** GitHub runner queue and active worker heartbeats require different deadlines. */
export function videoProducerStalledRenderReason(input:{
 status:string;requestedAt:string;heartbeatAt?:unknown;stage?:unknown;now?:number;
}):string|null{
 const {status,requestedAt,heartbeatAt,stage,now=Date.now()}=input;
 if(!["queued","rendering"].includes(status))return null;
 const queued=status==="queued";
 const last=queued?requestedAt:heartbeatAt||requestedAt;
 const timeout=queued?VIDEO_PRODUCER_QUEUED_RENDER_STALE_MS:VIDEO_PRODUCER_RENDER_STALE_MS;
 if(!isVideoProducerWorkerStale(last,timeout,now))return null;
 if(queued)return "GitHub accepted render dispatch but no worker started within 15 minutes. Check Actions run status, the dispatcher workflow and Contents: write permission on VIDEO_STUDIO_GITHUB_TOKEN. Approval and source are preserved. Retry render after repair.";
 const lastStage=typeof stage==="string"&&stage.trim()?" Last stage: "+stage.slice(0,160)+".":"";
 return "FFmpeg render stopped reporting progress for more than 3 minutes."+lastStage+" Check the GitHub Actions job logs for a runner failure or cancellation. Approval and source are preserved. Retry render.";
}
