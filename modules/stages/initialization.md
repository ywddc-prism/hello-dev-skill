# Stage 2: Initialization - Scope Survey & Coarse Decomposition

> The session's first planning step. Identify what this work is made of and what can run in
> parallel, before any requirement confirmation or design decision.

## Position

Mandatory on **every** state-bearing task (the full chain is the only route; `other` tasks included). It sits
between [bootstrap](bootstrap.md) and [requirement](requirement.md) and is deliberately **not** a
design-only stage: knowing the shape of the work is a precondition of planning, not a consequence
of it.

```
Bootstrap -> Initialization -> Requirement -> [design stages] -> Implementation -> ...
```

## Why This Stage Exists

Two failures motivated moving planning to the front of the session:

1. **Parallelism discovered too late.** When the work is not split until immediately before
   Implementation, every earlier stage (requirement, design) runs serially with no shared picture
   of which parts are independent. The dependency topology is knowable much earlier — it comes
   from the scope, not from the design.
2. **The stage list itself drifted.** Because the plan was produced late and restated in several
   documents, the "what can run concurrently" answer was recomputed per stage and per document,
   and disagreed with itself.

The stage therefore produces a **coarse** plan early and hands the **fine** plan to
[requirement](requirement.md). See [decomposition.md](../core/task/decomposition.md) for the full
two-level contract.

## Deliverables

| Checkpoint | What it records |
|------------|-----------------|
| `Scope survey` | Affected files, logical change units, business-module roots, and whether any undecided design point exists |
| `Coarse decomposition plan` | The coarse units and their dependency order, written to `coarseDecomposition` |

```bash
node scripts/state.js stage initialization in_progress
node scripts/state.js checkpoint "Scope survey" pass --reason "affected files / change units / module roots / design points"
node scripts/state.js checkpoint "Coarse decomposition plan" pass --reason "coarse units and their dependencies, listed with the files each one touches"
node scripts/state.js stage initialization completed
node scripts/state.js stage requirement in_progress
```

## Scope Survey (the four required outputs)

Before any path decision, produce all four. A missing item means the survey is not finished:

| Output | Meaning |
|--------|---------|
| Affected-file list | Every file this work will create or modify |
| Logical change units | How many independently meaningful changes there are (**not** the file count) |
| Spans business modules? | Judged mechanically by module root — see [escalation.md](../core/task/escalation.md) |
| Undecided design point? | Any decision that must be settled before implementation can start |

The escalation and decomposition criteria both consume this output. They are two different
questions with two different thresholds, defined once in
[escalation.md](../core/task/escalation.md), section "Change-complexity checkpoint".

## Coarse Decomposition

Register the coarse units — this is the plan, not the schedule:

```bash
node scripts/state.js decompose --coarse true --tasks '[
  {"id":"c1","name":"State machine core","depends":[]},
  {"id":"c2","name":"Documentation","depends":["c1"]}
]'
```

The coarse plan answers **which units exist and in what order**. It does not answer which files
each unit touches or which wave it lands in — that is the fine plan.

### Coarse vs Fine, precisely

| | Coarse (this stage) | Fine ([requirement](requirement.md)) |
|---|---|---|
| Field | `coarseDecomposition` | `decomposition` |
| Unit granularity | Work areas ("state machine core", "documentation") | Independently verifiable subtasks |
| Declares `affectedFiles` | Optional | **Required** (drives file-conflict detection) |
| Drives sub-agent dispatch | **No** | Yes — parallel waves must be dispatched |
| Gate that reads it | None | `stage implementation completed` |

**No dispatch obligation.** The mandatory-dispatch gate reads `decomposition.dispatches` only. A
coarse wave marked `parallel` is a statement of intent about concurrency, not an instruction to
spawn sub-agents; nothing is blocked if it is never dispatched.

**No scope confirmation.** This stage surveys and plans; it does not confirm the goal, the scope,
or the authorization basis. Silence here is not consent, and nothing in this stage may be recorded
as user approval. The overall goal and scope are confirmed in
[requirement](requirement.md) via `Requirement confirmed`.

## What This Stage Must Not Do

- **Do not guess the scope.** The coarse units must come from files actually read, not from the
  request's wording. If the survey cannot be completed, record `warn` and say what is missing.
- **Do not treat the coarse plan as approved scope.** It is a hypothesis about structure that
  requirement may overturn; re-decomposing after requirement is expected, not a failure.
- **Do not skip it.** The stage runs in condensed form for small changes, but it is mandatory
  on every state-bearing task; there is no short path around it. What shrinks is the ceremony,
  not the stage.
- **Do not write the fine plan here.** If a unit already has a file list and a wave number, it
  belongs in requirement, not initialization.

## Completion

```bash
node scripts/state.js stage initialization completed
```

Completing it requires both checkpoints (`Scope survey`, `Coarse decomposition plan`) to be `pass`
in the current round. Next stage is always [requirement](requirement.md).
