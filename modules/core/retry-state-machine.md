# Retry State Machine - Retry Protocol

> Actual storage, commands, and transitions follow [state-protocol.md](state-protocol.md) and scripts/state.js; does not maintain a second state model.

## Module State

```text
Design -> submitted -> approved
                 -> annotated -> modified then submitted
                 -> rejected  -> modified then submitted (within limit)
```

approved/annotated can only target this stage's current round submitted. annotated does not count as approval. Only the reject command can produce rejected; must provide reason and accumulate module/global rejection count; cannot use `module rejected` to bypass counting.

Default module cumulative rejection 3 times or global cumulative 10 times triggers limit; it is not "consecutive failures followed by success resets count". After hitting limit, stop stage progression and module changes; generate report; wait for user decision.

```bash
node scripts/state.js reject storage --reason "Missing recovery strategy"
node scripts/state.js report
node scripts/state.js retry-resume --reason "User explicitly approved one more attempt"
```

retry-resume preserves history and counts; only extends limit and saves basis. It cannot make authorization judgments for the user; must not be called without explicit approval. block/unblock does not release retry limit exceeded.

User can continue, change direction, pause, or terminate. Do not repeat same attempts without new evidence; do not adopt the rule "must run infinitely because only manual force can terminate".

## Stage State

Valid transitions for pending / in_progress / completed / failed / rolled_back are constrained by CLI. Rollback invalidates downstream records and requires new evidence; cannot use old approvals and old tests to auto-complete rework.

For recovery, first `node scripts/state.js resume`; read pending modules, latest checkpoints, and blockers. Do not guess counts from conversation memory; do not manually edit JSON to reset.
