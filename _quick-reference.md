# Hello Dev — Quick Reference (30-line)

> New agent? Start here. Full docs at [SKILL.md](SKILL.md) and [modules/index.md](modules/index.md).

## 1. Confirm scope
Read-only checks → direct. Modifications → confirm problem, scope, success criteria, exclusions.

## 2. Initialize state
```bash
node scripts/state.js init --name "Task" --type implementation [--path full]
node scripts/state.js stage bootstrap completed
node scripts/state.js stage initialization in_progress
```

## 2b. Initialize: scope survey + coarse decomposition (every path)
```bash
node scripts/state.js checkpoint "Scope survey" pass --reason "affected files / change units / module roots"
node scripts/state.js decompose --coarse true --tasks '[{"id":"c1","name":"...","depends":[]}]'
node scripts/state.js checkpoint "Coarse decomposition plan" pass --reason "coarse units and their dependencies, listed with the files each one touches"
node scripts/state.js stage initialization completed
node scripts/state.js stage requirement in_progress
```
> Coarse answers "which units exist and in what order". It confirms no scope and owes **no**
> dispatch. The overall goal and scope are confirmed in requirement, which writes the fine plan.

## 3. Decompose, fine level (mandatory unless the scope survey reports a single logical change unit: 1 file, de-duplicated <50 lines, no deps)
```bash
node scripts/state.js decompose --tasks '[{"id":"t1","name":"...","depends":[],"affectedFiles":["f1"]}]'
node scripts/state.js dispatch-plan    # parallel groups are mandatory to dispatch
node scripts/state.js dispatch-mode serial   # explicit opt-out; parallel is the default
node scripts/state.js dispatch --wave 2 --subtasks t2,t3 --agent <name>
node scripts/state.js order
```
> Routing uses the escalation criterion defined once in
> [escalation.md](modules/core/task/escalation.md),
> section "Change-complexity checkpoint";
> read that section for the branches -- this file does not restate them.
> decompose != escalate. "Spans business modules" is decided by module root, defined in the same section.

## 4. Execute by wave → Testing → Review → Ship
Each stage: explicit transition, evidence required, no implicit completion.

## 5. Codex sub-agent dispatch (parallel waves)
```bash
node scripts/codex-prompt.js wave --wave 1 --project "my-app" --project-path /path/to/app
# => JSON with prompts for each subtask
# Parallel task: add --task <id> to read .hello-dev/state.sibling-<id>.json
# Agent calls: mcp__codex_app__create_thread({ prompt, title, target: {type:"project", projectId, environment:{type:"worktree"}} })
# Then: mcp__codex_app__wait_threads({ targets: [{threadId}], timeoutMs: 300000 })
```

## 6. Git / ops commands require separate approval
Task confirmation ≠ Git/ops authorization. Hooks only work on registered hosts.
When the ops gate returns `deny` or `ask`: pause, report the exact command and reason, ask for
authorization, wait for explicit confirmation. Never bypass it by other commands or wrappers.

## 7. Memory: candidate → validation → merge/reject → write
```bash
node scripts/memory.js recall --layer L2 --limit 5
node scripts/memory.js add --layer L2 --content "..." --source <evidence>
```

## Key files
- `SKILL.md` — Execution contract
- `modules/core/state-protocol.md` — State persistence
- `modules/core/approval/git-gate.md` — Git risk classification
- `modules/core/task/decomposition.md` — Task decomposition rules
- `modules/stages/initialization.md` — Scope survey + coarse decomposition (session step 2)
- `modules/hosts/codex.md` — Codex sub-agent dispatch
- `docs/progress_coding/_RULES.md` — Development log rules
