# Host Adapter: WorkBuddy

> Sub-agent dispatch and state machine integration instructions for the WorkBuddy host environment.

## Host Identification

- **Host name**: WorkBuddy
- **Detection**: The agent is running inside WorkBuddy when the system context includes `<product_identity>` identifying WorkBuddy, and the `Agent` tool is available in the tool set.
- **Version constraints**: None specific. The `Agent` tool and `TaskCreate`/`TaskUpdate`/`TaskList` interfaces have been stable across WorkBuddy versions.

## State Machine Integration

WorkBuddy provides a task management system (`TaskCreate`, `TaskUpdate`, `TaskList`) that is visible to the user in the UI. Hello Dev has its own state machine with 15 stages and 5 status values, persisted in `.hello-dev/state.json`. This section defines how the main agent **synchronizes Hello Dev's state machine into WorkBuddy's task system** so the user can see the Hello Dev process progress in WorkBuddy's task panel.

### Hello Dev Stage Inventory

Hello Dev defines 15 stages in `scripts/lib/stages.js` (the single source; `state.js` requires it):

```
STAGES = ['bootstrap', 'initialization', 'requirement', 'tool-research', 'feature-design', 'architecture', 'prototype', 'implementation', 'testing', 'review', 'ship', 'learn', 'evolution', 'reflection', 'archive']
```

Each stage has 5 possible statuses:

```
STAGE_STATUS = ['pending', 'in_progress', 'completed', 'failed', 'rolled_back']
```

### Execution Path

There is one execution path: the full 15-stage chain — **All 15 stages**:

```text
bootstrap -> initialization -> requirement -> tool-research -> feature-design -> architecture -> prototype -> implementation -> testing -> review -> ship -> learn -> evolution -> reflection -> archive
```

Design-stage reduction happens only through a recorded, user-approved skip (`state.js skip`), never through a second declared chain.

The `route()` function in `scripts/lib/stages.js` implements this:
- Current states (field `skipped` present): all STAGES minus the recorded skips
- Legacy states (field absent): the old `type=design && path=full` filter, preserved so states written under the retired contract still read correctly

### Stage-to-Task Mapping

When Hello Dev initializes (`state.js init`), the main agent **must** create WorkBuddy tasks for all stages in the current execution path. Each stage maps to one WorkBuddy task.

#### Naming Convention

| Hello Dev Stage | WorkBuddy Task Subject | Task Description |
|---|---|---|
| `bootstrap` | `HelloDev: Bootstrap` | Initialize project, confirm scope, load skill |
| `requirement` | `HelloDev: Requirement` | Confirm problem, scope, authorization boundaries |
| `feature-design` | `HelloDev: Feature Design` | Design feature modules for approval |
| `prototype` | `HelloDev: Prototype` | Interleaved UX+UI iteration, produce runnable HTML prototype |
| `architecture` | `HelloDev: Architecture` | Make architectural decisions |
| `implementation` | `HelloDev: Implementation` | Implement per approved scope |
| `testing` | `HelloDev: Testing` | Layered verification |
| `review` | `HelloDev: Review` | Evidence review |
| `ship` | `HelloDev: Ship` | Deliver results |

#### Status Mapping

| Hello Dev Status | WorkBuddy Task Status | Trigger |
|---|---|---|
| Stage not yet reached | `pending` | Initial creation |
| `in_progress` | `in_progress` | `state.js stage <name> in_progress` |
| `completed` | `completed` | `state.js stage <name> completed` |
| `failed` | `in_progress` | `state.js stage <name> failed` -- keep active, needs resolution |
| `rolled_back` | `in_progress` | `state.js stage <name> rolled_back` -- needs re-execution |

Note: Hello Dev's `failed` and `rolled_back` both map to WorkBuddy `in_progress` because the stage is still active and requires resolution. The WorkBuddy task panel shows the stage as "being worked on" rather than "done".

### Initialization Sequence

After `state.js init` succeeds, the main agent must:

1. Determine the execution path from the init result (`full` or filtered).
2. Call `TaskCreate` for each stage in the path, in order.
3. Set the first stage (`bootstrap`) to `in_progress`.
4. All subsequent stages start as `pending`.

```
# Pseudocode for initialization (full chain is the only chain)
state.js init --name "..." --type <type>

# Determine active stages: full chain minus recorded user-approved skips
stages = route(state)  # scripts/lib/stages.js route(): STAGES filtered by state.skipped

# Create WorkBuddy tasks
for stage in stages:
  TaskCreate({
    subject: "HelloDev: <Stage Display Name>",
    description: "<stage description from table above>"
  })

# Set first stage active
TaskUpdate({ taskId: "<bootstrap-task-id>", status: "in_progress" })
```

### Stage Transition Sync

Every time the main agent calls `state.js stage <name> <status>`, it **must immediately** call `TaskUpdate` with the mapped WorkBuddy status:

