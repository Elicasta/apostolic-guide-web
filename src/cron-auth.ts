import { timingSafeEqual } from "node:crypto";

export function cronRequestAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const provided = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(providedBuffer, expectedBuffer);
}
