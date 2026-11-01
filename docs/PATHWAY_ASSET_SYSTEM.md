# Pathway Asset System

Pathway Assets is the media source of truth for Apostolic Guide Studio.

The rule is simple: **media belongs to a Pathway first, then a production lane.** Carousel Studio and Video Studio can create and consume assets, but the Pathway library owns the durable record.

## Product direction

The system borrows the useful patterns from modern DAM and creative-review products without copying their enterprise bloat:

- metadata, tags, search, favorites, Smart Views, duplicate detection, bulk actions, permissions, and usage reporting keep media findable;
- AI-derived descriptions and tags are reviewable suggestions, not silent truth;
- revisions stay attached to one asset through version history;
- parent/child relationships keep decks, slides, thumbnails, renders, captions, and derivatives together;
- distribution records point back to the source asset so operators can answer where a file is being used;
- large source media uploads directly to object storage instead of flowing through Next.js memory.

Apostolic Guide applies those patterns around the Pathway instead of around a generic folder tree.

## Data ownership

`studio_pathway_assets` is the current asset record.

`studio_pathway_asset_versions` stores immutable snapshots before creative source changes. Restoring an old snapshot never rewinds the version number. It preserves the current version first, then applies the old snapshot as a new version.

`studio_pathway_asset_views` stores per-user dynamic Smart Views for a Pathway. It stores filters only and never duplicates files.

`studio_pathway_asset_uploads` is the source-ingest ledger. It records the operator, Pathway, production lane, source filename, MIME type, byte length, transfer state, storage provider/path, expiry, and finalized asset ID.

`studio_visual_style_profile` stores approved visual reference asset IDs used by Sol.

**Vercel Blob holds large source-master bytes. Supabase holds the DAM database, workflow state, metadata, relationships, audit trail, and ingest ledger.** Existing small-image workflows that already use Supabase Storage remain supported.

The `studio_content_calendar_items.asset_id` link is treated as an asset usage reference so the library can show whether a file has entered distribution.

## Operational metadata

Operational DAM metadata lives in the asset `metadata` JSONB envelope so the schema can evolve without destructive rewrites.

Current fields include:

- `description`
- `altText`
- `tags[]`
- `favorite`
- `sha256`
- `mime` / `mimeType`
- `bytes`
- `mediaKind`
- `role`
- `storageProvider`
- `uploadMethod`
- `ingestSessionId`
- `immutableSource`
- original filename / last modified timestamp
- duration and dimensions when the browser can inspect them
- provider ETag and private Blob provenance for ingested masters
- generation metadata such as model, size, and creation type

Tags are normalized, case-insensitively deduplicated, and capped.

## Sol metadata assist

For an image-backed asset, Sol can analyze the visual together with the Pathway title, summary, Scripture context, current asset type, and generation prompt.

Sol returns a suggestion instead of mutating the database:

- suggested library title
- description
- accessible alt text
- search tags
- confidence score

The operator can apply the suggestion, review it, change anything, and save manually.

## Upload safety

There are two ingest paths.

### Fast image upload

The library still supports quick PNG, JPEG, and WebP uploads up to 8 MB each. The server computes SHA-256 and skips exact duplicates.

### Ingest Dock

The dedicated **Pathway Assets Ingest Dock** is for source masters:

- PNG / JPEG / WebP
- MP4 / MOV / M4V / WebM / MPEG / AVI
- MP3 / WAV / M4A-compatible `audio/mp4`
- PDF reference documents
- ZIP project archives
- up to 20 GB per source at the application layer

The browser uploads directly to the existing private Vercel Blob store through `@vercel/blob/client`. Next.js authorizes the upload and tracks the session, but the application server never proxies the large file bytes.

Large files use Vercel Blob multipart upload. Multipart splits the file into parts, uploads parts in parallel, retries failed parts, and reports live progress. The Studio surfaces percentage, transferred bytes, speed, ETA, retry, and cancellation.

The upload session remains in Supabase for 24 hours. A daily cron expires stale sessions and removes any orphaned Blob object associated with the reserved source path.

Video and audio masters automatically route into the Video Production lane. Images, PDFs, and archives honor the lane selected when the operator enters the Ingest Dock.

For files up to 64 MB the browser computes SHA-256 before transfer so the API can warn when the same binary already exists. Larger files keep a stable browser-file fingerprint for tracing without pretending that filename and size are cryptographic duplicate proof.

