# Ekegusii translation correction workflow

## Reviewer flow

On any Ekegusii Pathway, choose **Suggest corrections**, edit the draft title, explanation and transition, and add an optional note. Enter name, email and location. The submission goes to `/api/ekegusii/corrections`, is validated against the canonical English step and stored in `public.ekegusii_corrections`. The existing Studio Inbox is notified where configured. The reviewer is given an EK- reference number.

The public endpoint has no database read or publishing capability.

## Studio module

Visit **Studio → Library → Ekegusii Reviews**, or `/admin/ekegusii-reviews`.

The protected queue shows **submitted, in review, approved, rejected, published**, with reviewer name and Scripture reference. Open an item to see the original English teaching and a licensed link to the 2021 Ekegusii Bible.

1. **Save review** — adjust the proposed Ekegusii fields and internal notes; status becomes `in_review`.
2. **Approve** — editor accepts the corrected text and marks it `approved`; nothing changes publicly.
3. **Publish approved correction** — separate confirmed action; writes the corrected step to `ekegusii_published_steps`, then marks the submission `published`. The public lesson reads those fields server-side.
4. **Reject** — keeps the submission in the audit trail, without publishing.

Only a signed-in user with `manage_content` can operate this workflow. The existing `record_studio_audit` records the action; the correction row carries editor identity and timestamps.

Published corrections affect **only the Ekegusii edition**, not the approved English catalog, Scripture reference or source Bible links. Other parts of the reader remain unchanged. A new correction is required for a further revision.

## Privacy and security

Migration: `supabase/migrations/20261022130000_ekegusii_review_workflow.sql`.

Both tables enable RLS and revoke direct client access; the service-role key is used exclusively on the server. Reviewer personal information never enters public lesson props. Every admin endpoint checks `manage_content`, validates the canonical Pathway and step, and refuses publishing unless the correction is explicitly approved.

## Deployment notes

Database migration was applied to Supabase project `jtvrrsyqvahslelpmtvv` and verified for enabled RLS. Ensure the Vercel production site points to the same Supabase project and has a service-role or secret key configured on the server.

A review submission does not itself assert linguistic or doctrinal correctness. Editors must check Scripture in the licensed Ekegusii Bible and preserve the approved original English teaching's meaning before approving it.

This module operates only on *new* structured submissions. There were no earlier Ekegusii submissions in the legacy Inbox to backfill as of initial deployment.