```
# Hello Dev transition
state.js stage requirement completed

# Immediate WorkBuddy sync
TaskUpdate({ taskId: "<requirement-task-id>", status: "completed" })

# Then activate next stage
state.js stage implementation in_progress
TaskUpdate({ taskId: "<implementation-task-id>", status: "in_progress" })
```

The sync must happen **in the same turn** as the state.js call. Do not batch or defer -- the task panel must reflect the current state at all times.

### Subtask Integration (Optional)

When decomposition produces subtasks (`state.js decompose`), the main agent may optionally create WorkBuddy tasks for each subtask, nested under the Implementation stage task. This provides finer-grained visibility.

| Hello Dev Subtask Status | WorkBuddy Task Status |
|---|---|
| `pending` | `pending` |
| `in_progress` | `in_progress` |
| `completed` | `completed` |
| `failed` | `in_progress` |

Subtask task subjects follow the pattern: `HelloDev: <subtask-name> (<id>)`.

This is optional -- the main agent should create subtask tasks only when the decomposition has 3+ subtasks, to avoid task panel clutter for simple decompositions.

### Rollback Handling

When a stage is rolled back (`state.js stage <name> rolled_back`):

1. Set the rolled-back stage's WorkBuddy task to `in_progress`.
2. Set all downstream stages' WorkBuddy tasks back to `pending`.
3. This matches Hello Dev's rule: "Rolling back to the current or earlier stage invalidates that stage and downstream completion records."

### Task ID Tracking

The main agent must track the mapping between Hello Dev stage names and WorkBuddy task IDs. This mapping is implicit -- the main agent holds it in context during the session. If the session restarts and state is resumed (`state.js resume`), the main agent should call `TaskList` to find existing HelloDev tasks and rebuild the mapping.

## Sub-Agent Invocation

WorkBuddy provides the `Agent` tool for launching sub-agents. Each sub-agent is an isolated execution context with its own tool access and conversation history.

### Tool Signature

```
Agent({
  prompt: string,           -- Required. Task description for the sub-agent.
  name: string,             -- Required. Unique name for addressable communication.
  description: string,      -- Optional. 3-5 word summary.
  subagent_type: string,    -- Optional. Agent type (see Sub-Agent Type Selection below).
  max_turns: number,        -- Optional. Maximum API round-trips before stopping.
  mode: string,             -- Optional. Permission mode ("default", "plan", "auto", etc.).
  run_in_background: bool   -- Optional. true to run without blocking.
})
```

### Invocation Pattern for Hello Dev

For each subtask in a parallel wave:

```
Agent({
  name: "subtask-<id>",
  description: "<subtask name>",
  prompt: <constructed per Prompt Construction section below>,
  subagent_type: "general-purpose",
  mode: "auto"
})
```

Launch all sub-agents in the same message to enable concurrency. The tool returns a result object containing the sub-agent's output.

## Prompt Construction

Build each sub-agent's prompt from the decomposition subtask. Include these elements in order:

### Required Elements

1. **Scope statement**: One sentence describing what this subtask implements.

2. **File boundaries**: Explicit list of files the sub-agent may read and modify (from `affectedFiles`). State clearly that files outside this list are off-limits.

3. **Implementation description**: The subtask's `name` field from decomposition, expanded with any additional context from the approved design or requirement.

4. **Acceptance criteria**: Observable conditions that must be true for the subtask to be considered complete. These come from the requirement confirmation and design approval.

5. **Constraints block**: Copy the universal constraints from `decomposition.md` Sub-Agent Constraints section:
   - No writes to `state.json`, `memory.json`, or any HelloDev state file.
   - No Git operations (`git add`, `git commit`, `git push`, etc.).
   - No user interaction. If blocked, return failure description to the main agent.
   - Do not modify files outside `affectedFiles`.

6. **Context completeness**: The sub-agent inherits no context from this thread -- the prompt is the
   only context it receives. Include a `## Context` block carrying everything the main agent already
   knows that the sub-agent would otherwise have to rediscover: the absolute working directory, exact
   file paths with line anchors, the verbatim text to be changed, the target state, already-measured
   facts and baselines, and the off-limits list with reasons. Never dispatch a one-line task or write
   "based on your findings" -- that outsources understanding to the sub-agent. Adequacy test: the
   sub-agent can locate the change without any additional search.

### Prompt Template

```
You are implementing subtask "<id>" of a larger task.

## Scope
<one-sentence description>

## Files
You may READ and MODIFY only these files:
<affectedFiles list, one per line>

Do NOT read, modify, or create any other files.

## Implementation
<expanded description of what to implement>

## Acceptance Criteria
- <criterion 1>
- <criterion 2>
- ...

## Constraints
- Do NOT write to .hello-dev/state.json, .hello-dev/memory.json, or any HelloDev state file.
- Do NOT perform any Git operations.
- Do NOT ask the user questions. If you are blocked, describe what is blocking you in your response.
- Do NOT modify files outside the list above.

## Context (already established -- do not re-derive)
- Working directory (absolute): <path>
- Files and line anchors already located: <path:line -> what is there>
- Verbatim text to change: <quote>
- Target state: <what it should become>
- Already-measured facts / baselines: <command -> output>
- Off-limits (do NOT touch, and why): <paths/anchors -> reason>

## Working Directory
<path/to/hello-dev or target project path>
```

