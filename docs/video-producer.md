# Video Producer

Video Producer is the post-production system for recorded Apostolic Guide video.

## Principle

**AI decides. Code edits.**

The transcript and Apostolic Guide content data are the editorial inputs. Language models may propose edit decisions, titles, clip candidates and graphic cues. Deterministic media tooling performs the actual cuts, audio processing, color transforms, graphics, music mixing and exports.

## Phase 1 flow

1. Open `/admin/video-producer`.
2. Load a raw video source.
3. Review or paste the transcript.
4. Generate an edit plan.
5. Review cuts, overlays and production presets.
6. Compile the edit plan into the worker-safe render plan.
7. Approve before rendering.

The current browser workspace intentionally does not pretend to render a long-form podcast inside a Vercel request. Long media jobs belong in the existing renderer/worker pattern already used by Video Studio.

## Edit plan

`VideoProducerEditPlan` is source-time based. It describes:

- cut ranges
- graphic overlays
- music cues
- audio preset
- color preset
- intro/outro usage

`compileVideoProducerRenderPlan()` normalizes cuts, builds keep segments, calculates edited duration and maps graphic events from source time to output time.

If an overlay lands inside a removed interval, its `outputStart` becomes `null`. A renderer must not silently move it to an unrelated sentence.

## Default production presets

### `ag-voice-clean`

Target implementation in the render worker:

1. high-pass filter
2. corrective EQ
3. compression
4. de-essing
5. presence EQ
6. limiter
7. final loudness normalization

The worker owns exact FFmpeg filter values so every episode receives the same repeatable chain.

### `ag-studio`

Target implementation in the render worker:

1. known camera/log transform when available
2. restrained contrast curve
3. light saturation correction
4. highlight protection
5. final Rec.709 output

This should stay deterministic. AI rescue/enhancement can remain an opt-in path for damaged recordings later.

## Renderer boundary

The renderer receives `VideoProducerRenderPlan`, not free-form model output.

A production worker should:

1. validate the source asset
2. cut/concatenate `keepSegments`
3. process voice audio
4. apply the selected color preset
5. render branded graphics using the existing AG visual system
6. mix library music using explicit cue timings and gains
7. prepend/append the approved AG bumper assets
8. encode the final master
9. save output metadata and progress
10. return the project to review

## Next phases

### Transcript service

Generate word-level timestamps from the uploaded source and persist the transcript. The editing model should reference timestamped transcript segments rather than estimate times from paragraph position.

### Sol editorial pass

Use structured output to propose:

- false-start and repetition cuts
- pause tightening
- chapter beats
- Scripture/pathway graphics
- statement cards
- music moments
- CTA placement

Every returned plan is normalized and validated before it can reach the renderer.

### Clip Producer

Run the approved master/transcript through a second editorial pass to identify self-contained short-form moments, then create 9:16 render plans with captions, safe crop/reframe data and AG branding.

### Publishing

After explicit review, create the cover/thumbnail package, title, description and platform-specific copy, then hand approved assets to the existing content control/publishing workflow.

## Guardrails

- Never publish directly from model output.
- Never let an invalid timestamp silently delete media.
- Never overwrite Video Studio pathway projects.
- Never make long FFmpeg rendering depend on a browser staying open.
- Keep project source assets immutable. Render from edit decisions instead of destructively modifying uploads.
