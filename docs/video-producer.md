# Video Producer

One transcript-driven production pipeline for multiple brands. The existing admin editor is at `/admin/video-producer`; its Chromium scene editor is at `/admin/code-mode/video-v2`. This release extends them rather than introducing another editor or commercial video service.

**Working rule:** AI decides. Code edits. Humans approve and publish.

## Architecture and trust boundary

```text
Admin chooses a brand profile and uploads a private source
  -> Vercel Blob private multipart source
  -> GitHub Actions transcribe worker -> whisper-1 word timestamps
  -> Sol proposes an edit plan, validated by server code
  -> Optional source-linked mini episodes and 12–60 second Shorts
  -> Code Mode V2 saved scene document: theme, overlays, assets, words
  -> Human review, doctrine gate when required, SHA-256 approval fingerprint
  -> Immutable private render manifest
  -> GitHub repository_dispatch / trusted FFmpeg finishing worker
  -> Chromium compositor reads saved, validated scene state
  -> Private Blob review master and human review
  -> AG Publisher or confirmed personal YouTube scheduling
```

The browser is not needed after transcription/render dispatch. The source media is never modified or duplicated to make child episodes. Supabase holds service-role-managed project state; the durable private Vercel Blob path is stored, not an expiring signed URL. Workers receive expiring URLs and hashed, one-use callback tokens. **Do not send stored Blob pathnames or rendered URLs directly to untrusted assistant inputs.**

## Brand profiles

Profiles are **data** in `video_producer_brand_profiles`, managed via `/api/admin/video-producer/brand-profiles`. The project stores `brand_profile`. Every new project selects the active brand before upload; source-linked child projects inherit the parent's brand.

| Setting | Apostolic Guide | In the Now |
| --- | --- | --- |
| Slug | `apostolic-guide` | `in-the-now` |
| Brand colors | navy `#0E1E2D`, red `#B3212D`, warm `#FFF9F2` | red `#6A0000`, warm `#FFF9F2` |
| Fonts | Bebas Neue, Montserrat, Playfair Display | Poppins, Playfair Display, Bebas Neue |
| Mark | existing AG reversed wordmark PNG | In the Now wordmark text until a licensed logo asset is supplied |
| Pathway | required for Podcast | optional, never blocks a personal project |
| Doctrine gate | mandatory | optional, not a blocking approval step |
| Delivery | existing AG Publisher | YouTube handle **`@iamelicastaneda`** only |
| Master loudness | Podcast `-16 LUFS` | `-14 LUFS`, peak `-1.5 dBTP` |

The database, brand API, new project selector, and YouTube channel verifier reject any Cornerstone destination. Do not add Cornerstone to future profile seed data. Creating more series means inserting a validated profile, not branching the editor or compositor.

**Brand asset note:** The AG logo already exists under `public/brand`. The seed for In the Now currently provides a text wordmark. To use a specific personal logo image, add an approved PNG under `public/brand` and set `config.logo.assetPath`. No image is invented by the pipeline.

## Production lanes and source-linked episodes

- **Podcast:** 1920 × 1080, 30 fps H.264/AAC. Conservative cuts, approved chapters and overlays, optional branded intro and outro, captions usually disabled. Existing Sol guardrails prohibit removal of over 35% of original source time.
- **Reels and Shorts:** 1080 × 1920, 30 fps H.264/AAC, with transcript-based cut-aware word captions, animated overlays, and numeric vertical focus/motion. The 9:16 end item reads “Full episode on my channel.”
- **Split one recording:** `POST /api/admin/video-producer/split-episodes` creates up to 24 named podcast children and a 12–60 second matching Short for each. Specify source-relative `start`, `end`, optional `shortStart`, `shortEnd`. Source windows must be nonoverlapping. Each child is a separate draft needing a Sol editorial pass, review and approval. Existing Podcast to Reels candidate selection still works.

The source project page lists every generated episode and matching Short. Transcripts are sliced from the immutable root recording. No implicit approval or publishing occurs during splitting.

## Code Mode V2 and brand presets

The retained renderer is `src/code-mode/video-scenes.ts`, `video-scene-frame.ts`, `video-word-sync.ts`, and `scripts/render-video-code-mode.ts`. `src/code-mode/video-brand-overlays.ts` compiles typed overlays into the same Chromium frames.

A document contains:

