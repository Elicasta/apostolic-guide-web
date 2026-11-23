# Pathway Read-Along: the primary 20-episode Apostolic Guide series

## Editorial decision

The 20 public website Pathways are the canonical source for the first 20
Apostolic Guide read-along episodes. The recording script is not a new theology
document or a longer alternate Pathway. A viewer should be able to open the
exact linked public page and follow the Scripture, explanations, and transitions
word for word, step by step.

The existing 24 doctrine teaching scripts remain available under **Deep Dives**.
They are different episodes, not substitutes for a public Pathway.

## Source and rendering

- Public page source: `src/pathway-catalog.ts` and `src/pathway-kjv.ts`.
- Public renderer: `app/pathways/[slug]/page.tsx` and
  `src/pathway-card-reader.tsx`.
- Teleprompter renderer: `src/lib/teleprompter/pathways/index.ts`.
- The script builder reads the same catalog objects and KJV passage objects as
  the public Pathway page. No paraphrased or manually duplicated teaching text.
- For each step, the exact step title and Scripture reference are used, followed
  by the same numbered KJV verses, explanation, and next-question hook. Where
  the public site synthesizes a missing hook, the script uses the exact same
  fallback wording.
- A short, separately labeled **INTRO** introduces Apostolic Guide and invites
  reading along on `https://www.apostolicguide.com/pathways/<slug>`.
- A separately labeled **CTA** directs the viewer back to the *same* public
  Pathway. No app, channel subscription, generic course, or deep-dive CTA.
- Intro and CTA are new host narration. The 20 study bodies remain word for
  word. Private teleprompter `@note` cues distinguish the segments.

## User experience

The library opens by default in **Pathways** (20 episodes, website order).
**Deep Dives** (24 manuscripts), **Personal**, and **My scripts** are separate.
Each Pathway script is labeled **Matches online Pathway** if its saved title
and content match the source. Local edits are labeled **Edited · differs from
Pathway**. The **Website** link opens the exact canonical public URL.

**Restore website wording** only appears when a Pathway was edited. It prompts
for confirmation, creates a separate backup copy under My scripts, and then
restores the current public text. It never silently discards an edit.

## Browser-local synchronization

- First use adds the 20 Pathways without replacing any matching local ID.
- The app saves a compact signature of each canonical title and script.
- When the website source is changed in a future release, only Pathway drafts
  that still match the previous canonical signature are refreshed.
- Edited documents, intentional deletions, custom scripts, personal episodes,
  and Deep Dives stay untouched. A deleted Pathway is not reinstalled on reload.
- A missing or corrupted previous signature record is not interpreted as
  permission to overwrite previously edited manuscripts.
- Old Episodes 01–12 remain in the browser-local archive from PR #181.
- Scripts and backups reside in each browser's local storage. `www` and apex
  hostnames do not share the same local storage.

## Acceptance

1. All 20 canonical Pathway slugs, titles, and sequence match public pages.
2. All 106 step reference/title/KJV/explanation/hook combinations match source.
3. Each Intro and CTA points only to the exact related public website Pathway.
4. Deep Dive content and public Pathway page content remain unchanged.
5. Edits and deletions survive reload; future changed Pathway source updates
   only untouched local copies.
6. Restoring website wording preserves a duplicate of the user's prior edit.
7. iPad/phone library category navigation and source links work.

Automated regression tests cover 1–5. Verify 6–7 in the actual browser.
