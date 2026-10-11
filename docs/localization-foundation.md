# Apostolic Guide localization foundation

This layer prepares Guía Apostólica without changing the current English production experience.

## Compatibility phase

- Existing English URLs remain unchanged: `/`, `/pathways/*`, `/answers/*`, and the rest of the current route tree keep working as-is.
- `/en` exists only as a compatibility locale entry and redirects to `/`.
- Spanish begins under `/es` and is not linked from the English experience yet.
- Public locale keys are `en` and `es`; existing database locale values remain `en-US` and use `es-US` for Spanish content.
- Editorial content never silently falls back from Spanish to English. Missing Spanish content is unavailable until reviewed/published.

## Source files

- `src/i18n/config.ts`: supported locales and locale metadata.
- `src/i18n/routes.ts`: localized route names and URL resolution.
- `src/i18n/dictionaries/*`: UI copy by locale.
- `src/i18n/content.ts`: translation types and no-fallback content resolver.
- `app/[locale]/*`: isolated locale boundary. English remains outside this tree during compatibility phase.
- `supabase/migrations/202608100001_localization_foundation.sql`: additive translation grouping/status metadata.
- `tests/i18n.test.ts`: English compatibility and Spanish behavior tests.

## Database strategy

The existing `content.items` table remains the localized content record. The new tables do not duplicate titles, bodies, slugs, or pathway data.

`content.translation_groups` provides a canonical language-neutral identity.

`content.translation_entries` attaches each localized `content.items` record to that canonical group and tracks translation workflow metadata such as status, source revision, reviewer, and publication date.

This builds on the existing `content.items.translation_group_id` column rather than replacing the current content model.

## Rollout rules

1. Do not move current English routes under `[locale]` during this phase.
2. Do not rewrite existing English content records.
3. Do not expose a Spanish content page until its Spanish record is approved for publication.
4. Use `getPublicContentUrl` for links that must preserve current English URLs.
5. Use `getLocalizedContentUrl` when explicitly constructing locale-prefixed routes.
6. Do not add an automatic browser-language redirect to the English production experience.
7. Add the language switcher only after Spanish content coverage is ready.

## Future cutover

When `/en/...` becomes the desired canonical English URL, the compatibility helper can be changed in one place. Existing English URLs can then receive deliberate redirects after SEO and analytics validation. No content identity migration should be required.