## Result Collection

WorkBuddy's `Agent` tool returns the sub-agent's result directly in the tool call response. The result contains:

- The sub-agent's final text output (its summary of what it did).
- Any files it created or modified (visible in the tool result).

### Interpreting Results

| Sub-Agent Output | Interpretation |
|-----------------|----------------|
| Clear description of completed work matching acceptance criteria | **Success**. Proceed to verification. |
| Partial description -- some criteria met, others not | **Partial completion**. Main agent reviews, decides accept or retry. |
| Explicit failure message or blocking description | **Failure**. Apply Failure Handling below. |
| Output does not address the prompt or addresses wrong scope | **Conflicting output**. Main agent resolves, may need to re-decompose. |

### Verification (Mandatory)

After collecting results, the main agent **must** independently verify each sub-agent's output:

1. Read the files listed in `affectedFiles` to confirm changes match acceptance criteria.
2. Run relevant build/syntax checks if applicable.
3. Do not accept the sub-agent's self-report as evidence of correctness.

Only after verification passes should the main agent mark the subtask `completed`.

## Failure Handling

### Retry Strategy

When a sub-agent fails:

1. **First retry**: Re-launch with a refined prompt. Include the failure reason from the first attempt. Add more specific guidance about what went wrong.

2. **Second retry**: If the first retry also fails, try once more with an even more constrained prompt -- smaller scope, more explicit file paths, simpler acceptance criteria.

3. **Fall back to serial**: If two retries fail, abandon parallel dispatch for this subtask. The main agent implements it directly in serial mode.

### Failure Isolation

A sub-agent failure does not affect other subtasks in the same wave (they have no mutual dependencies). The main agent should:

1. Mark the failed subtask as `failed`.
2. Accept results from other subtasks in the wave that passed verification.
3. Record a checkpoint noting the partial wave completion.
4. Address the failed subtask before proceeding to the next wave (downstream waves are blocked until all predecessors are `completed`).

## Constraints

### WorkBuddy-Specific Limitations

- **No cross-subtask communication**: Sub-agents cannot communicate with each other. Each operates in isolation. The main agent is the sole coordinator.
- **No shared filesystem state between sub-agents**: While sub-agents share the same filesystem, concurrent writes to the same file cause conflicts. This is why `affectedFiles` must not overlap within a wave.
- **Sub-agent turns are limited**: Use `max_turns` to prevent runaway sub-agents. A reasonable default is 20-30 turns for implementation subtasks.
- **Background agents need explicit result collection**: If using `run_in_background: true`, the main agent must use `TaskOutput` to retrieve results. Prefer synchronous invocation for simplicity unless wave size demands backgrounding.

### Sub-Agent Type Selection

| Subtask Characteristic | Recommended `subagent_type` |
|----------------------|---------------------------|
| Code implementation (creates/modifies files) | `"general-purpose"` |
| File exploration or research (read-only) | `"Explore"` |
| Architecture planning (read-only, analytical) | `"Plan"` |

Default to `"general-purpose"` unless the subtask is explicitly read-only.

## Examples

### Example: Two-Task Parallel Wave

Given decomposition:

```json
{
  "tasks": [
    {"id": "t1", "name": "Data model", "depends": [], "affectedFiles": ["src/models/user.js"]},
    {"id": "t2", "name": "API endpoint", "depends": ["t1"], "affectedFiles": ["src/api/user.js"]},
    {"id": "t3", "name": "Frontend form", "depends": ["t1"], "affectedFiles": ["src/components/UserForm.vue"]}
  ]
}
```

Wave 2 contains t2 and t3 (both depend on t1, no file conflict). The main agent launches:

```
Agent({
  name: "subtask-t2",
  description: "API endpoint implementation",
  prompt: "You are implementing subtask \"t2\" of a larger task.\n\n## Scope\nImplement the user API endpoint...\n\n## Files\nYou may READ and MODIFY only these files:\n- src/api/user.js\n\nDo NOT read, modify, or create any other files.\n\n## Implementation\nCreate a REST API endpoint at /api/users that...\n\n## Acceptance Criteria\n- Endpoint accepts GET /api/users and returns user list\n- ...\n\n## Constraints\n- Do NOT write to .hello-dev/state.json or memory.json.\n- Do NOT perform Git operations.\n- Do NOT ask the user questions.\n- Do NOT modify files outside src/api/user.js.\n\n## Working Directory\n/path/to/your/project",
  subagent_type: "general-purpose",
  mode: "auto"
})

Agent({
  name: "subtask-t3",
  description: "Frontend form implementation",
  prompt: "...(similar structure for t3)...",
  subagent_type: "general-purpose",
  mode: "auto"
})
```

Both launched in the same message for concurrency. Main agent collects results, verifies independently, marks completed/failed.
