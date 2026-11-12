# Video Producer

Updated November 11, 2026. This document covers the existing Video Producer and Kinetic Video Code Mode pipeline, including the brand profile, split episode, thumbnail, release calendar, and draft assistant changes on `codex/video-producer-brand-episodes`.

## Principle

**AI decides. Code edits. Humans approve and submit.** Sol proposes cuts and metadata from a Whisper word-level transcript. The code validates decisions and turns approved, fingerprinted state into a private render manifest. FFmpeg and the existing Chromium Code Mode compositor create actual frames. An editing assistant cannot approve, schedule, or publish.

This is **one editor and one processing pipeline**. It does not depend on Remotion, Shotstack, Creatomate, Runway, ElevenLabs, generated faces, external hosted editing APIs, or a second editing interface.

## Entry points

| Screen | Path |
| --- | --- |
| Video Producer dashboard | `/admin/video-producer` |
| Create a Video Producer project | `/admin/video-producer/new` |
| Project source and finishing flow | `/admin/video-producer/[id]/source` and corresponding existing stages |
| Kinetic Video Code Mode | `/admin/code-mode/video-v2` |
| Brand restricted YouTube release calendar | `/admin/video-producer/calendar` |

The existing AG video studio/publishing routes remain available to the Apostolic Guide profile.

## Source, transcript, and approval

1. Choose a **brand profile** and production lane when creating the project. A personal podcast does not require a doctrine pathway.
2. Upload a camera file directly to a **private** Vercel Blob pathname. The client receives a narrowly scoped upload token. The server keeps the pathname rather than exposing the raw video publicly.
3. The existing GitHub Actions transcription worker runs `whisper-1` and returns transcript words and segments. Callback tokens are stored as hashes and compared securely.
4. Sol builds a deterministic JSON editorial plan from the transcript. It does not directly edit pixels or skip approval.
5. Change the edit plan, audio mix, brand graphics, or Code Mode scene document before approving. **Every changed input invalidates an old fingerprint**. `src/video-producer-production-server.ts` includes the original edit/media data, current brand settings, saved scene document, and per-project noise mix in the fingerprint.
6. The authenticated admin reviews and approves. Apostolic Guide podcasts require a pathway and the existing doctrine gate. In the Now has an optional doctrine pass and **no required pathway**.
7. The server creates a frozen manifest with private signed input/output URLs and an expected approval fingerprint. `.github/workflows/video-producer-dispatch.yml` launches the existing FFmpeg finishing worker.
8. `scripts/render_video_producer_finishing_worker.py` applies cuts, optional noise reduction, deesser and compression, grades, Chromium Code Mode overlays, package finishing, and post-mix loudness normalization, then saves a **private review master**.
9. A human separately sends AG material to AG Publisher or submits a verified personal-brand release to YouTube.

### Production dimensions

- Long episodes: 1920 × 1080, 30 FPS MP4.
- Shorts: 1080 × 1920, 30 FPS. The finishing worker samples genuine frames with OpenCV and places the presenter near the horizontal center before applying the existing motion cues. When no reliable face is detected, it uses the original center crop without inventing or modifying a face.
- YouTube thumbnails: exactly 1280 × 720 JPEG.
- Short end card: **“Full episode on my channel.”**

## Brand profiles

Profiles live in `public.video_producer_brand_profiles` and are validated through `src/video-producer-brand-profiles.ts`. Editors can create another allowed profile through the protected `GET/POST /api/admin/video-producer/brand-profiles` API. These are data rows rather than compositor-specific branches.

| Field | Apostolic Guide | In the Now |
| --- | --- | --- |
| Slug | `apostolic-guide` | `in-the-now` |
| Theme | Navy `#0E1E2D`, red `#B3212D`, warm `#FFF9F2` | Deep red `#6A0000`, warm light |
| Fonts | Bebas Neue, Montserrat, Playfair Display | Poppins, Playfair Display, Bebas Neue |
| Mark | AG assets/wordmark | “In the Now” text logo fallback until a real logo asset is registered |
| Intro/outro | AG branded cards | Own brand cards |
| Pathway | Required for AG podcasts | Not required |
| Doctrine approval | Required | Optional |
| Destination | AG Publisher | YouTube `@iamelicastaneda` only |
| Integrated target | −16 LUFS | −14 LUFS |
| True-peak ceiling | AG profile setting | −1.5 dBTP |

`isSelectableVideoProducerBrand()` excludes all Cornerstone-branded profiles and handles. The API and database also reject Cornerstone destinations. Existing AG project rows automatically default to the AG profile. **Do not present Cornerstone channels in a selector.**

