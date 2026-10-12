# Stage 4: Architecture - One Decision at a Time (Mandatory User Questioning)

> Execution boundaries follow [SKILL.md](../../SKILL.md) and [State Protocol](../core/state-protocol.md). Below is the on-demand teaching and check material; not required to execute all examples, create irrelevant deliverables, or repeat already-confirmed questions.

## Hard Rule: Architecture Decisions Require the User

**This stage is a questioning stage, not a drafting stage.** Every architectural decision is put to the user, one at a time, and no decision is recorded as made until the user answers. The agent must not decide architecture on its own, must not batch decisions into a questionnaire, and must not treat silence, timeout, or tool unavailability as an answer.

1. **One question at a time.** Ask exactly one question, then wait for a real reply before the next.
2. **Recommendation before every question.** State the recommended answer and the reasoning first; the user confirms, corrects, or rejects. The user is never asked to invent an answer from nothing.
3. **Record the user's answer verbatim.** The answer is the evidence; paraphrase loses the basis.
4. **Answer facts yourself.** Anything resolvable by reading the codebase, specs, or configuration is resolved with Read/Grep instead of spending a user turn.
5. **Questioning follows the `grill-me` discipline.** Model the decisions as a tree, walk branches in dependency order (most foundational first), resolve each branch to completion before opening the next.
6. **Stop when the tree is closed.** The session ends when every branch is resolved and no "it depends" answers remain; close with a one-paragraph summary of the decisions actually made.

## Teaching Goal

By the end of this stage, you will:

- Understand the reasoning behind each architectural choice, because you made each choice yourself after hearing the recommendation
- Have an architecture document whose every decision traces back to one of your answers
- Be able to explain why each choice was made

---

## How This Works

```markdown
 THE CONVERSATION FLOW

 STEP 1: I recommend and ask ONE question
 "Recommendation: ... because ... Question 1 of N: ..."

 STEP 2: You answer (confirm / correct / reject)

 STEP 3: I record your answer verbatim and confirm
 "Got it — recorded: [your words]. Next question..."

 STEP 4: Repeat until the decision tree is closed

 STEP 5: Generate document from your recorded answers
 "Based on all your answers, here is our architecture"
```

---

## Current Status

```
 ARCHITECTURE DECISIONS - IN PROGRESS

 [ ] Decision 1: Frontend/Backend Split
 [ ] Decision 2: Frontend Framework
 [ ] Decision 3: Data Storage
 [ ] Decision 4: State Management
 [ ] Decision 5: Component Structure
 [ ] Decision 6: API Design

 Progress: 0 / 6 completed
```

---

## Decision 1: Frontend/Backend Split

### The Question

```markdown
## Question 1 of 6: Do you need multiple frontends?

**My recommendation**: Scenario B (one website) — the scope survey reports a web-facing
tool with no mobile or desktop deliverable, and a second frontend now would multiply
every later decision (state sync, auth, packaging) for a capability nobody asked for.

**Scenario A: "Yes"**
> You need a website, a mobile app, AND maybe a desktop app - all sharing the same data.

**Scenario B: "No"**
> Just one website, no plans for mobile or desktop.

**Scenario C: "Not sure"**
> Maybe someday, but not now.

---

**Your answer**: [A / B / C]

Or in your own words: [Tell me about your situation]
```

---

## After Your Answer

Once you respond, I will:

1. **Record your answer verbatim**
2. **Explain why this matters**
3. **Show what this means for the next question**
4. **Ask the next question** (with a recommendation)

---

## Our Discussion So Far

```markdown
## Discussion Log

| # | Question | Your Answer | Recorded |
|---|----------|-------------|----------|
| 1 | Frontend/Backend Split | [pending] | [ ] |
| 2 | Frontend Framework | [pending] | [ ] |
| 3 | Data Storage | [pending] | [ ] |
| 4 | State Management | [pending] | [ ] |
| 5 | Component Structure | [pending] | [ ] |
| 6 | API Design | [pending] | [ ] |

---

### Detailed Notes

**Decision 1: Frontend/Backend Split**
- Your answer: [will be filled in]
- What this means: [will be explained based on your answer]
- Reasoning: [your explanation]
```

---

## Ready?

**Let's start with Question 1.**

Just tell me your situation regarding frontend/backend split:
- Do you need both website AND mobile app?
- Or just a website for now?
- Or something else?

Your answer doesn't have to be technical - just describe what you're thinking about building.

---

## Relationship to the Module Approval Gate

Questioning and the state-machine gate are two independent layers:

- **This document** constrains *behavior*: one question at a time, recommendation first, verbatim answers, no self-decided architecture.
- **State Protocol** constrains *evidence*: `stage architecture completed` requires at least one module this round, submitted and approved with real evidence (`scripts/state.js module <id> submitted|approved`).

Both must hold. A module approved without the underlying decision having been asked (this document's rule) is an approval whose basis cannot be audited; a fully-asked conversation that never records `module ... approved` cannot complete the stage. Modules submitted in feature-design may be carried here, but every registered module must be resubmitted and approved in this round's attempt — old approvals do not survive a rollback into this stage.

## Stage Deliverables

| Deliverable | Template | Description |
|--------|------|------|
| Architecture design document | [architecture-template.md](../../references/architecture-template.md) | Standard structure for architecture docs; quality must not be lower than this template; every decision section cites the user's recorded answer |
| Interface design | [api-design-template.md](../../templates/api-design-template.md) | Interface contract, error codes, examples |
| Rollback plan | [rollback-plan-template.md](../../templates/rollback-plan-template.md) | Required for high-risk changes |
