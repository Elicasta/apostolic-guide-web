import { z } from "zod";

/**
 * Brand settings are stored in video_producer_brand_profiles.config, not in
 * branches of the compositor. New series are data rows, not new editors.
 */
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const videoProducerBrandProfileSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
  name: z.string().trim().min(1).max(120),
  active: z.boolean().default(true),
  config: z.object({
    theme: z.object({
      ink: hex, accent: hex, paper: hex,
      fonts: z.array(z.string().trim().min(1).max(80)).min(1).max(6)
    }).strict(),
    logo: z.object({
      wordmark: z.string().max(120),
      assetPath: z.string().max(300).nullable().default(null)
    }).strict(),
    bumpers: z.object({
      introSeconds: z.number().finite().min(0).max(12),
      outroSeconds: z.number().finite().min(0).max(12),
      outroSafeBottom: z.number().finite().min(0.25).max(0.5)
    }).strict(),
    pathwayRequired: z.boolean(),
    doctrineGate: z.enum(["required", "optional"]),
    destination: z.object({
      type: z.enum(["ag_publisher", "youtube"]),
      youtubeHandle: z.string().regex(/^@[a-zA-Z0-9_.-]{3,50}$/).nullable()
    }).strict(),
    audio: z.object({
      integratedLufs: z.number().min(-24).max(-10),
      truePeakDbtp: z.number().min(-6).max(-1),
      lra: z.number().min(3).max(12),
      rnnoiseMix: z.number().min(0).max(1).default(0)
    }).strict(),
    captions: z.object({
      font: z.string().min(1).max(80),
      fill: hex, highlight: hex
    }).strict()
  }).strict()
}).strict();
export type VideoProducerBrandProfile = z.infer<typeof videoProducerBrandProfileSchema>;

const forbiddenChannel = /cornerstone/i;
export function isSelectableVideoProducerBrand(value: unknown): value is VideoProducerBrandProfile {
  const result = videoProducerBrandProfileSchema.safeParse(value);
  if (!result.success || !result.data.active) return false;
  const profile = result.data;
  if (forbiddenChannel.test(profile.slug) || forbiddenChannel.test(profile.name) ||
      forbiddenChannel.test(profile.config.logo.wordmark) ||
      forbiddenChannel.test(profile.config.destination.youtubeHandle || "")) return false;
  if (profile.config.destination.type === "youtube" && !profile.config.destination.youtubeHandle) return false;
  if (profile.slug === "in-the-now" &&
      (profile.config.destination.type !== "youtube" ||
       profile.config.destination.youtubeHandle?.toLowerCase() !== "@iamelicastaneda" ||
       profile.config.pathwayRequired ||
       profile.config.doctrineGate !== "optional" ||
       profile.config.audio.integratedLufs !== -14 ||
       profile.config.audio.truePeakDbtp !== -1.5)) return false;
  if (profile.slug === "apostolic-guide" &&
      (profile.config.destination.type !== "ag_publisher" ||
       !profile.config.pathwayRequired ||
       profile.config.doctrineGate !== "required" ||
       profile.config.audio.integratedLufs !== -16)) return false;
  return true;
}
export function requiresVideoProducerPathway(profile: VideoProducerBrandProfile, mode: "podcast" | "reels") {
  return mode === "podcast" && profile.config.pathwayRequired;
}
export function requiresVideoProducerDoctrineGate(profile: VideoProducerBrandProfile) {
  return profile.config.doctrineGate === "required";
}
export function videoProducerBrandAudioTarget(profile: VideoProducerBrandProfile) {
  const { integratedLufs, truePeakDbtp, lra } = profile.config.audio;
  return { integrated: integratedLufs, truePeak: truePeakDbtp, lra };
}
export function validateVideoProducerChannel(profile: VideoProducerBrandProfile, channel: string) {
  if (!isSelectableVideoProducerBrand(profile)) return false;
  if (profile.config.destination.type !== "youtube") return channel === "ag_publisher";
  return channel.toLowerCase() === profile.config.destination.youtubeHandle?.toLowerCase();
}