If you want a real graphical In the Now logo rather than the text fallback, register an approved asset and assign its `assetPath` in the brand config. The compositor embeds it; it must not fetch `/brand` during worker export.

### Database changes

Apply these in migration order to staging, then production after reviewing the PR:

1. `20261111190000_video_producer_brand_profiles.sql`: brand profiles, reusable presets, schedules, project brand foreign key, RLS.
2. `20261111191500_video_producer_thumbnail_variants.sql`: A/B thumbnails while retaining legacy AG variants.
3. `20261111192500_video_producer_episodes_from_source.sql`: nested named mini episodes and paired Shorts.
4. `20261111193000_video_producer_noise_mix.sql`: per-project noise reduction mix.
5. `20261111194500_video_producer_agent_api.sql`: hashed draft assistant tokens, asset authorizations, and preview records.
6. `20261111210000_video_producer_schedule_safety.sql`: human-controlled release calendar fields, one active item per brand per day, immutable submitted state.
7. `20261111211500_video_producer_brand_preset_revisions.sql`: durable named preset versions and restore history.
8. `20261111213500_video_producer_schedule_worker.sql`: callback token hashes, progress, heartbeat and signed worker expiry.

All new tables enable RLS. The admin API uses service-role database access **only after permissions are checked**. Do not publish service-role credentials to browser or agent clients.

## Kinetic Video Code Mode

Use the existing `/admin/code-mode/video-v2` editor, not a second editor. The project scene lives in `director_metadata.kineticSceneV2`. The UI offers Code, Fields, assets, JSON Apply, validation, local undo, server checkpoints, saved preset selection, and preview.

### Shared scene document

`src/code-mode/video-scenes.ts` defines the schema. A saved document can add:

```json
{
  "templateHtml": "<div class=\"vp-template\">{{kicker}} {{boxText}} {{label}}</div>",
  "themeCss": ".vp-template { gap: 1.2em; }",
  "fields": {
    "series": "In the Now",
    "episodeTitle": "Why Did Jesus Pray?",
    "logo": "In the Now",
    "lowerThird": "Prayer reveals true dependence.",
    "boxText": "God was manifest in the flesh.",
    "quote": "A verified sentence from the recording.",
    "kicker": "Episode 1",
    "label": "The question"
  },
  "overlays": [
    {
      "type": "lowerThird",
      "text": "Prayer reveals true dependence.",
      "start": 20.5,
      "end": 25.5,
      "position": "lower-left",
      "preset": "brand-lowerThird"
    }
  ]
}
```

The document also retains its required `tool`, `version`, `kind`, `id`, `format`, `assets`, `style`, `scenes`, and optional revision guard. All placeholders in the request are supported: `{{series}}`, `{{episodeTitle}}`, `{{logo}}`, `{{lowerThird}}`, `{{boxText}}`, `{{quote}}`, `{{kicker}}`, and `{{label}}`.

All overlays are timed items. Allowed types include `intro`, `outro`, `logo`, `lowerThird`, `boxText`, `quote`, `captions`, and `shortsEnd`. The renderer directly reads `start`, `end`, `text`, `position`, and `preset`. Lower thirds must contain a full sentence or real quotation with punctuation, not a single word.

Burned FFmpeg captions take their font, fill and word highlight colors from the selected profile. Personal captions use Poppins and the In the Now red, and the legacy AG logo bug is never inserted into personal output. AG captions keep their existing palette. This is applied to the compiled ASS render, not only the browser preview.

Default intro/outro cards distribute series and title evenly. The outro copy occupies at most the upper 75% of the frame, leaving YouTube's lower 25% available for end screens. Logo bugs have a safe corner margin. Red box highlights use optical padding near 0.35em at the sides and 0.22em top/bottom. Word-sync timing uses the existing transcript-to-kept-segment mapping, not arbitrary text changes.

### Previews, font embedding, and safety

The frame source `src/code-mode/video-scene-frame.ts` is shared by the preview and `scripts/render-video-code-mode.ts`. The CSS compiler embeds the registered logo, local Poppins font files, and other local fonts as base64 so headless Chromium does not fetch `/fonts` or `/brand`. No scripts, handlers, external-resource CSS, form elements, publish buttons, or arbitrary asset URLs are allowed inside overlay template documents.

The sandbox reports **actual measured browser overflow** using `src/code-mode/video-scene-overflow.ts`. Final compositing checks text geometry again and rejects frames with clipped cards or lower thirds, rather than silently proceeding.

An Apply operation is draft-only and uses `expectedUpdatedAt` for optimistic locking. It stores a checkpoint **before** changing project state and revokes existing approval. Rendering reads only saved state. Merely editing a local field or preview never changes a production render.

