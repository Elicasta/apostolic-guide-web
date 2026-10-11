# Pathway explanations: editorial standard

## Reader outcome

The **What This Shows** section must teach the passage instead of restating the highlighted KJV phrase. A reader should understand the historical or literary setting, what the passage explicitly says, how it connects to the Pathway's central argument, and where interpretation begins.

## Rules for every step

1. Write one mobile-readable paragraph of roughly **60 to 95 words**. The automated lower bound is 55 words; the upper safety bound is 135.
2. Start with the biblical writer, speaker, scene, or argument. Explain what the verse actually contributes in context.
3. Move from observation to theological significance. Distinguish a direct statement from a doctrinal conclusion drawn across multiple passages.
4. When a passage is debated, state the Apostolic interpretation clearly **without presenting a disputed inference as an explicit quotation**. Acknowledge the particular textual tension where it matters.
5. Stay Scripture-first and Christ-centered. Do not caricature other Christian traditions. Do not substitute polemical labels for evidence.
6. Preserve the authored `hook` as a separate **Next Question** section. It should move the reader to the *next* passage; do not turn the explanation into a navigation prompt.
7. Avoid repetition, generic affirmations, proof-text chains without explanation, inflated certainty, or calls to action inside the explanation.
8. Read the linked *full KJV passage* before editing any claims that hinge on its exact wording.
9. Prefer plain language, short sentences, and one main claim per sentence. **Do not embed HTML, Markdown, or additional headings** in the explanation string.
10. Review how the resulting text fits on a 390px iPhone and a full-width desktop Pathway card, without hiding content behind a collapsed section.


## Apostolic doctrine review gate

Before publishing doctrinal Pathway edits, use the [2026-10-11 full-catalog doctrine audit](./pathway-doctrine-audit-20261011.md) as the current review baseline. Keep God's Word fully divine, Jesus genuinely human, and the Apostolic interpretation clearly distinguished from what any one isolated verse explicitly states. Review contested texts (John 1:1, Matthew 28:19, 1 Corinthians 12:30, John 14:16–18, Psalm 110:1, and Gethsemane) with the assigned editor or church leader. Automated tests are a regression gate, not doctrinal approval.

## Architecture and coverage

- Canonical content: `src/pathway-catalog.ts` `steps[].explanation`. It drives the public Pathway card reader and Scripture-study explanation lookup.
- Scripture emphasis, references, ordering, step count, next-question hooks, SEO slugs, and routing stay unchanged in this editorial pass.
- `tests/pathway-explanations.test.ts` prevents one-line replacements, missing explanations, duplicated step references, and lost next questions.
- `tests/pathway-kjv.test.ts` separately verifies complete KJV passages and emphasis phrases.
- This change is **editorial only**. It does not alter the existing Teleprompter, authentication, database schema, subscriptions, publication systems, or analytics instrumentation.

## Release validation

Run `npm test`, `npm run typecheck`, and `npm run build` on the content branch; review the Vercel preview and the first/last steps of each of the 20 Pathways, especially the debated passages in John 1, Matthew 28/Acts 2, and 1 Corinthians 12. The parent unified integration PR remains subject to the separate signed-in Studio and Supabase staging release gates.
