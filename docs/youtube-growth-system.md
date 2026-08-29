# YouTube Growth System

Episode Studio now treats YouTube growth as one production contract instead of a title step added after editing.

## Workflow

`Idea → Package → Script → Audio → Video → Publish → Learn`

### Package

Before script generation, Sol builds and stores one `growth_plan` on the episode row. The plan contains the viewer tension and promise, title candidates, thumbnail concepts, click reason, 0–30 second hook, first-minute beats, open loops, pattern interrupts, B-roll and graphics opportunities, Shorts candidates, and publishing direction.

The title and thumbnail complement each other instead of repeating the same line. Curiosity, contrast, conflict, controversy, confusion, or clarity are allowed only when the episode can truthfully resolve the information gap.

The growth plan stores a `sourceFingerprint` derived from the working title, premise, Pathways, format, and speakers. If one of those inputs changes, the UI and APIs treat the package as stale and require a rebuild before script generation, approval, or Video Producer handoff. Changing only the selected title or thumbnail does not change the content strategy and does not invalidate an approved script.

### Script

Script generation receives the selected package as a delivery contract. The opening must establish the planned tension, the body must close its open loops, and the ending must deliver the promised payoff. The theology checker also checks for a material title/thumbnail bait-and-switch before approval can pass.

### Video Producer

The existing project handoff keeps one source of truth. `director_metadata` receives the complete `episodeGrowthPlan` plus a flattened `youtubePackage` containing the selected title and thumbnail. Re-opening an already exported Episode Studio project refreshes this metadata instead of leaving a stale package attached.

The downstream editor can use the same plan for camera emphasis, B-roll, graphics, visual resets, and Shorts extraction.

### Learn

Episode Studio accepts post-publish YouTube performance snapshots and stores them in `growth_metrics`. The same endpoint can be populated manually today and by YouTube Analytics later.

The learner does not declare a generic YouTube benchmark. It first needs at least three other published episode snapshots in the same episode format to build an Apostolic Guide baseline. Once a baseline exists, it compares package click-through and retention signals to the channel's own history and proposes one next experiment.

Confidence is based on the current episode sample size:

- low: below 5,000 impressions or 500 views
- medium: at least 5,000 impressions and 500 views
- high: at least 20,000 impressions and 2,000 views

A single result is not promoted into a permanent channel rule. A strong result should be repeated on a comparable topic before Sol treats the pattern as learned behavior.

## Storage

`video_producer_episode_scripts` remains the episode source of truth. Growth data lives on the same row:

- `growth_plan jsonb`
- `growth_metrics jsonb`
- `growth_learning jsonb`

No parallel episode or package table is created.

## Guardrails

- Packaging cannot introduce theology unsupported by the selected Pathways.
- The thumbnail cannot promise proof the script does not deliver.
- Camera changes are editorial punctuation, not random retention cuts.
- B-roll and graphics are separate visual layers.
- Post-publish learning is baseline-relative and sample-size-aware.
- Existing theology approval and audio-before-video gates remain in place.
