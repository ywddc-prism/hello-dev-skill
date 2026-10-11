# Stage 8: Ship - Delivery

> Delivery completion does not mean auto-commit, push, or go-live.

## Pre-checks

- Current path's stages explicitly completed; Testing and Review valid and based on this round's evidence.
- Requirements, implementation, and documentation are consistent; changelog appended immediately; remaining limitations explained.
- No failures concealed and no unexecuted tests written as passed.
- If new modifications appear, rollback implementation and revalidate; do not secretly patch code in Ship.

## Delivery Content

Describe actual changes, verification results, updated documentation, unexecuted items, and necessary recovery methods. If task collaboration table was recorded during Bootstrap
(`node scripts/state.js collab`), also report which skills were actually used this task; the snapshot's list is
skills **present at that time**, not that they were called this task -- report must distinguish "present" from "used".
If plugin auto-installation was executed (`pluginInstallationResult`), summarize installation results:

```bash
# Read installation results
node -e "const s=require('./.hello-dev/state.json'); if(s.pluginInstallationResult){const r=s.pluginInstallationResult; console.log('Plugin installation summary:'); console.log('  Success:', r.summary.success); console.log('  Failed:', r.summary.failure); r.installed.forEach(p=>console.log('    OK:', p.name)); r.failed.forEach(p=>console.log('    FAIL:', p.name, '-', p.error));}"
```

Optional: Generate usage report and clean up unused plugins:

```bash
# Generate usage report (compare installed vs collab snapshot)
node scripts/search-install-skill.js usage-report

# Preview uninstallable plugins
node scripts/search-install-skill.js uninstall

# Execute uninstall (requires user confirmation)
node scripts/search-install-skill.js uninstall --execute
```
Do not require users to do irrelevant satisfaction questionnaires; do not auto-write memory or schedule cron tasks for delivery.
When there truly is reusable experience, first pass through [memory write gate](../../SKILL.md) before persisting; must be facts confirmed by user this round:

```bash
node scripts/memory.js add --layer L2 --content "One reusable experience from this task" --source "User's exact words or verified output"
```

Also extract reusable patterns and processes to L3/L4 (evidence pipeline's high-level write):

```bash
# Extract reusable patterns to L3 (semantic memory: concepts, principles, architecture constraints)
node scripts/memory.js add --layer L3 --content "Reusable pattern discovered in this task" --source "User-confirmed fact" --tags pattern,architecture
# Extract verified execution strategies to L4 (procedural memory: workflows, diagnostic steps)
node scripts/memory.js add --layer L4 --content "Execution strategy verified effective in this task" --source "Verification output" --tags process,strategy
```

Leave empty if none; do not write one just for the count; development logs still go to `docs/progress_coding/`, not memory.

Git add/commit/push, deployment, and installation sync only executed after explicit user authorization; follow [Git Gate](../core/approval/git-gate.md) and [Runtime Boundaries](../../references/runtime-adapters.md). Must not claim auto-approval popup for hosts without registered hooks.

## Evidence Recovery (Closing the Evidence Pipeline Loop)

Before Ship completion, run evidence recovery check; compare Bootstrap snapshot with current memory state; find entries retrieved but not adopted this task and backfill:

```bash
# Evidence recovery: compare snapshots, find missed adopts
node scripts/evolve.js recall-check
```

If `recall-check` finds `recalledButNotAdopted` entries, backfill adopt per suggestions:
```bash
node scripts/memory.js adopt --id <entry-id> --source "Used this pattern/process this task"
```

After backfilling, can rerun `recall-check` to confirm all processed. This is Ship stage's final check to ensure evidence pipeline is closed.

```bash
node scripts/state.js stage ship completed
node scripts/state.js stage learn in_progress
```

Ship completing is not the end of the loop. The four post-delivery stages -- Learn, Evolution, Reflection, Archive -- are mandatory on every execution path and run in that order. Do not call the `archive` command here: `state.js archive` relocates `.hello-dev/state.json` out of the active location, after which no later stage can be entered, so running it at Ship makes Learn, Evolution, Reflection, and Archive unreachable. The `archive` command is the close-out of the **Archive stage** and runs only after `node scripts/state.js stage archive completed`. It saves a snapshot; it is not completion evidence by itself. It may also be used when the user explicitly terminates an unfinished task, but the task must then be honestly marked uncompleted.
