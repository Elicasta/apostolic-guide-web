# Video Producer

Video Producer is the post-production system for recorded Apostolic Guide video.

## Principle

**AI decides. Code edits.**

The transcript and Apostolic Guide content data are editorial inputs. Language models may propose edit decisions, titles, graphics, captions, motion cues and clip structure. Deterministic media tooling performs the actual cuts, audio processing, color transforms, graphics, motion, music mixing and exports.

## Two production lanes

### Podcast Mode

Long-form production for full Apostolic Guide episodes and teaching content.

Default delivery:

- 16:9
- 1920x1080
- 30 fps MP4
- AG voice cleanup
- AG Studio grade
- chapters and Scripture graphics
- intro and outro enabled
- captions off by default

The producer pass is allowed to prioritize pacing, clarity and polish over aggressive retention editing.

### Reels Producer

Short-form production for Reels, TikTok, Shorts and other vertical distribution.

Default delivery:

- 9:16
- 1080x1920
- 30 fps MP4
- punchier AG voice preset
- clean social grade
- animated captions enabled
- current-word emphasis enabled
- reframing and punch-in motion cues available
- Scripture, statement and CTA overlays
- intro and outro disabled by default

Caption style and caption animation are explicit project settings rather than uncontrolled model decisions. Initial styles are `kinetic-clean`, `word-pop`, `editorial` and `minimal`. Initial animations are `highlight`, `pop`, `rise` and `none`.

## Workspace flow

1. Open `/admin/video-producer`.
2. Select Podcast Mode or Reels Producer.
3. Load the raw video source.
4. Review or paste the transcript.
5. Configure mode-specific direction such as reel caption style and animation.
6. Generate the edit plan.
7. Review cuts, overlays, motion and production presets.
8. Compile the edit plan into the worker-safe render plan.
9. Approve before rendering.

The browser workspace intentionally does not pretend to render long media inside a Vercel request. Media jobs belong in the renderer/worker pattern already used by Video Studio.

## Edit plan v2

`VideoProducerEditPlan` is source-time based. It describes:

- production mode
- cut ranges
- graphic overlays
- overlay animation and placement
- motion cues
- numeric focal point and scale for crop/reframe motion
- music cues
- caption settings
- audio preset
- color preset
- intro/outro usage

`compileVideoProducerRenderPlan()` normalizes cuts, builds keep segments, calculates edited duration and maps timed media into the edited output timeline.

Timed ranges are cut-aware. If a cut happens inside an overlay, motion cue or music cue, `outputRanges` splits the event around the removed media rather than letting timing drift.

A point event whose start lands inside removed footage receives `outputStart: null`. A renderer must not silently move it to an unrelated sentence.

Model-proposed focal points are normalized to `0..1`, and zoom scale is clamped to the supported `1..2.5` range before the worker receives it. Invalid timestamps and invalid source durations are rejected or normalized. NaN must never become an FFmpeg timestamp or transform.

## Production presets

### `ag-voice-clean`

Podcast-oriented target chain:

1. high-pass filter
2. corrective EQ
3. compression
4. de-essing
5. presence EQ
6. limiter
7. final loudness normalization

### `ag-voice-punch`

Short-form target chain using the same clean foundation with tighter dynamics and controlled presence so phone playback remains clear without clipping or becoming harsh.

### `ag-studio`

Long-form target grade:

1. known camera/log transform when available
2. restrained contrast curve
3. light saturation correction
4. highlight protection
5. final Rec.709 output

### `ag-clean`

Short-form target grade. Keep skin and brand graphics clean, preserve phone-screen readability and avoid extreme contrast that destroys caption legibility.

These presets remain deterministic. AI rescue/enhancement can be an opt-in path for damaged recordings later.

## Renderer boundary

The renderer receives `VideoProducerRenderPlan`, not free-form model output.

A production worker should:

1. validate the source asset
2. cut and concatenate `keepSegments`
3. process voice audio using the selected preset
4. apply the selected color preset
5. reframe to the requested output geometry using sanitized focal and scale values
6. render branded overlays using approved placement and animation values
7. render captions using word-level timestamps and the approved style/animation
8. execute motion cues such as punch-ins or emphasis
9. mix library music using remapped cue ranges and explicit gains
10. prepend/append approved bumper assets when enabled
11. encode the final master
12. save output metadata and progress
13. return the project to review

## Next production layer

### Transcript service

Generate word-level timestamps from the uploaded source and persist the transcript. The editing model must reference timestamped transcript segments rather than estimate times from paragraph position.

### Sol Edit Director

Use structured output with separate prompts/rules per mode.

Podcast Mode can propose:

- false-start and repetition cuts
- pause tightening
- chapter beats
- Scripture/pathway graphics
- statement cards
- music moments
- CTA placement

Reels Producer can propose:

- hook protection
- dead-air and repetition removal
- caption grouping
- punch-ins and reframes
- focal point and zoom values
- emphasis cards
- overlay placement and animation
- Scripture graphics
- CTA placement
- safe crop direction

Every returned plan is normalized and validated before it can reach the renderer.

### Reels extraction from a podcast master

Reels Producer should also be able to receive an approved podcast master/transcript, identify self-contained short-form moments and create independent 9:16 projects. Those reel projects still use the same `VideoProducerEditPlan` contract instead of becoming a separate editing stack.

### Publishing

After explicit review, create the cover/thumbnail package, title, description and platform-specific copy, then hand approved assets to the existing content control/publishing workflow.

## Guardrails

- Never publish directly from model output.
- Never let an invalid timestamp silently delete media.
- Never let cuts silently drift overlays, motion or music.
- Never execute unbounded model-proposed crop/zoom values.
- Never overwrite Video Studio pathway projects.
- Never make FFmpeg rendering depend on a browser staying open.
- Keep source assets immutable. Render from edit decisions instead of destructively modifying uploads.
- Mode changes invalidate the current plan so a 16:9 plan cannot accidentally render as a reel or vice versa.
