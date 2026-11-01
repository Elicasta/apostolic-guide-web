## Broadcast Code Mode (Phase 2)

Open **Broadcasts → Open Code Mode**. The per-campaign JSON includes `{ "tool":"broadcast", "version":1, "campaign":{...}, "theme":{"html":"...","css":"...","containerWidth":600}, "overrides":{} }`.

Fields: `{{subject}}`, `{{preview}}`, `{{eyebrow}}`, `{{headline}}`, `{{body}}`, `{{button_text}}`, `{{button_url}}`, `{{resources}}`, `{{unsubscribe_url}}`. The Resend token `{{{RESEND_UNSUBSCRIBE_URL}}}` is never interpolated by the normal expander. Required footer, site URL, and unsubscribe are appended outside the custom template. The default 600px table is adjustable from 320–720px. Custom CSS accepts simple selector rules and embedded @media; scripts/imports/URL expressions are rejected, CSS is inlined during build, and a plain-text body comes from final HTML.

**Draft workflow**: Apply JSON saves a versioned private broadcast draft, old revision checkpoint, and audit entry. Doctrine PASS or owner-approved FLAG is required before a signed-in admin can send a test or create a Resend draft. Send Test sends only to the signed-in admin. Mass Send stays a distinct explicit action, and the saved draft is pinned to its approved content hash. Editing after approval invalidates the authorization and clears the Resend association. No Code Mode endpoint sends anything.

**SQL migration and rollback**: `supabase/migrations/20261027110000_broadcast_code_mode.sql` and `supabase/rollback/20261027110000_broadcast_code_mode.sql`. RLS ON, only service_role granted. Test migration against isolated database before authorized production migration, per `docs/MIGRATION_RUNBOOK.md`. Rollback drops private code drafts/revisions and restores doctrine type constraints only after backup and app rollback. Neither SQL file has been applied to production.

**Manual verification**: Desktop/mobile/dark sandbox preview; Save/Restore version conflict; admin-only test; no email calls during Apply. Gmail/Outlook rendering is not claimed without real inbox inspection.
