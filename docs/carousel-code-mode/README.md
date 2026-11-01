# Carousel Studio Code Mode

Code Mode adds text-based design controls to existing creative drafts. Open an existing carousel draft at `/admin/carousel-studio?project=<id>`, then choose **Open Code Mode** or **Custom Theme · Code Mode**. It uses the existing draft and its revision history.

## Test on an existing draft

1. Open Code Mode. The CSS textarea starts with the selected preset's retained original artwork rules. It uses a fixed 1080 × 1350 artboard. Inter, Inter Tight, Source Serif Pro and Arimo are bundled locally, alongside existing brand fonts.
2. Edit **Carousel CSS**, then select a frame and its **Code** tab. Leave Frame HTML empty for the carousel template, or type markup. **Load template HTML** gives a working starting point. Frame CSS affects only this frame.
3. Use placeholders `{{kicker}}`, `{{headline}}`, `{{quote}}`, `{{body}}`, `{{label}}`, `{{page}}`, `{{total}}`, `{{logo}}`, `{{eyebrow}}`. Headline permits literal `<br>`; other normal fields are escaped as text. Normal fields remain editable. **Apply** saves and preserves a revision.
4. Choose **JSON**, copy the current document, or paste `example-ten-slides.json`. **Apply JSON** validates it and shows syntax/schema error lines. Invalid JSON leaves the draft untouched. JSON contains settings, theme CSS/template, every normal frame field and per-frame overrides. It does not accept publishing status or scheduling instructions.
5. Review all saved frames side by side. **View 100%** displays 1080 × 1350 without scaling. Overflow outlines are warnings, including deliberate tight typography or bleed; they do not modify or truncate your design. Font/image load failures are flagged and prevent incomplete exports.
6. Use **Assets** to copy mark/skyline/paper URLs or upload PNG/JPEG/WebP. Uploaded assets use stable admin URLs, resolved to fresh private storage URLs by the shared renderer. Save a named preset to reuse its CSS, template and asset registry on future carousels.
7. Use **Export PNGs** for `<carousel-title>.zip`, containing `slide-01.png` through `slide-NN.png`, or **Export frame PNG**. Exports use saved state, not unapplied textarea edits. **Revisions · Undo / Restore** preserves the current version before restoring an older one.

## File-by-file changes

| File | Purpose |
| --- | --- |
| `src/carousel-code.ts` | Versioned JSON schema, precise validation lines, placeholder expansion, HTML sanitizer, CSS imports, shared HTML document and fixed fit/overflow helper. |
| `src/carousel-code-preset-css.ts` | Original artwork CSS copied from the retained Studio CSS sources as the editable preset base. |
| `src/carousel-code-fonts.ts` | Bundled font-face declarations. |
| `src/carousel-code-panel.tsx` | Plain CSS/HTML/JSON fields, named presets, assets, Apply, export, Undo/Restore and saved frame gallery. |
| `src/carousel-code-panel.module.css` | Responsive Code Mode controls; monospace textareas, mobile-safe font size. |
| `src/carousel-code-preview.tsx` | Sandboxed iframe at native dimensions, scaled display, overflow and resource flags. No same-origin permission. |
| `src/carousel-code-render.ts` | Chromium renderer at device scale 1, resource allowlist, fonts/images ready check and full-resolution screenshots. |
| `src/carousel-code-assets.ts` | Refresh private image URLs without rewriting drafts. Missing assets remain editable. |
| `src/creative-studio-client.tsx` | Code Mode integration, saved-state Apply/Restore, normal field editing and export handoff. |
| `src/carousel-preview.tsx` | Custom HTML preview and saved Chromium PNG download; vector preview remains for ordinary themes. |
| `src/carousel-design-panel.tsx` | Custom Theme entry; standard preset choice exits custom rendering. |
| `src/carousel-artwork.tsx` | Typed Code Mode render inputs. |
| `src/carousel-studio-v3.module.css` | Hides slider-based workspace while Code Mode is open. |
| `src/creative-project-server.ts` | Hydrates saved private Code Mode assets on project reads. |
| `src/forge-carousel-image.tsx` | Uses Chromium for saved custom designs. |
| `src/forge-carousel-render.ts` | Passes custom designs into the existing shared render workflow. |
| `app/api/admin/editorial/preview/route.ts` | Uses the custom design when previewing the same project in the 14-day engine. |
| `app/api/admin/creative-projects/[projectId]/code/route.ts` | Admin Apply/Restore with draft-only and optimistic-version conditions; checkpoints before mutation. |
| `app/api/admin/creative-projects/[projectId]/code-render/route.ts` | Admin draft-only PNG/ZIP export, private large-file delivery and export cleanup. |
| `app/api/admin/carousel-code-presets/route.ts` | List/save presets for the current administrator. |
| `app/api/admin/carousel-code-assets/[assetId]/route.ts` | Admin access to stable uploaded image URLs. |
| `public/fonts/*` | Locally bundled fonts and their licenses. |
| `public/brand/carousel-skyline.svg`, `carousel-paper.svg` | Copyable vector artwork assets. |
| `next.config.ts` | Chromium packaging and public-font CORS for sandboxed iframes. |
| `package.json`, `package-lock.json` | Pinned Chromium, Puppeteer, sanitizer, CSS/JSON parsers, server-only marker and ZIP library. |
| `tests/carousel-code.test.ts` | Sanitization, placeholders, isolated overrides, CSS imports, JSON roundtrip/errors and migration access checks. |
| `scripts/carousel-code-proof.ts` | Real Chromium export versus sandbox preview pixel comparison, 10 PNGs, overflow/fit checks, network allowlist and ZIP checks. |
| `scripts/carousel-browser-proof.mjs` | Existing editor plus Code Mode UI, 10-slide JSON, named preset, mobile containment, download and revision restore. Uses synthetic API responses. |
| `supabase/migrations/20261026211306_carousel_code_presets.sql` | Adds reusable private preset storage. Existing drafts/revisions need no migration. |

