import "server-only";
import { textDoctrineSource, type DoctrineSource } from "./doctrine-gate";

/** The canonical, immutable text snapshot used by both the write API and the worker. */
export function publicationDoctrineSource(metadata: Record<string, unknown>): DoctrineSource {
 const kind=String(metadata.source_kind||"");
 const sourceType=kind==="custom_asset"?"custom_asset":kind==="clip"?"video_clip":kind==="render"?"video_render":null;
 if(!sourceType)throw new Error("Unknown publication source. Doctrine check required.");
 const id=String(kind==="custom_asset"?metadata.custom_asset_id:kind==="clip"?metadata.clip_id:metadata.render_id||"");
 if(!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id))throw new Error("Publication source has no valid doctrine identity.");
 const fields:Record<string,unknown>={};
 for(const field of ["title","description","caption","alt_text","transcript"]) {
  fields[field]=typeof metadata[field]==="string"?metadata[field]:"";
 }
 fields.hashtags=Array.isArray(metadata.hashtags)?metadata.hashtags.filter(v=>typeof v==="string").join(" "):String(metadata.hashtags||"");
 return textDoctrineSource(sourceType,id,fields);
}
