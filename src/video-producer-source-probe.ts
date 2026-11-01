import {z} from "zod";

/** Technical FFprobe observations. Unknown is not silently classified as SDR. */
export const videoSourceProbeSchema=z.object({
 durationSec:z.number().positive().nullable(),
 width:z.number().int().positive().nullable(),
 height:z.number().int().positive().nullable(),
 colorPrimaries:z.string().max(64),colorTransfer:z.string().max(64),
 colorSpace:z.string().max(64),colorRange:z.string().max(64),
 pixelFormat:z.string().max(64),bitDepth:z.number().int().min(1).max(32).nullable(),
 rotationDegrees:z.number().int().min(-360).max(360),
 averageFps:z.number().positive().max(1000).nullable(),
 nominalFps:z.number().positive().max(1000).nullable(),
 vfrHint:z.enum(["likely","undetermined"]),
 hdrMode:z.enum(["sdr","hlg","pq","unknown"])
}).strict();
export type VideoSourceProbe=z.infer<typeof videoSourceProbeSchema>;