## Persistence and safety

The document lives in `editorState.visualSettings.codeMode`; frame overrides are keyed by stable frame ID. Code Mode never calls Ready, schedule or publish endpoints. Apply checks `status=draft` and the expected version both before and during the database update. Checkpoints preserve the pre-Apply version. Restore also takes a checkpoint first.

HTML scripts, event handlers, embeds and executable links are removed. The only script in the generated document is the fixed overflow/fit helper. Preview sandbox permits scripts for that helper but does not grant same-origin, navigation or form permissions. CSP restricts scripts, fonts, images and CSS imports. Server requests are allowlisted; metadata/private IPs and app API calls are blocked. Static animation/transition suppression keeps screenshot timing deterministic.

ZIPs and large PNGs use the existing private Vercel Blob store to avoid the function response limit. The browser downloads the signed artifact, then requests deletion. If a download is abandoned, the private artifact may remain; its signed link expires after 15 minutes. No public social post is created.

The optional bearer-token REST API is not included. This release uses existing signed-in admin permissions and draft endpoints, without introducing a new credential-management system.

## Migration

Apply `20261026211306_carousel_code_presets.sql` through the normal Supabase migration process. It adds one table and owner index, enables RLS, revokes direct public/anonymous/authenticated access and grants server-role access. API permission checks restrict operations to content administrators and filter preset reads by creator.

The migration was tested against isolated PGlite with role-access assertions, then applied to the configured Apostolic Guide database. RLS and the absence of direct anonymous/authenticated grants were verified. No existing project, asset, publication or approval row is altered. Reverting the application does not require dropping the additive table.

## Verification

```sh
npm ci
npm test
npm run typecheck
npm run lint
npm run build
npx playwright install --with-deps chromium --only-shell
node --conditions=react-server --import tsx scripts/carousel-code-proof.ts
node scripts/carousel-browser-proof.mjs
```

For a local Chromium installation, set `CAROUSEL_CHROMIUM_PATH` to its executable. Production uses the packaged Lambda Chromium binary. Local tests used Chromium 153.0.8010.0, including raw-pixel equality between an unscaled sandbox iframe and exported PNG. Browser rendering on other engines can differ in font rasterization; both paths use the same HTML/CSS and bundled fonts.

Release checks: 467 tests passed, typecheck passed and the production build passed. Code Mode scoped lint has zero errors. Chromium 153 pixel and UI proofs passed.

