# Apostolic Guide teleprompter: teaching guide

## Current active script

The teleprompter now starts with **Who Did Jesus Pray To?**, a nine-section
KJV teaching guide. This is a teaching outline, not a word-for-word script.

Each section uses:
- `#` for its title and `---` for a section break.
- `> ` for short KJV Scripture excerpts.
- `• ` for talking points, styled smaller than Scripture.
- `@ref` for passages displayed in the section header.
- `@note` for optional presenter guidance at the foot of the section.

The iPad displays one section at a time. The phone remote can advance sections
and manage the existing scrolling and display settings.

## One-time local library changeover

On the first teleprompter load after this release, the app:
1. Reads the active localStorage script collection.
2. Writes its exact serialized contents to
   `ag:teleprompter:previous-scripts:20261108` if a prior collection exists.
3. Replaces the active collection with the single teaching guide.
4. Sets the teaching guide as the last-presented script.
5. Stores `ag:teleprompter:teaching-reset:v1` with version `2026-11-08-v1`.

The reset runs once per browser. It does not require a database migration and
does **not** affect separate Video Producer scripts or Code Mode documents.

To preserve older local scripts, open **Teleprompter Library** on the original
device after the update, then choose **Export previous scripts**. The backup
is device-local. There is no cross-device cloud backup promise.

Edits and new guides created after migration persist normally and are not
replaced on later loads. Legacy seed bundles are no longer reinstalled.

## Editorial review before publishing

Read John 17:1-5 and John 17:24 in full. The notes explicitly distinguish
Scripture quotations from Apostolic Guide's Oneness interpretation, and mention
the Trinitarian interpretation where the passages are debated.

This draft is not an approved public doctrine article. The owner should
review delivery and theological phrasing before recording or publishing.

## Manual proof checklist

1. Open the library with an existing local collection. It should show only
   **Who Did Jesus Pray To?** after initial load, with backup export visible.
2. Export and inspect the JSON: the prior local collection should be intact.
3. Navigate all nine sections in library preview and on the iPad display.
4. Pair the phone and jump between sections; confirm Scripture and cues remain
   legible in night/day and portrait/landscape orientations.
5. Edit a point or add a new guide, reload, and verify changes persist.
6. Reload again: the old episode seeds must not reappear.
7. Confirm no separate Video Producer or Code Mode document was modified.
