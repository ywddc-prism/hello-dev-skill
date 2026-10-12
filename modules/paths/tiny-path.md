# Tiny Path

> Single-file trivial changes. Runs the full 15-stage chain but merged into four phases executed by the lead agent alone — no sub-agents spawned.

Applicable: scope survey reports a single file, single logical change unit, de-duplicated ≤ 10 lines, no test updates needed, no cross-module impact, no undecided design points. The key criterion is **no sub-agent needed** — the change is small enough that spawning a team would cost more overhead than the change itself.

Under the full-chain default, tiny does **not** route through a shorter chain: design stages are skipped only through the recorded, user-approved `state.js skip` mechanism (proposed at the stage boundary when the survey shows no design point). The chain is `bootstrap -> initialization -> requirement -> tool-research -> feature-design -> architecture -> prototype -> implementation -> testing -> review -> ship -> learn -> evolution -> reflection -> archive`; with design stages skipped, the execution path reaches implementation through consent-based skips, not a separate declared route.

## Tiny Entry Conditions (all must hold)

| Condition | Threshold |
|-----------|-----------|
| Affected files | 1 |
| Logical change units | 1 |
| De-duplicated estimated lines | ≤ 10 |
| Cross-module | No |
| Undecided design point | None |
| Test updates needed | No |
| API / data model change | No |

**Any condition not met → escalate to the standard flow** (see [escalation.md](../core/task/escalation.md)).

## Orchestration Phases

The stages are still all executed, but merged into fewer phases run by the lead agent alone:

| Phase | HelloDev Stages | Who | Notes |
|-------|---------------|-----|-------|
| 1 | bootstrap + initialization + requirement | Lead agent | No scope-gatekeeper sub-agent; lead confirms boundary directly and records basis |
| 2 | tool-research + feature-design + architecture + prototype (skipped when the survey shows no design point, via user-approved `state.js skip`) + implementation + testing | Lead agent | Implement the change, then run applicable verification. Testing scope is minimal for single-file trivial changes |
| 3 | review + ship | Lead agent | Self-review + delivery conclusion. No independent reviewer sub-agent |
| 4 | learn + evolution + reflection + archive | Lead agent | Combined: write memory entry, close loop, update index. Minimal ceremony for trivial changes |

## State Initialization

Tiny path still initializes HelloDev state (`state.js init`) for audit traceability. The task type is `implementation`; the route is always the full chain:

```bash
node scripts/state.js init --name "Task name" --type implementation
```

## What Tiny Does NOT Skip

- Authorization (Git writes, ops commands still need separate confirmation)
- State initialization (state.json is still created)
- Development log (append immediately after changes)
- Memory write (at minimum, record what was done in L2)

## When Tiny Cannot Be Used

- Any escalation criterion met (≥ 2 change units, cross-module, undecided design point, > 10 lines)
- Test updates required
- API or data model changes
- The change is in a file that other sub-agents or sessions are concurrently modifying

## Comparison

| Dimension | Tiny | Standard |
|-----------|------|----------|
| Sub-agents spawned | None | Full team (all members) |
| HelloDev stages covered | 15/15 (full path) (merged; design stages skipped only via user-approved `state.js skip` when the survey shows no design point) | 15/15 (full path) (full chain, design stages executed) |
| Independent review | No (self-review) | Yes (reviewer) |
| Typical scenario | Typo fix, config value change | New module, architecture change |

CLI transitions and checkpoints in [state-protocol.md](../core/state-protocol.md). Full flow: [full-flow.md](full-flow.md).
