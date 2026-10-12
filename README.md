# Hello Dev

**English** | [Chinese](README.zh-CN.md)

**Ensure AI builds what you actually want.**

Hello Dev is a development enhancement system that solves seven problems AI-assisted development repeatedly hits: building the wrong thing, parallel execution collisions, experience loss across sessions, fuzzy approval boundaries, tests that pass without real verification, state loss on restart, and platform lock-in.

## Core Value: Deliver What Users Actually Want

Unlike other AI dev tools that focus on "writing code faster", Hello Dev focuses on **building the right thing**. Through structured requirement interrogation, prototype-first validation, and mandatory user checkpoints at every critical stage, it ensures the final deliverable matches the user's real needs -- not what the AI guessed.

| Traditional AI Dev Tools | Hello Dev |
|-------------------------|-------------|
| Focus on coding speed | Focus on delivery correctness |
| Assume requirements are clear | Assume requirements need validation |
| Verify after development | Validate before development |
| "I built it fast" | "I built the right thing" |

## What It Solves

| Problem | How Hello Dev Addresses It |
|---------|------------------------|
| AI builds the wrong thing because requirements were misunderstood | Structured requirement interrogation (grill-me) with decision tree traversal + prototype validation before implementation + mandatory user checkpoints at every critical stage |
| Multiple sub-agents silently overwrite each other's file changes | Dependency-graph-driven wave scheduling + automatic file conflict detection (overlapping `affectedFiles` forces sequential execution) |
| Lessons from past tasks disappear when the conversation ends | Five-layer memory (L0-L4) with write gate rejecting speculation + evidence pipeline tracking whether each experience actually helped (`improved`/`regressed`/`no_effect`/`unknown`) |
| Task confirmation treated as blanket authorization for commits and deployments | Separate confirmation for Git writes, ops commands, and deployment; dual PreToolUse hooks classify risk before execution |
| Running tests is not the same as proving correctness | Risk-first four-layer verification: identify risks -> prove with build/regression/behavior/boundary evidence |
| Session restart loses all approvals and progress | Full state persistence in `.hello-dev/state.json`; recover via `resume` |
| Workflow tied to a single AI platform | Host Adapter layer decouples scheduling core from platform-specific sub-agent dispatch (WorkBuddy, Claude Code, Codex) |

## Quick Start

```bash
# 1. Initialize a new task (every task starts on the full chain)
node scripts/state.js init --name "Your task name" --type implementation

# 2. Follow the execution path
# full: bootstrap -> initialization -> requirement -> tool-research -> feature-design -> architecture -> prototype -> implementation -> testing -> review -> ship -> learn -> evolution -> reflection -> archive
# When a design stage is unnecessary, propose it and record the user-approved skip:
# node scripts/state.js skip <stage> --reason "<user approval, verbatim>"

# 3. Run self-check after modifications
bash scripts/self-check.sh
```

For detailed usage, see [_quick-start.md](_quick-start.md).

## Core Concepts

- **Execution Contract**: 7 principles governing scope confirmation, causality understanding, exception handling, accurate accounting, minimal authorization, minimal change, and stoppability.
- **Execution Path**: Every task runs the full 15-stage chain. When a design stage is unnecessary, the agent proposes the skip at the stage boundary and records it only after user approval (`state.js skip`). The escalation criterion and the module-root definition of "spans business modules" are defined once in [escalation.md](modules/core/task/escalation.md); this list cites them and does not restate their thresholds.
- **Dual-Gate Strategy**: Git operations and ops commands (kubectl, systemctl, terraform) are classified by risk level before execution.
- **State Persistence**: All approvals, retries, and checkpoints are recorded in `.hello-dev/state.json` for recovery and audit.

## Project Structure

```
hello-dev/
 SKILL.md                    # Execution contract and routing
 AGENTS.md                   # Agent entry point
 _quick-start.md             # Quick start guide
 modules/
    core/                   # Core modules (state protocol, approval, task management)
    stages/                 # Stage definitions (bootstrap -> ship)
    paths/                  # Execution paths (full flow, legacy fast doc retired)
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
node scripts/state.js init --name "Task" --type implementation
node scripts/state.js stage <name> <status>
node scripts/state.js skip <stage> --reason "<user approval, verbatim>"
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
| `full` (the only path) | Bootstrap -> Initialization -> Requirement -> Tool Research -> Feature Design -> Architecture -> Prototype -> Implementation -> Testing -> Review -> Ship -> Learn -> Evolution -> Reflection -> Archive | Every task; design stages are skipped only via recorded user-approved `state.js skip` |

The escalation criterion and the module-root definition of "spans business modules" are defined once in [escalation.md](modules/core/task/escalation.md), which is the only place the thresholds are stated.

## Hard Constraints

- Read-only checks can be done directly; confirm scope for modifications
- Stages are explicitly persisted, not implicitly completed
- Testing and Review cannot be skipped
- Git operations require separate confirmation based on risk protocol
- Development logs must be appended immediately after modifications

## Version

Current: v15.11 (2026-10-07)

## License

[MIT](LICENSE) - Copyright (c) 2026 Hello Dev Contributors

This project is open source under the MIT License. You are free to use, modify, and distribute it, including for commercial purposes, as long as the copyright notice is preserved.
