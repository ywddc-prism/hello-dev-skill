# Task Decomposition

> Decomposition is **mandatory** after requirement confirmation. The only valid reason to skip is a scope survey reporting a single logical change unit (one file, de-duplicated <50 lines, no dependencies, not spanning business modules, no undecided design point). All other tasks must be decomposed into independently verifiable subtasks with dependency analysis and wave order.

## When Decomposition Is Mandatory

Judge by the scope-survey output (affected-file list + number of logical change units), **counted by logical change unit, not by touched-file count**:

| Condition | Action |
|------|------|
| >= 2 logical change units | **Must decompose** |
| Clear sequential dependencies (data model -> API -> frontend) | **Must decompose** |
| De-duplicated estimated > 50 logical change lines | **Must decompose** |
| Scope survey reports a single logical change unit (one file, de-duplicated <50 lines, no dependencies, not spanning business modules, no undecided design point) | May skip (record reason) |

The same logical change unit synchronized across N locations (documentation consistency / copy sync) counts as **one** change unit and does not accumulate lines, but all N locations must be listed in the boundary contract. Touched-file count only serves as the scope survey's lower-bound evidence, not as an independent escalation threshold.

**This table is the decomposition criterion, not the escalation criterion.** "Must decompose" and "escalate to the standard path" are two different questions with two different thresholds; both consume the same scope-survey output but yield independent conclusions — **escalate != decompose**. The escalation criterion (number of logical change units >= 2, spanning business modules, an undecided design point, de-duplicated estimated logical change lines > 50) is defined once in [escalation.md](escalation.md), section "Change-complexity checkpoint" ([SKILL.md](../../../SKILL.md) only cites that section), together with the module-root definition of "spans business modules". A request can escalate with only one change unit (so decomposition may be skipped) and can require decomposition without escalating (2 change units, same module, no undecided design point, de-duplicated <50 lines).

The burden of proof is on **not** decomposing. If in doubt, decompose.

## Decomposition Rules

1. **Subtask granularity**: Each subtask should be independently implementable and verifiable; estimated <100 lines of changes.
2. **Dependency declaration**: Each subtask declares `depends` (list of predecessor subtask IDs). No dependencies = can execute in first wave.
3. **Do not duplicate design modules**: Design approval (module submitted/approved) manages scope; decomposition manages execution order; the two do not replace each other.
4. **Can merge**: If two subtasks always change the same file and are logically coupled, merge into one.
5. **Affected files declaration**: Each subtask must declare `affectedFiles` -- the list of file paths it will create or modify. This enables file conflict detection before dispatch.

## Affected Files and Conflict Detection

Each subtask declares its `affectedFiles` at decomposition time:

```json
{
  "id": "t1",
  "name": "Data model",
  "depends": [],
  "affectedFiles": ["src/models/user.js", "src/db/schema.sql"]
}
```

**File conflict rule**: If two subtasks within the same parallel wave share any `affectedFiles`, that wave is automatically downgraded to `sequential`. The main agent implements them one at a time to avoid concurrent file writes.

```
# Conflict detection happens automatically during decomposition.
# The CLI output will indicate:
#   "Wave 2 [parallel -> sequential]: file conflict between t2 and t3 on src/config.js"
```

## Order Table (waves)

Auto-derived from dependencies. Subtasks within the same wave have no mutual dependencies and can run concurrently; waves must run serially.

```
Wave 1: [t1]           <- No dependencies; do first
Wave 2: [t2, t3]       <- Depends on t1; but t2/t3 have no mutual dependencies; can run concurrently
Wave 3: [t4]           <- Depends on t2 + t3; do last
```

Derivation rule: Subtask's earliest wave = max(all predecessor waves) + 1; no predecessors = Wave 1.

**Derivation must not depend on declaration order.** The rule above is a property of the dependency graph, so `[t1, t2]` and `[t2, t1]` must yield the same waves whenever `t1` is `t2`'s only predecessor. Derivation therefore lives in one place, `scripts/lib/decomposition.js`, and consumers (`state.js`, `codex-prompt.js`) call it rather than re-implementing it.

