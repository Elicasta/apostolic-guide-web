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
- Heavy source media should upload directly and resumably instead of flowing through application-server memory.

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
- Can I ingest a large video or audio master without restarting after a network interruption?

## Data ownership

`studio_pathway_assets` is the current asset record.

`studio_pathway_asset_versions` stores immutable snapshots before creative source changes. Restoring an old snapshot never rewinds the version number. It preserves the current version first, then applies the old snapshot as a new version.

`studio_pathway_asset_views` stores per-user dynamic Smart Views for a Pathway. It stores filters only. It never duplicates assets.

`studio_pathway_asset_uploads` is the resumable-ingest ledger. It records the operator, Pathway, destination lane, source filename, MIME type, byte length, current transfer state, last known byte offset, TUS upload URL, expiry, and finalized asset ID.

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
- `mime` / `mimeType`
- `bytes`
- `mediaKind`
- `role`
- `uploadMethod`
- `ingestSessionId`
- original filename / last modified timestamp
- duration and dimensions when the browser can inspect them
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

There are now two ingest paths.

### Fast image upload

The library still supports quick PNG, JPEG, and WebP uploads up to 8 MB each. The server computes SHA-256 and skips exact duplicates.

### Ingest Dock

The dedicated **Pathway Assets Ingest Dock** is for source masters:

- PNG / JPEG / WebP
- MP4 / MOV / WebM
- MP3 / WAV / M4A-compatible `audio/mp4`
- PDF reference documents
- ZIP project archives
- up to 1 GB per source in the current bucket policy

Large files do not pass through Next.js as base64 or request bodies. The server creates a signed upload token and the browser talks directly to Supabase Storage using the TUS protocol.

Supabase requires 6 MB TUS chunks. The UI uses that chunk size, tracks byte offset, speed and ETA, supports pause/cancel/retry, and can resume an interrupted transfer after the operator reselects the same local file.

The upload ledger retains the TUS URL and client fingerprint for 24 hours. A daily cron marks expired sessions and removes any orphaned storage object that exists at the reserved path.

Video and audio masters automatically route into the Video Production lane. Images, PDFs, and archives honor the lane selected when the operator enters the Ingest Dock.

For files up to 64 MB the browser also computes SHA-256 before transfer so the API can warn when the same binary already exists. Larger files still receive stable browser-file fingerprints for session recovery without pretending that filename/size is cryptographic duplicate proof.

Finalization verifies that the storage object exists and that its stored byte size matches the source before creating the durable `studio_pathway_assets` record.

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

Non-image source masters deliberately do not receive image preview URLs, which prevents the UI from trying to render MP4/WAV/PDF files as images and prevents them from appearing as Sol visual style references.

## Audit trail

Privileged Pathway Asset mutations write to the existing Studio audit system where practical, including:

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

All Pathway asset admin routes require `manage_content`.

The source-media bucket is private. The application signs a single storage path for upload instead of exposing the service role or proxying large binaries through the app server.

Storage previews use signed URLs for private image files when no public URL is present. Non-image masters remain downloadable through the permission-checked server download route without receiving an image preview URL.

Saved views and ingest sessions are scoped to the authenticated user. Direct table access is revoked; server APIs own access.

## Recovery and failure policy

A resumable upload has three identities:

1. the browser file fingerprint,
2. the server ingest-session UUID,
3. the unique TUS upload URL.

The browser can safely pause or lose connectivity because Storage owns the partial transfer. On retry the Studio renews the signed upload credential, performs a `HEAD` request against the TUS URL to recover the authoritative offset, and resumes from there.

A source is not registered as a durable asset until storage verification passes. That keeps half-uploaded files out of the normal library.

## Deliberately separate future lakes

These remain independent product projects rather than hidden inside ingest:

- frame-accurate comments and annotations
- multi-stage external proofing/approval links
- expiring external portals
- license/rights expiration enforcement
- derivative/transformation presets
- visual similarity search
- automatic video proxy generation / transcoding
- waveform and thumbnail extraction jobs for heavy media

## Current next step

The resumable-ingest lake is now part of Pathway Assets. The next media-system expansion should only happen when there is a proven production bottleneck. The most natural future step is a background derivative worker that turns source masters into lightweight preview proxies, thumbnails, waveforms, and production-ready renditions without altering the original file.
