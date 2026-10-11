# Host Adapter: <Host Name>

> Copy this file to `modules/hosts/<host-name>.md` and fill in all required sections. Delete optional sections you do not need.

## Host Identification

- **Host name**: <human-readable name>
- **Detection**: <how the main agent determines it is running on this host. Be specific -- environment variable, tool availability, system context marker, etc.>
- **Version constraints**: <minimum version, API stability notes, or "None specific">

## Sub-Agent Invocation

<Describe the exact mechanism to launch a sub-agent on this host. Include:
- Tool name or API call
- Required parameters and their types
- Optional parameters relevant to Hello Dev dispatch
- A minimal invocation example>

## Prompt Construction

<Describe how to build the sub-agent's prompt from a decomposition subtask. Must cover:

1. **Scope statement**: How to express what the subtask implements.
2. **File boundaries**: How to communicate `affectedFiles` as the allowed file set.
3. **Implementation description**: What context beyond the subtask name to include.
4. **Acceptance criteria**: How to express observable completion conditions.
5. **Constraints block**: Universal constraints from decomposition.md (no state writes, no Git, no user interaction) plus any host-specific additions.
6. **Context completeness**: The sub-agent inherits no context from the dispatcher's thread -- the prompt is the only context it receives. Include a `## Context` block with the absolute working directory, exact file paths with line anchors, the verbatim text to be changed, the target state, already-measured facts and baselines, and the off-limits list with reasons (this is constraint 7 of decomposition.md Sub-Agent Constraints). One-line dispatches and "based on your findings" are prohibited. Adequacy test: the sub-agent can locate the change without any additional search. If the host has a prompt generator script, note whether it emits this block or it must be added manually.

A template is recommended but not required.>

## Result Collection

<Describe how the main agent receives sub-agent output:
- Is it returned synchronously in the tool call response?
- Is it asynchronous, requiring polling or event waiting?
- What fields or formats does the output contain?

Then describe how to interpret results:
- What constitutes success?
- What constitutes partial completion?
- What constitutes failure?>

## Failure Handling

<Describe host-specific retry or fallback behavior:
- How many retries before falling back to serial?
- How to refine the prompt between retries?
- How does failure in one subtask affect others in the same wave?
- Is there a host-specific mechanism for cancellation or timeout?>

## Constraints

<List any host-specific limitations beyond the universal constraints in decomposition.md. Examples:
- Maximum concurrent sub-agents
- Sub-agent communication restrictions
- Filesystem isolation behavior
- Turn or time limits
- Sub-agent type availability>

## Optional: State Machine Integration

<If the host provides a user-visible task or progress tracking system, describe how to synchronize Hello Dev's 8-stage state machine into it. Must cover:

1. **Stage inventory**: Hello Dev has 15 stages: `bootstrap`, `initialization`, `requirement`, `tool-research`, `feature-design`, `architecture`, `prototype`, `implementation`, `testing`, `review`, `ship`, `learn`, `evolution`, `reflection`, `archive`. Two execution paths: `full` (all 15) or filtered (11, skipping the four design-only stages: `tool-research`, `feature-design`, `architecture`, `prototype`).
2. **Stage-to-task mapping**: How each Hello Dev stage maps to a host task/progress item. Naming convention and description.
3. **Status mapping**: How Hello Dev's 5 stage statuses (`pending`, `in_progress`, `completed`, `failed`, `rolled_back`) map to the host's status values.
4. **Initialization sequence**: What to do after `state.js init` -- create tasks for all stages in the active path.
5. **Transition sync**: Every `state.js stage <name> <status>` call must be immediately followed by a host status update.
6. **Rollback handling**: How to propagate `rolled_back` to downstream stages.

See `workbuddy.md` for a complete implementation example.>

## Optional: Sub-Agent Type Selection

<If the host offers multiple sub-agent types (read-only, general-purpose, planning, etc.), describe when to use which. A table mapping subtask characteristics to sub-agent types is recommended.>

## Optional: Parallelism Limits

<If the host has limits on concurrent sub-agents, resource constraints, or throttling behavior, describe them here.>

## Optional: Examples

<Provide one or more concrete invocation examples showing:
- A real decomposition scenario
- The actual tool call(s) with filled-in parameters
- Expected result format>
