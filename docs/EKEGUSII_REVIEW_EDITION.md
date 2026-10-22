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