- `tool: "video"`, `version: 2`, project ID, frame size, FPS, and registered asset IDs.
- `style`, one shared `themeCss`, one shared `templateHtml`, and editable `fields`: `series`, `episodeTitle`, `logo`, `lowerThird`, `boxText`, `quote`, `kicker`, `label`.
- `overlays` containing **`type`, `text`, `start`, `end`, `position`, `preset`**. Types: `intro`, `outro`, `logo`, `lowerThird`, `boxText`, `quote`, `captions`, `shortsEnd`. These are timed items, not executable document controls.
- `scenes` with HTML, CSS, and keyframes. Stored scene revision IDs power checkpoints, restore, and draft undo.

The default intro/outro distribute series and title with equal vertical spacing. Outro copy uses only the upper 75% of the frame for YouTube end-screen widgets. Persistent logos have a 5% top/right margin. Boxed highlights use `padding: .22em .35em`, optically adjusted white text and consistent line height. Lower thirds require a full sentence or attributed quote and ending punctuation, not an isolated word. Visual overflow measures Chromium bounds after fonts load and blocks invalid finishing renders rather than silently truncating text.

**Apply JSON** uses line-numbered syntax/schema errors. Apply is draft-only, uses a matching `expectedUpdatedAt`, preserves a checkpoint, and invalidates the previous approval. Export reads the saved state and its new approval fingerprint, never unsaved textarea edits. The preview iframe is restricted and HTML scripts, handlers, network resources, forms, and publishing controls are rejected. Brand fonts and the approved logo are converted into local inline data so the Linux Chromium renderer does not fetch live `/fonts` or `/brand` endpoints.

Named brand presets and revisions are stored in `video_producer_brand_presets` and `video_producer_brand_preset_revisions`. A preset is a design document, not a project, schedule, or publish action. Preset apply must preserve the target project ID and optimistic version.

## Audio and thumbnails

The FFmpeg finishing worker is `scripts/render_video_producer_finishing_worker.py`. Its filter order is source cleanup, optional `arnndn` noise reduction with mix amount `0..1`, then the existing de-esser, compressor, limiter, and output normalization. The RNNoise model is included under `models/video-producer` with its license.

`scripts/video_producer_audio_master.py` runs measured **two-pass** loudnorm after any music and bumpers have been combined, and copies the video bitstream. A brand-specific `brandAudioTarget` freezes integrated LUFS, true peak and LRA into the approved render manifest. A personal master targets `-14 LUFS` and `-1.5 dBTP`, while AG Podcast stays at `-16 LUFS`.

Thumbnail generation uses `scripts/video_producer_thumbnail_worker.py`. It samples only **actual camera frames** around transcript-derived candidate timestamps, evaluates face/eye/sharpness proxies when OpenCV is available, avoids synthetic facial replacements, lightly adjusts exposure and contrast, and overlays actual text. Both YouTube Test and Compare options **A** and **B** are 1280 × 720 JPEGs. The stored thumbnail output path stays private. These image-quality proxies cannot guarantee closed mouth, direct eye contact, or no hands near the face; final selection still needs human review.

## Human YouTube calendar

`/admin/video-producer/calendar` is the personal brand calendar. It lists approved or in-progress work and lets the editor create an alternating sequence: episode, Short, episode, Short, **one item per day**.

- Default schedule: **6:00 PM America/New_York**, including DST, editable per item.
- A schedule row is only a **draft**. No cron or assistant API submits it.
- Before submission the admin checks channel authorization, selected brand handle, completed private master, matching approval fingerprint, future publishing time, title/description, thumbnail A or B or privately uploaded 1280 × 720 custom image, and optional playlist ID.
- `POST /api/admin/video-producer/schedule/[id]/submit` requires a live signed-in administrator with `manage_distribution` and explicit JSON `{"confirm":true}`. It connects only to the OAuth account that owns `@iamelicastaneda` for the personal profile. The upload creates a **private** YouTube video carrying future `publishAt`; YouTube schedules the transition.
- After YouTube confirms the new video ID, the system records it before optional thumbnail or playlist calls. A failure there does **not** reupload the video; check YouTube Studio and repair the add-on manually.

Existing AG publishing continues through `/api/admin/video-producer/send-to-publisher`; a personal project cannot be sent to AG Publisher without a pathway.

**OAuth:** The prior upload-only scope remains, and the additional `https://www.googleapis.com/auth/youtube.force-ssl` scope is requested for playlist operations. Reauthorize the intended YouTube account after deploying the OAuth change. The app does not access other channel destinations. Review Google's OAuth app verification and quota requirements independently.

## Authenticated assistant API, draft only

A scoped token can be issued/revoked by a human administrator with `manage_integrations` via `/api/admin/video-producer/agent-tokens`. Its plaintext appears only once, a SHA-256 hash is stored in the service-only `video_producer_agent_tokens` table, and tokens expire or can be revoked.

