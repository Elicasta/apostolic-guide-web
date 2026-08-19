# Analytics V2

Analytics V2 turns the first-party `analytics.events` ledger into decision metrics for Apostolic Guide.

## North star

**Weekly Engaged Study Sessions** counts distinct public sessions in the last seven days that contain at least one meaningful study signal:

- a completed Pathway step
- a completed Pathway
- a completed article
- completed Pathway audio
- at least 30 tracked seconds of Pathway audio

Simple page views, heartbeats, Pathway opens, and audio starts do not qualify by themselves.

## Public traffic

Decision metrics exclude sessions whose first-touch referrer identifies known internal Studio/admin traffic or Apostolic Guide Vercel preview/development traffic. Raw ledger totals remain available for tracker diagnostics.

A direct visit to the production site cannot be reliably distinguished from genuine direct traffic. If internal production testing needs to be excluded later, add an explicit internal-browser flag instead of guessing from browser identity.

## Retention

- **Returning visitor**: a public browser identity seen on more than one calendar day.
- **7-day retention**: browsers first seen 8 to 15 days ago that returned between day 1 and day 7 after first seen.
- **30-day retention**: browsers first seen 31 to 61 days ago that returned between day 1 and day 30 after first seen.

A retention rate is not displayed until a complete eligible cohort exists.

## Pathway funnel

Each Pathway/session pair is deduplicated and assigned its highest observed reading or audio progress. Funnel stages are 25%, 50%, 75%, and completion. Explicit completion events and final-step completion count as 100%.

## Acquisition

First-touch UTM source takes priority over referrer. Common aliases are normalized for Instagram, YouTube, Facebook, TikTok, and X. Known internal preview/Studio sessions are excluded.

The dashboard reports source sessions, engaged-study sessions, completed-study sessions, and app-transition sessions so acquisition quality is measured by study behavior rather than traffic alone.

## Search quality

Search success is session-based. A search session is successful when at least one tracked search result is opened. No-result sessions remain visible as content/search-index gaps.

## Needs Attention

The dashboard uses deterministic rules rather than model-generated guesses. It can surface:

- meaningful drops in engaged study once a full trend baseline exists
- repeated no-result searches
- Pathways with enough starts but low completion
- sources sending sessions with weak engaged-study conversion

## Security

All Analytics V2 RPC functions are restricted to `service_role`; `anon` and `authenticated` cannot execute them directly.

The Analytics V2 migrations do not change public table policies or expose analytics event rows.