### Reusable brand presets

`public.video_producer_brand_presets` stores a named, per-brand scene document. `/api/admin/video-producer/brand-presets` lists, creates, updates, and restores presets. `public.video_producer_brand_preset_revisions` stores the previous document on each update, permitting a restore to an earlier version.

In Code Mode, save a new series preset, select an older preset or revision, load into the current sandbox, inspect timing against the current source duration, then **Apply JSON** to the draft. Loading a preset is not approval.

## Mini episodes and Shorts

From a source project that has finished transcription, use the **Episodes and Shorts from this source** panel:

- Add named episode ranges (`start`, `end`) that do not overlap and stay within the original recording.
- Give each a matching 12 to 60 second Short range contained inside the parent episode.
- Submit the split once. The server creates a podcast child and a matching reels grandchild per section, with its own transcript slice at editorial time, retained brand/pathway settings, and an independent approval/render lifecycle.
- Inspect all related drafts from the source project page and open each independently.

The media path and transcript stay linked to the same immutable root source; there is no duplicate camera upload. `app/api/admin/video-producer/split-episodes/route.ts` implements the validation and child creation.

## Audio processing

The profile target overrides legacy audio presets:

- In the Now: `I=-14`, `TP=-1.5`, `LRA=7`.
- Apostolic Guide: `I=-16`, target peak defined by the AG profile.

Optional per-project RNNoise runs in the existing FFmpeg audio filter chain **before** deesser and compressor. Set the slider from 0 to 100%. A 0 mix disables the `arnndn` filter. The repo bundles the original licensed `models/video-producer/std.rnnn` model for the worker; an approved local model path can override it via `VIDEO_PRODUCER_RNNOISE_MODEL`, but no production secret is needed or changed by this branch. Loudness normalization occurs after voice, music, and bumper mix, and reports an error if out of tolerance. Turning noise reduction up cannot bypass a new fingerprint review.

## Real-frame YouTube thumbnails

The thumbnail director produces two materially different headlines, **A** and **B**, with honest copy derived from the transcript. The Python worker probes real frames near the suggested timestamp and scores sharpness, frontal-face presence, apparent open eyes and gaze direction, central position, inner-mouth darkness, and possible raised hands. These are heuristics, not an infallible facial-expression detector.

Only extracted camera frames are used; the worker applies restrained color/contrast and local font/text overlays. It verifies each candidate is exactly **1280 × 720**. The personal calendar also lets a human upload a separate PNG, JPEG, or WebP thumbnail, which is privately stored after fitting to the YouTube dimensions.

## YouTube scheduling and calendar

The **In the Now** calendar is `/admin/video-producer/calendar`. It provides:

- A verified destination channel picker limited to `@iamelicastaneda` for personal projects. The API checks the actual OAuth-linked channel ID, not just a typed handle.
- One release per calendar day, alternating available episodes and Shorts.
- Default **6:00 PM America/New_York**, configurable per day. Time conversion accounts for daylight saving time and rejects nonexistent wall-clock times.
- Editable title, description, thumbnail A/B or custom image, playlist ID, and local release date/time.
- A separate **human confirmation** for each send to YouTube; no scheduler cron ever initiates an upload.
- A stored YouTube video ID when accepted, which prevents blind duplicate retry if a later playlist or thumbnail step fails. A progress stage and percent are shown while the GitHub worker streams the review master.

YouTube OAuth uses the existing upload authorization plus the scope required for playlist work. If the scope changed, the human account owner must reconnect YouTube in Admin Setup. The AG profile still uses its separate AG Publisher destination. Do not select or add a Cornerstone destination.

**Streaming release worker:** Human confirmation calls the authenticated submit endpoint, which checks the approved render fingerprint and the exact OAuth-linked brand channel, then dispatches `video-producer-youtube-schedule` through GitHub Actions. The Python worker streams 8 MB private Blob chunks to a resumable YouTube session, refreshes short-lived Google tokens through a hashed callback broker, records the confirmed YouTube video ID before thumbnail/playlist work, and reports progress. The Vercel function does not upload the video bytes. Never resubmit an unknown YouTube outcome before inspecting YouTube Studio.

## Draft-only agent API

The authenticated agent endpoints are deliberately separate from human actions.

