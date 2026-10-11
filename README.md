# DevLoop Pro

**English** | [Chinese](README.zh-CN.md)

**Ensure AI builds what you actually want.**

DevLoop Pro is a development enhancement system that solves seven problems AI-assisted development repeatedly hits: building the wrong thing, parallel execution collisions, experience loss across sessions, fuzzy approval boundaries, tests that pass without real verification, state loss on restart, and platform lock-in.

## Core Value: Deliver What Users Actually Want

Unlike other AI dev tools that focus on "writing code faster", DevLoop Pro focuses on **building the right thing**. Through structured requirement interrogation, prototype-first validation, and mandatory user checkpoints at every critical stage, it ensures the final deliverable matches the user's real needs -- not what the AI guessed.

| Traditional AI Dev Tools | DevLoop Pro |
|-------------------------|-------------|
| Focus on coding speed | Focus on delivery correctness |
| Assume requirements are clear | Assume requirements need validation |
| Verify after development | Validate before development |
| "I built it fast" | "I built the right thing" |

## What It Solves

| Problem | How DevLoop Addresses It |
|---------|------------------------|
| AI builds the wrong thing because requirements were misunderstood | Structured requirement interrogation (grill-me) with decision tree traversal + prototype validation before implementation + mandatory user checkpoints at every critical stage |
| Multiple sub-agents silently overwrite each other's file changes | Dependency-graph-driven wave scheduling + automatic file conflict detection (overlapping `affectedFiles` forces sequential execution) |
| Lessons from past tasks disappear when the conversation ends | Five-layer memory (L0-L4) with write gate rejecting speculation + evidence pipeline tracking whether each experience actually helped (`improved`/`regressed`/`no_effect`/`unknown`) |
| Task confirmation treated as blanket authorization for commits and deployments | Separate confirmation for Git writes, ops commands, and deployment; dual PreToolUse hooks classify risk before execution |
| Running tests is not the same as proving correctness | Risk-first four-layer verification: identify risks -> prove with build/regression/behavior/boundary evidence |
| Session restart loses all approvals and progress | Full state persistence in `.devloop/state.json`; recover via `resume` |
| Workflow tied to a single AI platform | Host Adapter layer decouples scheduling core from platform-specific sub-agent dispatch (WorkBuddy, Claude Code, Codex) |

## Quick Start

```bash
# 1. Initialize a new task
node scripts/state.js init --name "Your task name" --type implementation --path fast

# 2. Follow the execution path
# fast: bootstrap -> initialization -> requirement -> implementation -> testing -> review -> ship -> learn -> evolution -> reflection -> archive
# full: bootstrap -> initialization -> requirement -> tool-research -> feature-design -> architecture -> prototype -> implementation -> testing -> review -> ship -> learn -> evolution -> reflection -> archive

# 3. Run self-check after modifications
bash scripts/self-check.sh
```

For detailed usage, see [_quick-start.md](_quick-start.md).

## Core Concepts

- **Execution Contract**: 7 principles governing scope confirmation, causality understanding, exception handling, accurate accounting, minimal authorization, minimal change, and stoppability.
- **Execution Paths**: Choose `fast` when the scope survey reports a single logical change unit (de-duplicated <50 lines, no new dependencies); otherwise `implementation` for standard tasks, or `full` for new design work. The escalation criterion and the module-root definition of "spans business modules" are defined once in [escalation.md](modules/core/task/escalation.md); this list cites them and does not restate their thresholds.
- **Dual-Gate Strategy**: Git operations and ops commands (kubectl, systemctl, terraform) are classified by risk level before execution.
- **State Persistence**: All approvals, retries, and checkpoints are recorded in `.devloop/state.json` for recovery and audit.

## Project Structure

```
devloop-pro/
 SKILL.md                    # Execution contract and routing
 AGENTS.md                   # Agent entry point
 _quick-start.md             # Quick start guide
 modules/
    core/                   # Core modules (state protocol, approval, task management)
    stages/                 # Stage definitions (bootstrap -> ship)
    paths/                  # Execution paths (fast, full, dev-mode-guide)
    hosts/                  # Host adapter layer for sub-agent dispatch
 scripts/                    # CLI tools (state.js, memory.js, self-check.sh)
 hooks/                      # PreToolUse hooks (git-gate.js, opsgate.js)
 references/                 # Detailed references (runtime adapters, cost metrics)
 templates/                  # Document templates
 docs/progress_coding/       # Development logs
```

## Key Commands

```bash
# State management
node scripts/state.js init --name "Task" --type implementation --path fast
node scripts/state.js stage <name> <status>
node scripts/state.js checkpoint "Name" pass --reason "Evidence"
node scripts/state.js decompose --tasks '[...]'
node scripts/state.js resume

# Memory management
node scripts/memory.js recall --layer L2 --limit 5
node scripts/memory.js add --layer L2 --content "..." --source "evidence"

# Validation
bash scripts/self-check.sh
node scripts/gen-index.js --check
node scripts/check-links.js
```

## Execution Paths

| Path | Stages | Use Case |
|------|--------|----------|
| `fast` | bootstrap -> initialization -> requirement -> implementation -> testing -> review -> ship -> learn -> evolution -> reflection -> archive | Scope survey reports a single logical change unit (de-duplicated <50 lines, no new dependencies); this is the inverse of the escalation criterion defined once in [escalation.md](modules/core/task/escalation.md), which is the only place the thresholds are stated |
| `implementation` | Same as fast | Standard tasks with clear plan |
| `full` | bootstrap -> initialization -> requirement -> tool-research -> feature-design -> architecture -> prototype -> implementation -> testing -> review -> ship -> learn -> evolution -> reflection -> archive | New design or major architecture changes |

## Hard Constraints

- Read-only checks can be done directly; confirm scope for modifications
- Stages are explicitly persisted, not implicitly completed
- Testing and Review cannot be skipped
- Git operations require separate confirmation based on risk protocol
- Development logs must be appended immediately after modifications

## Version

Current: v15.11 (2026-10-07)

See [OPTIMIZATION-REPORT.md](archive/OPTIMIZATION-REPORT.md) for version history.

## License

This project is for internal use. Contact the maintainer for licensing questions.
