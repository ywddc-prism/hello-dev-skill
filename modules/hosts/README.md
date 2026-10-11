# Host Adapter Layer -- Sub-Agent Dispatch

> Decouple the scheduling core (decomposition, wave derivation, dependency graph, conflict detection, state machine) from host-specific sub-agent mechanics. The core is host-agnostic; each host adapter declares how the main agent should invoke and constrain sub-agents on that host.

## Purpose

Hello Dev's task decomposition and wave-based dispatch ([decomposition.md](../core/task/decomposition.md)) produce a plan: what subtasks exist, their dependencies, their wave order, and whether a wave should run serially or in parallel. The plan says **what** to do; the host adapter says **how** on a specific host.

Without this layer, the main agent must already know the host's sub-agent API at execution time. That implicit coupling breaks when the same Hello Dev repository runs on different hosts (WorkBuddy, Claude Code, Codex, etc.), each with its own sub-agent invocation mechanism.

## Design Principles

1. **Declarative, not executable.** Host adapters are instructions for the main agent, not runtime code. They tell the agent what tools to call, what constraints to apply, and how to collect results -- using the host's native capabilities.

2. **Core stays host-agnostic.** The scheduling core (`scripts/state.js`, `decomposition.md`, `implementation.md`) never references a specific host. It produces decomposition, waves, and dispatch mode. The host adapter is consulted only during Implementation when dispatching sub-agents.

3. **Interface, not implementation.** Each host adapter conforms to a fixed set of sections (see Interface Contract below). New hosts are added by creating a new file following `_template.md`. No changes to the core are needed.

4. **Minimal surface.** Adapters describe only what differs between hosts: how to launch a sub-agent, what prompt structure to use, how to collect results, and what to do on failure. Shared constraints (no state writes, no Git operations, no user interaction) live in `decomposition.md` and are not duplicated.

5. **Backward compatible.** When no host adapter is loaded, the main agent falls back to its existing behavior -- using whatever sub-agent mechanism it knows for the current host. The adapter layer is additive.

## Interface Contract

Every host adapter file **must** contain these sections:

### Required Sections

| Section | Description |
|---------|-------------|
| **Host Identification** | Host name, version constraints (if any), and how the main agent detects it is running on this host. |
| **Sub-Agent Invocation** | The exact mechanism to launch a sub-agent. Tool name, required parameters, parameter format. |
| **Prompt Construction** | How to build the sub-agent's prompt from a decomposition subtask: which fields to include (scope, affectedFiles, acceptance criteria, off-limits files, and the context the sub-agent cannot inherit: file paths with line anchors, verbatim text, baselines), and in what structure. |
| **Result Collection** | How the main agent receives and interprets sub-agent output. What constitutes success, partial completion, or failure. |
| **Failure Handling** | Host-specific retry or fallback behavior. How to recover when a sub-agent fails. |
| **Constraints** | Any host-specific limitations or gotchas beyond the universal constraints in `decomposition.md`. |

### Optional Sections

| Section | Description |
|---------|-------------|
| **State Machine Integration** | How to synchronize Hello Dev's stage state machine into the host's task/progress tracking system. Stage-to-task mapping, status mapping, initialization sequence, and transition sync. Required for hosts that provide user-visible task tracking (e.g. WorkBuddy's TaskCreate/TaskUpdate). |
| **Parallelism Limits** | Maximum concurrent sub-agents, resource considerations. |
| **Sub-Agent Type Selection** | When the host offers multiple sub-agent types (read-only explorer vs. general-purpose), which to use for which subtask characteristics. |
| **Examples** | Concrete invocation examples for this host. |

## File Structure

```
modules/hosts/
  README.md        -- This file. Interface contract and design principles.
  _template.md     -- Blank template for adding a new host adapter.
  workbuddy.md     -- WorkBuddy host adapter.
  codex.md         -- Codex desktop app host adapter (side tasks via create_thread/wait_threads).
  (future).md      -- Claude Code, etc.
```

## How the Main Agent Uses This Layer

During Implementation with `dispatchMode: parallel`:

```
1. Main agent reads decomposition and order table (state.js order)
2. Main agent identifies current host (by host detection rules in the adapter)
3. Main agent loads the matching host adapter file
4. For each parallel wave:
   a. For each subtask in the wave:
      - Build prompt per host adapter's "Prompt Construction" section
      - Launch sub-agent per host adapter's "Sub-Agent Invocation" section
   b. Collect results per host adapter's "Result Collection" section
   c. Handle failures per host adapter's "Failure Handling" section
   d. Verify results (universal constraint: main agent verifies, sub-agent self-reports are not accepted)
   e. Mark subtasks completed/failed, record checkpoint
5. Proceed to next wave
```

When `dispatchMode: serial`, the host adapter is not consulted -- the main agent implements subtasks directly.

## Adding a New Host

1. Copy `_template.md` to `modules/hosts/<host-name>.md`.
2. Fill in all required sections.
3. Add host detection rules that are reliable and unambiguous.
4. Test by running a decomposition with `dispatchMode: parallel` on the target host.
5. Update this README's file structure table.

Do not modify `decomposition.md`, `implementation.md`, or `scripts/state.js` to accommodate a new host. If an adapter needs core changes, that is a design gap -- revisit the interface contract.

## Relationship to Existing Modules

| Module | Relationship |
|--------|-------------|
| [decomposition.md](../core/task/decomposition.md) | Defines universal sub-agent constraints. Host adapters extend with host-specific details. |
| [implementation.md](../stages/implementation.md) | References host adapters during parallel dispatch. |
| [state-protocol.md](../core/state-protocol.md) | State CLI is host-independent. Host adapters do not add state commands. |
| [runtime-adapters.md](../../references/runtime-adapters.md) | Describes host capability detection at the tool level. Host adapters operate at the sub-agent dispatch level -- a different layer. |
