# Apostolic Guide: Unified Reconciliation Ledger

Status: **NOT READY — remotely accessible work is stabilized; do not merge**
Inventory refreshed: 2026-10-07
Stabilization pass: 2026-10-07 on `integration/ag-unified-20261006`
Repository: `Elicasta/apostolic-guide-web`
Integration branch: `integration/ag-unified-20261006`
Baseline `main`: `9b995dd065ea737e81345b3904da1a48d1ae7af4` (PR #110 already merged; those files are unchanged on this branch)
Remote heads inspected: **135** (includes `main`)
Open PRs: **12**

## Result

The accessible, in-scope feature work is on this branch. The stabilization pass cleared lint regressions on the integrated files, re-checked the 83 leftover heads, and marked Motion Engine PR #74 **SEPARATE_SCOPE**. **Do not merge to `main`.** Consolidation is not complete while the three local-only Sol commits are unreachable and Studio login / production database end-to-end checks have not been run. No further remote branch was merged in this pass.

Migrations are **in the tree only**. Nothing in this pass applied them, enabled the video cron, scheduled a publish, sent email, changed billing, or deployed production.

## Integrated sources

Proof for each merged PR: the source tip is an ancestor of this branch (`git merge-base --is-ancestor`), except #113, whose two files match the source tree exactly. Overlapping files (`package.json`, `.env.example`, `vercel.json`, and Visual Pass files later edited by the scene editor) differ from the earlier tip because a later in-order merge updated them. That is the stack, not a dropped feature.

| Source | Base / head | Proof | Disposition | Integration commit | Risk / next owner action |
| --- | --- | --- | --- | --- | --- |
| #113 shared agent contract | `docs/shared-agent-contract-20261006` @ `83846c4f9210fd377d2438469432a1d5f29fcc09` | `git diff` of `AGENTS.md` and `.github/pull_request_template.md` against that tip is empty | INTEGRATED | `19c1a2432596e8cfea272775f18c3424d8c39d34` | None. Leave the source PR open until the owner merges #115. |
| #112 editorial drafts and inline KJV | `feat/editorial-content-engine` @ `7ac807dea383a215d372a58b8f422b3bc8fc650a` | Tip is an ancestor. 32 paths. `package.json` also contains the Visual Pass `test:media` script and `@electric-sql/pglite` | INTEGRATED | `88647dcd8f62125058ede2a3354f73b102144086` | SQL file `supabase/migrations/20261006193000_editorial_content_engine.sql` is not applied. Cron `/api/cron/editorial` is registered in `vercel.json` at `23 11 * * *` and returns skipped unless `studio_editorial_settings.enabled` is true (default false). Do not enable it or apply the migration on production from this pass. |
| #102 Visual Pass | `feat/video-producer-visual-pass` @ `52fc1f80044c66527330bb2297eb3c5b4b89265a` | Tip is an ancestor. Scene editor commits sit on top of this tip | INTEGRATED | `9d9a3f20c8ada9bc2e2f599b1c06fe38da4a6599` | SQL files `202609020001_video_producer_visual_pass.sql` and `202609020002_video_producer_visual_import_jobs.sql` are not applied. |
| #103 scene editor | `feat/video-producer-scene-editor` @ `c2287594a65bf05cd507a7f31f502bfccf308a38` | Tip is an ancestor and contains the #102 tip. Merged only after #102 | INTEGRATED | `cba3eceb28bbe7f102a3f4cb2c05ed8cbac3f76f` | `app/api/cron/video-producer/route.ts` exists and is **not** listed in `vercel.json` crons, so the draft advancer is not scheduled. Authenticated Studio E2E was not run. |
| #111 Sol security / Stop Sol, remote only | `fix/sol-pr1a-security-stop-20261006` @ `372b5362402a00c380883cb525f1ea1c94b8afa6` | Tip is an ancestor. 23 commits, 13 paths | INTEGRATED (remote head only) | `6c8b44759188ac4b22adfca83c5a7344d1886b3f` | SQL file `supabase/migrations/20261006180000_sol_pr1a_guardrails.sql` is not applied. `SOL_KILL_SWITCH=false` is documented in `.env.example` only. Local follow-ups below are still missing. |
| #104 Pathway reader analytics | `feat/pathway-reader-funnel-20261002` @ `fb20151a2d0fd2edb6121a2ceb8a1642c5808452` | Tip is an ancestor. 10 paths, no schema migration | INTEGRATED | `5c44af7e2a5f1318b733719bffee7bce5112b620` | Code and the read-only validation script are present. The production 30-day read-only ledger check has not been run. |

`codex/video-producer` @ `ca2432cc9f81` is an ancestor of the Visual Pass tip, so that older producer history came in with #102.

PR #110 production behavior stays. `src/cron-auth.ts`, `src/security-headers.ts`, `tests/cron-auth.test.ts`, `next.config.ts`, and `proxy.ts` have no diff against `main`.

## Local-only Sol commits

Re-checked on 2026-10-07 after `git fetch origin '+refs/heads/*:refs/remotes/origin/*'`. `git cat-file` and `git log --all` do not contain `04359be`, `7711357`, or `e72ab1c`. GitHub commit search for each prefix returned `total_count: 0`. `cursor/sol-mcp-read-facade-2e88` and `cursor/sol-ui-restore-2e88` still return HTTP 404. `git ls-remote` Sol heads are only the seven known branches, and remote #111 still ends at `372b5362402a`. They are **BLOCKED**. Only the original local Cursor environment can push or export them. This pass did not invent patches or rewrite #111.

| Reported SHA | Reported branch | Disposition |
| --- | --- | --- |
| `04359be` | `fix/sol-pr1a-security-stop-20261006` (hardening above #111) | BLOCKED. Remote #111 still ends at `372b5362402a`. The original environment must push or export the commit. |
| `7711357` | `cursor/sol-mcp-read-facade-2e88` | BLOCKED. Branch does not exist on the remote. |
| `e72ab1c` | `cursor/sol-ui-restore-2e88` | BLOCKED. Branch does not exist on the remote. |

## Older open PRs

| PR | Head | Disposition | Evidence | Next owner action |
| --- | --- | --- | --- | --- |
| #88 multicam | `5b9c97399c107a15247e7e4b9fd6c500dcf46be8` | SUPERSEDED | `git cherry origin/main` shows 20 non-equivalent commits, but current `main` already has Camera B, waveform sync (`scripts/sync_video_producer_worker.py`), and external audio on the media-asset model. Seven #88 files are absent here (`multicam/analyze`, `multicam/callback`, `multicam/route`, `analyze_video_producer_multicam.py`, `render_video_producer_multicam_worker.py`, `video-producer-multicam-studio.tsx`, `video-producer-multicam.module.css`). They are an older unlimited-camera studio and would replace the production A/B asset model. FFmpeg multicam smoke on the current worker passed (A → B → A with external audio). | Leave the PR open. Do not overlay it onto #102/#103. |
| #79 big-edit lane | `463faf996143f3d4dae7209c64dd4d2fe9c6b575` | SUPERSEDED | Every path in its three-dot diff already exists on this branch. The 16 paths that still differ are older Sol manager and admin edits, 78 commits behind `main`, and would roll back #111. | Leave open. Do not wholesale-merge the August staging lane. |
| #74 Motion Engine V1 | `32de8e717bdb4f3a48acb03bb0e35a3ddfbed9aa` | SEPARATE_SCOPE | Compared with #102/#103 below. The pilot is an illustrated Pathway-video explainer, not a missing piece of the current kinetic overlay system. Eight pilot files are still absent. Wholesale merge would also rewrite `app/admin/video-studio/page.tsx` from the August stack. | Leave the PR open. Do not merge it into this release. |
| #70 Sol Runtime V1 | `5a61f4742abff6b0b20820f34e948b1033334c6d` | SUPERSEDED | 81 paths still differ, including a parallel `src/sol-core/**` runtime, review UI, and eight SQL migrations from 2026-08-16. Current Sol operator plus #111 is the runtime on this branch. Integrating #70 would create a second Sol. | Leave the draft open. Do not apply its migrations. |
| #26 Song Studio | `cb32aaba16d6d9b06def68e1a4937ce4eb325e81` | OUT_OF_SCOPE | 16 paths, all still different, including `supabase/migrations/20260812150000_apostolic_song_studio.sql`. Separate product. | Keep the PR open. Ask before any later inclusion. |
| #3 Guía Apostólica i18n | `09f8f5821bde8483dbec5e4f327cbf8f67c224b6` | OUT_OF_SCOPE | 11 paths, all still different, including `supabase/migrations/202608100001_localization_foundation.sql`. Separate product. | Keep the PR open. Ask before any later inclusion. |

## Branch inventory method

For each of the 135 remote heads:

1. Ancestor of `main`, or an empty three-dot diff: `ALREADY_IN_MAIN`.
2. Otherwise, if every path in `git diff --name-only origin/main...branch` has the same blob on `main`: `ALREADY_IN_MAIN` (squashed or content-equivalent).
3. Otherwise, if the tip is an ancestor of this integration branch: `INTEGRATED`.
4. Otherwise, if those blobs match this integration branch: content is already here.
5. Otherwise: `NOT_IN_THIS_PASS`. These are an inventory, not 83 new feature requests. Duplicate tips were not merged twice.

Counts: already on main **44**, integrated by ancestry **7**, content matches integration **1** (#113), not in this pass **83**.

Identical tips:

- `450c4de57519` — `agent/video-producer-reliability-library`, `agent/video-producer-reliability-library-final`, `agent/video-producer-reliability-review`
- `6dfd6a00b1c7` — `feat/video-producer-broadcast-graphics`, plus `-checkpoint`, `-final`, `-pr`, `-review`
- `964b3d55c974` — `fix/restore-carousel-capabilities`, `fix/restore-carousel-capabilities-validated`
- `999ae6d2de8f` — `fix/restore-original-social-clip-style`, `fix/restore-original-social-clip-style-2`
- `b87219200415` — `threads-publisher-final`, `-final2`, `-finish-pr`, `-ready`, `-release`

`cursor/studio-media-permissions-002e` (`f14ef9fac102`) matches `main` content. That is the PR #110 camera and cron work, already merged as `9b995dd`.

`feat/pathway-full-kjv-v2` matches `main` on the paths it changed. The older `feat/pathway-full-kjv` CSS blob differs only because `main` has the later full-width pathway navigation from `d620b8d`. KJV study text on this branch comes from current `main` plus #112 (`src/kjv-reader.ts`, `src/scripture-data/kjv.json`). The v1 emphasis CSS was not restored.

## Reconciliation fixes on top of the merges

- `package-lock.json` from #103 did not list `@electric-sql/pglite`, which #112 added. `npm install` recorded that package (8 lines). Studio CI now runs `npm ci` because a lockfile is committed.
- `selectCandidate` replaces `useCandidate` in `src/video-producer-visual-pass-panel.tsx` so the click handler is not treated as a React hook. Behavior is unchanged.
- Stabilization commit `2f11f17` clears the integrated-file lint regressions. Fetch-on-mount updates run from a microtask so `setState` is not called synchronously inside the effect, and the scene editor writes `dirtyRef` from an effect. Full-tree lint is still red on legacy files this pass did not rewrite. See checks.

## Checks run on this branch

| Check | Result |
| --- | --- |
| `npm test` | Pass. 440 tests, 0 failed. |
| `npm run typecheck` | Pass. |
| Targeted lint on `git diff origin/main...HEAD` TypeScript and JavaScript | Pass after `2f11f17`. Before that commit the same file set had 8 errors and 7 warnings (`react-hooks/set-state-in-effect`, `react-hooks/refs`, unused bindings, and two `<img>` warnings). After: 0 errors and 0 warnings. |
| `npm run test:media` | Pass. 2 tests (local B-roll render, trimmed scene master). Node v22.14.0, ffmpeg present. |
| `python3 scripts/check_video_producer_sync.py` | Pass. |
| `python3 scripts/check_video_producer_multicam.py` | Pass. A → B → A with external audio. |
| `python3 scripts/check_video_producer_kinetic.py` | Pass. |
| `python3 scripts/check_video_producer_finishing.py` | Pass. |
| `python3 scripts/check_video_producer_visual_pass.py` | Pass. Visual Pass V3. |
| `python3 scripts/check_video_producer_worker.py` | Pass. |
| `npm run lint` | Fail, global baseline only. 103 errors and 38 warnings. None of those files are in the integration diff against `main`. Examples that remain are unchanged legacy files such as `src/video-studio-workflow.tsx`. They were not rewritten. |
| `npm run build` | Pass on the stabilization tree. Build runs `npm test` again (440 passed), then `next build`. |
| Authenticated Studio browser E2E | Not run. No Studio login in this environment. |
| Production Supabase migration apply | Not run. |
| Pathway reader 30-day production validation | Not run. |

## Release gate

**No-go for `main` and for production.** The remotely accessible tree is as unified as it can be without owner action. That is not merge authorization.

Still required before anyone calls this unified or release-ready:

1. The original environment pushes `04359be`, `7711357`, and `e72ab1c` (or an equivalent export). Re-integrate them without force-pushing the source branches. Do not fabricate substitutes.
2. Owner confirms the separate-scope items stay out: #74 Motion Engine, #26 Song Studio, #3 Spanish, the unwired "Why did Jesus pray?" teleprompter script, and the unmerged Character Poster studio.
3. Apply the new SQL only to a preview database, then run authenticated Video Producer and editorial Studio checks. Leave video cron unscheduled until that passes.
4. Run the read-only Pathway reader validation against production data only when the owner explicitly asks. Do not enable editorial draft production or `SOL_KILL_SWITCH` as part of a quiet deploy.
5. Owner reviews draft PR #115.

## Stabilization pass

Commit `2f11f17` (`[skip vercel]`) is the lint fix. The final checkpoint on top of it records this audit and the test evidence. No additional remote head was merged.

### Lint evidence

Integrated surfaces are the TypeScript and JavaScript files in `git diff --name-only origin/main...HEAD` (the #112, #102, #103, #111, and #104 stack plus the small files those merges touched).

| Moment | Errors | Warnings |
| --- | ---: | ---: |
| Before `2f11f17`, integrated files only | 8 | 7 |
| After `2f11f17`, integrated files only | 0 | 0 |
| After `2f11f17`, `npm run lint` on the whole tree | 103 | 38 |

The eight errors were `react-hooks/set-state-in-effect` in the editorial client, kinetic review, visual-pass panel (load and auto-pass), scene editor, dashboard, and sequential flow, plus `react-hooks/refs` for writing `dirtyRef.current` during render in the scene editor. Dashboard and sequential flow already had the effect pattern on `main`; they were cleaned because this branch already edits those files. Legacy files that this branch does not change were left red.

Two deliberate exceptions remain, both silenced with a line comment because the rule's suggested `next/image` loader would drop the Studio session:

- `src/editorial-engine-client.tsx`: the preview `<img>` loads `/api/admin/editorial/preview`, which requires the operator cookie.
- `src/video-producer-sequential-flow.tsx`: thumbnail `<img>` tags load signed private blob URLs. This warning already existed on `main`; the comment documents it.

`diagnosePathwayReaderFunnel` still accepts `largestDrop` so a funnel row can be passed through. The diagnosis recomputes each transition from `steps`. The binding is not read, and that is not a lint error.

`app/api/admin/video-producer/projects/[id]/route.ts` still omits `config_snapshot` from the JSON body. The unused rename `_snapshot` was a new warning; the field is now referenced with `void` so it is intentionally dropped.

### PR #74 compared with kinetic graphics

`feature/apostolic-motion-engine-v1` @ `32de8e717bdb` is **SEPARATE_SCOPE**. It was not merged.

What it uniquely does: `buildApostolicMotionPlan` turns approved Pathway narration cues into illustrated scenes. Cameras are `hold`, `push`, `pan-left`, `pan-right`, and `pull`. The visual grammar is a fixed diagram set (Shema, no-rival, Word to flesh, baptism, throne, and the rest in `docs/APOSTOLIC_MOTION_ENGINE.md` on that branch). The saved contract is `pathway_video_projects.style.motionEngine.plan`. `scripts/render_pathway_motion.py` draws it through the August Pathway video renderer. The pilot also mounts that runtime on `app/admin/video-studio/page.tsx`.

What #102/#103 already do: `VideoProducerKineticTreatment` is `impact`, `split`, `strike` (review normalizes strike back to impact), `band`, `stack`, and `question-stack`. Those are typographic overlays on a spoken Video Producer master. The scene editor trims scenes and places visuals. `python3 scripts/check_video_producer_kinetic.py` passed on this branch: A-roll phrase, moving AG field, editorial composition, then A-roll again.

Why it is not a port: the diagram grammar, camera vocabulary, and Pathway-video plan have no counterpart in the kinetic overlay model. Copying only a helper would not produce the pilot, and copying the pilot would revive the obsolete video-studio page and renderer. The shared idea is "AG-colored motion," which the kinetic system already implements for spoken episodes.

### Leftover remote heads

The 83 `NOT_IN_THIS_PASS` heads collapse to 73 unique tips (the duplicate tips are listed above). For each tip, `git diff --diff-filter=A HEAD...tip` was compared with `git cat-file` on this branch. Added files that are actually absent are listed in the groups below. Modified files were checked against the current symbols rather than merged by default.

No candidate was **INTEGRATE**. Merging any of these tips would reintroduce an older stack or a separate product.

#### Pathways / audio — SUPERSEDED

| Candidate | SHA | Unique behavior | Why it looked relevant | Overlap | Recommendation |
| --- | --- | --- | --- | --- | --- |
| `agent/pathway-audio-mainline` and the mastering, metrics, theology, script, checker, completion, and publishing-panel tips | `de1cfa5bb69c` and the later audio tips through `2471d0af2349` | Studio audio generation, Cedar mastering, script approval, script checker, listening metrics, completion identity | Pathway audio is current product surface | `src/pathway-audio-mastering.ts`, `src/pathway-audio-script.ts`, `src/pathway-audio-script-checker.ts`, and the `20260812*` audio migrations are already on this branch | SUPERSEDED |
| `feat/pathway-card-reader` | `1eea7c667e1d` | Guided card reader and authored transitions | Reader is the current Pathway UI | `src/pathway-card-reader.tsx` exists. The tip's copy of that file is 36 lines smaller than this branch | SUPERSEDED |
| `feat/pathway-full-kjv` | `34948cea3faf` | Local KJV corpus and passage emphasis | #112 depends on KJV fidelity | `src/pathway-kjv*.ts` and `src/kjv-reader.ts` are on this branch. The v1 CSS change is the later full-width nav on `main` | SUPERSEDED |
| `codex/pathway-assets-dam-v3`, `codex/pathway-assets-resumable-ingest` | `f83893d538a6`, `c14572d4ee21` | Asset library and resumable ingest | Media library is current | Both are 400+ commits behind. Current asset routes already exist; no added file is missing | SUPERSEDED |

#### Publishing / social — SUPERSEDED

| Candidate | SHA | Unique behavior | Why it looked relevant | Overlap | Recommendation |
| --- | --- | --- | --- | --- | --- |
| Threads publisher tips (`threads-publisher-final` and aliases, `threads-publisher-finish`, `threads-publisher-merge-ready`, `threads-callback-fix`) | `b87219200415`, `5722195493b6`, `69c4033f7c16`, `cacc102be526` | Threads credentials, composer, cron worker | Publishing is live product | `src/threads-publisher.ts` is on this branch. The only absent file is `THREADS_PUBLISHER_RELEASE.md` | SUPERSEDED. The markdown note is IGNORE |
| `fix-instagram-automation-token-guard` | `ae4b7dbe3fe5` | Refuse to replace a stored Instagram token when the new credential fails | Auth safety | `src/social-publishing-integrations.ts` still throws "The existing stored token was not replaced." | SUPERSEDED |
| Comment Guide tips (`feat/apostolic-comment-guide`, argument library, confrontation, doctrine fallback, self-loop, delete-ledger) | `d3469b307623` through `14c925fe08ad` | Doctrine-locked replies and preserving self-reply identity after log deletion | Comment Guide is on `main` | `jobIsSelfAuthored` on this branch already checks `social_events.provider_message_id` with `delivery_status = sent` | SUPERSEDED |
| `feature/custom-media-publishing` | `08581a041016` | Custom media publish workflow | Publishing workspace | `src/custom-media-publishing-server.ts` is imported by `src/scheduled-publishing.ts` | SUPERSEDED |
| `ag-signature-dm-flow` | `fc4a32a84aea` | Branded Instagram study-card DM | Social automation | Current social signature modules are the later code. No added file is missing | SUPERSEDED |
| `seo-v2-google-2026-08-19`, `seo-v3-ranking-clusters`, `seo/app-search-isolation` | `290ae3a2cf1d`, `6f893213e533`, `673cff0ad55a` | Canonical SEO, ranking clusters, app-host noindex | Public discovery | `src/seo.ts`, `src/search-intent-cluster.tsx`, `tests/app-search-isolation.test.ts`, and `X-Robots-Tag: noindex` in `proxy.ts` are present | SUPERSEDED |
| `fix/analytics-accuracy-2026-08-19`, `feature/live-analytics` | `76bc2e14594e`, `598fe5ad3adf` | Ledger accuracy and traffic context | Analytics is current | `supabase/migrations/202608190001_analytics_accuracy_hardening.sql` is present. #104 is the newer reader funnel | SUPERSEDED |

#### Video Producer — SUPERSEDED

| Candidate | SHA | Unique behavior | Why it looked relevant | Overlap | Recommendation |
| --- | --- | --- | --- | --- | --- |
| `feat/video-producer-multicam` (#88) and `agent/video-producer-2-multicam` | `5b9c97399c10`, `837ddb987c08` | Older unlimited-camera studio, then Studio 2.0 waveform sync | Camera capture is production behavior from #110 | `scripts/sync_video_producer_worker.py` and `src/video-producer-multicam-panel.tsx` are the current model. The seven #88-only studio files are still absent on purpose. Multicam FFmpeg smoke passed | SUPERSEDED |
| Broadcast-graphics tips | `6dfd6a00b1c7` | AG broadcast template renderer | #102 rebuilt broadcast graphics | `scripts/check_video_producer_worker.py` passed the current broadcast smoke | SUPERSEDED |
| Reliability, library, heartbeats, sequential flow, dispatcher, UI, nav, flow, render-speed, old video-studio | `450c4de57519`, `3bdfe1e42b59`, `ce2fea37e378`, `b4dba625a78b`, and the other producer tips in the inventory | Project library, 3-minute heartbeat, pathway-first setup, GitHub dispatch, old renderer progress | Easy to mistake for missing producer bugfixes | Current dashboard, scene editor, `src/video-producer-job-state.ts` heartbeat comment, and dispatch workflow are newer. No added file from these tips is missing | SUPERSEDED |

#### Sol / Studio — SUPERSEDED

| Candidate | SHA | Unique behavior | Why it looked relevant | Overlap | Recommendation |
| --- | --- | --- | --- | --- | --- |
| `agent/sol-content-operator-phase-1` | `bc7cfc724e72` | Natural-language `interpretSolMessage` that can set Sol mode | The file `src/sol-operator-chat.ts` is absent | `main` history removed it in the durable-agent rebuild (`f81e09b`, PR #68). #111 blocks chat from escalating mode. Restoring the file would undo that lock | SUPERSEDED |
| `codex/sol-runtime-v1` (#70), `feature/sol-admin-jarvis`, `feature/sol-agent-kernel-v3`, `agent/sol-manager-v4-mainline` | `5a61f4742abf`, `4365f4cf1ab1`, `2c791496bff2`, `93b78361c021` | Parallel Sol runtime, sidecar, kernel, Forge recipes | Sol is in this release via #111 | Current operator plus #111 is the runtime. Forge recipe migrations `20260820073000` and `20260820074500` are already present. #70's `src/sol-core/**` tree is a second Sol | SUPERSEDED |
| `agent/studio-login-fix` | `73d0afeba194` | One `proxy.ts` auth-route change | Login is production-critical | `proxy.ts` has no diff against `main` / PR #110 | SUPERSEDED |
| `edit/ag-big-edit-2026-08-19` (#79) | `463faf996143` | August staging lane | Large diff | Would roll back #111. Already recorded above | SUPERSEDED |

#### Content / editorial

| Candidate | SHA | Unique behavior | Why it matters | Overlap | Recommendation |
| --- | --- | --- | --- | --- | --- |
| `content/teleprompter-episodes-2-11`, `content/episode-12-john-14-philip`, `feature/teleprompter-beta`, `fix/teleprompter-scroll-tuning`, `fix/teleprompter-seed-content-refresh` | `d38bfeefea5e`, `c189682b4f15`, `f00e5f9f7ea8`, `4343f85b5011`, `d2abe58e25c9` | Episode scripts, remote session, page nudge, seed refresh | Teleprompter is current | Episodes 2–12, `scrollNudge`, and seeded storage are on this branch | SUPERSEDED |
| `feature/teleprompter-doctrine-season` | `898137431814` | Unregistered script `src/lib/teleprompter/scripts/why-did-jesus-pray.ts` ("If Jesus is God, why did He pray?") | Teaching copy is not in the episode index. Episode 02 is the different script "Who Was Jesus Praying To?" | Nothing imports the file. Adding it would create a new teleprompter document | SEPARATE_SCOPE. Owner decides before it is registered. Not published from this pass |
| `feature/character-poster-v1` | `bac89219ead6` | Admin AI character-poster studio | The page never landed on `main` (`git merge-base --is-ancestor` is false) and the tip also carries the obsolete Carousel Studio lab | Current Carousel Studio and the editorial engine are the art path | SEPARATE_SCOPE |
| `carousel-studio-lab`, `carousel-studio-main-ready` | `867087a41c54`, `04153afa056f` | `src/carousel-preview-stability.tsx` and a second carousel studio | Experimental duplicate of Carousel Studio | Current carousel studio is the later implementation | IGNORE |
| `agent/fix-public-routes-site-polish` | `9e725f753229` | August 3 sitemap / public-route polish, 1145 commits behind | Public pages | Current `app/sitemap.ts` and SEO modules are later | IGNORE |

#### Misc already decided

| Candidate | SHA | Recommendation |
| --- | --- | --- |
| `agent/apostolic-song-studio` / PR #26 | `cb32aaba16d6` | SEPARATE_SCOPE. Song Studio migration and routes are still absent. Leave the PR open. |
| `feature/guia-apostolica-i18n-foundation` / PR #3 | `09f8f5821bde` | SEPARATE_SCOPE. Spanish locale routes and localization migration are still absent. Leave the PR open. |
| `feature/apostolic-motion-engine-v1` / PR #74 | `32de8e717bdb` | SEPARATE_SCOPE. Proof is in the section above. |

### Release recommendation

**Not ready for `main`.** Remotely reachable code that belongs in this architecture is already here, and the integrated files are lint-clean. The remaining blockers are owner actions: export the three local Sol commits, confirm the separate-scope PRs stay open, apply SQL only on a preview database, and run authenticated Studio checks. Do not enable video cron, editorial production, or `SOL_KILL_SWITCH` from this branch.

## Already on main

| Branch | Tip | Ahead of main | Behind main | Unique paths | Paths still different from integration |
| --- | --- | ---: | ---: | ---: | ---: |
| `agent/pathway-audio-chunking` | `e28e3bcbceb7` | 0 | 689 | 0 | 0 |
| `agent/pathway-audio-lossless` | `bda0ddaf8fad` | 0 | 680 | 0 | 0 |
| `agent/pathway-audio-neutral-greeting` | `6091f7bef248` | 0 | 698 | 0 | 0 |
| `agent/pathway-audio-pacing` | `2a1ab1fb1db0` | 0 | 684 | 0 | 0 |
| `agent/studio-cleanup` | `93ad79966baf` | 0 | 572 | 0 | 0 |
| `agent/studio-login-fix-v2` | `81d04f67ec76` | 0 | 568 | 0 | 0 |
| `agent/studio-subdomain` | `74b15b2ef33a` | 0 | 582 | 0 | 0 |
| `content/scripture-first-lens-final` | `81fa01e6c723` | 1 | 24 | 17 | 0 |
| `content/scripture-first-tone-rewrite` | `1ef4640fc987` | 18 | 25 | 17 | 0 |
| `cursor/studio-media-permissions-002e` | `f14ef9fac102` | 2 | 1 | 16 | 0 |
| `feat/analytics-v2` | `d436aac9a415` | 0 | 68 | 0 | 0 |
| `feat/character-poster-v1` | `479d1ee56a5c` | 0 | 617 | 0 | 0 |
| `feat/pathway-full-kjv-v2` | `127b6e293ef7` | 8 | 4 | 8 | 0 |
| `feat/unified-creative-publishing` | `2dcc26141f67` | 0 | 352 | 0 | 0 |
| `feat/youtube-growth-system` | `fef6ff09fb7b` | 1 | 44 | 14 | 0 |
| `feature/ai-clips-social-package` | `47923eaeba79` | 0 | 597 | 0 | 0 |
| `feature/channel-publishing` | `2ee9585faa1f` | 0 | 621 | 0 | 0 |
| `feature/teleprompter-auto-scroll-remote` | `eb65d313c3a5` | 0 | 34 | 0 | 0 |
| `feature/teleprompter-remote-qr` | `6e0a3e10a9d0` | 3 | 28 | 3 | 0 |
| `feature/youtube-oauth` | `bbe597e27a99` | 0 | 635 | 0 | 0 |
| `fix-instagram-automation-health` | `5374a61a2b0f` | 0 | 532 | 0 | 0 |
| `fix-instagram-login-scoped-id` | `79b440e4ac75` | 1 | 532 | 1 | 0 |
| `fix/ai-clip-render-progress` | `c8f83a7db0c6` | 0 | 589 | 0 | 0 |
| `fix/carousel-studio-design-hierarchy` | `d293c1e5da8f` | 0 | 133 | 0 | 0 |
| `fix/comment-guide-controls-quiet` | `6d5f5d59e412` | 2 | 480 | 2 | 0 |
| `fix/comment-guide-study-handoff-article` | `ba1deea6c285` | 1 | 486 | 2 | 0 |
| `fix/episode-article-editor` | `4d833cfbdda9` | 0 | 111 | 0 | 0 |
| `fix/episode-render-timing` | `a1d7f9522ee8` | 0 | 115 | 0 | 0 |
| `fix/publish-regenerated-youtube` | `a90d96e88bbd` | 0 | 613 | 0 | 0 |
| `fix/publishing-system-audit` | `862e71e8fb90` | 0 | 379 | 0 | 0 |
| `fix/restore-carousel-capabilities` | `964b3d55c974` | 0 | 93 | 0 | 0 |
| `fix/restore-carousel-capabilities-validated` | `964b3d55c974` | 0 | 93 | 0 | 0 |
| `fix/restore-original-social-clip-style` | `999ae6d2de8f` | 0 | 570 | 0 | 0 |
| `fix/restore-original-social-clip-style-2` | `999ae6d2de8f` | 0 | 570 | 0 | 0 |
| `fix/social-clip-cover-storage` | `a31bbd8fa10a` | 0 | 586 | 0 | 0 |
| `fix/sol-manager-team-production` | `4cb23c9051a6` | 0 | 46 | 0 | 0 |
| `fix/studio-final-polish` | `9c13109fc79b` | 0 | 118 | 0 | 0 |
| `fix/teleprompter-qr-visibility` | `ff40ddf73226` | 3 | 27 | 3 | 0 |
| `fix/video-renderer-bridge` | `dd7d62bde2bb` | 0 | 630 | 0 | 0 |
| `fix/video-studio-template-parity` | `b0f64f099d8e` | 0 | 644 | 0 | 0 |
| `instagram-post-carousel-publishing` | `1bb857eea530` | 0 | 556 | 0 | 0 |
| `instagram-post-carousel-publishing-v2` | `5e3f853c49e5` | 0 | 562 | 0 | 0 |
| `main` | `9b995dd065ea` | 0 | 0 | 0 | 0 |
| `tmp/youtube-growth-system-lake` | `e9d60e7d577e` | 14 | 44 | 14 | 0 |

## Integrated tips and the contract branch

| Branch | Tip | Ahead of main | Behind main | Unique paths | Paths still different from integration |
| --- | --- | ---: | ---: | ---: | ---: |
| `codex/video-producer` | `ca2432cc9f81` | 108 | 11 | 48 | 0 |
| `feat/editorial-content-engine` | `7ac807dea383` | 1 | 0 | 32 | 0 |
| `feat/pathway-reader-funnel-20261002` | `fb20151a2d0f` | 9 | 0 | 10 | 0 |
| `feat/video-producer-scene-editor` | `c2287594a65b` | 116 | 0 | 77 | 0 |
| `feat/video-producer-visual-pass` | `52fc1f80044c` | 112 | 0 | 52 | 0 |
| `fix/sol-pr1a-security-stop-20261006` | `372b5362402a` | 23 | 0 | 13 | 0 |
| `integration/ag-unified-20261006` | `19c1a2432596` | 2 | 0 | 3 | 0 |
| `docs/shared-agent-contract-20261006` | `83846c4f9210` | 1 | 0 | 2 | 0 |

`docs/shared-agent-contract-20261006` is the content match. The other rows are ancestors of this branch. `integration/ag-unified-20261006` in the table is the previous remote tip `19c1a243`, which this work builds on.

## Not in this pass

| Branch | Tip | Ahead of main | Behind main | Unique paths | Paths still different from integration |
| --- | --- | ---: | ---: | ---: | ---: |
| `ag-signature-dm-flow` | `fc4a32a84aea` | 8 | 521 | 8 | 4 |
| `agent/apostolic-song-studio` | `cb32aaba16d6` | 18 | 617 | 16 | 16 |
| `agent/comment-guide-delete-ledger-guard` | `14c925fe08ad` | 3 | 481 | 3 | 1 |
| `agent/comment-guide-self-loop-controls` | `61b622fece40` | 11 | 483 | 11 | 4 |
| `agent/fix-public-routes-site-polish` | `9e725f753229` | 92 | 1145 | 43 | 21 |
| `agent/pathway-audio-mainline` | `de1cfa5bb69c` | 15 | 703 | 13 | 11 |
| `agent/pathway-audio-mastering` | `b5387881d229` | 5 | 678 | 5 | 1 |
| `agent/pathway-audio-metrics-refresh` | `0e581b4d9b6a` | 2 | 679 | 2 | 1 |
| `agent/pathway-audio-mobile-theology` | `048a4741994a` | 6 | 701 | 6 | 6 |
| `agent/pathway-audio-script-workflow` | `77ceea3c75a9` | 9 | 702 | 9 | 6 |
| `agent/pathway-audio-v1` | `d741cec8a90c` | 26 | 704 | 13 | 12 |
| `agent/pathway-completion-identity` | `c9271dfea49f` | 12 | 677 | 12 | 5 |
| `agent/pathway-publishing-control-panel` | `2471d0af2349` | 37 | 704 | 13 | 4 |
| `agent/pathway-script-checker-download` | `9ca9e1fc3149` | 10 | 676 | 10 | 1 |
| `agent/sol-content-operator-phase-1` | `bc7cfc724e72` | 2 | 483 | 17 | 13 |
| `agent/sol-manager-v4-mainline` | `93b78361c021` | 54 | 57 | 35 | 12 |
| `agent/studio-login-fix` | `73d0afeba194` | 1 | 571 | 1 | 1 |
| `agent/video-producer-2-multicam` | `837ddb987c08` | 30 | 45 | 30 | 7 |
| `agent/video-producer-delete-hook-render` | `aa83111f151e` | 14 | 479 | 13 | 6 |
| `agent/video-producer-finishing-pass` | `9a0d1da899db` | 26 | 491 | 21 | 11 |
| `agent/video-producer-project-library` | `59814e27698b` | 7 | 496 | 7 | 2 |
| `agent/video-producer-reliability-library` | `450c4de57519` | 22 | 485 | 17 | 11 |
| `agent/video-producer-reliability-library-checkpoint` | `39a2becbe818` | 21 | 485 | 17 | 12 |
| `agent/video-producer-reliability-library-final` | `450c4de57519` | 22 | 485 | 17 | 11 |
| `agent/video-producer-reliability-review` | `450c4de57519` | 22 | 485 | 17 | 11 |
| `agent/video-producer-render-heartbeats` | `3bdfe1e42b59` | 6 | 495 | 5 | 1 |
| `agent/video-producer-sequential-flow` | `ce2fea37e378` | 18 | 490 | 14 | 8 |
| `carousel-studio-integrate-main` | `a5b825d2b56e` | 2 | 567 | 28 | 13 |
| `carousel-studio-lab` | `867087a41c54` | 48 | 617 | 26 | 13 |
| `carousel-studio-main-ready` | `04153afa056f` | 50 | 617 | 29 | 16 |
| `codex/pathway-assets-dam-v3` | `f83893d538a6` | 33 | 415 | 22 | 4 |
| `codex/pathway-assets-resumable-ingest` | `c14572d4ee21` | 39 | 413 | 21 | 3 |
| `codex/sol-runtime-v1` | `5a61f4742abf` | 116 | 408 | 81 | 81 |
| `codex/video-producer-dispatcher` | `b4dba625a78b` | 2 | 531 | 1 | 1 |
| `content/episode-12-john-14-philip` | `c189682b4f15` | 2 | 32 | 2 | 2 |
| `content/teleprompter-episodes-2-11` | `d38bfeefea5e` | 17 | 42 | 15 | 14 |
| `edit/ag-big-edit-2026-08-19` | `463faf996143` | 28 | 78 | 24 | 16 |
| `feat/apostolic-comment-guide` | `d3469b307623` | 2 | 489 | 22 | 15 |
| `feat/pathway-card-reader` | `1eea7c667e1d` | 17 | 6 | 8 | 4 |
| `feat/pathway-full-kjv` | `34948cea3faf` | 19 | 5 | 8 | 1 |
| `feat/persistent-creative-publishing` | `e31f889cfb95` | 38 | 409 | 33 | 17 |
| `feat/publishing-suite-ai-clips` | `fb0e72972a36` | 19 | 619 | 17 | 16 |
| `feat/video-producer-broadcast-graphics` | `6dfd6a00b1c7` | 7 | 497 | 6 | 4 |
| `feat/video-producer-broadcast-graphics-checkpoint` | `6dfd6a00b1c7` | 7 | 497 | 6 | 4 |
| `feat/video-producer-broadcast-graphics-final` | `6dfd6a00b1c7` | 7 | 497 | 6 | 4 |
| `feat/video-producer-broadcast-graphics-pr` | `6dfd6a00b1c7` | 7 | 497 | 6 | 4 |
| `feat/video-producer-broadcast-graphics-review` | `6dfd6a00b1c7` | 7 | 497 | 6 | 4 |
| `feat/video-producer-multicam` | `5b9c97399c10` | 20 | 45 | 18 | 18 |
| `feature/ag-studio` | `8e5e44197dd9` | 133 | 617 | 80 | 5 |
| `feature/apostolic-motion-engine-v1` | `32de8e717bdb` | 3 | 239 | 11 | 11 |
| `feature/character-poster-v1` | `bac89219ead6` | 22 | 617 | 12 | 9 |
| `feature/comment-guide-argument-library` | `107537e72bd5` | 1 | 487 | 8 | 7 |
| `feature/custom-media-publishing` | `08581a041016` | 1 | 64 | 5 | 1 |
| `feature/guia-apostolica-i18n-foundation` | `09f8f5821bde` | 15 | 704 | 11 | 11 |
| `feature/live-analytics` | `598fe5ad3adf` | 3 | 968 | 3 | 2 |
| `feature/sol-admin-jarvis` | `4365f4cf1ab1` | 14 | 415 | 14 | 10 |
| `feature/sol-agent-kernel-v3` | `2c791496bff2` | 30 | 411 | 21 | 15 |
| `feature/teleprompter-beta` | `f00e5f9f7ea8` | 17 | 43 | 20 | 8 |
| `feature/teleprompter-doctrine-season` | `898137431814` | 1 | 42 | 1 | 1 |
| `feature/video-studio` | `8abbe7322c39` | 38 | 675 | 24 | 18 |
| `fix-instagram-automation-token-guard` | `ae4b7dbe3fe5` | 1 | 533 | 1 | 1 |
| `fix/analytics-accuracy-2026-08-19` | `76bc2e14594e` | 8 | 78 | 6 | 2 |
| `fix/comment-guide-answer-confrontation` | `3600187606de` | 1 | 485 | 7 | 1 |
| `fix/comment-guide-doctrine-fallback` | `8ef5e9ff3e88` | 1 | 488 | 6 | 6 |
| `fix/regenerate-and-youtube-visibility` | `d311d9afdda1` | 5 | 617 | 5 | 1 |
| `fix/render-dispatch-payload-limit` | `6c19793f58e9` | 1 | 620 | 1 | 1 |
| `fix/teleprompter-scroll-tuning` | `4343f85b5011` | 8 | 33 | 6 | 3 |
| `fix/teleprompter-seed-content-refresh` | `d2abe58e25c9` | 3 | 25 | 3 | 3 |
| `fix/video-producer-admin-nav` | `04a45476acda` | 1 | 516 | 1 | 1 |
| `fix/video-producer-flow-ux` | `6221d2c3ae75` | 5 | 514 | 4 | 3 |
| `fix/video-producer-ui` | `ccf697d1e19b` | 3 | 515 | 3 | 1 |
| `fix/video-render-speed-progress` | `93db5984c913` | 8 | 618 | 8 | 3 |
| `seo-v2-google-2026-08-19` | `290ae3a2cf1d` | 1 | 66 | 16 | 6 |
| `seo-v3-ranking-clusters` | `6f893213e533` | 9 | 65 | 8 | 2 |
| `seo/app-search-isolation` | `673cff0ad55a` | 1 | 29 | 2 | 1 |
| `threads-callback-fix` | `cacc102be526` | 1 | 534 | 3 | 2 |
| `threads-publisher-final` | `b87219200415` | 14 | 534 | 15 | 8 |
| `threads-publisher-final2` | `b87219200415` | 14 | 534 | 15 | 8 |
| `threads-publisher-finish` | `5722195493b6` | 18 | 534 | 17 | 7 |
| `threads-publisher-finish-pr` | `b87219200415` | 14 | 534 | 15 | 8 |
| `threads-publisher-merge-ready` | `69c4033f7c16` | 19 | 534 | 18 | 8 |
| `threads-publisher-ready` | `b87219200415` | 14 | 534 | 15 | 8 |
| `threads-publisher-release` | `b87219200415` | 14 | 534 | 15 | 8 |

## Never do during consolidation without a separate explicit approval

- Do **not** merge to `main`, auto-merge old PRs, delete branches, or force-push.
- Do **not** apply Supabase migrations to production, run destructive data operations, or loosen auth/policy gates.
- Do **not** activate Video Producer cron, marketing automation, social posts, email campaigns, or published content.
- Do **not** treat a passing typecheck as authenticated Studio E2E validation.
- Do **not** make competing duplicate Sol managers, video producer workers, content engines, or analytics tables.
- Do **not** assume a local-only commit is available in a Cloud Agent workspace.
