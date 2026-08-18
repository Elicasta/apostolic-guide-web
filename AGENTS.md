# Apostolic Guide Agent Rules

## Deployment discipline

Apostolic Guide is developed with AI agents that can create many commits quickly. A Vercel preview is useful at the end of a reviewable unit of work, not after every internal sub-step.

- Treat one contained feature, fix, refactor, or workflow as one lake.
- Prefer one tested remote commit per lake. Do not commit every file, helper, UI adjustment, or internal sub-step separately.
- Work through the lake locally first, then run the relevant checks before the final remote commit.
- For application changes, the final checkpoint should pass `npm test`, `npm run typecheck`, and `npm run build` when those checks apply.
- If a remote intermediate checkpoint is genuinely necessary, append `[skip vercel]` to that commit message. Vercel will keep the Git history but skip the preview build.
- The final reviewable commit for the lake must not contain `[skip vercel]`. That commit should produce the single preview deployment used for review.
- Never suppress the `main` production build. Production always builds.
- Documentation-only and GitHub-workflow-only commits do not need a Vercel preview.

The goal is fewer redundant builds without reducing tests, review quality, or production safety.