See `proof.json`, `ui-report.json`, the exported PNG and desktop/mobile screenshots. UI persistence tests use synthetic API responses. Actual signed-in persistence still requires an app session; server authorization was not bypassed to manufacture one. Repository-wide lint has existing failures outside this feature; changed-file lint is recorded separately in the PR.

## Editing fixes: test draft 5cfbfa74-8ed7-419d-9108-ae81055630e0

Open `/admin/carousel-studio?project=5cfbfa74-8ed7-419d-9108-ae81055630e0` and open Code Mode. No Ready, scheduling or publishing action is needed.

1. **Whole-carousel JSON** is visible immediately. **Refresh JSON from fields** explicitly replaces it with current field values; **Copy JSON** only copies. Back up that JSON before testing. Paste malformed JSON and press **Apply JSON**: expect a line-numbered error, no saved mutation and no new revision. Restore valid JSON and Apply: expect a saved revision and persistence after reload.
2. Edit **Carousel template HTML** and **Carousel CSS**. Use **Clear all Frame HTML overrides**, then **Apply**. All frames inherit the template; CSS and text overrides remain intact. **Copy Frame CSS to all** is an optional separate action, also saved by Apply.
3. In **Normal fields**, edit **Kicker**, **Quote**, **Label** and **Eyebrow**. They autosave using the existing draft autosave pipeline. An explicitly empty string renders empty. **Use fallback** clears that override and uses Scripture for kicker/eyebrow, Body for quote and Overlay Text/CTA for label. Older missing overrides retain their checked fallback behavior.
4. New Custom Theme configurations default **Auto-shrink headlines: On**. Existing explicit On/Off preferences remain intact. Use `data-fit` on headline elements and optionally `data-fit-min` (minimum 12px; default 60px).
5. Use **Open frame N large** for a responsive 640 × 800px saved preview on desktop. Its fit status and **Overflow details** identify selectors, box dimensions and content dimensions. Preview and export wait for `document.fonts.ready`, image decoding and two animation frames. Inline text is checked by its bounds, avoiding false scroll-dimension warnings. Decorative ambient/grain/city bleed is excluded; mark deliberate custom bleed `data-overflow="ignore"`. Actual content outside the artboard is flagged.
6. While a saved preview loads, a loading surface covers the artboard. Each document revision has its own eager iframe and message channel, so stale checks cannot label the new preview as ready.
7. Source Serif Pro Black 900 normal and 400 italic are local WOFF2 assets, shared by preview and export. Test `font-family:"Source Serif Pro";font-weight:900` on a heading and `font-style:italic;font-weight:400` on a quote.
8. Clipboard buttons replace each code textarea's contents, then require Apply. If browser clipboard permissions deny access, the error is displayed and direct paste remains available. Export still uses saved state. Undo/Restore is available for Apply revisions.

Changed files for these fixes: `carousel-code-panel.tsx` (controls), `carousel-code-panel.module.css` (large preview and checkboxes), `creative-studio-client.tsx` (extra-field autosave), `carousel-code.ts` (empty strings, fitting and diagnostics), `carousel-code-preview.tsx` (loading and diagnostic display), `carousel-code-fonts.ts` plus two `public/fonts/source-serif-pro-*` files (font faces), `tests/carousel-code.test.ts`, `scripts/carousel-browser-proof.mjs`, and `scripts/carousel-code-proof.ts` (regressions).

The browser integration proof uses synthetic projects, not this live draft. It checks shared-template Apply, clearing frame HTML, quote autosave/empty/fallback, large preview, invalid JSON, valid 10-frame JSON, revision restore and mobile containment. The renderer helper now scopes its constants per document, allowing consecutive exports in one browser page without stale readiness results. The renderer proof also asserts that the original editorial preset fits, loads both new font faces and checks overflow element diagnostics as well as preview/export pixel equality. Live draft content has not been changed by these checks.

Verification for the editing fixes: 469 tests pass; TypeScript and changed application-file lint pass; Chromium and desktop/mobile browser workflow proofs pass. Repository-wide lint still reports 107 existing errors and 52 warnings outside the changed application code. The complete production build is checked before the release commit.
