# Stage 1: Bootstrap - Initialization

> Find the correct project, confirm existing work and capability boundaries; do not change state for loading skill.
>
> **Memory Integration**: Before proceeding, retrieve reusable experience from past tasks. This prevents repeating mistakes and accelerates problem-solving. Evidence pipeline starts here: snapshot -> recall -> (later) adopt -> outcome.

## Pre-flight: Memory Retrieval (Why: Reuse past experience, avoid repeating mistakes)

```bash
node scripts/memory.js snapshot --tag task-start  # Snapshot for Ship recall-check
node scripts/memory.js recall --layer L2 --limit 5  # Episodic: similar past tasks
node scripts/memory.js recall --layer L3 --limit 3  # Semantic: patterns and principles
node scripts/memory.js recall --layer L4 --limit 3  # Procedural: reusable workflows
```
If no entries found, skip -- memory gaps do not block Bootstrap.

1. Read target project AGENTS.md, related requirements/architecture, current workspace state. Preserve user's existing changes.
2. Based on [classifier](../core/task/classifier.md), determine read-only, design, confirmed-plan implementation, or other writes.
3. Check available tools and permissions; see [runtime-adapters.md](../../references/runtime-adapters.md). Do not fabricate tool calls when tools are missing.
4. If state exists, first `node scripts/state.js resume`. Do not overwrite or silently archive unfinished tasks; confirm whether to resume, end, or open a separate isolated project.
5. After scope confirmation for modification tasks, init; skill scripts called from installation location; cwd stays as target project.
6. Load [log rules](../../docs/progress_coding/_RULES.md) and [state protocol](../core/state-protocol.md); read-only tasks do not need to write logs.
7. Retrieve memory (optional, seconds-level): `node scripts/memory.js recall --layer L2`. Read relevant entries if found; skip if none -- memory gaps do not block Bootstrap, and do not fabricate data "for having output". Also retrieve L3 (patterns) and L4 (procedures) to accumulate reusable experience. Take snapshot before retrieval (for Ship stage recall-check comparison):
   ```bash
   node scripts/memory.js snapshot --tag task-start  # Take snapshot (for Ship comparison)
   node scripts/memory.js recall --layer L2 --limit 5  # Episodic: historical experience from similar tasks
   node scripts/memory.js recall --layer L3 --limit 3  # Semantic: related concepts and principles
   node scripts/memory.js recall --layer L4 --limit 3  # Procedural: reusable workflows
   ```
8. Record task collaboration table (optional, seconds-level): `node scripts/state.js collab detect` writes detected skill set snapshot to state for subsequent stages and audit review. Detection only reads disk and **does not mean these skills can be called or authorized**; host not having skills installed or scripts missing does not block flow.
9. Auto-search and install needed plugins (optional): `node scripts/search-install-skill.js analyze` generates plugin installation judgment prompt (with impact analysis and scope constraints); Agent analyzes and outputs installation plan to `state.json.pluginInstallationPlan`, then runs `node scripts/search-install-skill.js install` before Implementation starts. After installation, run `node scripts/detect-skills.js --write` to update collaboration matrix.
   - **Tier 1 cross-host adaptation (2026-10-11)**: `analyze` and `usage-report` now work on both Claude Code and WorkBuddy. When CLI is unavailable, falls back to directory scanning (WorkBuddy constructs equivalent data from marketplace directory + `installed_plugins.json`). `install` / `uninstall` actions still depend on `claude plugin install` CLI, which is not available on WorkBuddy -- WorkBuddy users should use the host-provided tool `search_and_install_skills` instead.
   - **Impact Analysis (P0-1)**: Perform directory scanning on available plugins on disk, extract component info (skills/agents/commands/hooks/MCP servers), calculate risk level (safe/moderate/elevated)
   - **Scope Constraints (P0-2)**: Generated prompt injects per-install limit (3), priority order (safe > moderate > elevated), task matching constraints
   - **Impact Analysis (P0-1)**: Perform directory scanning on available plugins on disk, extract component info (skills/agents/commands/hooks/MCP servers), calculate risk level (safe/moderate/elevated)
   - **Scope Constraints (P0-2)**: Generated prompt injects per-install limit (3), priority order (safe > moderate > elevated), task matching constraints

```bash
node scripts/state.js init --name "Confirmed task" --type implementation --path full
node scripts/memory.js snapshot --tag task-start
node scripts/memory.js recall --layer L2 --limit 5
node scripts/state.js collab detect
node scripts/search-install-skill.js analyze  # Optional: generate plugin installation judgment prompt
node scripts/state.js stage bootstrap completed
node scripts/state.js stage initialization in_progress
```

Then enter [initialization](initialization.md): the session's first planning step (scope survey + coarse decomposition). It produces the coarse plan only and confirms nothing about scope — the overall goal and scope are confirmed in requirement.

Initialization does not mean user has approved all subsequent operations. Requirement uses real confirmation or explicit direct execution authorization as checkpoint. When requirements are unconfirmed, only do side-effect-free observation; do not change project configuration for the sake of "persistence".
