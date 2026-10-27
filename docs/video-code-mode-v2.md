# Video Code Mode v2: architecture and review gates

Base: `main` at `8dcbb4c9c35ecfc5790b80364480d655373b66c2`. Depends on no unmerged branches. Related work: #102, #103 and #74.

## Contract
- The Code Mode envelope is versioned. Legacy v1 documents still parse.
- New `video` version 2 documents are stored in the existing Producer `director_metadata.videoCodeV2` or Studio `style.videoCodeV2` JSON. No migration.
- Scenes carry absolute start/end, layer, HTML, CSS, target keyframes and easing, optional phrase/word anchors, and transitions.
- Code and Fields edit the same JSON document. Apply saves a Code Mode checkpoint, uses the project's updated-at concurrency check, and resets Producer approval.
- Chromium frame export uses `videoFrameHtml`, exactly the same compiler as the read-only sandboxed editor iframe. FFmpeg is still the media compositor and audio master. It never executes scene HTML scripts.
- Scene HTML is sanitized, frame CSS blocks network resources and generated text, and preview CSP blocks scripts/network assets.
- Scene anchors move to output time through the Producer cut map. A word deleted by cuts suppresses its anchored scene.
- Optional word-pop kinetic captions follow Whisper word timing. Existing ASS captions are disabled when kinetic captions are enabled to avoid double text.

## Gate
Code Mode does not publish. For Producer v2, **Approve** runs the shared doctrine engine on all visible scene HTML, captions and the entire spoken transcript. A failed/flagged/unavailable verdict blocks approval. Render asserts that the exact approved content still matches. Changes invalidate the approval fingerprint. Production schema updates are not required.

## Renderer
`scripts/video_code_render_frames.ts` steps Chromium at exact integer frame times, using fonts already stored in `public/fonts`, embedded in the renderer. `scripts/video_code_motion_overlay.py` composes the RGBA plates into existing FFmpeg video. Producer invokes it before packaging; Studio invokes it after the existing Pathway pipeline.

On both runners Playwright/Chromium is installed via the repository lockfile. This increases render time and GitHub Actions usage. Set clear per-job limits before enabling for longer Pathways.

## What is and is not proven
Unit tests validate the v2 schema, selector/CSS rejection, anchored timing, renderer HTML and template library. Full browser/UI, screenshot comparison, actual database writes, Actions-to-blob completion and the IMG 2032 source have **not yet** been verified. The preview currently displays the graphics plate, not the composited camera footage.

Still needed before accepting the original 30-second IMG 2032 definition of done:
- An actual 5–10s proof-render UI and golden-frame comparison.
- Stable signed Media/Graphics registry and automatic asset resolution.
- Version history browsing/restore UI (checkpoints are written).
- Field tools for advanced word/letter stagger and eased footage punch-ins.
- Verified text cue alignment for Isaiah 43:10, Isaiah 44:8, and Mark 12 in IMG 2032, plus the broken master download and stale worker jobs.
- Reconcile or supersede PRs #102/#103/#74 without losing their B-roll and editor contracts.

Release is blocked until all required automated checks and an actual end-to-end render are green. Do not merge solely on this foundation's code coverage.