This matters because a single forward pass over the task array is subtly wrong: while walking in declaration order, a subtask listed *before* a dependency it declares reads that dependency's wave as `undefined`. The measured result was a decomposition that stored **zero waves** while reporting success:

```
node scripts/state.js decompose --tasks '[{"id":"t2","depends":["t1"]},{"id":"t1","depends":[]}]'
-> [OK] Decomposition complete: 2 subtasks, 0 waves     # before the fix
-> [OK] Decomposition complete: 2 subtasks, 2 waves     # after
```

Two independent derivations made it worse: `codex-prompt.js` carried its own recursive copy that resolved the same graph correctly, so the printed order table and the dispatched sub-agent prompts could describe different execution plans. There is now a single implementation; do not add a second.

## Execution Order Analysis (dependency, serial chain, parallel groups)

Wave numbers alone leave the reader to infer which edges force serialization and which waves may truly run concurrently. Decomposition therefore emits the analysis as part of its own output, and `order` appends the same block after the existing table.

```
=== Execution Order Analysis ===
Subtasks: 4   Waves: 3   Longest chain: 3

Prerequisites (each subtask <- what must finish first):
  t4 <- t2, t3
  t3 <- t1
  t2 <- t1
  Roots (no prerequisites): t1
  Leaves (nothing waits on them): t4

Serial chain the dependencies force:
  Wave 1: t1 (single subtask, runs alone)
  Wave 3: t4 (single subtask, runs alone)
  Wave order is strictly serial: Wave 1 -> Wave 2 -> Wave 3
  Longest dependency chain: t1 -> t2 -> t4

Parallel groups (safe to run concurrently):
  Wave 2: t2, t3

File conflicts forcing sequential execution inside a wave:
  (none)
```

What each section answers:

| Section | Question it answers |
|------|------|
| Prerequisites | Which subtask must finish before this one, and where the graph starts and ends |
| Serial chain | Which waves hold a single subtask and are the real serialization the graph forces |
| Longest dependency chain | The shortest possible number of sequential steps; the lower bound on wall-clock stages |
| Parallel groups | Which waves are multi-subtask **and** conflict-free, so they may be dispatched concurrently |
| File conflicts | Which waves were narrowed to sequential because two subtasks share a file |

