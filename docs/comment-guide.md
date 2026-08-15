# Apostolic Comment Guide

The Comment Guide routes every new Instagram comment through GPT-5.6 Sol before any reply is prepared. It is intentionally pinned to `gpt-5.6-sol` and fails closed if the model, OpenAI, validation, Supabase, or Instagram delivery is unavailable.

## Reply flow

1. Meta sends a signed comment webhook.
2. The webhook stores an idempotent Comment Guide job and returns without waiting on AI.
3. The one-minute worker first matches the comment against the server-owned objection library, then asks Sol to classify the comment and any paraphrased arguments.
4. Positive comments receive one short, varied acknowledgement.
5. Sincere questions, objections, and one-time redirects are composed from approved argument records and receive a second Sol doctrine review against one of the 20 current Pathways.
6. Deterministic checks reject combative language, unsupported Scripture, model-created links, and out-of-doctrine claims.
7. If the reviewed wording fails those checks, a server-owned reply uses the same classified argument records and redirects the person to Sol's selected approved Pathway. No rejected model wording is published.
8. An approved reply is scheduled with a lane-specific human delay.
9. Keyword requests receive a public acknowledgement and the existing private `OPEN` handshake. Other matched Pathways use the same private handoff.

Repeated contention from one person on one post receives no second doctrinal reply. Hostile, sensitive, spam, and ambiguous comments receive no automatic fallback. The server-owned fallback is limited to sincere questions, doctrinal objections, and one-time gotcha redirects that Sol confidently matched to an approved Pathway.

The objection taxonomy, research sources, combination logic, and repetition controls are documented in [comment-guide-argument-library.md](./comment-guide-argument-library.md).

## Deploy

1. Apply `supabase/migrations/20260814170000_apostolic_comment_guide.sql`.
2. Keep `OPENAI_API_KEY`, Instagram messaging credentials, Supabase service credentials, and `CRON_SECRET` configured in production.
3. Keep `OPENAI_COMMENT_GUIDE_MODEL=gpt-5.6-sol` or omit it. Any other value is rejected.
4. Deploy on a Vercel plan that supports at least three cron jobs and one-minute schedules. The repository now runs `/api/cron/comment-guide` every minute.
5. Open Studio → Comment Guide. Leave the default **Shadow** mode on while reviewing simulator results and real shadow decisions.
6. Switch to **Live** when the activity log looks right. Only comments arriving after that switch are eligible for automatic delivery.

## Safe keyword behavior

Comment automations are request terms, not substring triggers. `JESUS`, `Jesus! 🙏`, and `please send me the Jesus guide` may deliver the configured guide. `Jesus is not God`, `I love Jesus`, and prompt-injection text do not pass the keyword gate.
