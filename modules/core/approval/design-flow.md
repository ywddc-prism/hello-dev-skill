# Design Approval Flow

> Split real design decisions into independently judgable modules; do not split mechanical steps for the sake of approval.

## Each Submission

Describe the problem, boundaries, candidate approaches, recommendation with trade-offs, acceptance method, and pending items; ask only one current blocking decision.

Major decisions should include a [structured decision record](../../../templates/design-decision.md), answering at least: what problem to solve,
why this choice, what was given up, how to prove it right later, how to roll back if wrong. **This sets the floor for content quality, not new fields** --
no new CLI subcommands, no new state fields; approval itself remains submitted -> approved.
After user approves an existing approach, do not re-request the same authorization. Overall approval can only record basis per module when it clearly covers module content.

## Interaction and State

Use interaction tools that are real, available, and permitted on the current host; when unavailable, ask in conversation and wait; do not pretend to call AskUserQuestion or ExitPlanMode. Timeout is not approval; mode switching is not expanding authorization.

```bash
node scripts/state.js module api submitted
node scripts/state.js module api approved --reason "User explicitly approved interface scope"
node scripts/state.js module storage submitted
node scripts/state.js module storage annotated
```

- approved: This round's submitted version has been explicitly approved; record the reason.
- annotated: Annotations received; not yet approved; after processing, resubmit.
- rejected: Recorded via `node scripts/state.js reject storage --reason "rejection reason"`, accumulates retries; after modification, resubmit.
- design: Design in progress; does not count as approval passed.

Module IDs cannot be mixed between feature-design and architecture; use independent IDs like feature-api / arch-storage. After rollback reopens a stage, this round's modules must be resubmitted; old approvals do not automatically cover new designs.
All modules in this stage must be approved to complete; adjustments to rejected modules can continue, but stop when retry limit is exceeded and output [contrast report](../contrast-report.md).

## Approval Does Not Equal Release Authorization

Design approval does not include Git write operations, installation sync, deployment, deletion, or dependency upgrades that were not explicitly authorized. See [runtime-adapters.md](../../../references/runtime-adapters.md) for runtime boundaries.
