# HelloDev Core Concept — Teaching Reference

> **Authoritative Source**: Core concepts and execution paths follow [SKILL.md](../../SKILL.md) and [state-protocol.md](state-protocol.md).
> This file is a teaching reference providing HelloDev's design philosophy and panoramic view.

## Core Model

HelloDev is a **loop with rollback**, not a linear flow.

```
Bootstrap -> Initialization -> Requirement -> Tool Research -> Feature Design -> Architecture -> Prototype -> Implementation -> Testing -> Review -> Ship -> Learn -> Evolution -> Reflection -> Archive
```

  PASS  -> proceeds through the four mandatory post-delivery stages
  FAIL  -> ROLLBACK to the failed stage

**Full Flow has 15 stages — the only chain; design stages are skipped only via recorded, user-approved `state.js skip`.**

## Three Key Principles

| Principle | Description |
|------|------|
| Review gate | Cannot Ship without passing Review |
| Failure rollback | Rollback to the failed stage on any stage failure |
| Experience accumulation | Extract experience after each loop |

## Stage Overview

| Stage | Purpose | Path | Skippable? |
|------|------|------|---------|
| Bootstrap | Initialization, check context | all | No |
| Initialization | Scope survey and coarse decomposition | all | No |
| Requirement | Answer all key questions | all | No (unless user already confirmed or gave explicit execution authorization) |
| Feature Design | Feature detail design | all | Yes (via recorded user-approved skip) |
| Tool Research | Technology selection when needed | all | Yes (via recorded user-approved skip) |
| Architecture | Requirements-based design | all | Yes (via recorded user-approved skip) |
| Prototype | Interleaved UX+UI convergence with a runnable prototype | all | Yes (via recorded user-approved skip) |
| Implementation | Code implementation | all | No |
| Testing | Real environment verification | all | No |
| Review | Consistency check | all | No |
| Ship | Delivery | all | No; no release without approval |
| Learn | Capture knowledge cards, decision reviews, error learnings | all | No |
| Evolution | Pattern extraction and improvement candidates | all | No |
| Reflection | Agent self-evaluation of execution quality | all | No |
| Archive | Permanent storage, index update, loop closure | all | No |

## Path Selection

| Complexity | Score | Path | Description |
|--------|------|------|------|
| Simple | <=5 | Fast Path | Scope survey: single logical change unit, 1 file, de-duplicated <50 lines, no deps (this is the scope survey's lower-bound evidence, not a standalone threshold; the escalation criterion and the module-root definition of "spans business modules" are defined once in [escalation.md](task/escalation.md), section "Change-complexity checkpoint"; [SKILL.md](../../SKILL.md) only cites that section)) |
| Medium | 6-20 | Full Flow | Feature development |
| Complex | 21+ | Full Flow | Architecture changes, may need decomposition |

**Note**: There is no "Standard Path". All non-trivial tasks use Full Flow.

See [full-flow.md](../paths/full-flow.md) for details.
