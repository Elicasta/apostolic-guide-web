# AG Studio Architecture

AG Studio is the production operating system for Apostolic Guide media. It plans episodes from existing Apostolic Guide content, runs solo and guest productions, accepts live audience questions and polls, and emits a clean program feed for OBS.

## Product boundary

AG Studio owns episode planning, pathway-linked assets, run of show, cue execution, scenes, graphics, live audience interaction, program state, production logs, and browser output.

OBS owns encoding, local recording, RTMP, YouTube delivery, audio monitoring, and backup recording.

Apostolic Guide remains the source of truth for pathways, Scripture content, user identity, and membership status.

## System hierarchy

```text
Apostolic Guide content
  -> Content graph
  -> Episode intelligence
  -> Episode
  -> Assets
  -> Run of show
  -> Cues
  -> Program state
  -> Output renderer
  -> OBS
  -> Recording / YouTube

Audience
  -> AG account identity
  -> Questions / votes / polls
  -> Studio audience queue
  -> Content intelligence feedback
```

## First-class modules

### 1. Episode system

Episode types: `solo`, `interview`, `panel`, `live_qa`.

Access modes:

- `public`: anyone may watch.
- `account`: an Apostolic Guide account is required for participation.
- `members`: restricted to an explicitly entitled AG membership group. Membership is not assumed to mean paid.
- `private`: invite-only production/session.

Payment is not part of the core identity model. Paid access can be added later by granting the same entitlement keys from a billing system.

### 2. Pathway asset system

Episodes reference canonical pathway IDs from the existing `pathway-catalog`. When a Scripture or pathway item is added to an episode, Studio stores both the canonical source reference and a production snapshot. Old episodes therefore remain historically stable while new episodes can use current pathway data.

### 3. Run of show

A cue represents a production moment, not necessarily a full scene change. Each cue can execute one or more explicit actions.

Supported action families include scene changes, overlay show/hide, media playback, Scripture loading, question loading, poll control, lower thirds, markers, timers, notes, and waits.

Production state must never use toggle semantics. `show`, `hide`, `start`, and `stop` are explicit and idempotent.

### 4. Program state engine

One authoritative session state drives every controller and renderer. Each mutation increments a monotonically increasing version. Clients ignore stale state versions.

Every live action has an idempotency key so a double tap or retry cannot execute the same cue twice.

### 5. Output renderer

`/output/[sessionId]` is a deterministic read-only renderer for OBS. It contains no producer controls and no private notes. The renderer must recover current state after refresh and use safe fallbacks for missing media.

### 6. Episode intelligence

The intelligence layer organizes production around the real Apostolic Guide content graph. It does not generate generic Christian content ideas.

Inputs:

- canonical pathways and steps
- Scripture relationships
- objections and related questions
- existing episode/pathway mappings
- live submitted questions
- question votes
- poll results
- content publish history
- later: YouTube/site analytics

Outputs:

- pathway coverage map
- content gaps
- recommended next episodes
- suggested series
- related pathway clusters
- draft run-of-show proposals
- recurring audience question clusters

AI produces drafts and recommendations only. It never silently changes canonical doctrine, publishes content, answers on behalf of the host, or pushes graphics live.

### 7. AG Live audience layer

Viewer route: `/live/[episode]`.

A viewer may watch according to the episode access mode. An AG account is required for question submission, question voting, and polls unless a future session explicitly enables guest participation.

Question lifecycle:

`submitted -> approved -> queued -> live -> answered`

Questions may also be dismissed. Anonymous means anonymous to the public presentation, not anonymous to the moderation system.

Poll lifecycle:

`draft -> scheduled -> open -> closed -> archived`

Poll results are not automatically exposed to viewers. The producer decides when results appear.

### 8. Membership and entitlements

Use the existing Apostolic Guide identity system. Do not create a second user database for Studio.

Access is evaluated through entitlements rather than hard-coded payment tiers.

Example entitlement keys:

- `live.questions`
- `live.polls`
- `live.replay`
- `live.members_session`
- `studio.access`
- `studio.host`

This allows free members, invited ministry teams, future paid members, or other groups to receive access without rewriting Studio authorization.

## Routes

```text
/studio
/studio/episodes/new
/studio/episodes/[episodeId]
/studio/episodes/[episodeId]/prepare
/studio/episodes/[episodeId]/live
/studio/intelligence
/live/[episode]
/guest/[inviteToken]
/output/[sessionId]
```

## Persistence tables

Studio tables should use the `studio_` prefix so the feature is isolated from the main application schema.

```text
studio_episodes
studio_episode_pathways
studio_assets
studio_runs
studio_cues
studio_cue_actions
studio_scene_definitions
studio_graphic_presets
studio_media_assets
studio_people
studio_episode_guests
studio_guest_invites
studio_sessions
studio_session_state
studio_participants
studio_production_events
studio_clip_markers
studio_messages
studio_episode_recommendations
studio_content_coverage
studio_question_clusters
live_events
live_questions
live_question_votes
live_polls
live_poll_options
live_poll_responses
content_relationships
user_entitlements
```

## Core engineering rules

1. One authoritative session state.
2. No live toggle commands.
3. Renderer contains no producer logic.
4. Guests never decide when they are on program.
5. OBS remains independent of Studio state.
6. A missing asset cannot crash output.
7. Refresh cannot reset a show.
8. Every live mutation is idempotent.
9. Every media cue defines a safe fallback.
10. Pathway assets keep both source references and snapshots.
11. Public audience text never goes directly to program output without moderation/producer approval.
12. Solo production remains first-class after guest support ships.

## Build passes

### Pass 1: Solo production foundation

- Studio dashboard
- episode creation
- real pathway catalog selection
- asset drawer
- run-of-show editing
- cue/action model
- host camera and microphone preflight
- scenes and overlays
- program state
- clean output route
- clip markers and event log
- refresh recovery

### Pass 2: Episode intelligence

- coverage map
- recommendations
- series builder
- question clustering
- episode draft builder

### Pass 3: AG Live

- account identity integration
- audience questions
- question voting
- polls
- moderation
- members/private access rules
- questions/polls as Studio assets and cues

### Pass 4: Remote guests

- guest invitations
- preflight
- green room
- WebRTC provider integration
- host preview
- guest live states
- reconnection fallback

### Pass 5: Producer polish

- preview/program mode
- talkback
- producer chat
- mobile controller
- stronger timers and panic controls

### Pass 6: Media intelligence and post-production

- ISO recording if justified
- clip workflow
- analytics feedback
- stronger opportunity scoring
- publishing handoff

## Pass 1 definition of done

Pass 1 is finished when a real solo episode can be created from a real pathway, run cue-by-cue through Studio, rendered in a clean browser output at 1920x1080, recorded in OBS, refreshed mid-session without losing state, and archived with its production log and markers.
