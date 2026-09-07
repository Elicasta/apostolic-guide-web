# Video Producer scene editor

The editing room lives at `/admin/video-producer/<projectId>/edit`.
The project dashboard opens recordings here. New uploads request a draft, then enter the editor.
Existing source, multicam, finishing, review, and delivery pages remain available.

## What the editor does

- Presents a dark preview, paper controls, crimson accents, and a horizontal scene strip.
- Groups timestamped transcript segments into stable scenes on the local source clock.
- Plays the source with cut ranges skipped; Original plays the uncut recording.
- Trims, removes, or restores a scene without moving the spoken material out of order.
- Preserves director cuts when trim handles move outward again and splits cuts at scene boundaries.
- Provides undo/redo (50 document snapshots), scene locks, text graphics, captions, punch-ins, voice presets, music selection/level/ducking.
- Searches/selects B-roll using the existing Visual Pass and permits an explicit stay-on-A-roll decision.
- Saves with `updated_at` compare-and-swap. A stale tab cannot replace newer project edits.
- Clears approval and selected music together with plan changes. Voice-only exports cannot fall back to an old music selection.
- Requires approval of the current revision before a render. Render dispatch claims the project atomically to reject a second simultaneous request.

## Preview contract

Cut preview is the original media with source cuts skipped. It does **not** simulate final graphics, multicam, B-roll, color, or audio mastering. The UI says so.
Render preview is the actual completed MP4. It is identified as current only when the latest completed render snapshot matches the project's approval fingerprint and the editor has no unsaved changes. Otherwise it is labeled previous render.
Child reels use local timestamps for decisions and add the parent source offset only for source playback. Timeline bars show transcript word density, not an invented audio waveform.
Private preview URLs refresh without replacing the playing source on every production poll.

## Background draft

`POST /api/admin/video-producer/draft` requires the existing `manage_content` permission. It stores a job under `director_metadata.draftJob` and starts one stage using Next `after`.
`GET /api/cron/video-producer`, protected by `CRON_SECRET`, advances one pending stage each minute. Jobs have a 10-minute lease, compare-and-swap claims, saved beat progress, and a six-hour timeout. Two kickoff requests reuse the active job.

Stages reuse the existing implementation through server-only operation modules:

1. Dispatch or wait for transcription.
2. Direct the content edit if no plan exists.
3. Plan visual beats if they have not been analyzed.
4. Search real footage one beat at a time; use the existing score threshold of 84 for provisional selections. Existing placements and active imports are reused.
5. Finish with the editable draft. The user reviews unresolved B-roll, then explicitly renders.

The score remains a provider/search ranking heuristic, not a new visual understanding model. No paid video generation or publishing is automatically invoked. Failed stages retain prior work and expose retry. Rendering still enforces Visual Pass readiness.

Operations cannot be called from the client directly. Public routes retain their permission checks. Internal calls receive their project/beat/candidate IDs from the claimed job and persisted project records. Provider credentials remain server-side.

## Deployment and validation

This change stacks on `feat/video-producer-visual-pass` (PR #102). Its existing migrations, worker workflows, private Blob connection, dedicated producer model key, and media providers must be available. This layer adds no schema migration.

Vercel cron runs in production. Preview jobs are excluded from the production queue by their saved environment. `Continue draft` advances a stage in a preview without a cron. Fully unattended processing must be verified on a deployment with the scheduled runner active.

Local verification:

- Repository test suite, including scene boundaries, trim reversal, cut/overlay output clocks, undo/redo, and malformed plan rejection.
- TypeScript typecheck.
- Next production build.

Still required before merge:

- Desktop and phone browser inspection, keyboard controls, playback, and save-conflict UI. The available browser could not reach the local server; an isolated preview transfer was rejected by automatic approval review for its size.
- Authenticated database integration checks for stale saves, duplicate job claims, and duplicate renders.
- One real uploaded recording through transcription, background draft, B-roll import, save, render, and download; verify the actual output and audio.

No live database changes, paid production calls, publication, or production merge were performed while building this PR.
