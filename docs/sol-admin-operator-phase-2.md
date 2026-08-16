# Sol Admin Operator Phase 2

Sol is the persistent operations copilot inside Apostolic Guide Studio. Phase 2 keeps the original three operating modes and makes each mode materially different without turning the assistant into browser automation.

## Outcome

Sol can now stay available across `/admin`, understand which Studio surface is open, read the canonical operator snapshot, explain what needs attention, scan for missing production work, run registered recipes, and report progress.

The floating control is a viewport-fixed sidecar. The admin page remains usable on desktop while Sol is open. On mobile, Sol becomes a contained sheet with its own scroll and safe-area handling.

## The three modes

| Mode | Behavior |
| --- | --- |
| Watch | Scans, reasons, and reports. It never starts work. |
| Assist | Starts registered work only after an authorized admin approves it. |
| Trusted | After a scan, may auto-run only server-allowlisted `safe_draft` recipes. Review-required and external-effect work still waits for approval. |

Trusted is intentionally narrow. The first autonomous recipe is `journey_automation_draft`, which creates disabled automation and draft journey records and stops before activation or enrollment.

## Trusted auto-run policy

Autonomous execution must pass every condition below:

1. Sol is enabled.
2. Sol mode is `trusted`.
3. The proposal is still `pending`.
4. Proposal risk is exactly `safe_draft`.
5. The recipe is in the server-side Trusted allowlist.
6. Current run capacity allows another Trusted proposal.
7. The proposal can be atomically claimed from `pending` before runs are created.

Current Trusted allowlist:

```text
journey_automation_draft
```

`audio_to_youtube` and `carousel_topic_pack` remain review-required and cannot be started autonomously by Trusted mode.

## Hard locks

Phase 2 does not weaken these controls:

- No live publishing by Trusted mode.
- No automatic activation of social automations.
- No automatic journey enrollment.
- No outbound messaging from Sol.
- No destructive source-media operations.
- No canonical Pathway doctrine edits through Sol.
- No arbitrary database mutation outside registered recipes.

## No click automation

Sol does not simulate mouse clicks or inspect the DOM to operate Studio.

That is intentional. Browser-click automation is fragile, difficult to audit, and can mutate the wrong object after a UI change. Sol instead calls typed admin actions and registered server recipes. A successful action has an ID, a stored run, a status, steps, result data, and an event history.

The robot avatar itself has `pointer-events: none`. The launcher button owns the entire click target, so clicking the robot graphic reliably opens Sol without adding a second invisible interaction layer.

## Current-screen context

`src/sol-admin-context.ts` maps admin routes to trusted server-known context such as:

- Studio Overview
- Sol Operator
- Pathway Asset Editor
- Pathway Publishing
- Pathway Audio
- Video Studio
- Video Producer
- Carousel Studio
- Pathway Assets
- Content Calendar
- Social Automations
- Comment Guide
- Channel Publishing
- Analytics
- Growth Hub
- People
- Inbox
- Journeys
- System Health

The browser submits only the current pathname. The API rebuilds the surface context on the server. Client-provided labels or capability claims are never trusted.

Route context helps Sol explain the current screen and choose useful prompts. It does not grant execution permission.

## Sidecar behavior

Desktop:

- Fixed to the viewport, not the page scroll container.
- Top and bottom are pinned, so the assistant cannot drift offscreen.
- Only the middle content region scrolls.
- Chat remains visible at the bottom of the sidecar.
- The underlying admin stays interactive.
- The launcher is removed while the sidecar is open.

Mobile:

- The sidecar fills the safe viewport with an 8px inset.
- A backdrop closes Sol.
- Body scrolling is locked while Sol is open.
- Internal content remains independently scrollable.
- Escape closes the sidecar on hardware keyboards.

## Admin chat contract

Sol chat may:

- explain the current admin surface;
- summarize pending, active, waiting-review, failed, and KPI state;
- request a scan;
- switch between Watch, Assist, and Trusted;
- approve only proposal IDs supplied by the current server snapshot;
- dismiss supplied proposal IDs;
- preserve user requirements as execution constraints.

Sol chat may not claim that it clicked UI controls, changed arbitrary fields, or completed an action that the run ledger has not confirmed.

## Adding a future autonomous recipe

Do not make Trusted more permissive by changing prompt text alone.

A new autonomous recipe requires all of the following:

1. A typed `SolRecipeKey`.
2. Deterministic proposal evidence.
3. Registered execution steps.
4. A clear stop condition.
5. A `safe_draft` risk classification that is defensible even if the LLM output is wrong.
6. No live publishing, external messaging, enrollment, deletion, or activation side effect.
7. Explicit addition to `TRUSTED_AUTO_RECIPE_ALLOWLIST`.
8. Tests proving review-required and external-effect work cannot enter the Trusted lane.

If a recipe can affect a real audience or permanently alter canonical content, it should stay out of Trusted auto-run until a separate approval model exists for that side effect.

## Validation

Phase 2 tests cover:

- trusted route-to-surface context;
- pathname sanitization;
- safe-draft allowlisting;
- rejection of review-required work;
- rejection of external-effect work;
- active-run capacity;
- Trusted priority ordering;
- existing Sol proposal generation and theology gates.

Manual acceptance test:

1. Open any `/admin` page and click anywhere on the robot launcher.
2. Scroll the admin page with Sol closed, then open Sol and verify its viewport position is unchanged.
3. Open Sol on desktop and keep using the underlying admin.
4. Confirm the current-screen card matches the route.
5. Switch Watch → Assist → Trusted and verify only those three modes exist.
6. In Watch, confirm proposal run buttons are disabled.
7. In Assist, approve one review-required proposal and verify it enters the run ledger.
8. In Trusted, scan with a pending journey safe draft and verify it runs automatically.
9. In Trusted, scan with a video or carousel review proposal and verify it remains pending.
10. On mobile, verify the panel stays inside the safe viewport and its center content scrolls without moving the page behind it.
