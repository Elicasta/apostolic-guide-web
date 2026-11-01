# Forge Production Agent

Forge is the production specialist inside Sol, the Apostolic Guide manager.

Forge is not a chatbot persona and it is not a second Studio. It is a deterministic production worker that reads canonical Apostolic Guide state, identifies missing work, executes server-registered production recipes, records durable run state, and stops at explicit human or external-effect gates.

## Outcomes Forge owns

### Pathway audio

Forge can move a Pathway from missing/stale audio to a verified current audio asset:

1. Read the current canonical Pathway.
2. Compare the Pathway source hash, narration hash, doctrine-check hash, and stored audio hash.
3. Reuse current work when hashes match.
4. Generate narration when the current Pathway has no current narration.
5. Run the existing narration doctrine checker.
6. Never approve its own narration.
7. Stop at human script approval when approval is missing.
8. Automatically resume the same durable run after approval is detected.
9. Generate chunked TTS from the exact approved narration.
10. Master and store a lossless WAV asset.
11. Verify the stored audio hash against the approved narration before counting the work complete.

If an exact current audio asset already exists, Forge reuses it. It does not incur another TTS generation charge.

### Persistent carousels

Forge can move a Pathway from no carousel to an editable project plus rendered review assets:

1. Read the current canonical Pathway.
2. Confirm there is no existing non-archived persistent carousel for that Pathway.
3. Generate complete slide copy, captions, CTA, alt text, and Pathway links.
4. Run a second doctrine/source review against the canonical Pathway.
5. Save the work in `studio_creative_projects` with source-hash and doctrine-review evidence.
6. Render the current Creative Project frames server-side at 1080×1350.
7. Store PNGs in Vercel Blob and register them in the existing `studio_pathway_assets` DAM.
8. Link each PNG back to its frame through `studio_creative_project_assets`.
9. Reuse current state-version renders instead of regenerating them.
10. Stop before scheduling or live publishing.

The renderer uses the existing AG navy/red/paper visual direction and role-specific layouts for hooks, Scripture slides, teaching slides, statements, and CTAs. Render evidence is written back to the current Forge review run.

The retired `carousel_topic_pack` recipe remains readable only so historical runs do not break. New scans must not create it.

### YouTube handoff

Forge identifies when current approved audio can move into the existing YouTube production recipe. The YouTube recipe remains review-required because it creates finished external-facing media and a publishing handoff.

## Production queue

Forge produces one safe-draft proposal per Pathway for audio and carousel work. This is intentional.

One Pathway per proposal gives the system:

- exact ownership
- exact retry state
- exact review state
- exact cost attribution
- correct `maxConcurrentRuns` behavior
- no grouped failure where one Pathway hides another

Queue priority is deterministic. Active/planning campaign work moves ahead of lower-priority work. Existing queued, running, retrying, or waiting-review recipes suppress duplicate work.

## Modes

### Watch

Forge reads and diagnoses. Nothing mutates.

### Assist

Forge can prepare proposals, but mutation tools stop for approval.

### Trusted

Forge may automatically execute only recipes that are both:

- classified `safe_draft`
- explicitly allowlisted by server policy

Current Forge Trusted recipes:

- `pathway_audio_stage`
- `forge_carousel_stage`

Existing disabled journey/automation drafts are also allowed by Sol policy but are owned by the relationship lane, not Forge.

`audio_to_youtube` is not Trusted-auto-runnable.

## Hard boundaries

Forge cannot:

- approve narration on its own
- bypass a doctrine verdict
- edit canonical Pathway doctrine
- schedule content
- publish live content
- activate automations
- enroll people
- send outbound messages
- claim work is complete without stored evidence

## Durable execution

Forge work is stored in the existing Sol proposal/run/event ledgers.

Background-safe Forge recipes can recover without a browser session. The minute runner:

- detects approved audio scripts that satisfy a waiting review gate
- resumes that same run instead of creating a replacement
- drains new Forge carousel render work without letting old completed drafts starve newer projects
- detects stale worker leases
- requeues transient failures with bounded backoff
- executes due background-safe work

The worker lease is intentionally long enough for multi-segment audio generation.

## Storage

Pathway audio retains MP3 compatibility and permits mastered WAV assets. Generated audio is stored in the existing `pathway-audio` bucket.

Forge carousels use the current persistent Creative Project tables and the existing DAM/rendered-asset links. PNG files are stored through Vercel Blob. Forge must not write new carousel production into retired loose `pathway_assets` rows.

## Sol integration

Sol receives Forge's current queue and execution state during each reasoning loop. Forge is also exposed through `get_forge_status`, and workspace status includes Forge production evidence.

When the user asks questions such as:

- “How many audios are done?”
- “What needs to be made?”
- “Take care of the audios.”
- “Handle production.”

Sol should inspect current Studio/Forge state, prefer existing work over duplicates, scan when necessary, execute registered Forge proposals when policy permits, and report the actual gate or result.

## Current-work hygiene

The Sol operator feed is not a history page. It shows only queued, running, retrying, waiting-review, failed, and stalled work.

Completed and cancelled runs remain in the durable ledger but stay out of the operator feed. Scans collapse duplicate waiting-review work by recipe + Pathway. Explicit commands such as `clear those old review jobs` may cancel abandoned review rows.

## Definition of done

A Forge task is done only when current persisted state proves it.

For audio, that means canonical source, approved narration, doctrine verdict, and audio hash all align.

For a carousel, that means a persistent Creative Project exists with current source evidence and doctrine review, and the current project state has linked 1080×1350 rendered PNG assets ready for human review. Scheduling and publishing remain separate stages.
