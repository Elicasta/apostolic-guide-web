# Ekegusii editorial review edition

## Status and scope

- URL: `/ekegusii` and `/ekegusii/pathways/[slug]`
- Source: the canonical `src/pathway-catalog.ts`, currently 20 studies and 106 Scripture steps.
- Language: Ekegusii / Gusii, BCP 47 code `guz`.
- Publication state: a **live but unlisted editorial workspace**, not a complete or approved language translation.
- Translation fields are intentionally empty. Do not fabricate translations or identify English fallback text as Ekegusii.
- Main site layout is visually suppressed only while this edition renders. All existing site routes and original doctrinal content are untouched.

## Reviewer workflow

1. Open the link. Select a Pathway and use **Review translation**.
2. Compare the exact English source with the intended Ekegusii title, explanation, and transition for each numbered Scripture step. Fill Pathway title and summary as well.
3. Every edit autosaves in that browser using `localStorage`. The browser storage is not an account, central database, or collaboration channel. Do not clear browser data before export.
4. Use **Reading preview** to inspect the proposed translation against the English fallback. Empty fields are labeled as English.
5. Use **Export review** to download `apostolic-guide-ekegusii-review.json`, and send it to the project owner. Another reviewer can use **Import**; import replaces the local reviewer draft, never the public English catalog.
6. Before public approval, perform a native-speaking linguistic review, doctrinal review, Scripture reference verification, reading-layout review, and editorial signoff. Future approved text should be stored server-side under versioned translation content, not localStorage.

## Safeguards

- Every route sets `robots: noindex, nofollow`. This discourages search indexing; it **does not password-protect** the public URL. Do not send confidential data through the review pages.
- The 2021 revised Ekegusii Bible belongs to the Bible Society of Kenya. The edition links to its listing and **does not reproduce copyrighted Ekegusii verses**. Obtain reuse rights before embedding its verse text.
- All original KJV references are unchanged; links lead to existing Apostolic Guide English teaching pages.
- Reviewer changes are never uploaded to Supabase, merged, published, or emailed automatically.
- Imported JSON is limited to 1.5 MB; its fields are type and length checked before any local write. React escapes rendered reviewer text.
- Verify responsive behavior, browser storage, import/export, reading preview, copyright handling, and the 20/106 catalog invariant. Production release should only follow verified CI and preview.

## Next phase

Use an approved Ekegusii translator/model to produce initial drafts against the English source and a locked theological terminology glossary, then collect native-speaker approvals. Do not mark any translation as approved merely because a model returned text.

## AI draft and direct review submission

- The 20 canonical slugs are the only accepted translation requests. `GET /api/ekegusii/draft?slug=...` generates one complete Pathway via the configured server-only OpenAI API key and caches it for 30 days. Preview environments without the key show the English source and a retry warning.
- Model-generated Ekegusii drafts are **not approved translations**. They load into the review form on the first visit to each Pathway, without overwriting edits already saved locally. A native reviewer must validate every word.
- Reviewers can submit one corrected step through the existing `/api/contact` route. Its successful responses include a reference ID; the submission goes to the Studio Inbox/email workflow, NOT directly into the teaching catalog. A fully edited worksheet may also be exported as JSON. This feature does not need any production migration.
- Model calls must be monitored for cost and abuse. The Next Data Cache reduces repeats for recognized slugs; CDN caching is also enabled. Do not use this alone as a universal distributed quota. Add persistent budgeting and reviewer access if the audience expands.
- Bible library `/ekegusii/bible` directs visitors to the complete Bible reader and downloadable PDF/ePub from eBible.org. The independently found GitHub USFM extraction is incomplete and unlicensed; nothing is copied from it.

## Reading-first language edition (October 22, 2026)

- The source catalog provides 20 studies and 106 Scripture steps. Every one now has a fixed **AI-generated Ekegusii draft** in `src/ekegusii-seeds/part-*.json`, captured against the English catalog on October 22.
- These machine drafts are **unverified**. Do not represent them as approved Bible teaching in Ekegusii until a fluent native reviewer confirms meaning and Apostolic doctrine. Scripture quotations are not embedded due to Bible copyright.
- The site now opens every Pathway in **Read teaching** mode. Ekegusii is the main text with links to the English source and the licensed Ekegusii Bible reader. The reviewer may choose **Suggest corrections** from the toolbar or a lesson, edit it and send a passage to the existing Studio Inbox. Exports remain available only in editing mode.
- The original 20 English slugs and 106 Scriptures are locked. Completing a study offers the next Pathway, and a progress indicator tracks the current step. Shareable `#step-N` links work.
- The public `/api/ekegusii/draft?slug=...` API is deterministic and read-only; on-demand OpenAI generation is retired, eliminating repeat model charges and inconsistent drafts between visitors.
- Existing local reviewer edits take precedence when seeding the catalog. English editorial revisions must prompt translation updates and another native-language review.

## Ekegusii Bible references and teaching-home localization (October 22, 2026)

- Every canonical English book name used across the 106 Pathway steps maps to the matching **EBIBILIA ENCHENU** book name as printed in the published Bible index at https://ebible.org/guz/.
- All references remain canonically stored in English. Only the Ekegusii teaching display is localized; reviewer submissions retain their English reference for source validation.
- Displayed references in the reader and editor are clickable and open the correct Ekegusii eBible chapter, via https://ebible.org/guz/{USFMBOOK}{CHAPTER}.htm. Example: `Deuteronomy 6:4` renders `Okoiranerera 6:4` and links `https://ebible.org/guz/DEU06.htm`. Psalms chapters use 3-digit padding.
- The link goes to the **chapter**, not necessarily the exact numbered verse. eBible's chapter HTML uses Roman-numbered verse typography. No Bible verses are copied into Apostolic Guide.
- The home page now displays the draft Ekegusii teaching title and summary without repeating an English subtitle on each card. The primary release status is **Draft translation**, with a readable reminder that native-speaker approval is pending.
- All mappings are covered by tests against the 106 canonical step references. Do not infer mappings for unfamiliar books. Update this mapping from the Bible Society's index if the Bible's wording changes.
