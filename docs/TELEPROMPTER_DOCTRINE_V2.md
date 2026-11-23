# Apostolic Guide doctrine teaching voice, v2

## Outcome

The teleprompter ships 24 individually authored doctrine narrations, based on
the existing doctrine source catalog and associated Pathway names. The prior
generic output followed Claim -> stand-alone verse cards -> Objection -> Answer
-> Close -> Reel Cues. That structure is no longer used for active scripts.

The new output has a specific opening that leads into the first passage,
exact existing KJV verse cards in their canonical order, a distinct spoken
explanation after each reading that carries the argument into the next, and a
closing that returns to the opening question.

Reel plans stay in src/lib/teleprompter/doctrine/catalog.json for editorial
production; they no longer interrupt the teleprompter manuscript.

The separate Who Did Jesus Pray To? guide from PR #176 is adapted as a
non-destructive companion. It includes John 17:1-5,24 and acknowledges
interpretive differences between Trinitarian and Oneness readings.

## Sources and boundaries

- doctrine/catalog.json: 24 existing titles, sequence, KJV quotations,
  Pathway links, claims and reels. Unchanged.
- doctrine/teaching-flows-identity.ts and doctrine/teaching-flows-gospel.ts:
  the 24 newly authored narration masters.
- doctrine/script.ts: attaches existing verses to authored explanations.
  Retains the old generator only for exact-content migration checks.
- pathway-audio-script.ts, pathway-audio-script-checker.ts and
  video-producer-episode-script.ts: help future audio/video narration avoid
  disconnected proof-text snippets.

The 20 public Pathway articles and live public doctrinal content are not
rewritten or published. Existing remote Video Producer documents and cloud
drafts are not overwritten. Future generated scripts still require approval.

## Local library update

The doctrine seed version advances from 1 to 2.

- Only a doctrine document whose title and complete content exactly match
  the original v1 seed is eligible for replacement.
- Edited titles, edited manuscripts, personal documents, and copies stay.
- A doctrine episode intentionally deleted is not reinstalled by the upgrade.
- Before refreshing eligible v1 documents, the full local collection is
  snapshotted at ag:teleprompter:doctrine:before-v2.
- The library offers Export previous doctrine scripts when a backup exists.
  This backup is browser-local, not a remote/cloud backup.
- If the snapshot cannot be saved because storage is full or blocked, the
  rewrite is not applied, and the next opening can retry the upgrade.
- The companion John 17 guide uses its own one-time seed key and does not
  replace the existing collection.

Unlike PR #176, this does not reset the script library to one document.
PR #176's destructive changeover should not be merged alongside v2.

## Editorial and recording review

Review all 24 episodes for theological accuracy and actual spoken delivery.
Give extra attention to full context of John 17, John 14, 1 Corinthians 15,
Acts baptism accounts, and tongues in Acts / 1 Corinthians. Label interpretive
inferences as inferences. No draft is an owner-approved publication.

## Verification

Automated tests cover all 24 per-passage narration bridges, verse preservation,
removal of generic claim/objection pages, exact old-seed matching, edits,
deletions, idempotency, backups and backup failure.

Run npm test, npm run typecheck, npm run lint and npm run build on a PR checkout.
Then verify on the iPad and phone:

1. Open 24 doctrine drafts and the John 17 companion guide.
2. Read through the original verse cards and rewritten passages.
3. Edit a seeded script, reload, and verify it stays edited.
4. Start with an unedited v1 script, then verify the rewritten v2 appears.
5. Export the previous local library and inspect its JSON.
6. Delete a doctrine draft, reopen, and confirm it stays deleted.
7. Check large type, scroll, night/day and remote navigation on the iPad.
8. Confirm no remote Video Producer script or public article was altered.

CI, owner editorial approval, and hardware verification are separate gates.
