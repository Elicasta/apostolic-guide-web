# Sol 2.0: Operating Assistant + Grokbot Workbench

**Status:** product plan only  
**Repo:** `Elicasta/apostolic-guide-web`  
**Baseline branch:** `integration/ag-unified-20261006`  
**Owner:** Eli Castaneda  
**Date:** 2026-10-07

## Product sentence

**Sol watches Apostolic Guide, decides what private work should happen next, prepares it, explains it, asks Eli for public decisions, executes what he approves, verifies the result, and keeps moving. Grokbot gets its own Studio workbench so it can operate Apostolic Guide through structured commands instead of clicking through the admin UI.**

---

## 1. What Sol 2.0 is

Sol is both:

1. **An assistant** Eli can talk to inside Studio.
2. **A background worker** that continues useful private work when Eli is away.

Sol should not wait for Eli to invent every next task. It should understand what is coming up next, what is missing, what is blocked, and what should be prepared.

### Private work Sol may do automatically

- inspect current Studio state
- reconcile stale/duplicate/incomplete work
- prioritize next tasks
- draft carousel topics
- build carousels
- render previews
- prepare captions
- create article drafts
- create Instagram automation drafts
- prepare journey drafts
- organize the content calendar
- build a mock Instagram feed
- analyze Pathway coverage
- retry safe internal jobs
- prepare morning/evening briefings
- surface failures and expiring reply windows

### Public-effect rule

Anything that creates a public external effect waits for Eli's explicit signed-in approval.

Examples:
- publishing or scheduling a social post
- sending a DM, reply, broadcast, or public comment
- publishing an article
- activating an Instagram automation
- activating a journey
- enrolling a person in a journey

Sol prepares. Eli approves. Sol executes. Sol verifies.

---

## 2. Explicitly removed from this roadmap

Sol 2.0 does **not** depend on or add:

- MCP
- MCP tools/resources/events
- external MCP direct commits
- fixed design constraints, palettes, Look repetition rules, or rigid template rotations
- AI-disclosure or AI-label workflows
- doctrine logic built around forbidding discussion of particular theological vocabulary

Existing dormant MCP-related code may remain temporarily if harmless, but it is not part of Sol 2.0 and should not drive the architecture.

Doctrine/content checking should focus on:
- fidelity to approved Apostolic Guide source material
- accurate Scripture references and quotations
- avoiding invented claims
- traceability to the source being taught

---

## 3. The operating loop

**Observe → reconcile → prioritize → prepare → review → approve → execute → verify → learn**

### Observe
Read current Apostolic Guide state from canonical Studio services.

### Reconcile
Do not count stale, failed, duplicate, or superseded work as complete.

### Prioritize
Rank what should happen next using:
- publishing gaps
- Pathway coverage gaps
- approved projects waiting on production
- deadlines
- expiring communication windows
- failed jobs
- owner priorities
- dependencies
- recent outcomes

Every task has a plain-language reason.

### Prepare
Sol performs private work autonomously.

### Review
Public effects become approval cards.

### Approve
Eli approves, edits, declines, or asks Sol to redo.

### Execute
Only the approved effect executes.

### Verify
Sol confirms the actual result.

### Learn
Sol may improve planning from Eli's decisions and observed outcomes, with lasting preferences visible and reversible.

---

## 4. Sol Home: the page should move

The Sol page becomes a live operating room instead of a static dashboard.

### Motion should communicate real state

Use restrained, meaningful motion:
- active tasks visibly progress through stages
- approval cards enter when work becomes ready
- priority cards reorder smoothly when state changes
- progress indicators animate during real jobs
- the activity timeline updates without a hard refresh
- the feed mockup updates as proposals change
- workers switch between queued, running, waiting, failed, and complete visibly
- success/failure states transition clearly
- Sol's assistant panel can expand/collapse while preserving context

Avoid motion that is only decorative.

### Main sections

**Now**
- what Sol is doing
- what changed
- failures
- current worker state

**Approvals**
- public effects waiting for Eli
- expiring decisions
- batch review

**Next**
- ranked private tasks
- why each task matters
- reprioritization controls

**Content**
- proposed topics
- carousels in progress
- feed mockup
- calendar

**Pathways**
- coverage and gaps

**Automations**
- proposed Instagram automations
- active automations
- keyword conflicts

**Activity**
- Sol actions
- jobs
- approvals
- execution results

---

## 5. Approval Inbox

Route: `/admin/approvals`

Every public-effect card shows:
- what Sol wants to do
- topic/title
- Pathway/source
- why Sol chose it
- finished preview
- exact caption/message/automation behavior
- Scripture references if used
- proposed schedule/recipient behavior
- exact public effect after approval

