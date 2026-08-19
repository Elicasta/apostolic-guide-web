# Carousel Studio capability contract

This is the minimum behavior Carousel Studio must preserve across refactors.

## Project model

- Creative Projects are persistent database records.
- Manual slide design is stored per frame in `studio_creative_frame_designs`.
- Generated background art is linked per project frame through `studio_creative_project_assets` with role `background`.
- Do not replace project persistence with localStorage-only state.

## Manual Edit

Manual Edit must remain visible below Preview for Single Post, Carousel, and Story projects.

Per-frame controls include:

- vertical copy position
- headline size and width
- body size and width
- copy spacing
- left, center, and right alignment
- headline/reference font
- body/support font
- headline/reference brand color
- body/support brand color
- approved background texture and strength
- Sol texture direction
- apply texture across the sequence
- reset to the untouched template

Untouched frames must keep the selected template's native styling. Merely opening Manual Edit must not write or apply a manual design.

## Sol visual direction

- Single Post uses the art director owned by `CarouselPersistentArtwork`.
- Carousel and Story use per-frame art direction.
- Each generated image is attached to its exact frame and survives reload/export.
- Generated imagery is the visual layer only. Typography, Scripture, logo, and layout stay editable.
- Background and texture recommendations may use the current frame copy and Apostolic Guide style references.

## Prompt and Pathway relationship

For normal prompt-led creation:

1. The user's prompt controls the thesis, question, hook, emphasis, audience, and creative angle.
2. The selected Pathway controls doctrine and supplies trustworthy Scripture/source context.
3. The Pathway is not automatically the slide outline.
4. Recent creatives on the same Pathway are supplied as anti-repetition context so Sol avoids cloning the same thesis, hook, headline sequence, or verse route.
5. Freshness may change the angle and route through the source material, but it must not create new doctrine.

`Pathway Guide` is the explicit exception. In that mode, the canonical Pathway progression is intentionally the outline.

## Visual prompt relationship

Image-generation prompts follow the same rule: the user's creative request drives the composition while the Pathway acts as theological context. Do not turn every asset from one Pathway into the same recurring visual metaphor.

## Regression gate

Changes to Carousel Studio must pass the full repository test suite and preserve this contract before merging to `main`.