Finalization calls Vercel Blob metadata verification and refuses to create `studio_pathway_assets` unless the Blob exists and its stored byte size matches the selected source file.

Finalized source masters are deliberately immutable. Production work should create derivatives rather than edit or replace the original source record.

## Private Blob delivery

The private Blob URL is never exposed as an unauthenticated public asset.

`/api/admin/pathway-assets/file` verifies `manage_content`, fetches the private object with the server-side Blob token, and streams authorized previews.

`/api/admin/pathway-assets/download` follows the same permission model and streams Vercel Blob masters instead of buffering multi-gigabyte files into Function memory.

To avoid turning an admin preview into a multi-gigabyte transfer, video/audio/PDF masters larger than 100 MB do not auto-stream in the source viewer. The original is still available for download and production handoff.

## Search and organization

The Pathway library supports:

- Pathway selection
- Carousel/Social vs Video lanes
- visual/copy/output groups
- workflow status filtering
- favorites
- multi-term metadata search
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

Bulk archive is soft removal. If a partial database failure occurs, the API returns the IDs already updated rather than pretending the whole batch succeeded.

## Usage tracing

Asset list responses include Content Calendar usage information derived from `asset_id` references:

- usage count
- latest linked calendar item
- latest platform
- latest workflow state
- schedule time when available

The calendar points to the asset. The asset library does not clone distribution records into its own metadata.

## Asset relationships

The existing `parent_asset_id` relationship is surfaced in the inspector as the first related-asset model:

`Carousel Deck → Slides`

`Video Project → Render → Thumbnail`

`Story Set → Story Frames`

If many-to-many semantic relationships become necessary, add a dedicated relation table rather than overloading `parent_asset_id`.

## Workflow states

Assets use the lifecycle:

`draft → review → approved → ready → published`

`archived` is soft removal. Archiving removes an item from normal library queries while keeping its record, source reference, and history intact.

## Version policy

Creative source edits increment the asset version and snapshot the prior asset first.

Operational metadata edits such as tags, description, favorite, alt text, or status do not create a creative version.

A restore is non-destructive:

1. preserve current version;
2. load the requested historical snapshot;
3. apply its restorable creative fields;
4. increment the current version;
5. keep the full chain recoverable.

Ingested source masters are a separate immutable class. They are not edited in place.

## Visual memory

Any image-backed creative asset can be added to or removed from the Apostolic Guide visual style reference set. The library marks active references so operators can see what is currently teaching Sol the visual language.

Non-image source masters do not receive image-style references.

## Audit trail

Privileged Pathway Asset mutations write to the Studio audit system where practical, including:

- create/version save
- upload/generated save
- ingest prepare/finalize/cancel
- metadata update/archive
- bulk update/archive
- version restore
- style-reference add/remove
- Sol metadata suggestion

The audit system remains server-only.

## Security model

All Pathway Asset admin routes require `manage_content`.

The private Vercel Blob store uses `BLOB_READ_WRITE_TOKEN` only on the server. Client uploads receive short-lived upload authorization through `handleUpload`; the long-lived read/write token is never sent to the browser.

Source preview and download routes authenticate beside the Blob read operation. Saved views and ingest sessions are scoped to the authenticated user. Direct table access remains revoked; server APIs own access.

## Recovery and failure policy

The source ingest flow has three durable identities:

1. browser file fingerprint;
2. server ingest-session UUID;
3. unique Vercel Blob pathname.

Multipart upload retries individual failed parts while the active browser transfer is alive. Cancellation aborts the browser request and asks the server to clean the reserved Blob path.

A full browser close does not pretend to provide byte-perfect cross-session resume. The Supabase ledger preserves the interrupted state so cleanup is deterministic, and the operator can reselect the source to begin a fresh multipart transfer. This is preferable to advertising recovery guarantees the underlying client API does not provide.

A source is not registered as a normal DAM asset until Blob verification passes. Half-uploaded files therefore never appear as durable masters.

## Deliberately separate future lakes

These remain separate product projects:

- frame-accurate comments and annotations
- multi-stage external proofing links
- expiring external portals
- license/rights expiration enforcement
- derivative/transformation presets
- visual similarity search
- automatic video proxy generation / transcoding
- waveform and thumbnail extraction jobs for heavy media

## Current next step

The source-ingest lake now shares the same Vercel Blob storage architecture already used by Video Producer. The next natural media-system expansion is a background derivative worker that turns source masters into lightweight preview proxies, thumbnails, waveforms, and production-ready renditions without altering the original.