Actions:
- Approve
- Edit
- Redo
- Not now
- Decline

### Fresh execution check

A card can wait for days.

When Eli taps Approve, the server re-checks:
- current source/content hash
- owner/session permission
- reply window if relevant
- schedule availability
- Scripture/reference state
- duplicate execution protection
- whether the proposed effect already happened

If anything meaningful changed, the card returns to review instead of executing stale work.

### Batch approval

Batch approval checks each item independently. One stale item does not block valid items.

---

## 6. Background worker and durable task queue

Sol keeps moving with Studio closed.

Each task should know:
- task type
- source
- priority
- reason
- dependencies
- stage
- current artifact
- attempt count
- public/private class
- approval state
- next allowed action
- last error
- timestamps

### Idempotency

Repeated scans must not create:
- duplicate carousels
- duplicate plans
- duplicate Instagram automations
- duplicate approvals
- duplicate public effects

### Stop Sol

Existing Stop Sol remains first-class:
- blocks new mutation work
- cancels eligible queued/running work
- revokes pending short-lived execution approvals
- keeps read-only intelligence available

---

## 7. Topic planner

Sol proposes what Apostolic Guide should teach next.

Each proposed topic includes:
- title/topic
- Pathway
- teaching goal
- why now
- source material
- intended channel(s)
- what coverage gap it fills
- possible CTA/follow-up
- what Sol expects to produce after approval

There are **no fixed design rotation rules**.

Eli approves the topic/direction. Sol chooses a fitting visual treatment from current AG capabilities and can be told to redo it.

### Rolling plan

Maintain a rolling two-week plan.

Sol may revise it when:
- a better teaching opportunity appears
- something is blocked
- Eli changes direction
- performance suggests a useful change
- a dependency shifts

Every plan change should have an explanation.

---

## 8. Carousel worker

Pipeline:

**Topic → source → copy → Scripture/source verification → frames → rendered preview → feed preview → approval**

Sol should be able to produce a complete reviewable carousel without Eli assembling every frame.

Requirements:
- faithful to approved source material
- accurate Scripture references/quotes
- coherent frame progression
- useful final CTA/next step
- rendered preview saved to the project
- editable before approval

Visual direction is flexible. No rigid palette or Look engine belongs in policy.

---

## 9. Mock Instagram feed

Sol builds a feed preview from:
- recent real Instagram posts
- already-approved/scheduled posts
- proposed posts

Eli should be able to understand:
- how the feed will look
- what topics are repeating
- what is coming next
- whether the order feels right

Eli can reorder, replace, or reject a proposed slot.

Sol updates the plan and explains the consequence.

---

## 10. Instagram automation planner

Sol connects content and Pathways to useful keyword automations.

For a Pathway/post, Sol proposes:
- keyword
- reason for the keyword
- trigger/CTA
- first DM
- linked Pathway/resource
- follow-up behavior
- conflicts with current keywords

Examples:
- Holy Ghost teaching → `SPIRIT`
- God Is One teaching → `ONE`

Keywords are generated from actual content and user intent, not a static list.

Sol creates the automation as a **draft**.

The Approval Inbox shows the exact behavior.

Eli's approval activates it.

---

## 11. Pathway operating health

Every Pathway should have one canonical view of:
- Scripture/source
- teaching copy
- audio
- video
- carousel
- article
- social content
- Instagram automation/keyword
- journey where applicable
- completion analytics

Use one resolver per domain so Sol, UI, analytics, and other pages cannot disagree.

Sol uses the gaps to create its own next private tasks.

---

## 12. Inbox and communications

Sol may automatically:
- classify new messages
- detect reply-window deadlines
- group spam/noise
- prepare ordinary informational drafts
- connect a question to a Pathway
- surface useful history/context
- remind Eli about waiting threads

Pastoral, grief, crisis, deeply personal, or ambiguous sensitive messages are escalated to Eli.

Sending/replying remains a public effect and waits for approval.

---

## 13. Blog and content families

One approved teaching can produce:
- carousel
- Instagram caption
- Threads drafts
- reel/teleprompter script
- blog article
- email draft
- Direct Answer
- automation suggestion

Children remain independently editable/reviewable.

Sol avoids regenerating work that already exists and is current.

---

## 14. Briefings and learning

### Morning
- approvals
- failures
- urgent communications
- today
- next work

### Evening
- what went live
- what Sol completed privately
- what is waiting
- failures
- tomorrow/next

### Weekly
- content output
- performance
- Pathway progress
- automation performance
- delayed approvals
- recommendations

Use cautious language about causality.

Sol may learn preferences from:
- approvals/declines
- Eli's edits
- repeated owner directions
- observed performance

