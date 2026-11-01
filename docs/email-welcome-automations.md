# AG Admin: Welcome Email Automation

## Scope
One reusable email automation at /admin/email-automations, protected by existing distribution permissions.
When a new subscriber submits the website signup, the server persists consent, inserts one welcome delivery record (unique subscriber + automation), attempts to send through Resend, and records the result.

Existing subscribers editing preferences are not sent another welcome. Historical sends remain in the existing welcome_sent_at column, and the new delivery ledger is intentionally not backfilled. An unsubscribed, bounced or previously registered email will not get another welcome automatically.

## Admin workflow
- Preview unsaved copy in a sandboxed email frame.
- Test unsaved copy to the authenticated AG Studio account email only (this sends one actual test).
- Save fields with optimistic revision checking. This updates the next new subscriber's message when active.
- Active sends on signup, Paused blocks new sends and scheduled retries.
- Inspect the newest 40 delivery records, including HTTP failure or ambiguous outcome.

## Reliable delivery
- email_automations: single welcome configuration, server-only, active by default with existing welcome copy.
- email_automation_deliveries: unique (automation_key, subscriber_id), status/attempts and opaque Resend ID.
- Signup immediately attempts the new queued delivery.
- /api/cron/email-automations runs every five minutes, requiring CRON_SECRET with bounded retry work.
- Network failures with unknown Resend outcomes become uncertain and are never retried automatically.
- Up to three attempts for confirmed 429/5xx responses. Permanent errors are not retried.
- Sent status means accepted by Resend, not guaranteed inbox delivery.
- Test messages do not enroll subscribers or affect the delivery ledger.

## Opt-out
Each email includes a unique /unsubscribe?token=... link. It opens a confirmation form, not a GET mutation, so link scanners cannot unsubscribe on preview. Confirmed opt-out updates Resend's contact and the local subscriber status.

## Release checklist
1. Back up production. Test SQL migration 20261027193000_welcome_email_automations.sql on isolated Supabase project and verify RLS.
2. Run npm test, npm run typecheck, npm run lint, npm run build. Inspect desktop/mobile and keyboard interactions.
3. Verify RESEND_API_KEY, RESEND_FROM_EMAIL, and CRON_SECRET on Vercel. Keep server-only.
4. Apply production migration only after authorization, then deploy the application. Never deploy application first while signup depends on new tables.
5. Sign up a controlled new test subscriber. Check exactly one send, duplicate signups and preference updates do not resend.
6. Test pause/resume, preview, owner-only test, invalid token, unsubscribe confirmation, retry handling and webhook bounce.
7. Check mobile email, all CTA links, and monitor the queue for uncertain outcomes.

## Rollback
Pause welcome automation first to prevent sends. Revert the app deployment; keep the delivery ledger and token in the database to preserve sending evidence. Do not run the old direct send while new automation is active.
