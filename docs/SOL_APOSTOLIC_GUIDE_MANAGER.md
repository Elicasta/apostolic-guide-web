# Sol · Apostolic Guide Manager

## Mission

Sol is not just an admin chatbot. Sol is the operating manager for Apostolic Guide.

Its job is to know what Apostolic Guide is supposed to contain, compare that desired state with what actually exists, stage missing work, surface blockers, protect doctrine and publishing gates, and keep people follow-up visible without inventing spiritual conclusions.

The canonical Scripture Pathway catalog remains the source of truth. Current production starts from the 20 live Pathways and their current source hashes.

## Manager loop

Sol should continuously reason through the same deterministic loop:

1. **Observe** current Pathways, assets, Creative Projects, publications, automations, people, journeys, failures, and KPIs.
2. **Compare** actual state with the desired state for every Pathway.
3. **Classify** each item as ready, missing, stale, blocked, staged, reviewable, published, or failed.
4. **Propose** the smallest evidence-backed jobs that close the gap.
5. **Execute** safe staging work through registered recipes.
6. **Stop** at doctrine, editorial, activation, relationship, or live-publishing boundaries.
7. **Verify** output hashes/state after execution instead of assuming success.
8. **Rescan** so completed work disappears from the queue and new gaps become visible.

This keeps AI in the planning/orchestration role while deterministic state, hashes, database records, and explicit execution recipes remain the authority.

## What Sol should be able to answer

Examples:

- How many Pathway audios are actually current?
- Which audios are missing, stale, or blocked by script approval?
- Make every audio that can safely be made right now.
- Which Pathways have approved audio but no YouTube project?
- Which YouTube videos are rendered but still waiting for publishing review?
- Which Pathways have no carousel Creative Project?
- What is ready to publish this week?
- What failed overnight?
- What changed in a Pathway that made downstream content stale?
- Which people are currently enrolled in journeys?
- Where is a specific person in a stored journey and what is the recorded next action?
- Which follow-up journeys exist but have no active automation?
- What are the five highest-value things I should approve today?

## Canonical source graph

Every derived content asset should eventually point back to a revision of a canonical source.

```text
Pathway
  ├─ narration source hash
  │   ├─ audio script hash
  │   │   └─ audio content hash
  │   │       └─ video project source hash
  │   │           └─ video render
  │   │               └─ publication
  │   └─ publishing kit
  ├─ Creative Projects
  │   ├─ carousel
  │   ├─ single post
  │   └─ story
  └─ campaign profile
      ├─ keyword
      ├─ automation
      └─ relationship journey
```

If an upstream source changes, Sol should mark downstream artifacts stale instead of counting them as complete.

## Content state model

A file existing is not enough.

Use explicit states:

- `missing`: desired artifact does not exist and prerequisites are ready.
- `blocked`: desired artifact does not exist but a prerequisite/review is unresolved.
- `stale`: artifact exists but no longer matches its canonical source or approved hash.
- `draft`: editable work exists.
- `ready`: all internal quality gates passed.
- `scheduled`: publication has a future slot.
- `publishing`: provider handoff is active.
- `published`: external publication is confirmed.
- `failed`: execution failed and needs recovery.
- `waiting_review`: Sol completed everything allowed and stopped at a human gate.

## Production recipes

### Pathway audio staging

Implemented in Manager V1.

1. Inspect canonical source, script, doctrine verdict, and audio hash.
2. Generate a current narration draft if needed.
3. Stop until the exact script is doctrine-passed and approved.
4. Generate/master audio only from that approved script.
5. Verify the stored audio hash.
6. Never publish externally.

The audio endpoint is idempotent by script hash so a repeated manager run can reuse current audio instead of paying for a duplicate generation.

### Audio to YouTube

Already registered.

Only starts from current, approved, doctrine-passed audio. It builds the video project, publishing kit, and render, then stops before publishing.

### Carousel / Creative Project staging

Next production recipe.

This must create or reuse persistent `studio_creative_projects`, not legacy loose `pathway_assets`.

Target flow:

