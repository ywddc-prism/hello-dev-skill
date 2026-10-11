# Stage: Reflection - Agent Self-Evaluation

> Mandatory stage after Evolution. The agent evaluates its own execution quality and generates actionable improvement recommendations. This is **not** user self-assessment — it is the agent reflecting on what it did well, where it went off track, and how it can improve.

## Purpose

After delivery (Ship), the agent reviews its own performance across this loop:
- Decision quality (scope confirmation, decomposition choices, wave ordering)
- Execution efficiency (unnecessary retries, wasted context, redundant reads)
- Risk management (risks identified vs missed, verification coverage)
- Evidence quality (were all checkpoints backed by real evidence?)

## Stage Overview

```
REFLECTION Stage (Agent Self-Evaluation)

 1. [Execution Review]  → 2. [Quality Assessment]  → 3. [Improvement Plan]
       ↓                         ↓                          ↓
  What happened            How well did it go         What to do differently
       ↓                         ↓                          ↓
 4. [Write Reflection to Memory]
```

## Step 1: Execution Review

Review the factual record from state.json checkpoints, dispatches, and history:

```markdown
## Execution Review

**Stages executed:** [list of stages in this path]
**Total checkpoints:** [N] pass, [N] warn, [N] fail
**Retries:** [N] (limit: [N])
**Sub-agent dispatches:** [N] waves dispatched, [N] waived
**Rollbacks:** [list any rolled_back stages]
**Blocked periods:** [list any block/unblock events]
```

## Step 2: Quality Assessment

Evaluate across five dimensions, using evidence from the execution record:

| Dimension | Rating | Evidence |
|-----------|--------|----------|
| **Scope accuracy** | good/acceptable/poor | Was the initial scope confirmed correctly? Did scope creep occur? |
| **Decomposition quality** | good/acceptable/poor | Were waves well-ordered? File conflicts detected early? |
| **Verification thoroughness** | good/acceptable/poor | Did Testing cover all identified risks? Any risks missed? |
| **Evidence integrity** | good/acceptable/poor | Were all checkpoints backed by real execution? Any self-reported passes without evidence? |
| **Authorization discipline** | good/acceptable/poor | Were all Git/ops operations properly authorized? Any bypasses? |

## Step 3: Improvement Plan

Generate 2-5 concrete, actionable improvement recommendations for future loops:

```markdown
## Improvement Recommendations

1. **[Title]**: [What to do differently, with specific trigger condition and action]
2. **[Title]**: [What to do differently]
3. **[Title]**: [What to do differently]
```

Focus on patterns, not one-offs. Each recommendation should be:
- **Triggered**: describe when this improvement applies
- **Actionable**: describe what the agent should do differently
- **Measurable**: describe how to tell if the improvement was applied

## Step 4: Write Reflection to Memory

```bash
node scripts/memory.js add --layer L2 --content "Reflection [task-id]: [summary of findings]. Improvements: [list]" --source "Agent self-evaluation in stage reflection"
```

## Completion Condition

Checkpoint `Agent reflection` must pass. Evidence: the reflection document exists in the execution record, improvement recommendations are written to memory.

## Related Documents

- [Stage: Evolution](stage-9-1-evolution.md) - Previous stage (evolution)
- [Stage: Archive](stage-9-3-archive.md) - Next stage (archive)
- [Stage: Learn](../stages/stage-9-learn.md) - Learn stage overview
