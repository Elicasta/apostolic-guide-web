# Editorial Content Engine

## Outcome

`/admin/content-engine` connects canonical pathways to a repeating weekly production queue. A successful refill atomically creates a saved pack, a real editable Carousel Studio project, and a draft calendar handoff for each missing day. Existing drafts and human edits are never replaced by refill.

| Day | Output |
| --- | --- |
| Monday | Teaching installment 1 |
| Tuesday | Scripture poster |
| Wednesday | Teaching installment 2 |
| Thursday | How to use this pathway |
| Friday | Teaching installment 3 |
| Saturday | Scripture poster |
| Sunday | Study invitation and weekly newsletter draft |

One pathway is covered each week, in canonical catalog order. Teaching installments preserve every assigned verse, explanation, and transition in order. Long text is split into frames without dropping words. Posters use a complete verse and split across frames when necessary. The cycle has 20 pathways and repeats after 20 weeks. The epoch is Monday, October 5, 2026. Refill starts on the current Eastern date and produces 14 daily drafts; first activation in the middle of a week begins at that day's lane.

Artwork uses the existing Forge SVG renderer at 1080 × 1350 with paper, navy, and crimson. Authenticated PNG previews/downloads render on demand. They are review artwork, not persisted publishing assets. Review/export the project in Carousel Studio and use the existing Publishing workflow to schedule the approved, current rendered version. Editing a project does not revise the original saved pack or generated-caption snapshot in Content Engine. Artwork previews read the project's current frames.

Weekly newsletter copy is stored with Sunday's pack, with up to two related articles and one related answer selected from existing canonical website content. Preview/download uses the existing branded email builder. **Open draft in Broadcasts** prefills the existing editor. Creating a Resend draft, selecting the consented audience, testing, and sending remain actions in Broadcasts. Preparing a newsletter does not subscribe people or send mail.

## Activation

1. Apply `supabase/migrations/20261006193000_editorial_content_engine.sql` before deploying or activating this workflow.
2. Deploy the branch and verify Studio authentication and the Supabase service key.
3. Open Content Engine, select **Prepare next 14 days**, and inspect the saved projects and PNG previews.
4. Select **Enable daily refill**. The editorial cron runs at 11:23 UTC daily, after Eastern midnight year-round. It uses `CRON_SECRET` and the stored enabled flag.
5. Review doctrine and visual output in Carousel Studio. Export current frames and schedule them in Publishing. The existing publishing cron delivers scheduled publications.
6. Review Sunday's newsletter through Broadcasts and the existing subscriber preferences.

This release automates draft production, not unattended publishing. It does not activate social keyword automations, enroll journeys, auto-approve content, create new articles, produce AI background images, or send email. The actual Pinterest board and an approved visual reference are still needed for a matched image production lane. Account health and publishing credentials must be verified in the deployed Studio before live distribution can be claimed operational.

## Doctrine and source protection

Copy is taken from authored canonical pathways and locally stored KJV passages. No new model-generated doctrinal claims are introduced. Generated projects retain their source fingerprint and production blockers. Ready transitions, publication creation, and execution recheck the canonical fingerprint; a source change blocks posting until the draft is reconciled. The UI reports source drift. Existing non-editorial projects keep their previous behavior.

A current fingerprint establishes source alignment, not editorial or visual approval. Review remains required. If a canonical pathway changes, preserve the original project, create a new project from current source, and review/export/schedule that replacement. Refill never silently updates a source or a human-edited draft.

## Public study experience

The shared StudyScriptures component now displays full KJV text locally across articles, answers, topics, beliefs, Scripture guides, how-it-works, and pathways. It retains all referenced passages rather than capping them at twelve. Authored pathway emphasis and matched explanations are reused; other passages display their full text beside the existing article/answer explanation, without invented commentary. The surrounding-chapter action remains available.

The full 66-book KJV corpus is imported by a server-only component. It is not serialized as a full Bible into browser bundles. Valid same-chapter ranges and Psalm/Psalms aliases resolve. Unsupported or invalid references fail explicitly rather than returning a partial passage.

The pathway index now gives a clear **Begin the study** entry and explains the Scripture → explanation → Next flow.

## Validation

Tests cover the full 20-week rotation, complete text reconstruction, graphic text limits, source changes, Eastern dates/DST, all known seeded article/answer/topic references, and malformed KJV ranges. PGlite exercises the actual SQL refill function against the existing creative schema: duplicate/concurrent requests preserve one row per day, editor changes survive, and a failed pack rolls back all handoffs. PGlite uses one embedded connection; the SQL advisory transaction lock provides serialization on deployed PostgreSQL.

No database migration or live publishing test is performed by the local build. Those remain deployment acceptance checks.