1. Inspect Pathway + existing Creative Projects.
2. Decide whether the Pathway needs a carousel based on campaign/KPI policy.
3. Generate the deck inside a persistent Creative Project.
4. Run doctrine checks against the exact saved frames.
5. Save revision/checkpoint.
6. Move only passing work to `ready`.
7. Stop before scheduling/publishing unless a future publishing policy explicitly permits it.

### Short-form video

Target flow:

1. Reuse current Pathway/audio/video source when possible.
2. Generate short-form structure and visual plan.
3. Render vertical output.
4. Run content/doctrine/readability checks.
5. Save as a reviewable asset.
6. Stop before external publication.

## People Journey Manager

Sol can read people and stored journey progress in Manager V1.

The manager must separate **recorded relationship state** from **inferred spiritual state**.

Allowed evidence includes:

- person identity/handle/email already stored in CRM
- source/channel
- last activity
- tags
- recorded events
- journey enrollment
- current step position
- next action date
- completion state

Sol must not infer conversion, repentance, baptism, Holy Ghost reception, doctrine, motives, or pastoral condition from social comments or model interpretation alone.

Future relationship actions should be registered as explicit tools with approval policy for:

- enroll in journey
- pause/resume journey
- assign follow-up
- draft reply
- send reply
- tag/update status

Sending, enrolling, or changing relationship state should remain separately permissioned and fully audited.

## Site and data auditor

The manager should grow into one health scan that checks:

- canonical Pathway count and source changes
- broken or missing Pathway routes
- missing metadata/SEO fields
- stale narration/audio/video hashes
- Creative Projects with incomplete captions/frames
- ready content with no schedule
- failed publications
- orphaned publications/assets
- automations pointing to missing Pathways
- journeys pointing to missing/disabled automations
- people with failed/overdue journey actions
- KPI pace
- renderer/provider health
- recent failures and retries

Every finding should include evidence, severity, owner/recipe, and whether Sol can fix it safely.

## Autonomy model

Keep the current three modes.

### Watch

Read, count, audit, prioritize, and explain. No mutation.

### Assist

Prepare work. Mutation recipes require approval unless the current user command explicitly authorizes the narrow action under existing policy.

### Trusted

May execute only policy-allowlisted `safe_draft` recipes.

Trusted is not permission to publish or contact people. It is permission to remove repetitive internal staging work while preserving hard gates.

## Hard boundaries

Sol must not silently:

- publish live content
- activate social automations
- enroll people
- send outbound messages
- delete source media
- rewrite canonical Pathway doctrine
- approve its own theology/editorial gate
- count stale content as complete
- retry indefinitely
- create duplicate paid generations when a matching artifact already exists

## Manager V1 now in this branch

- Sol is explicitly instructed to operate as Apostolic Guide Manager.
- `get_content_inventory` gives exact per-Pathway and total production state for audio, video/YouTube, carousels, and automation linkage.
- Audio inventory distinguishes `ready`, `missing`, `stale`, and `blocked` using canonical source/script/audio hashes and approval/checker state.
- `get_people_journey_status` reads CRM people and stored journey progress without exposing private notes by default.
- Deterministic scans can propose `pathway_audio_stage` work for missing/stale audio.
- Trusted mode may run Pathway audio staging because it remains internal and still stops at script/doctrine approval.
- Audio execution verifies the saved asset after generation and reuses already-current audio.
- Existing YouTube and journey/automation recipes remain behind their current gates.

## Next build order

1. Finish persistent Carousel/Creative Project staging recipe.
2. Add short-form video staging.
3. Add one manager health/audit summary across website + Studio + CRM.
4. Add source dependency/revision records so all downstream stale detection uses one graph.
5. Add schedule/publishing planner with explicit live-publish approval.
6. Add relationship action tools with separate permissions and audit events.
7. Add scheduled Trusted self-scan and a morning manager brief.

The target outcome is simple: the owner should be able to ask Sol what is done, what is missing, what is blocked, what changed, who needs attention, and then tell Sol to stage everything it is safely allowed to stage.