Scope note: the analysis describes execution order only. It does not grant dispatch authorization — [dispatch mode](#dispatch-mode) controls sub-agent use, and see [Dispatch Mode](#dispatch-mode) for the parallel-wave conditions.

## Dispatch Mode

After decomposition, the main agent sets a dispatch mode controlling how subtasks are executed.
`decompose` defaults this to `parallel`.

| Mode | Behavior |
|------|----------|
| `parallel` (default) | Every wave the analysis marks `parallel` is dispatched to sub-agents concurrently; single-subtask waves stay with the main agent |
| `serial` (explicit opt-out) | Main agent executes all subtasks sequentially, one at a time; the reason should be recorded |

### Dispatch Plan (mandatory)

`decompose` prints the plan immediately after the analysis, and `dispatch-plan` shows it at
any time:

```
=== Sub-Agent Dispatch Plan (mandatory) ===
2 parallel wave(s), 4 subtask(s) must be dispatched to sub-agents:
  Wave 1: t2, t3   (2 independent subtasks, no shared affectedFiles)
  Wave 3: t5, t6   (2 independent subtasks, no shared affectedFiles)
Main agent keeps (sequential waves): t1, t4, t7
```

A wave qualifies for the plan only when it has **more than one subtask and no shared
`affectedFiles`** — the same condition the analysis already used for `Parallel groups`. A wave
narrowed to `sequential` by a file conflict is never dispatched concurrently, because two
sub-agents writing the same file would overwrite each other.

| Command | Purpose |
|------|----------|
| `dispatch-plan` | Read-only: show the plan, recorded dispatches, and what is outstanding |
| `dispatch --wave <n> --subtasks <ids> --agent <name>` | Record that a parallel wave was dispatched to a sub-agent |
| `dispatch-waive --wave <n> --reason "..."` | Explicitly authorize serial execution instead, with a recorded reason |

`--agent` takes the identifier of the sub-agent that actually received the wave. The CLI
rejects a value that denotes the main agent — `main`, `main-agent`, `main.agent`,
`the main agent`, `self`, `none`, `n/a`, `waived`, `skip`, `local`, `inline`, `myself`, and
empty or whitespace-only text. Matching is case-insensitive, trims whitespace, and ignores
punctuation entirely (every non-alphanumeric character is dropped, so `main agent`,
`main_agent`, `main.agent` and `main-agent` are one value); a leading `subagent` / `agent`
prefix is stripped, and a name built only from role or placeholder words names no distinct
actor. A rejected command writes no record. Real identifiers (`subagent-1`, `dev-a`, `codex-1`,
`worker-2`, `agent-teammate-1`, `maintainer`, `verifier`) are accepted. When no sub-agent
exists, the correct command is `dispatch-waive`, not a self-naming `dispatch`; a waiver record
is exempt from this check because it claims serial execution rather than delegation.

The Implementation stage will not complete while any parallel wave in a state that has a
`dispatches` field lacks a record. The full boundary rules, including which states are
grandfathered, are in [state-protocol.md](../state-protocol.md).

### When to Use Parallel Dispatch

| Condition | Recommendation |
|------|----------|
| Parallel wave with >= 2 subtasks AND no file conflicts | Use `parallel` |
| All waves are sequential | Use `serial` (no benefit from sub-agents) |
| Subtasks involve read-only exploration | Use `parallel` with Explore sub-agents |
| Subtasks involve code modifications | Use `parallel` with general-purpose sub-agents, each scoped to non-overlapping files |

### Sub-Agent Constraints

When dispatching to sub-agents, the following constraints are **mandatory**:

1. **Scope containment**: Each sub-agent receives an explicit scope: which files to read/modify, what to implement, acceptance criteria, and which files are off-limits.
2. **No state writes**: Sub-agents cannot write to `state.json`, `memory.json`, or any HelloDev state. Only the main agent manages state.
3. **No Git operations**: Sub-agents do not perform `git add`, `git commit`, `git push`, or any Git write operations.
4. **No user interaction**: Sub-agents do not ask the user questions. If blocked, they return failure to the main agent, which decides how to proceed.
5. **Result verification**: The main agent must verify each sub-agent's output before marking the subtask as `completed`. Sub-agent self-reports are not accepted as evidence.
6. **Development logs**: Sub-agent code changes are logged by the main agent after result collection, not by sub-agents directly.
7. **Context completeness**: Sub-agents inherit no context from the caller's thread -- the prompt is
   the only context they receive. Everything the main agent already knows and the sub-agent would
   otherwise have to rediscover must be written into the prompt: exact file paths with line anchors,
   the verbatim text to be changed, the target state, the upstream/downstream relationship, the
   already-measured facts and baselines, the off-limits list with reasons, and the absolute working
   directory. "Based on your findings" is prohibited -- it outsources understanding. A prompt is
   adequate when the sub-agent can locate the change without any additional search.

### Sub-Agent Failure Handling

| Failure Type | Main Agent Action |
|------|----------|
| Sub-agent reports partial completion | Main agent reviews output, decides whether to accept or retry |
| Sub-agent fails entirely | Main agent retries with a refined prompt, or falls back to serial execution |
| Sub-agent produces conflicting output | Main agent resolves conflict, may need to re-decompose |

A sub-agent failure does not affect other subtasks in the same wave (they have no mutual dependencies). Downstream waves remain blocked until the failed subtask is resolved.

### Host Adapter Layer

The constraints above are host-agnostic. How sub-agents are actually invoked -- which tool to call, what prompt format to use, how to collect results -- depends on the host environment. See [Host Adapter Layer](../../hosts/README.md) for the interface contract and per-host dispatch guides.

When `dispatchMode` is `parallel`, the main agent **must** load the matching host adapter before dispatching. The adapter provides:
- Sub-agent invocation mechanism (tool name, parameters)
- Prompt construction template (scope, file boundaries, acceptance criteria, constraints)
- Result collection and interpretation rules
- Host-specific failure handling and retry strategy

If no host adapter is available for the current host, the main agent falls back to its native sub-agent mechanism. This is acceptable for initial use but should be followed by creating an adapter file for reproducibility.

## State and CLI

Decomposition results written to `decomposition` section of `state.json`:

```bash
# After requirement confirmation, register subtasks (JSON array)
# affectedFiles is required for each subtask
node scripts/state.js decompose --tasks '[
  {"id":"t1","name":"Data model","depends":[],"affectedFiles":["src/models/user.js"]},
  {"id":"t2","name":"API","depends":["t1"],"affectedFiles":["src/api/user.js"]}
]'

# View order table
node scripts/state.js order

# Set dispatch mode (after decomposition, before implementation)
node scripts/state.js dispatch-mode parallel   # default
node scripts/state.js dispatch-mode serial   # explicit opt-out

# View current dispatch mode
node scripts/state.js dispatch-mode

# Update subtask status
node scripts/state.js subtask t1 completed
node scripts/state.js subtask t2 in_progress

# Redecompose (overwrite)
node scripts/state.js decompose --tasks '[...]' --replace true
```

Subtask status: `pending` -> `in_progress` -> `completed` | `failed`.
After failure fix, only need to redo that subtask and its downstream waves; no need to roll back entire Implementation.

## Connection with Implementation

Implementation stage executes by wave:

1. Read order table (`node scripts/state.js order`)
2. Read dispatch mode (`node scripts/state.js dispatch-mode`)
3. For each wave:
   - If `serial` or wave is sequential: main agent implements each subtask one at a time
   - If `parallel` and wave is parallel: main agent dispatches subtasks to sub-agents concurrently
4. Wait for all subtasks in wave to complete (sub-agents return results to main agent)
5. Main agent verifies results, records checkpoint: `node scripts/state.js checkpoint "wave-1" pass --reason "t1, t2 completed"`
6. **Wave-close index regeneration**: when a parallel wave touches any file under `modules/`, the wave must end by running `node scripts/gen-index.js` and then `node scripts/gen-index.js --check`. `modules/index.md` is a generated artifact whose only legitimate source is the generator; without this step the check reports a false failure while the wave is still in flight.
7. Current wave all `completed` before entering next wave
8. After all waves complete, Implementation stage can be completed

Step 7 is **enforced by the CLI**, not left to discipline: `stage implementation completed` is rejected while any subtask in `decomposition.tasks` is not `completed`, with the offending ids and statuses named in the error. A wave whose subtasks all failed therefore cannot pass the stage.

Without decomposition (only when skip was justified per "When Decomposition Is Mandatory"), Implementation behavior is unchanged -- follows existing "small batch implementation".

## Rollback

When a subtask fails:
- That subtask marked `failed`; record reason
- Other subtasks in same wave can continue (no mutual dependencies)
- Downstream waves blocked; wait for that subtask to be fixed and marked `completed` before proceeding
- When completed subtask needs changes, first mark `pending` and redo; then revalidate downstream

## Backward Compatibility

`decomposition` section is optional. Existing state files without this section work normally with all commands (`order` prompts not yet decomposed).
Once field exists, strict validation applies -- same caliber as ops / collaboration sections.
The `dispatchMode` and `affectedFiles` fields within `decomposition` are also backward compatible: absent fields use defaults (`serial` for mode, empty array for `affectedFiles`).
