import "server-only";
import type { ServiceClient } from "./video-producer-server";
import {
  isSelectableVideoProducerBrand,
  videoProducerBrandProfileSchema,
  type VideoProducerBrandProfile
} from "./video-producer-brand-profiles";

export async function listVideoProducerBrands(service: ServiceClient): Promise<VideoProducerBrandProfile[]> {
  const result = await service.from("video_producer_brand_profiles")
    .select("slug,name,active,config").order("name", {ascending: true});
  if (result.error) throw new Error("Brand profile storage unavailable. Apply the Video Producer brand migration: " + result.error.message);
  return (result.data || []).map(row => videoProducerBrandProfileSchema.safeParse(row))
    .filter(result => result.success)
    .map(result => result.data as VideoProducerBrandProfile)
    .filter(isSelectableVideoProducerBrand);
}
export async function getVideoProducerBrand(service: ServiceClient, slug: string): Promise<VideoProducerBrandProfile> {
  const result = await service.from("video_producer_brand_profiles")
    .select("slug,name,active,config").eq("slug",slug).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  const parsed = videoProducerBrandProfileSchema.safeParse(result.data);
  if (!parsed.success || !isSelectableVideoProducerBrand(parsed.data)) throw new Error("Brand profile is unavailable or not allowed.");
  return parsed.data;
}
