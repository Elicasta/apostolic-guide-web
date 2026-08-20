# Apostolic Guide Agent Rules

## Deployment discipline

Apostolic Guide is developed with AI agents that can create many commits quickly. Vercel builds are review checkpoints, not a side effect of every internal edit.

### Branch policy

- Do not do multi-commit feature work directly on `main`.
- Use an `edit/*` branch for large or iterative AI-assisted edits.
- The active large-edit branch is `edit/ag-big-edit-2026-08-19`.
- `main` is the production lane. Every commit to `main` deploys, so only reviewed merges or intentional hotfixes belong there.

### Cost-controlled `edit/*` branches

- Vercel previews are OFF by default for every commit on `edit/*` branches.
- Make as many implementation commits as the lake needs. They remain in GitHub without spending a full Vercel build each time.
- Work through the contained feature, fix, refactor, or workflow before asking Vercel to build it.
- Before the final review checkpoint, run `npm test`, `npm run typecheck`, and `npm run build` when those checks apply.
- Only the final reviewable commit should include `[deploy preview]` in its commit message. That marker intentionally creates one Vercel preview.
- After that preview is approved, merge once to `main`. That merge intentionally creates the production deployment.
- If more changes are needed after review, keep working on the edit branch. Do not merge partial work to `main` just to see it deployed.

### Other feature branches

- If a remote intermediate checkpoint is genuinely necessary but should not build, append `[skip vercel]` to the commit message.
- Documentation-only and GitHub-workflow-only commits do not need a Vercel preview.

The target for a large edit is simple: many implementation commits, one preview build, one production build.
