export const VIDEO_PRODUCER_UPLOAD_STALE_MS = 6 * 60 * 60 * 1000;
export const VIDEO_PRODUCER_TRANSCRIPTION_STALE_MS = 2 * 60 * 60 * 1000;
export const VIDEO_PRODUCER_RENDER_STALE_MS = 4 * 60 * 60 * 1000;

function timestamp(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isVideoProducerWorkerStale(value: unknown, timeoutMs: number, now = Date.now()) {
  const started = timestamp(value);
  return started != null && now - started > timeoutMs;
}