Long-term preferences remain visible and reversible.

---

# 15. Grokbot Workbench

Route: **`/admin/grokbot`**

This is a dedicated Studio sandbox for Grokbot.

The purpose is to let Grokbot work on Apostolic Guide without navigating through every admin page or pretending it has an operating-system shell.

It is a **domain terminal** over the same application services used by Studio.

## 15.1 The workbench layout

### A. Command Terminal

Large terminal-like interaction area.

Examples:

```
status
what needs attention
show pathway Jesus Is God
plan next 14 days
propose 5 carousel topics
create carousel --pathway god-is-one --topic "Why Deut 6:4 matters"
preview feed
draft automation --pathway god-is-one
show approvals
show failed jobs
open project <id>
```

Natural language should also work:

> Build me three carousel ideas from the Pathways that need content most.

> Show me what is blocking next week.

> Take this image and use it as a reference for the Jesus Is God carousel.

The terminal is not an arbitrary server shell. Every operation maps to a registered Apostolic Guide action.

### B. Action Registry

Every important Studio button/action should have one structured action behind it.

Examples:
- inspect Pathway
- create/edit carousel project
- render carousel
- upload/reference media
- create content plan
- modify plan
- create article draft
- create automation draft
- inspect publishing state
- inspect analytics
- inspect inbox
- retry safe job
- submit public effect for approval
- inspect approval status

The normal admin UI and the Grokbot Workbench should call the **same domain services**.

Do not duplicate business logic in a Grok-only API.

### C. File and Image Drop Zone

Grokbot needs a place to receive and work with:
- uploaded images
- screenshots
- reference art
- PDFs/docs if supported
- captions/text files
- video/graphic references

Uploads become private Studio assets first.

From the Workbench, Grokbot can:
- inspect the asset
- tag it
- attach it to a Pathway/project
- use it as a carousel reference
- add it to a plan
- hand it to existing image/creative workflows

No upload becomes public automatically.

Reuse the existing Pathway Asset/Creative Project storage and upload services where possible.

### D. Planning Desk

A persistent planning panel where Grokbot can:
- create a 2-week plan
- edit priorities
- stage topic ideas
- group work into campaigns/content families
- set dependencies
- see upcoming dates
- explain why each item exists
- save plan revisions

The plan should survive browser sessions.

### E. Scratch / Sandbox

A private workspace for experiments:
- draft copy
- alternate hooks
- temporary outlines
- rough visual ideas
- test carousel variants
- draft automation copy

Sandbox work is not treated as canonical content.

Promoting an item out of the sandbox creates or updates a real Studio draft.

### F. Preview Dock

One place to preview:
- carousel
- feed
- article
- automation message
- caption
- Pathway destination
- uploaded image/reference
- public-effect summary

Grokbot should be able to work through a task without opening five different tabs.

### G. Run Log

Every command shows:
- what Grokbot asked for
- what structured action ran
- whether it changed private state
- resulting IDs/links
- errors
- approval requirement
- execution time

This becomes the audit-friendly equivalent of a terminal transcript.

---

## 15.2 Grokbot session model

A Grokbot workspace session should have:
- session ID
- owner/user
- current project/Pathway context
- active plan
- uploaded assets
- scratch artifacts
- recent commands
- selected objects
- open task IDs

This lets Grokbot maintain context while operating.

The Workbench should make it easy to say:

> Continue the plan we were working on yesterday.

without reconstructing the whole session.

---

## 15.3 Permissions

The Workbench does **not** bypass Studio permissions.

Grokbot can:
- read allowed Studio state
- create private drafts
- edit private drafts
- upload private assets
- prepare plans
- run safe internal checks
- submit public effects to the Approval Inbox

Grokbot cannot directly:
- publish
- send DMs/replies
- activate automations
- activate journeys
- enroll people
- bypass owner approval
- change credentials/roles
- perform arbitrary database operations
- execute operating-system commands

The Workbench is powerful because it exposes the product cleanly, not because it bypasses the product.

---

## 15.4 Why this replaces clicking around

Today an assistant must conceptually know:

> go to Pathways → inspect state → go to Carousel Studio → create project → go to Publishing → inspect feed → go to Automations → create draft → go to approvals...

With the Workbench:

```
> prepare campaign for /god-is-one for next week
```

The command resolver decomposes it into registered domain actions and displays the resulting plan.

Grokbot can then drill in:

```
> show carousel 2
> replace frame 1 hook
> attach uploaded-image-7 as reference
> rerender
> show feed
> submit carousel 2 and automation ONE for approval
```

That is the intended experience.

---

## 15.5 Grokbot command architecture

