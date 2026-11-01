# Pathway reader funnel validation

This check reads the existing production analytics ledger. It does not create, update, or delete events, and it does not need a new migration.

## Before running it

Leave the Pathway reader funnel pull request in draft until this procedure has been run against the live ledger and the printed waterfall matches Studio.

Put these values in the shell environment for one command. Do not paste them into chat, commit them, or write them into the repository:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Commands

Prove the report shape without credentials:

```bash
npx tsx scripts/validate-pathway-reader-funnel.ts --fixture
```

The fixture must diagnose `jesus-is-god` as an entry problem: 10 opens and 5 readers beginning Step 1.

Read the live ledger:

```bash
npx tsx scripts/validate-pathway-reader-funnel.ts --days 30
```

The live command sends `GET` requests to `analytics.events` for `pathway_started`, `pathway_step_completed`, `pathway_completed`, and `app_link_clicked`. It prints pathway totals, step counts, and the diagnosis. It does not print session identifiers or raw event properties.

If the command says credentials are missing, stop. Do not extract the service-role key from Vercel, Supabase, or a local secret store into the chat.

## What a passing live check shows

- The command exits 0.
- Each active Pathway has opened, began, and reading-complete counts.
- Audio completions stay out of the reading-complete count.
- A Pathway with fewer than 5 readers who began stays in Collecting.
- The same diagnosis appears in Studio analytics for that window.

Until that live output exists, the pull request stays draft.
