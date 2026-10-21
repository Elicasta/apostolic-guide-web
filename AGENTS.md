# Apostolic Guide Agent Rules

This is the shared, repository-owned engineering contract for Cursor, ChatGPT, and any other agent working in `Elicasta/apostolic-guide-web`. Read it before starting work. An agent is not authorized to merge, deploy, publish, or touch production solely because this file exists. Follow the user's current instructions and any stricter security or platform policies.

## Collaboration and authority

- **Owner:** Defines product direction, doctrinal standards, priorities, and approvals. The owner does not need to relay routine implementation choices.
- **ChatGPT:** Defines outcomes, architecture, acceptance criteria, tradeoffs, and independent review. It may implement changes when explicitly tasked, but follows the same Git and proof rules as Cursor.
- **Cursor:** Primary implementation engineer. Inspect the repository, write code, handle edge cases, test, fix regressions, and deliver a reviewable PR. Resolve routine coding decisions without waiting for the owner.
- **GitHub:** Shared, durable coordination surface. Use branches, PR descriptions, commits, CI results, and referenced issues. Chats and local files are not a substitute for a pushed change.

ChatGPT and Cursor are **not assumed to communicate directly or share live session state**. If a decision or result matters to the other agent, record it in the relevant GitHub PR or issue, with a link. Do not claim the other agent has read, approved, or executed anything unless there is actual evidence.

## One lake, end to end

A **lake** is one bounded feature, fix, refactor, workflow, or review. Finish the lake: implementation, naming, UX and accessibility where relevant, error states, regression coverage, documentation, cleanup, and verifiable results. An **ocean** is a broad unrelated rewrite. Identify oceans as out of scope and split them into independently reviewable lakes.

Before implementation, establish:
1. **Outcome:** What must work for an actual user?
2. **Acceptance:** Observable behaviors, failure cases, and tests that prove it.
3. **Boundary:** What this PR will *not* change.
4. **Risk:** Any impact on production data, permissions, cost, security, doctrine, publishing, or other active PRs.

Small fixes may document these in the PR rather than a separate planning file. Do not create documentation for documentation's sake.

## Repository and branch safety

1. Inspect `git status`, current branch and HEAD, relevant code/tests, existing PRs, and applicable docs before editing. Never assume a prior chat accurately describes the current repository.
2. Work on an isolated feature branch or worktree. Start from the verified `main` SHA, unless the task explicitly requires a stacked PR. Record the exact base and dependencies.
3. Never overwrite, reset, delete, or rebase unrelated dirty work. Never silently incorporate another agent's uncommitted files. Do not force-push shared branches.
4. Never push to `main` directly. Open a PR, verify the branch is pushed, and await the authorized merge decision. Do not merge merely because checks are green.
5. Keep one lake per PR. If stacking is necessary, identify the parent PR and change the target branch only intentionally. Keep unrelated PRs and migrations untouched.
6. If remote push is rejected, stop claiming GitHub delivery. Preserve the local SHA, report the exact blocker, and provide the safe retry path. Local commits are **not** a PR update.

## Engineering and proof

- Match existing architecture and conventions; prefer the smallest complete solution over a parallel system. Avoid introducing new dependencies or hosted costs without a reason.
- Test the acceptance behaviors, including negative cases, concurrency or retries when applicable, and regressions near the changed surface.
- For application changes, run the relevant checks: `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`. Note that the build script runs tests too. Do not claim a check passed if it was skipped, unavailable, or failed.
- For UI changes, check responsive behavior, keyboard and accessibility basics, loading, empty, failure, and mobile states. Provide screenshots or preview URLs when available; say when visual inspection was not possible.
- For services and integrations, verify authorization, least privilege, input validation, idempotency, failure handling, useful logs, retries, and cost ceilings when relevant.
- Do not treat a passing build as proof that a live workflow works. Verify the actual behavior or name the verification gap.
- Documentation-only changes require a factual link/path review and clear diff; they do not need a fake application test run.

## Sensitive changes and release gates

- **Approval required:** Production migrations or destructive data operations; changes to authentication, authorization, secrets, billing, or payment flows; external mass email or social publishing; consequential doctrinal publication; and production merges/deployments unless the current request clearly authorizes them.
- Never paste credentials or private user data into issues, logs, screenshots, PRs, or ChatGPT handoffs. Use server-only secrets and least-privilege access.
- For Supabase schema changes, follow `docs/MIGRATION_RUNBOOK.md` and `docs/DEPLOYMENT.md`, test against an isolated database first, document forward and rollback plans, and never treat a committed SQL file as an applied migration.
- For Apostolic content, preserve exact Scripture quotations and references, label interpretive explanations, and respect approved doctrinal/editorial gates. A generated draft is not the same as approved or published teaching.
- Separate **merged**, **deployed**, and **production-verified** states. A Vercel preview or a green CI check proves neither merge nor successful production behavior.

## Agent-to-agent handoff

At each reviewable checkpoint, update the PR body or add a concise PR comment with this **evidence-based handoff**:

```text
Outcome: <user-visible behavior and acceptance status>
Repo / branch / base: <repo>, <branch>, <base SHA or parent PR>
Current HEAD: <commit SHA>; local | pushed | PR opened | merged | deployed | verified
PR / preview: <links or "not available">
Changed: <important surfaces and design choices>
Proof: <commands + results; manual/negative tests; screenshots when relevant>
Risks / blockers: <specific problem, exact failure, remaining uncertainty>
Next action: <one actionable decision or engineering step, with owner>
```

Use truthful status labels:
- **Local:** Exists only in the working copy or local Git.
- **Pushed:** The exact commit exists on GitHub.
- **PR opened:** The branch is represented by a linked PR.
- **Merged:** GitHub confirms the PR merged into the target branch.
- **Deployed:** A named environment has the target commit.
- **Verified:** The required behavior was checked on that named environment.

Do not say "done" when the deliverable is only local. Do not omit failing checks or hide blockers behind a long activity log. If blocked by access, missing credentials, broken CI, or an external service, complete safe independent work, then stop at the affected boundary with the exact needed action. No repeated blind retries.

## Review and completion contract

A reviewer checks acceptance evidence, security and data boundaries, regressions, scope creep, deployment impact, and the difference between code state and production state. Feedback must name the observed risk and a testable fix, not just give a vague approval.

A lake is code-complete when the work is on a remote branch, has a reviewable PR, required checks and review evidence are recorded, and known limitations are explicit. It is release-complete only after authorized merge, deployment, and the required production verification. Never conflate the two.

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