Use a central command registry, for example:

```
src/lib/operator/actions/*
src/lib/operator/registry.ts
src/lib/operator/execute.ts
```

Each action declares:
- name
- description
- input schema
- required Studio permission
- private/public classification
- whether owner approval is required
- service handler
- output schema
- audit behavior

Examples:

```
workspace.status
pathway.inspect
content.plan.create
content.plan.update
carousel.create
carousel.render
asset.upload
asset.attach
feed.preview
automation.draft
inbox.inspect
job.retry
approval.submit
approval.status
```

Buttons in the normal Studio UI should gradually reuse the same registry/services.

This makes Grokbot's terminal an alternate interface to Apostolic Guide rather than a separate implementation.

---

# 16. Observability

Every Sol task and Grokbot command should answer:

**Why did this happen?**

Show:
- trigger/state
- priority reason
- source
- dependencies
- check results
- action
- resulting artifact
- approval state
- execution/verification result
- model/cost information where available

---

# 17. Data strategy

Extend existing `sol_operator_*`, `sol_agent_*`, editorial, publishing, Pathway, asset, and audit systems before creating parallel ones.

Potential additive concepts:
- task reason/priority/stage/dependencies
- public-effect approvals
- approval batches
- execution hashes
- plan revisions
- content-family relationships
- Instagram automation proposals
- Pathway health snapshots
- briefing snapshots
- owner preference/feedback records
- execution verification
- Grokbot workspace sessions
- Grokbot scratch artifacts
- Grokbot command/run records

Write migrations are additive and tested against Preview/staging first.

---

# 18. Build order

## Batch 0 — Finish unified baseline

- recover or explicitly supersede missing Sol local commits `04359be`, `7711357`, `e72ab1c`
- apply Sol guardrail migrations to Preview only
- signed-in Sol/Studio E2E
- keep Production unchanged until approved

## Batch 1 — Sol page alive

- mount/restore assistant surface
- rebuild `/admin/sol`
- live task activity
- animated real stages
- workers/queue
- next work
- Stop Sol
- mobile-first

## Batch 2 — Operator action registry + Grokbot Workbench foundation

- shared structured action registry
- `/admin/grokbot`
- command terminal
- natural-language command interpretation
- run log
- persistent session context
- private-only command execution initially

Acceptance:
- Grokbot can inspect workspace/Pathways/projects without clicking around
- a terminal command invokes the same service as the equivalent admin function
- commands are audited
- no public effect can execute

## Batch 3 — Grokbot assets + planning sandbox

- image/file uploads
- asset attachment
- scratch artifacts
- Planning Desk
- plan revisions
- Preview Dock

Acceptance:
- upload an image from the Workbench
- attach it to a carousel/project
- create a 2-week plan
- save and reopen the session
- preview work without navigating away

## Batch 4 — Autonomous Sol private operating loop

- durable reconciler
- ranked tasks
- reason generation
- dependencies
- autonomous private preparation
- retries/idempotency

## Batch 5 — Approval Gateway and Inbox

- `/admin/approvals`
- stale checks
- mobile owner approval
- batch review
- execution verification
- notifications

The Grokbot Workbench can now use `approval.submit`, but still cannot execute public effects directly.

## Batch 6 — Topic planner + carousel worker + feed mockup

- topic proposals
- reasons
- carousel production
- renders
- real/scheduled/proposed feed
- reorder/replace

## Batch 7 — Instagram automation planner

- keyword suggestion
- trigger/DM draft
- conflict detection
- draft creation
- approval activation

## Batch 8 — Pathway health

- canonical status resolvers
- health board
- coverage-driven work generation

## Batch 9 — Communications

- triage
- reply timers
- draft replies
- sensitive escalation
- approval send

## Batch 10 — Blog + content families

## Batch 11 — Reports + governed learning

---

# 19. Success criteria

Sol 2.0 works when:
- Eli does not need to remember the next operational task
- Sol keeps useful private work moving while Eli is away
- the Sol page visibly reflects live work
- public effects reliably wait for Eli
- Sol proposes carousel topics and explains why
- approved topics become finished carousel drafts
- posts appear in a mock feed before approval
- Instagram automations are proposed from actual content/Pathways
- Pathway status is consistent
- failures surface automatically
- Sol verifies execution
- duplicate/stale work declines

The Grokbot Workbench works when:
- Grokbot has one place to operate AG
- it can inspect most admin state without page hopping
- it can upload reference images/files
- it can build and persist plans
- it can create/edit private drafts
- it can preview results
- it can submit public work for Eli's approval
- every command maps to an authorized structured action
- every run is visible/auditable
- it never becomes an arbitrary shell or bypasses Studio safety
