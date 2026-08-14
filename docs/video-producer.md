# Video Producer

Video Producer is the post-production system for recorded Apostolic Guide video.

## Principle

**AI decides. Code edits.**

GPT-5.6 Sol may propose editorial decisions from a timestamped transcript. Server code validates those decisions and freezes an approved render manifest. FFmpeg performs the actual cuts, audio processing, color transforms, captions, motion, graphics, bumpers and encoding.

The language model never receives permission to alter video frames directly and no model output can render until it survives normalization and human approval.

## Two production lanes

### Podcast Mode

Long-form production for full Apostolic Guide episodes and teaching content.

Default delivery:

- 16:9
- 1920x1080
- 30 fps H.264/AAC MP4
- `ag-voice-clean` dialogue processing
- `ag-studio` grade
- conservative editorial cuts
- chapter, Scripture and statement overlays
- restrained motion
- branded code-generated intro and outro
- captions off by default

Podcast directing prioritizes doctrinal continuity, clarity and natural pacing over aggressive retention editing. The server rejects a model plan that removes more than 35% of the source.

### Reels Producer

Short-form production for Reels, TikTok, Shorts and vertical distribution.

Default delivery:

- 9:16
- 1080x1920
- 30 fps H.264/AAC MP4
- `ag-voice-punch` dialogue processing
- `ag-clean` social grade
- animated captions
- current-word emphasis
- punch-in and reframe motion
- sanitized focal point and zoom data
- Scripture, statement and CTA overlays
- no long-form bumper by default

Caption styles:

- `kinetic-clean`
- `word-pop`
- `editorial`
- `minimal`

Caption animations:

- `highlight`
- `pop`
- `rise`
- `none`

Caption direction is explicit project state. If it changes after Sol generated a plan, the old plan cannot be approved until the Reels Director is run again.

## Implemented production flow

```text
private raw video
      ↓
word-level transcription worker
      ↓
normalized transcript
      ↓
Podcast Director OR Reels Director
      ↓
validated source-time edit plan
      ↓
human review
      ↓
approval fingerprint
      ↓
immutable private render manifest
      ↓
GitHub Actions FFmpeg worker
      ↓
private review master
```

The browser never needs to stay open for transcription or rendering.

## Storage architecture

Raw camera masters do **not** use Supabase Storage. The current Supabase organization cannot safely accept multi-gigabyte source files under its present storage limits.

Video Producer therefore separates storage responsibilities:

- **Supabase Postgres**: project state, transcript, edit plan, approval fingerprint, reel candidates, render jobs and progress.
- **Private Vercel Blob**: raw source video, immutable render manifests and finished review masters.
- **GitHub Actions**: long-running transcription and FFmpeg rendering compute.

Browser uploads use Vercel Blob client multipart upload so the raw file does not pass through a Vercel Function body. Workers receive short-lived private GET/PUT URLs. Persistent database records store the provider pathname, never an expiring signed URL.

If render dispatch fails after a manifest was uploaded, the server removes that private manifest and records the failed job rather than leaking orphaned render instructions into storage.

### Required Vercel setup

Connect a Vercel Blob store to the Apostolic Guide web project so `BLOB_READ_WRITE_TOKEN` is available to the deployment.

Source uploads are application-limited to 20 GB, but the connected Vercel account/store limits remain authoritative.

## Transcription

`video-producer-transcribe` is an asynchronous GitHub Actions worker.

The worker:

1. downloads the private source from a short-lived URL
2. reads source duration with `ffprobe`
3. extracts mono 16 kHz dialogue audio with FFmpeg
4. splits long audio into 30-minute MP3 chunks
5. sends each chunk to `whisper-1` with word and segment timestamps
6. offsets each chunk back onto the original source timeline
7. sends only the compact transcript back to Apostolic Guide

Chunking keeps long podcasts below transcription file-upload limits while preserving source-accurate word timing.

### Required GitHub Actions secret

The repository needs an Actions secret named:

```text
OPENAI_API_KEY
```

This is used only by the transcription worker. The Sol Director continues to use the server-side `OPENAI_API_KEY` already configured for the web application.

## Sol Edit Director

The route uses strict structured output and defaults to `gpt-5.6-sol`.

### Podcast Director rules

The model may propose:

- obvious false-start removal
- repeated-take removal
- accidental dead-air tightening
- chapter graphics
- Scripture graphics
- concise statement cards
- restrained punch-ins/reframes

