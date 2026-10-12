# Stage 3: Requirement - Requirement Confirmation

> Confirm the problem to solve and authorization boundaries; do not turn confirmation into a fixed questionnaire.
>
> **Two-level decomposition**: the COARSE plan (which units exist, and in what order) was already produced by [initialization](initialization.md) and stored in `coarseDecomposition`. This stage produces the FINE plan (`decomposition`): how each unit is actually built, which files it touches, and in what wave it executes. The overall goal and scope are confirmed **here**, not in initialization.

## Minimal Requirement Summary

Based on existing information, describe: problem, target users, core requirements, success criteria, constraints, and exclusions.
If information is already clear, do not re-ask; if there are key knowledge gaps, explain the original problem, causal mechanism, and cost; ask only one question that determines implementation direction at a time.

### Questioning Discipline: `grill-me`

This stage's questioning follows the `grill-me` method. It raises the *depth* of confirmation; it does not relax any rule above.

1. **Model the plan as a decision tree.** Every decision branches into the decisions that depend on it. Mark what is settled, what is open, and which decision must precede which.
2. **Walk branches in dependency order.** Pick the most foundational open branch first — later questions often depend on its answer. Resolve one branch to completion before opening the next.
3. **Give a recommended answer before each question.** State your recommendation and the reasoning, then ask. The user confirms, corrects, or rejects; they are not asked to invent an answer from nothing.
4. **Answer facts yourself.** If a question can be resolved by reading the codebase, specs, or configuration, resolve it with Read/Grep instead of spending a user turn.
5. **One question at a time.** Wait for a real reply before the next question. This is what separates the discipline from a questionnaire: depth comes from branch-by-branch traversal, not from batching.
6. **Stop condition.** The session ends when all branches are resolved and no "it depends" answers remain. Close with a one-paragraph summary of the decisions actually made.

**Reconciliation with the anti-questionnaire rule** (this stage's header, and the `feedback/user-feedback.md` precedent that a 30-point form collected zero data): the rule forbids **forms** — long batched checklists the user must fill in. It does not forbid **depth**. Asking one well-founded question at a time, each with a recommended answer, and traversing a decision tree until it converges is the opposite of a form. Batching many questions into one turn to finish faster is still forbidden.

## Confirmation Method

Use interaction tools that are actually available and permitted on the host; otherwise ask one brief question in conversation and wait for a real reply.
If user has already confirmed the same scope, do not require approval in a different form. When user explicitly says "just do it / use your judgment / don't ask" or provides a complete risk-free handoff, questions can be skipped, but record the execution authorization basis; do not skip this stage.
Silence, timeout, tool unavailability, and ambiguous annotations do not count as consent. When scope needs expansion, re-confirm the increment; do not re-ask all requirements.

```bash
node scripts/state.js checkpoint "Requirement confirmed" pass --reason "User-confirmed scope or explicit execution authorization"
node scripts/state.js stage requirement completed
```

pass can only come from real evidence; record pending as warn/fail; block when necessary. Next stage determined by [state protocol](../core/state-protocol.md)'s task path: design/full enters tool-research; confirmed-plan implementation enters implementation.

## Task Decomposition Plan, Fine Level (Mandatory)

After requirement confirmation and before entering implementation, **must produce the fine decomposition plan**. Decomposition is the default -- the burden of proof is on skipping it.

**This is the FINE level.** The coarse level was produced by [initialization](initialization.md) and lives in `coarseDecomposition`. The responsibilities are split, and must not be re-merged:

| Level | Stage | Field | Question answered | Dispatch obligation |
|-------|-------|-------|-------------------|---------------------|
| Coarse | initialization | `coarseDecomposition` | Which units exist, and in what order? | **None** |
| Fine | requirement | `decomposition` | How is each unit built, which files, which wave? | Yes (parallel waves) |

The Implementation gate reads `decomposition` only — never `coarseDecomposition`. A coarse plan that is never refined into a fine one cannot complete Implementation.

### When Decomposition Is Mandatory (fine level)

The decomposition criterion (when decomposition is mandatory, and when it may be skipped) is defined **once** in [decomposition.md](../core/task/decomposition.md), section "When Decomposition Is Mandatory". This document **does not restate that table or its thresholds** — when a decomposition decision is needed, read that file. The criterion is distinct from the escalation criterion (defined once in [escalation.md](../core/task/escalation.md)): escalate != decompose.

### Decomposition Plan Record

Must record the plan conclusion:

```bash
# Decomposing (the normal case)
node scripts/state.js decompose --tasks '[
  {"id":"t1","name":"Data model design","depends":[],"affectedFiles":["src/models/user.js"]},
  {"id":"t2","name":"API interface","depends":["t1"],"affectedFiles":["src/api/user.js"]},
  {"id":"t3","name":"Frontend component","depends":["t1"],"affectedFiles":["src/components/UserForm.vue"]},
  {"id":"t4","name":"Integration test","depends":["t2","t3"],"affectedFiles":["tests/integration.test.js"]}
]'
# Set dispatch mode (parallel recommended when parallel waves exist)
node scripts/state.js dispatch-mode parallel
# Record checkpoint
node scripts/state.js checkpoint "Decomposition plan" pass --reason "4 subtasks with dependencies in 3 waves; dispatch mode: parallel"

# Skipping decomposition (only when justified by the scope survey)
node scripts/state.js checkpoint "Decomposition plan" pass --reason "Scope survey: single logical change unit in one file; de-duplicated <50 lines; no dependencies; not spanning business modules; no undecided design point; no decomposition needed"
```

### Decomposition Execution

When decomposing, register subtasks with `affectedFiles` and generate order table:

```bash
node scripts/state.js decompose --tasks '[
  {"id":"t1","name":"Data model design","depends":[],"affectedFiles":["src/models/user.js"]},
  {"id":"t2","name":"API interface","depends":["t1"],"affectedFiles":["src/api/user.js"]}
]'
node scripts/state.js order
# Review for file conflicts and wave structure
# Set dispatch mode based on parallel wave analysis
node scripts/state.js dispatch-mode parallel
```

`decompose` prints the dependency edges, serial chain, critical path, and parallel groups
as part of its own output; `order` prints the same analysis. Declaration order of the
`--tasks` array does not affect the result — only the dependency graph does.

See [Task Decomposition](../core/task/decomposition.md) for full details on affectedFiles, file conflict detection, and dispatch mode.

## Acceptance and Scope

- Write observable acceptance results; do not just write "optimize", "better", "more secure".
- List actions not taken, e.g., not deploying, not pushing, not changing installation copies.
- When documentation and code conflict, clarify impact and include approved drift resolution in the same change set.
- Do not mandate PRD creation for small fixes; use [PRD template](../../references/prd-template.md) when formal requirement documents are needed.