| Route | Authorization | Allowed use |
| --- | --- | --- |
| `/api/admin/video-producer/agent-tokens` | Human `manage_integrations` | Issue one-time, scoped, expiring tokens; list/revoke them |
| `GET /api/admin/video-producer/agent?projectId=...` | `draft:read` | Read own project draft and private proof status |
| `POST /api/admin/video-producer/agent` `createProject` | `draft:projects` | Create own draft |
| `applyTimeline` | `draft:timeline` | Apply validated saved JSON with revision and checkpoint |
| `authorizeAsset` / `commitAsset` | `draft:assets` | Issue a private Blob upload and register approved image UUID |
| `requestPreview` | `draft:preview` | Queue a ten second Chromium proof from saved state |
| `/api/admin/video-producer/agent/preview-callback` | Hashed, expiring worker callback token | Report proof progress and completion |

Only active unapproved draft projects are mutable by an agent. All agent tokens are SHA-256 hashed at rest, owner-scoped, explicitly scoped, expiring within 30 days, and revocable. A token is displayed only once when created. Agent actions are audited. Agents **cannot approve, schedule, publish, delete a published item, or call human release endpoints**. The Chromium proof reuses `scripts/render-video-code-mode.ts` and private signed Blob URLs; it creates no upload to YouTube.

## Worker and GitHub health diagnostics

Two separate things must be configured:

1. **GitHub API dispatch token**: Vercel `VIDEO_STUDIO_GITHUB_TOKEN` or the encrypted `analytics.integration_secrets.video_studio_github_token`. Ensure repository access including Metadata read and **Contents write** for `POST /repos/{owner}/{repo}/dispatches`. Fine-grained PAT access must match the target repo. If inspecting Actions secrets, the optional diagnostic needs **Secrets read**; this is distinct from permission to dispatch.
2. **Transcription secret on GitHub Actions**: `VIDEO_PRODUCER_OPENAI_API_KEY`, for the asynchronous `whisper-1` transcription job. Its absence is not equivalent to a GitHub API 401.

A GitHub **401** is an invalid/revoked/expired dispatch credential, not proof of a missing dispatcher workflow. A **403** indicates permissions or policy restrictions. A **404** may indicate an unavailable repository or default-branch workflow. The readiness panel identifies the credential and relevant permission without printing the token.

GitHub `repository_dispatch` workflows must exist on the default branch to receive events. The existing dispatcher uses least-privilege Actions checkout, disallows untrusted worker refs, and recognizes the trusted feature branch during staging. `VIDEO_PRODUCER_WORKER_REF` can select a reviewed staging ref. Never promote unreviewed branches or change production secrets as part of this PR.

### Stalled jobs

Queued jobs wait up to 15 minutes for Actions runner startup. Actively rendering jobs that stop reporting a heartbeat for over 3 minutes are failed with the latest stage and a readable action to inspect the relevant GitHub Actions run. Source media and approved work are preserved. A human may retry a failed render after repairing the worker. Status changes and callback hash checks prevent accepting a stale worker as a successful new job.

## Copy standards

All generated default titles, descriptions, cards, and thumbnail headlines must use complete punctuation and no hyphens or dashes. Questions must carry question marks. Lower thirds must be actual sentences or verified quotations, never a single word. The editor validates lower thirds and blocks script or publish UI inside template HTML.

## Verification

Run the existing CI workflows on the feature branch before merging:

```bash
npm ci
npm test
npm run lint
npx tsc --noEmit
python3 scripts/check_video_producer_finishing.py
python3 scripts/check_video_producer_audio_master.py
```

Related tests include `tests/video-producer-brand-profiles.test.ts`, `tests/video-brand-scenes.test.ts`, `tests/video-scene-overflow.test.ts`, `tests/video-producer-job-state.test.ts`, `tests/video-producer-github-health.test.ts`, `tests/video-producer-agent-policy.test.ts`, and `tests/video-producer-schedule.test.ts`. Worker smoke tests exercise the real FFmpeg pipeline, 1280 × 720 A/B thumbnails, and audio targets. A green code test does not prove production credentials work; verify the admin readiness panel and run a private source recording in staging.

### Rollout checklist

1. Review the PR, policies, schema and database migrations. Apply migrations to **staging**.
2. Verify AG existing projects still load, the personal profile needs no pathway, and Cornerstone never appears as a choice.
3. Inspect Code Mode presets, HTML validation, replay/undo, overflow errors, saved-state preview, and the approval fingerprint.
4. Make a small private personal source recording and generate one mini episode, one matching Short and A/B thumbnails. Confirm render length, audio loudness and private output storage.
5. Check GitHub readiness 401/403 issues. Rotate the worker token separately **only with authorized infrastructure access**, outside the feature implementation.
6. Reauthorize the correct YouTube channel if OAuth scopes changed. Submit one reviewed test video manually, verify ID, thumbnail, playlist and release time.
7. Merge only when the required checks and staging gates pass. Do not force push or change production secrets in this branch.
