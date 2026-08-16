# Pathway Asset System

Pathway Assets is the media source of truth for Apostolic Guide Studio.

The rule is simple: **media belongs to a Pathway first, then a production lane.** Carousel Studio and Video Studio can create and consume assets, but the Pathway library owns the durable record.

## Product direction

The system borrows the useful patterns from modern DAM and creative-review products without copying their enterprise bloat:

- DAM systems use metadata, tags, search, favorites, collections, duplicate detection, bulk actions, permissions, and usage reporting to keep media findable.
- Smart collections/saved searches are dynamic queries, not duplicated files.
- AI-derived tags and descriptions are most useful as reviewable suggestions rather than silent truth.
- Creative review systems treat revisions as versions of one asset rather than a pile of unrelated filenames.
- Related-asset relationships help keep a parent creative and its slides, thumbnails, renders, captions, and derivatives together.
- Distribution should point back to the source asset so operators can answer where an asset is being used.

Apostolic Guide applies those patterns around the Pathway instead of around a generic enterprise folder hierarchy.

## User outcome

For any Pathway, an operator should be able to answer these questions without hunting through folders or other Studio screens:

- What media already exists?
- Which file is the approved one?
- What is ready, published, or still in review?
- What was this visual created for?
- Can I find it later by subject, Scripture, format, description, or tag?
- Can I save this search as a live Smart View?
- Can Sol suggest useful discovery metadata without silently changing the asset?
- Is this one of the visual references Sol should learn from?
- Have I already uploaded this exact file?
- Where is this asset currently being used?
- Which assets are its parent and children?
- Can I recover an earlier creative version?
- Can I update a batch of selected assets safely?
- Can I download, share, edit, archive, or queue it for publishing?

## Data ownership

`studio_pathway_assets` is the current asset record.

`studio_pathway_asset_versions` stores immutable snapshots before creative source changes. Restoring an old snapshot never rewinds the version number. It preserves the current version first, then applies the old snapshot as a new version.

`studio_pathway_asset_views` stores per-user dynamic Smart Views for a Pathway. It stores filters only. It never duplicates assets.

`studio_visual_style_profile` stores approved visual reference asset IDs used by Sol.

Supabase Storage holds binary files. Asset rows hold the storage bucket/path and operational metadata.

The existing `studio_content_calendar_items.asset_id` link is also treated as an asset usage reference so the library can show whether a file has entered distribution.

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

## Sol metadata assist

For an image-backed asset, Sol can analyze the visual together with the Pathway title, summary, Scripture context, current asset type, and generation prompt.

Sol returns a **suggestion**, not a database mutation:

- suggested library title
- description
- accessible alt text
- search tags
- confidence score

The operator can apply the suggestion into the editable fields, review it, change anything, and then save manually. This avoids turning model output into unreviewed asset truth.

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
- multi-term title/type/source/status/description/alt-text/tag search
- updated/title/workflow sorting
- asset detail inspection
- dynamic Smart Views
- batch selection and bulk operations

A Smart View stores the current query/filter/sort configuration for the current user and Pathway. Applying it recalculates results against the live library.

The metadata column has a GIN index for containment lookups such as SHA fingerprints and future server-side tag filters. Workflow status also has a Pathway/status index.

## Bulk operations

Operators can select up to 100 assets per server request and:

- change workflow status
- add tags while preserving existing tags
- favorite the set
- archive the set

Bulk archive is still soft removal. If a partial database failure occurs, the API returns the IDs that were already updated rather than pretending the whole batch succeeded.

## Usage tracing

Asset list responses include Content Calendar usage information derived from `asset_id` references:

- usage count
- latest linked calendar item
- latest platform
- latest workflow state
- schedule time when available

This is intentionally a source-reference model. The calendar points to the asset. The asset library does not clone distribution records into its own metadata.

## Asset relationships

The existing `parent_asset_id` relationship is surfaced in the inspector as the first related-asset model:

- open parent asset
- see child count
- jump directly to child assets

This maps well to Apostolic Guide outputs such as:

`Carousel Deck → Slides`

`Video Project → Render → Thumbnail`

`Story Set → Story Frames`

If we later need many-to-many semantic relationships, add a dedicated relation table rather than overloading `parent_asset_id`.

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

## Audit trail

Privileged Pathway Asset mutations write to the existing Studio audit system where practical, including:

- create/version save
- upload/generated save
- metadata update/archive
- bulk update/archive
- version restore
- style-reference add/remove
- Sol metadata suggestion

The audit system remains server-only.

## Security model

All Pathway asset admin routes require `manage_content`.

Storage previews use signed URLs for private files when no public URL is present. The service client performs server-side operations after Studio permission checks.

Saved views are scoped to the authenticated user and Pathway. Direct table access is revoked; the server API owns access.

## Deliberately not built yet

These are useful product patterns, but they are separate lakes and should not be jammed into this one:

- frame-accurate comments and annotations
- multi-stage external proofing/approval links
- expiring external portals
- license/rights expiration enforcement
- derivative/transformation presets
- visual similarity search
- resumable master-video ingest

The current single-operator workflow does not need all of those at once.

## Next contained lake

Large media should not be pushed through JSON/base64 uploads. The next asset-system lake is **resumable large-file ingest** for video and other heavy media, using direct/resumable Storage uploads with progress, retry, cancellation, server-side registration, and the same Pathway metadata/fingerprint rules.

Do that when Pathway Assets needs to ingest master video files directly. Do not bolt large video upload onto the current image endpoint.
