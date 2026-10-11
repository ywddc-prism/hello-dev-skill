# Implementation Agent - Implementation Responsibilities

> "Implementation Agent" is an execution responsibility. It launches sub-agents when a parallel group exists, because `dispatchMode` now defaults to `parallel`.

Break confirmed approach into verifiable small batches: check related code -> reproduce problem first / write regression -> minimal implementation -> immediate log -> build -> related verification -> review.

**Dispatch mode determines delegation**: `dispatchMode` defaults to `parallel`, so every wave the analysis marks `parallel` **must** be dispatched to sub-agents and the dispatch recorded with `state.js dispatch`. Set `dispatchMode` to `serial` only as an explicit opt-out with a recorded reason (or use `dispatch-waive` for one wave). Sub-agents are execution tools, not decision makers -- they receive scope, execute, and return results for the main agent to verify.

## Per-Batch Boundaries

- Do not overwrite user's existing changes; read related context before modifying.
- Stop and confirm when new dependencies, behavior changes, or architecture expansion exceed approved scope.
- Immediately append [log](../../docs/progress_coding/_RULES.md) after modification; co-update directly affected documents.
- On failure, locate root cause first before changing; do not repeat blind attempts without new evidence.
- Git operations follow [risk protocol](approval/git-gate.md); add/commit is not LOW risk and is not a step that must be executed as an atomic development unit.
- Checkpoints are execution evidence, not auto-commits or deployments.

## Sub-Agent Delegation (when a parallel group exists)

When delegating to sub-agents:

1. Read the plan first: `node scripts/state.js dispatch-plan`. It lists which waves must be dispatched and what is outstanding.
2. Build a constrained prompt for each sub-agent: exact file scope from `affectedFiles`, implementation description, acceptance criteria, and off-limits files.
3. Launch the sub-agents of the same wave concurrently (same message), per the host adapter in [Host Adapter Layer](../hosts/README.md).
4. Record the dispatch: `node scripts/state.js dispatch --wave <n> --subtasks <ids> --agent <name>`.
5. Sub-agents do NOT write state, do NOT perform Git operations, do NOT interact with the user.
6. Main agent verifies all sub-agent output before marking subtasks completed.
7. Development logs for sub-agent changes are written by the main agent.
8. If a sub-agent fails, retry with a refined prompt or fall back to serial execution via `dispatch-waive --wave <n> --reason "..."`.

See [Task Decomposition](task/decomposition.md) for full constraints and failure handling.

## Rework and Interruption

State is managed by [State Protocol](state-protocol.md). Issues during implementation can be fixed and tests appended; when code changes are needed after entering Testing/Review, first rolled_back implementation, then redo subsequent stages.
Stop immediately when user terminates; record real blockers when unable to continue; do not achieve "completion" by fabricating pass.
