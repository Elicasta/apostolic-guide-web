# Pathway Asset System

Pathway Assets is the media source of truth for Apostolic Guide Studio.

The rule is simple: **media belongs to a Pathway first, then a production lane.** Carousel Studio and Video Studio can create and consume assets, but the Pathway library owns the durable record.

## User outcome

For any Pathway, an operator should be able to answer these questions without hunting through folders or other Studio screens:

- What media already exists?
- Which file is the approved one?
- What is ready, published, or still in review?
- What was this visual created for?
- Can I find it later by subject, Scripture, format, or description?
- Is this one of the visual references Sol should learn from?
- Have I already uploaded this exact file?
- Can I recover an earlier creative version?
- Can I download, share, edit, archive, or queue it for publishing?

## Data ownership

`studio_pathway_assets` is the current asset record.

`studio_pathway_asset_versions` stores immutable snapshots before creative source changes. Restoring an old snapshot never rewinds the version number. It preserves the current version first, then applies the old snapshot as a new version.

`studio_visual_style_profile` stores approved visual reference asset IDs used by Sol.

Supabase Storage holds binary files. Asset rows hold the storage bucket/path and operational metadata.

## Operational metadata

Operational DAM metadata lives in the asset `metadata` JSONB envelope so the existing schema can evolve without a destructive table rewrite.

Current fields include:

- `description`
- `altText`
- `tags[]`
- `favorite`
- `sha256`
- `mime`
- `bytes`
- generation metadata such as model, size, and creation type

Tags are normalized, case-insensitively deduplicated, and capped to keep the metadata predictable.

## Upload safety

Manual uploads currently accept PNG, JPEG, and WebP images up to 8 MB each.

Each upload receives a unique storage path. Before storage, the server computes a SHA-256 fingerprint and checks active assets in the same Pathway and production lane. Exact duplicate files return `409 Conflict` rather than creating a second copy.

The UI supports multi-file selection and drag/drop, then uploads files sequentially so one failed file does not discard the rest of the batch.

## Search and organization

The Pathway library supports:

- Pathway selection
- Carousel/Social vs Video lanes
- visual/copy/output groups
- workflow status filtering
- favorites
- title/type/source/status/description/alt-text/tag search
- updated/title/workflow sorting
- asset detail inspection

The metadata column has a GIN index for containment lookups such as SHA fingerprints and future server-side tag filters. Workflow status also has a Pathway/status index.

## Workflow states

Assets use the existing lifecycle:

`draft → review → approved → ready → published`

`archived` is a soft removal state. Archiving removes the item from normal library queries while keeping its record, file reference, and history intact.

## Version policy

Creative source edits increment the asset version and snapshot the prior asset first.

Operational metadata edits such as tags, description, favorite, alt text, or status do **not** create a creative version. This prevents version history from being flooded by library housekeeping.

A restore is non-destructive:

1. preserve current version,
2. load requested historical snapshot,
3. apply its restorable creative fields,
4. increment the current version,
5. keep the full chain recoverable.

## Visual memory

Any image-backed asset can be added to or removed from the Apostolic Guide visual style reference set. The library marks active references so operators can see what is currently teaching Sol the visual language.

## Security model

All Pathway asset admin routes require `manage_content`.

Storage previews use signed URLs for private files when no public URL is present. The service client performs server-side operations after Studio permission checks.

## Next contained lake

Large media should not be pushed through JSON/base64 uploads. The next asset-system lake is **resumable large-file ingest** for video and other heavy media, using direct/resumable Storage uploads with progress, retry, cancellation, server-side registration, and the same Pathway metadata/fingerprint rules.

Do that when Pathway Assets needs to ingest master video files directly. Do not bolt large video upload onto the current image endpoint.