The agent route `/api/admin/video-producer/agent` accepts bearer `vpa_...` credentials. The explicit scope names are:

- `draft:projects`: create a draft project under an approved profile.
- `draft:timeline`: save validated Code Mode JSON to the same project with optimistic locking and a checkpoint.
- `draft:assets`: authorize then confirm a private registered asset upload.
- `draft:preview`: request a short private Chromium preview of saved state.
- `draft:read`: read draft status and preview results.

The API cannot approve, modify a past-draft project, publish, schedule, create distribution credentials, or modify production secrets. A separate callback endpoint validates hashed one-use tokens for preview workers. A machine preview is never a finished review master.

## Worker health and recovery

The readiness panel on `/admin/video-producer` checks Supabase, private Blob, Sol key, GitHub repository access, dispatcher workflow, and the transcription key visible to the worker. **Secret values are never displayed.**

A GitHub **401** for worker token, dispatcher and transcription readiness usually means the runtime token `VIDEO_STUDIO_GITHUB_TOKEN` or encrypted `analytics.integration_secrets.video_studio_github_token` is invalid, expired or revoked. It **does not prove** the transcription API key is missing.

- For a fine-grained PAT, repository **Contents: write** is needed to call `repository_dispatch`; read permissions cover the repository/dispatcher probes. Secrets: read is needed only to enumerate Actions secret names. The independent GitHub Actions secret `VIDEO_PRODUCER_OPENAI_API_KEY` is required for `whisper-1`.
- The dispatcher must live on the repository default branch at `.github/workflows/video-producer-dispatch.yml`; workers check out only a strict allowlist of known refs with persisted Git credentials disabled.
- A **queued render** without a worker start for over 15 minutes fails with a GitHub dispatch/runner explanation. An active render without a progress heartbeat for over 3 minutes fails with the last reported stage. Its approval remains intact for a controlled retry. Transcription timeout remains conservative at two hours and invalidates the previous callback hash.

Only update credentials through normal GitHub/Vercel settings. **Never commit a token, print it in logs, or copy it into this documentation.** Runtime secrets were not changed by the feature branch.

## Database migrations in order

Apply to a staging database first, then production only after review:

1. `20261111190000_video_producer_brand_profiles.sql`: brand profiles, project mapping, named preset storage and calendar draft base.
2. `20261111191500_video_producer_thumbnail_variants.sql`: A/B thumbnail variant support.
3. `20261111192500_video_producer_episodes_from_source.sql`: episode-to-Short parent relationship.
4. `20261111193000_video_producer_noise_mix.sql`: optional RNNoise mix per project.
5. `20261111194500_video_producer_agent_api.sql`: restricted assistant tokens, private uploads and proof jobs.
6. `20261111210000_video_producer_schedule_safety.sql`: calendar state, channel/day uniqueness and custom image paths.
7. `20261111211500_video_producer_brand_preset_revisions.sql`: optimistic preset revisions/restore.

All new security-sensitive tables have RLS enabled and no direct anonymous or authenticated client access. Writes use service-role server APIs behind specific admin permissions or scoped machine tokens.

## Tests and release checks

Run locally or in GitHub Actions:

```sh
npm ci
npm test
npm run typecheck
npm run lint
python3 -m py_compile scripts/render_video_producer_finishing_worker.py scripts/video_producer_thumbnail_worker.py
python3 scripts/check_video_producer_audio_master.py
python3 scripts/check_video_producer_finishing.py
```

CI separately covers video Code Mode scene compilation, word alignment, intro and outro spacing, boxed type, text overflow bounds, A/B thumbnail dimensions, brand audio targets, AG versus personal pathway policies, rejection of Cornerstone, and draft-only agent permissions. GitHub Actions' worker smoke task actually generates media with Linux FFmpeg; the web workflow checks Node/React/TypeScript.

**Before merging:** confirm the latest branch CI is green, apply migrations in a staging environment, verify the correct worker token permissions and callback origin, upload a real talking-head source, approve and render one video for each brand, examine lip/face alignment and thumbnails, then test a **private future YouTube schedule** on the selected personal channel. A passing synthetic worker smoke does not substitute for those live credential and account checks.

## Operational boundaries

This implementation intentionally does not add Remotion, Shotstack, Creatomate, Runway, ElevenLabs, a second editor, generated faces, automated approval, or automated publication. In the Now's exact image logo is not bundled until a real approved file is provided. OAuth connection, actual GitHub 401 token repairs, production migrations and end-to-end external scheduling require environment owner action.

See also `docs/carousel-code-mode/README.md` for the design editor lineage and `docs/video-producer-deployment.md` for private Blob environment details.
