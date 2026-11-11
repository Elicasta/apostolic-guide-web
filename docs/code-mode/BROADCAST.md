# Broadcast Code Mode

Open **Admin → Broadcasts → Open Code Mode**. The version-1 document is `{ "tool":"broadcast", "version":1, "campaign":{...}, "theme":{"html":"...","css":"...","containerWidth":600}, "overrides":{} }`. **Apply JSON** saves a private DB draft; it neither creates a Resend broadcast nor sends mail.

## JSON → template placeholders

| Campaign JSON field | HTML placeholder | Meaning |
| --- | --- | --- |
| `campaign.subject` | `{{subject}}` | Subject; also fills HTML document title |
| `campaign.previewText` | `{{preview}}` | Inbox preview; also fills hidden email preheader |
| `campaign.eyebrow` | `{{eyebrow}}` | Small section heading |
| `campaign.title` | `{{headline}}` | Main email headline |
| `campaign.summary` | `{{body}}` | Message body; blank-line-separated content becomes individual `<p>` paragraphs, individual single newlines become `<br>`, content is escaped |
| `campaign.ctaLabel` | `{{button_text}}` | Escaped label *only*. Do not wrap this in your own visual button. |
| `campaign.url` | `{{button_url}}` | Safe CTA href for custom auxiliary links |
| `campaign.ctaLabel` + `campaign.url` | **`{{button}}`** | Recommended: fully linked, accessible-looking email CTA with Outlook VML fallback; emits exactly one real CTA |
| `campaign.resources[]` | `{{resources}}` | Optional HTML list; if empty, renders no markup, no blank `<p>` |

`{{unsubscribe_url}}` may appear in an HTML theme, but the required unsubscribe/footer is always added outside the theme and cannot be suppressed. The actual Resend token `{{{RESEND_UNSUBSCRIBE_URL}}}` is reserved and passed through intact.

**Legacy templates:** A standalone `<p class="button">{{button_text}}</p>` is automatically converted into `{{button}}`. Token-only `<p>{{body}}</p>` and `<p>{{resources}}</p>` wrappers are normalized so there is no nested paragraph or empty wrapper. Custom designs without `{{button}}` receive the required linked CTA appended once. For customized themes, replace any old pseudo-button with `{{button}}` to control its placement.

**Body paragraphs:** In JSON, `"summary": "First paragraph.\n\nSecond paragraph."` is parsed as two paragraphs. The editor's Message field contains the same `campaign.summary`; applying an updated JSON document also updates those normal fields. The `overrides` object can replace scalar copy keys (`summary`, `title`, `eyebrow`, `ctaLabel`, `url`, `subject`, `previewText`) at render time. `resources` is always the actual structured campaign array.

The default CTA uses a solid burgundy `#8c2337` background and fixed white `#ffffff` link text, including an explicit dark-mode CSS rule. Theme CSS accepts simple selector rules and media queries; scripts, imports and unsafe URL expressions are rejected. The email is constructed with a 320–720px-wide table, server-rendered CSS and a plain-text alternative derived from final HTML.

## Saved drafts, revisions and presets

- **Saved drafts** are listed in the editor under Code Mode. Choose one to reload its JSON, revision history and doctrine status.
- **Undo / Restore** is visible even before a prior revision exists. Applying edits saves the preceding document as an immutable numbered checkpoint. “Undo to previous saved version” restores the most recent checkpoint *as a new version*; you can also restore any checkpoint in history. Version conflicts require a reload rather than overwriting another tab's changes.
- **Saved design presets** are stored in `public.studio_code_mode_presets`, scoped to the signed-in admin and `tool='broadcast'`. You can save a named preset, load it into a new unsaved draft or delete it. Saving or loading never interacts with Resend.

Every content edit and revision restore clears doctrine approval and any connected Resend campaign association. Only a fresh doctrine PASS or owner-approved FLAG can unlock *separate* Send Test, Create Resend Draft, and Mass Send actions; edits cannot reuse a previous approval.

## Deployment and safety

Production SQL: `supabase/migrations/20261027110000_broadcast_code_mode.sql` creates `studio_broadcast_code_drafts`, `studio_broadcast_code_revisions` and `studio_code_mode_presets`; see paired rollback script. It was applied to the Apostolic Guide production Supabase instance on October 27, 2026, followed by `NOTIFY pgrst, 'reload schema';`. All three tables have RLS enabled, and table privileges are restricted to `service_role` (not `anon` or `authenticated`).

**Manual verification still required:** Authenticated Apply JSON, reload and restore from the deployed /admin/broadcasts browser, Gmail/Outlook actual email-client appearance, responsive and mobile screens. Automated tests do not send email or create Resend campaigns.
