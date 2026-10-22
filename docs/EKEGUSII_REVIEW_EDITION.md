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

## Bible-grounded translation correction pass (October 22, 2026)

- **Important:** The original 20-pathway language drafts were machine-generated and contain demonstrable language errors. None should be marked native-approved.
- The Deuteronomy 6:4 wording that a reviewer supplied and the independent Mark 12:29 wording are now separated from explanatory text, shown as clearly attributed short quotations with direct Bible chapter links. Never imply the AI paraphrase is a Bible quotation.
- Revised translations include seven Bible-informed pathway titles, corrected Scripture book/chapter mentions and substitutions for a limited number of Bible-attested terms (e.g., `Omoika Omochenu`). These edits are helpful starting points, **not certified linguistic translations**.
- The dictionary and source passages are in `src/ekegusii-language-audit.ts`. All glossary terms carry verse references.
- Every step has a Bible Society of Kenya source credit, a link to the specific chapter, and an optional English teaching comparison. The published Ekegusii Bible remains the source of Scripture text, not a duplicated full Bible.
- The report `docs/EKEGUSII_SCRIPTURE_ALIGNMENT_AUDIT.md` documents all 106 reference links and identifies which verse quotations were actually compared, so unverified ones are not overstated.
- Reviewer browser drafts are upgraded from v1 to v2. When a field still matches the old machine draft, it receives the corrected baseline; a differing field is treated as a human correction and retained. v1 JSON imports use the same migration and v2 exports remain versioned.
- Doctrinal claims are grounded in the existing English catalog. Differences between direct Scripture statements and Apostolic Oneness interpretations are preserved, not silently rewritten into supposed Bible quotations.
- Bible Society of Kenya retains the copyright to `Ebibilia Enchenu` (© 2021). Obtain permission for extensive reproduction; this implementation uses two short, attributed excerpts and deep links for the other passages.
- Native-speaker and theological signoff remains necessary for all 106 steps, including the first two checked quotations' surrounding prose.

## 2021 publisher-aligned batch screening (October 22, 2026, pass three)

- The updated audit distinguishes **mapped verse**, **short Bible excerpt compared**, **draft vocabulary normalized**, and **human-approved translation**. These are distinct states, not synonyms.
- Used the Bible Society of Kenya's **2021 EKGE** on YouVersion to confirm the edition and compare Acts 4:12. The prior and correct Deuteronomy 6:4 and Mark 12:29 comparisons remain. The separate 2020 EKEGUSIIBBLE edition must not be substituted.
- Applied a restricted Bible-attested vocabulary pass to all 106 teaching steps. It standardizes recognizable biblical names and the Holy Spirit term; removes unverified AI quotation marks and directs the reader to the original chapter instead. This corrects presentation problems but **does not validate full Ekegusii prose**.
- The reading page warns when the original AI draft contains suspicious foreign-language or inconsistent wording. The full English original remains available for theological comparison.
- Storage advances to v3, preserving genuine v1 and v2 reviewer corrections while refreshing fields that still match the previous AI draft.
- All remaining uncollated Bible verse wordings stay marked as such in `EKEGUSII_SCRIPTURE_ALIGNMENT_AUDIT.md`; do not relabel them verified until the text was actually compared.
- Human review should prioritize doctrinally sensitive topics: God and the Son, the Word becoming flesh, baptismal formula, salvation by grace, the Holy Spirit, tongues as initial evidence, and the right hand of God.

## Comprehensive editorial baseline pass · 2026-10-22

- Published book names and references are mapped for all **106** teaching steps; this is a *reference coverage test*, not automatic translation verification.
- Added `src/ekegusii-editorial-standards.ts`: 20 topic-specific guardrail sets, one for every Pathway, that describe the English doctrinal claim to preserve and the most important mistranslation to avoid.
- Nine additional **distinct** citations were inspected directly in the **2021 Ebibilia Enchenu** source: Genesis 1:1, Matthew 1:21/23, John 1:1/3/14/18 and John 3:3/5. Previously checked: Deuteronomy 6:4, Mark 12:29, Acts 4:12. These are **12 unique Scripture references**, covering more than 12 of the 106 teaching steps because some citations recur.
- No new full Scripture quotations are copied into the site. The 2021 language cues are editorial summaries, and the linked source remains the place to read the actual verse.
- Risky Ekegusii explanatory prose now surfaces the original, approved English teaching directly beneath it in reading mode. All other source and doctrinal caveats remain accessible in the source notes. The pastor can suggest a correction without losing the original.
- **Human approved translations: 0**. No model or glossary can substitute for a fluent speaker's linguistic verification of full sentences; don't display an automatic “reviewed” badge for any of these teachings.
