# Shared Code Mode

The shared implementation under `src/code-mode/` is the foundation for every media adapter. JSON documents have `{ "tool": "...", "version": 1 }` plus tool-specific fields. A tool-specific Zod schema validates each payload before any mutation. The parser reports the source line for syntax and schema errors. The shared editor provides Copy, Apply, Reload and unsaved/error states. Previews use a sandboxed iframe without same-origin or navigation access.

## Carousel (legacy-compatible adapter)

The existing `docs/carousel-code-mode/example-ten-slides.json` intentionally has `version: 1` and **no tool field**. Its JSON format and existing Carousel panels remain compatible. The Carousel adapter delegates parsing, text escaping and substitution to shared utilities. All exports use a server-side local static resolver for referenced `/fonts/*` and `/brand/*`; the Chromium process does not request these assets from Vercel's protected deployment origin. Missing, oversized, unsupported or traversal-style assets fail closed. Existing named presets, draft-only Apply, checkpoints, PNG export, and doctrine publishing gate do not change.

## Broadcast, Threads, and later adapters

See the separate phase PRs for tool-specific schemas, persistence, code editors and examples. New adapters must use `defineCodeAdapter`, `parseCodeDocument`, and the same JSON panel. They cannot add publish/send/Ready controls to the document.

## Tests and rollback

Run `npm test`, `npm run typecheck`, changed-file `npm run lint`, `npm run build`, `node --conditions=react-server --import tsx scripts/carousel-code-proof.ts`, and `node scripts/carousel-browser-proof.mjs` with configured Chromium. The phase contains **no database migration**. Roll back the app branch only. Refer to `docs/MIGRATION_RUNBOOK.md` and `docs/DEPLOYMENT.md` for future adapter migrations.
