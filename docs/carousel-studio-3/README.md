# Carousel Studio 3 implementation and evidence

Base: `4e766a0198e8ffd971cd958464d28637cedb3ee6`. Branch: `feat/carousel-studio-3`.

## Design and architecture

The former workspace combined React state, hidden export DOM, cloned previews and portal-based repair controls. Studio 3 renders a single pure artwork tree through Satori for both visible SVG previews and server PNG exports. Bundled licensed fonts and the official brand logo remove external font-loading differences. Sharp rasterizes the same vector on the server; browser downloads rasterize it at 1080px.

Five directions have distinct typography and graphic treatments: condensed urban Street Theology, ivory serif Brand White Editorial, atmospheric Cinematic, scholarly Verse Connection and bold Manifesto. Role-aware opening, reading, connection, split, inset, statement and closing compositions provide sequence variation. Automatic fitting uses measured text bounds and retains every word. Explicit size overrides remain authoritative; overflowing exports fail with a reviewable message.

The workspace replaces DOM mutation controls with state-owned text and design controls, previews, frame navigation, undo/redo, autosave, conflict recovery, PNG download, textures and Sol background direction. Mobile shows artwork before copy controls. Existing artwork links remain persistent. Legacy manual designs are loaded and merged into the project design map; the next ordinary version-checked save persists this map. No schema migration is required.

The 14-day preview and export use the same renderer and assets. Newly prepared, untouched drafts receive a stable varied direction according to content lane and date. Initialization uses draft status and state-version compare-and-set, preserving projects that another editor has changed. Existing projects retain their selected theme. Regeneration changes composition without changing text; manual typography is retained. Content generation, KJV verification, doctrine review and human publishing approval remain in place.

## Proof

- `npm test`: 427 passed, no failures or skips.
- `npm run typecheck`: passed.
- `npm run build`: passed locally with Next 16.2.11.
- Browser component integration: live editing, autosave, undo/redo, themes, layout, regeneration preserving copy, PNG download, reload, slide switching, 390px mobile width, save-conflict preservation and retry. See `browser-report.json`.
- Exact vector-to-server PNG equality and 1080px output dimensions tested; 1920px Story height tested.
- Short, long, unusual copy and the longest canonical frame of each role tested across all five directions; impossible overflow is explicitly rejected.
- Changed-file lint: zero errors; three intentional raw-image warnings for the vector artwork and preview.
- Full repository lint baseline has 106 errors and 44 warnings. This change does not repair unrelated legacy components. The release must not be described as a clean repository-wide lint pass.
- Local runtime: Node 24.19; CI uses the repository's required Node 22.

Visual evidence: `before.png`, `design-directions.png` (five columns, six slide types), individual PNGs, `workspace-desktop.png`, `workspace-mobile.png`, and `browser-export.png`. Review artwork visually as well as the automated results.

Reproduce:

```sh
npm ci
npm test
npm run typecheck
npm run build
npx playwright install --with-deps chromium --only-shell
node scripts/carousel-browser-proof.mjs
node --import tsx scripts/carousel-visual-proof.ts
```

## Release boundary

Browser persistence tests use synthetic API responses with the real editor component. Authenticated Supabase saves, Sol paid image generation, deployed asset resolution and production publishing have not been exercised in this environment. No production data, schema, approval state or automatic-publishing setting was modified. Verify these on the authorized preview before production release. The implementation is not evidence of deployment or production verification.