It is explicitly instructed not to shorten substantive teaching merely for runtime.

### Reels Director rules

The model may propose:

- dead-air and stumble cuts
- hook protection
- vertical punch-ins/reframes
- focal points and zoom scale
- Scripture graphics
- statement/CTA overlays

It may not manufacture a spoken hook or fake B-roll. A `b-roll` cue is only a note for later asset selection.

## Edit-plan safety

`VideoProducerEditPlan` remains source-time based. `compileVideoProducerRenderPlan()`:

- normalizes and merges cut ranges
- rejects invalid duration/timestamps
- builds keep segments
- maps source time into edited output time
- splits overlay, motion and music ranges around cuts
- clamps `focusX` and `focusY` to `0..1`
- clamps zoom scale to `1..2.5`
- outputs exact 16:9 or 9:16 geometry based on mode

If an event begins inside deleted footage, it is not silently moved onto another sentence.

## Approval fingerprint

Approval is tied to a SHA-256 fingerprint of the exact edit plan.

The render route recomputes the fingerprint before dispatch. If the plan changed after approval, rendering is rejected and the edit must be reviewed again.

This prevents stale UI state, caption changes or future manual edits from rendering instructions that were never approved.

## FFmpeg render worker

The `video-producer-render` GitHub Actions worker executes the frozen manifest.

Implemented operations:

1. source range extraction for child reels
2. cut/concat from normalized keep segments
3. Podcast or Reels output geometry
4. selected audio preset
5. selected color preset
6. cut-aware ASS captions
7. current-word caption emphasis
8. cut-aware branded overlays
9. numeric punch-in/reframe motion
10. AG wordmark intro/outro when enabled
11. H.264/AAC encoding
12. private Vercel Blob upload
13. render progress callbacks
14. review-state handoff

`video-producer-worker-check.yml` smoke-renders synthetic Podcast and Reels files in CI so FFmpeg filter graphs are exercised rather than merely syntax-checked.

## Podcast → Reels

An approved Podcast project can ask Sol for 5–15 candidate moments.

Candidate validation:

- 12–150 second hard range
- score normalized to `0..100`
- strongly overlapping candidates are deduplicated
- score is editorial ranking, not a promise of virality

Accepting a candidate creates a **child Reels project** that references the same immutable raw source instead of duplicating the media file.

The child's transcript is sliced from the podcast transcript and shifted onto a local `0.00` timeline before the Reels Director runs. This prevents a clip taken at minute 32 from carrying 32-minute timestamps into its render plan.

## Database

Service-role-only tables:

- `video_producer_projects`
- `video_producer_renders`

Both have RLS enabled and intentionally expose no client-write policies. Admin APIs authenticate `manage_content` permission and perform mutations through the service client.

Foreign-key actor columns (`created_by`, `updated_by`, `requested_by`) have covering indexes so project history does not create avoidable FK maintenance scans as the table grows.

## Verification

The web branch is tested by the repository's Node test suite and Vercel production build/typecheck. Video Producer adds tests for timestamp normalization, transcript slicing, destructive-cut guards, strict structured-output parsing, mode geometry, transform sanitization and reel-candidate deduplication.

A separate GitHub Actions smoke workflow compiles the Python workers and actually renders synthetic Podcast and Reels masters with Linux FFmpeg. This catches invalid filter graphs, codec assumptions, captions, motion and bumper packaging that a TypeScript build cannot detect.

A real camera-file end-to-end run still requires the private Blob connection and the Actions `OPENAI_API_KEY` described above.

## Current boundary / next layer

Not implemented yet:

- selectable first-party music library and deterministic ducking/mix automation
- automatic camera/log-profile identification and camera-specific transforms
- actual external B-roll library insertion
- cover/thumbnail generation for Video Producer masters
- direct publishing handoff from Video Producer into the existing content-control queue
- detailed manual timeline correction UI

These should build on the current approved render-plan contract rather than creating another editor stack.

## Guardrails

- Never publish directly from model output.
- Never render unapproved model output.
- Never let invalid timestamps silently delete media.
- Never let cuts silently drift timed graphics or motion.
- Never execute unbounded crop/zoom values.
- Never overwrite Pathway Video Studio projects.
- Never make FFmpeg or transcription depend on the browser staying open.
- Keep raw source assets immutable.
- Create child Reels projects by source range instead of duplicating podcast masters.
- Clean up a private render manifest if dispatch fails before a worker owns it.
- Any visual-direction change after planning must invalidate approval before render.
