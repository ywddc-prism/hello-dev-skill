# Fast Path (Retired)

> The fast path is retired. Every task now runs the full 15-stage chain; lightening the flow happens only through recorded, user-approved stage skips.

## What changed

Previously `--path fast` (and the `type=implementation` route filter) silently removed the four design stages (`tool-research`, `feature-design`, `architecture`, `prototype`) from the route. That was a silent routing decision: the user never approved the removal, and the state file could not say what had been skipped or why.

Under the full-chain default:

- `init` no longer accepts `--path` (passing it fails with a targeted error).
- Every task starts on the full chain: `bootstrap -> initialization -> requirement -> tool-research -> feature-design -> architecture -> prototype -> implementation -> testing -> review -> ship -> learn -> evolution -> reflection -> archive`.
- When a design stage is unnecessary, the agent proposes skipping it **at the stage boundary** (current stage completed, next not yet in progress) with a recommendation; if the user approves, record it:

```bash
node scripts/state.js skip <stage> --reason "<user approval, verbatim>"
```

Only the four design stages are skippable. Authorization gates (bootstrap, initialization, requirement), evidence gates (testing, review), ship, and the four post-delivery retrospectives (learn, evolution, reflection, archive) are never skippable. The skip is recorded in `state.skipped` with the reason, is visible in `show`/`resume`, and survives rollback.

## What did NOT change

Requirement confirmation, Testing, Review, and the four post-delivery stages were never reduced by the fast path, and they are not reduced now. The scope survey still decides *whether to propose a skip*, using the affected-file list, the number of logical change units, and whether the change spans business modules — not a bare line count.

## Legacy states

States written under the old contract (`task.path === 'fast'`, or `type=implementation` with no `skipped` field) keep their old 11-stage route: they never scheduled design stages, and reading them as the full chain would demand unscheduled work. The `route()` function in `scripts/lib/stages.js` splits on the presence of the `skipped` field to preserve exactly that behavior.

For the active path, see [full-flow.md](full-flow.md). CLI transitions and checkpoints in [state-protocol.md](../core/state-protocol.md).
