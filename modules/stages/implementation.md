# Stage 5: Implementation - Small Batch Implementation

> Implement per approved scope; do not impose example engineering structures or teaching exercises on the project.

## Before Starting

1. Confirm current stage and approval basis; read related source files, tests, documentation, and user's existing changes.
2. Describe the problem this batch solves, minimal approach, possible failure modes, and acceptance method; already-confirmed scope does not need re-approval.
3. Explain causality for complex points as needed; resolve only one actual blocking question at a time.
4. If task decomposition was done in Requirement stage (`node scripts/state.js order` has output), execute by order table waves and dispatch mode. Current wave all `completed` before entering next wave. Without decomposition (only when skip was justified), follow existing "small batch implementation"; not affected.

## Execute by Order Table (when decomposed)

If `decomposition` section exists, Implementation progresses by wave and dispatch mode.
`order` also prints the execution-order analysis: dependency edges, the serial chain the
graph forces, the critical path, and the parallel groups. Use the **parallel groups** to
decide which waves are candidates for concurrent dispatch, and the **serial chain** to see
which steps cannot be overlapped regardless of dispatch mode.

```bash
# View current order table and dispatch mode
node scripts/state.js order
node scripts/state.js dispatch-mode
```

### Serial Dispatch (explicit opt-out)

Selected only when `dispatchMode` is `serial` (an explicit choice) or a wave has no
parallel group. The main agent executes all subtasks one at a time:

```bash
# Start a subtask
node scripts/state.js subtask t1 in_progress
# ... implement t1 ...
node scripts/state.js subtask t1 completed

# Move to next subtask
node scripts/state.js subtask t2 in_progress
# ... implement t2 ...
node scripts/state.js subtask t2 completed
```

### Parallel Dispatch (sub-agent delegation)

`dispatchMode` defaults to `serial` (the main agent executes every subtask). Opt into
`parallel` when a wave of independent subtasks should be delegated to sub-agents; under
`parallel`, a wave the analysis marks parallel **must** be dispatched to sub-agents rather
than executed by the main agent. Read the plan first:

```bash
node scripts/state.js dispatch-plan
```

```
Wave N (parallel):
  Main agent:
    1. Identify current host and load matching host adapter (see modules/hosts/)
    2. Read subtask scope, affectedFiles, acceptance criteria
    3. Build constrained prompt per host adapter's Prompt Construction section
    4. Launch sub-agents concurrently per host adapter's Sub-Agent Invocation section
    5. Record the dispatch: state.js dispatch --wave N --subtasks <ids> --agent <name>
    6. Collect results per host adapter's Result Collection section
    7. Verify each result independently
    8. Mark subtasks as completed/failed based on verification
    9. Record wave checkpoint
```

`stage implementation completed` is **rejected** while any parallel wave lacks a dispatch
record (or an explicit `dispatch-waive`). The failure names the outstanding waves, so the
remedy is in the message itself.

**Sub-agent dispatch rules** (mandatory):

1. Each sub-agent receives: explicit file scope (from `affectedFiles`), implementation description, acceptance criteria, and list of off-limits files. The exact prompt structure is defined by the host adapter ([Host Adapter Layer](../hosts/README.md)).
2. Sub-agents do NOT write to `state.json`, `memory.json`, or any HelloDev state.
3. Sub-agents do NOT perform Git operations.
4. Sub-agents do NOT interact with the user.
5. Main agent verifies all sub-agent output before marking subtasks `completed`.
6. Development logs for sub-agent changes are written by the main agent after collection.
7. If a sub-agent fails, main agent retries with refined prompt or falls back to serial execution via `dispatch-waive --wave <n> --reason "..."`. Host adapter defines retry strategy.
8. File conflicts within a wave (detected at decomposition time) force sequential execution regardless of dispatch mode; such a wave never enters the dispatch plan.
9. The recorded `--agent` must be the real sub-agent that received the wave. `main-agent` and other names denoting the main agent are **rejected**, and a rejected command writes no record, so it cannot satisfy the gate above. If no sub-agent exists, use `dispatch-waive --wave <n> --reason "..."` instead of naming the main agent.
10. Recording a dispatch proves the command ran, **not** that a sub-agent existed or that its output was correct. The identity rule above closes only the self-assignment loophole; verification remains the main agent's responsibility.

### Wave Completion Rules

- **Intra-wave concurrency**: Subtasks in same wave have no mutual dependencies; a parallel wave is dispatched to sub-agents (see above)
- **Inter-wave serial**: Current wave all `completed` before starting next wave
- **Subtask failure**: Mark `failed`; after fix, re-`in_progress` -> `completed`
- **After each wave**: Record checkpoint: `node scripts/state.js checkpoint "wave-1" pass --reason "t1, t2 completed"`
- **After all subtasks complete**: Implementation stage can be completed

## Per-Batch Operations

- Prefer failure regression or minimal reproduction first, then implement. When existing tests are sufficient, supplement assertions targeting missed boundaries.
- Small-scope, reversible modifications; follow existing code style; do not do irrelevant renames, abstractions, or dependency upgrades.
- After each code/script/config change, immediately append [development log](../../docs/progress_coding/_RULES.md); co-update directly related documentation.
- Pass build/syntax first, then run affected regression, behavior, and boundary verification; fix failures before continuing.
- When blocked, describe what is missing; do not retry infinitely. External operations not approved are not auto-executed.

Git add/commit/push are not required per-batch steps; require separate authorization; see [Git Protocol](../core/approval/git-gate.md). Sub-agent dispatch follows decomposition rules; see [Task Decomposition](../core/task/decomposition.md).

## Evidence Recording (Connecting Evidence Pipeline)

When L3/L4 entries retrieved during Bootstrap were used, record adoption so evidence pipeline accumulates real data:

```bash
# After using a pattern or process, record adoption
node scripts/memory.js adopt --id <entry-id> --source "Used this pattern/process during implementation"
```

Skip if no retrieved entries were used; do not adopt just for the count.

## Completion and Rework

```bash
node scripts/state.js stage implementation completed
node scripts/state.js stage testing in_progress
```

Stage transition must not imply tests have passed. After entering Testing/Review, if implementation needs changes, first `node scripts/state.js stage implementation rolled_back`, then enter implementation/in_progress; subsequent testing and review re-executed.

For documentation-only tasks, organize already-approved documentation here; do not auto-implement business code. Related methods: [Implementation Responsibilities](../core/implementation-agent.md), [Self Review](../core/self-review.md), [Testing](testing.md).
