# Video Producer

Video Producer is Apostolic Guide's transcript-driven post-production system.

## Principle

**AI decides. Code edits.**

GPT-5.6 Sol proposes editorial decisions from timestamped transcript data. Server code validates the plan, a human approves the exact version, and FFmpeg executes the frozen manifest. Model output never edits frames directly and never publishes automatically.

## Production lanes

### Podcast Mode

- 16:9, 1920x1080, 30 fps MP4
- conservative long-form cuts
- `ag-voice-clean` audio preset
- `ag-studio` color preset
- chapter, Scripture and statement overlays
- restrained motion
- branded code-generated intro/outro
- captions off by default

The server rejects Podcast Director plans that remove more than 35% of source time.

### Reels Producer

- 9:16, 1080x1920, 30 fps MP4
- retention-focused cuts
- `ag-voice-punch` audio preset
- `ag-clean` color preset
- animated captions and current-word emphasis
- punch-in/reframe motion with numeric focal point and zoom
- Scripture, statement and CTA overlays
- no long-form bumper by default

Caption styles are `kinetic-clean`, `word-pop`, `editorial`, and `minimal`. Caption animations are `highlight`, `pop`, `rise`, and `none`.

Changing Reels caption direction after a plan was generated makes that plan stale and blocks approval until the Reels Director runs again.

## Implemented flow

```text
private raw video
      ↓
word-level transcription worker
      ↓
normalized timestamped transcript
      ↓
Podcast Director or Reels Director
      ↓
validated edit plan
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

The browser does not need to stay open for transcription or rendering.

## Storage and compute

- **Supabase Postgres** stores project state, transcript, edit plan, approval fingerprint, reel candidates, render jobs, and progress.
- **Private Vercel Blob** stores raw source media, immutable render manifests, and finished review masters.
- **GitHub Actions** runs long-form transcription and FFmpeg rendering.

Raw camera files do not use Supabase Storage. Browser source uploads use private multipart Blob upload and do not pass through a Vercel Function request body.

Persistent records store the private provider pathname, never an expiring signed URL. Workers receive short-lived signed download/upload URLs. If render dispatch fails after a manifest was uploaded, the server deletes the orphan manifest and records the failed job.

### Required runtime setup

The Vercel project needs a connected Blob store so `BLOB_READ_WRITE_TOKEN` is available. Video Producer currently application-limits source files to 20 GB, while provider/account limits remain authoritative.

The GitHub repository needs an Actions secret named `OPENAI_API_KEY` for the asynchronous transcription worker. The server-side Sol Director continues to use the application's existing OpenAI key.

## Transcription worker

`video-producer-transcribe`:

1. downloads the private source
2. probes duration with `ffprobe`
3. extracts mono 16 kHz dialogue audio
4. splits long audio into 30-minute MP3 chunks
5. transcribes each chunk with `whisper-1` word and segment timestamps
6. offsets chunk timing back onto the original source timeline
7. sends the compact transcript back through a one-time authenticated callback

Completed transcripts must contain usable word timestamps before they are accepted.

## Sol Edit Director

Both directors use strict structured output and default to `gpt-5.6-sol`.

Podcast rules prioritize doctrinal continuity, natural pacing, false-start/repeated-take cleanup, Scripture graphics, chapters, and restrained motion. Substantive teaching must not be removed merely to shorten runtime.

Reels rules protect the actual spoken hook, tighten dead air/stumbles, propose vertical punch-ins/reframes, and add Scripture/statement/CTA graphics. The model may not manufacture a hook or fake B-roll.

All model-proposed transforms are sanitized before render. `focusX` and `focusY` are clamped to `0..1`; zoom scale is clamped to `1..2.5`.

## Approval safety

Approval stores a SHA-256 fingerprint of the exact edit plan. The render route recomputes that fingerprint before dispatch. If the edit changed after approval, rendering is rejected and the project must be reviewed again.

Timed overlays, motion, and music ranges are remapped around cuts. A point event that lands inside removed footage is not silently moved onto an unrelated sentence.

## FFmpeg render worker

`video-producer-render` executes:

1. child-reel source-range extraction
2. normalized cut/concat
3. Podcast or Reels output geometry
4. selected audio preset
5. selected color preset
6. cut-aware ASS captions
7. current-word caption emphasis
8. cut-aware branded overlays
9. numeric punch-in/reframe motion
10. AG wordmark intro/outro when enabled
11. H.264/AAC encode
12. private review-master upload
13. progress/failure/completion callbacks

The worker workflow has a separate smoke test that compiles the Python workers and actually renders synthetic Podcast and Reels masters on Linux FFmpeg.

## Podcast to Reels

An approved Podcast can ask Sol for 5–15 self-contained reel candidates. Candidates are validated to 12–150 seconds, scores are normalized to 0–100, and strongly overlapping selections are deduplicated.

Accepting a candidate creates a child Reels project that references the same immutable raw source instead of copying the media. The inherited transcript is sliced to the selected source range and shifted to a local `0.00` timeline before the Reels Director runs.

## Database

Service-role-only tables:

- `video_producer_projects`
- `video_producer_renders`

RLS is enabled and no direct client-write policies are created. Admin APIs require `manage_content` permission and mutate through the service client. Actor foreign keys have covering indexes.

## Verification boundary

The repository's Node suite covers timestamp normalization, transcript slicing, destructive-cut guards, strict director parsing, mode geometry, transform sanitization, and reel-candidate deduplication. Vercel performs the production Next.js/TypeScript build. GitHub Actions separately smoke-renders both media modes with FFmpeg.

A real camera-file end-to-end run still requires the private Blob connection and the Actions `OPENAI_API_KEY` described above.

## Next layers

Not implemented yet:

- first-party music library selection and deterministic ducking/mixing
- automatic camera/log profile identification and camera-specific transforms
- external B-roll asset insertion
- cover/thumbnail generation
- direct publishing handoff into the existing content-control queue
- detailed manual timeline correction UI

These should extend the current approved render-plan contract rather than creating a second editor stack.
