---
name: hello-dev
description: >
  Development enhancement framework with staged execution, task decomposition, parallel multi-agent
  dispatch with file conflict detection, five-layer memory with evidence pipeline, dual-gate approval
  (Git + ops commands), and drift detection. Use when tasks require change approval, parallel sub-agent
  coordination, experience accumulation, test verification, state recovery, refactoring, migration,
  or deployment governance.
agent_created: true
metadata:
  version: "15.11"
  updated: "2026-10-07"
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: 'node "${HELLODEV_SKILL_DIR:?Set HELLODEV_SKILL_DIR to the hello-dev skill directory}/scripts/hook-resolver.js" git-gate'
          timeout: 10
        - type: command
          command: 'node "${HELLODEV_SKILL_DIR:?Set HELLODEV_SKILL_DIR to the hello-dev skill directory}/scripts/hook-resolver.js" opsgate'
          timeout: 10
---

# Hello Dev

**English** | [Chinese](SKILL.zh-CN.md)

Transform confirmed requirements into verifiable deliverables; do not treat more rules or more stages as higher quality.

## Overview

Hello Dev is a development enhancement system built around six problems that AI-assisted development repeatedly hits:

1. **Parallel execution collides**: multiple sub-agents modifying the same file silently overwrite each other. Hello Dev solves this with dependency-graph-driven wave scheduling and automatic file conflict detection -- overlapping affected files force sequential execution within a wave.
2. **Experience disappears**: lessons from past tasks live only in conversation context that gets discarded. Hello Dev provides a five-layer memory system (L0-L4) with a write gate that rejects speculation, plus an evidence pipeline that tracks whether each recorded experience actually helped (improved/regressed/no_effect/unknown).
3. **Approval boundaries are fuzzy**: task confirmation is treated as blanket authorization, leading to unintended commits or deployments. Hello Dev enforces separate confirmation for Git writes, ops commands (kubectl, systemctl, terraform), and deployment -- with dual PreToolUse hooks that classify risk before execution.
4. **Tests pass but nothing was verified**: running a test suite is not the same as proving the change is correct. Hello Dev uses risk-first four-layer verification: identify what this change could break, then prove each risk with build/regression/behavior/boundary evidence.
5. **State is lost on session restart**: conversation history is the only record, and it is unreliable. Hello Dev persists all approvals, retries, checkpoints, and decomposition state in `.hello-dev/state.json`, recoverable via `resume`.
6. **Platform lock-in**: the same workflow must run on different AI hosts. Hello Dev decouples scheduling from dispatch through a Host Adapter layer, so the core state machine is host-agnostic while each platform provides its own sub-agent invocation mechanism.

It provides structured execution paths (design/full, implementation, fast) with mandatory Testing and Review stages, interactive architecture decision guidance, and an evolution system that evaluates experience candidates without auto-activating them.

## When to Use

- Tasks requiring change approval and test verification
- Development work involving Git operations or ops commands (kubectl, systemctl, terraform)
- Projects needing documentation-code-test synchronization
- Multi-agent collaboration requiring state isolation and file conflict detection
- Refactoring, migration, or deployment with audit trail requirements
- Any development governance scenario with drift detection needs
- Codex sub-agent parallel dispatch (via `create_thread` / `wait_threads` toolchain)

## Quick Start

1. **Describe the task** in natural language (e.g. "fix a bug", "give me a plan", "refactor auth module").
2. **Confirm scope**: the agent identifies the execution path (design/full, implementation, or fast) and confirms boundaries with you.
3. **Decompose subtasks** (unless the scope survey reports a single logical change unit): each subtask declares affected files for conflict detection.
4. **Execute stages**: Bootstrap -> Initialization -> Requirement -> Implementation -> Testing -> Review -> Ship -> Learn -> Evolution -> Reflection -> Archive. Design paths insert Tool Research, Feature Design, Architecture, and Prototype before Implementation.
5. **Verify and deliver**: each stage produces required output; Testing and Review gates cannot be skipped.

## Execution Contract

1. **Confirm boundaries first**: Read-only checks can be done directly; before modifications, confirm the problem, scope, success criteria, and exclusions. Do not re-ask what has already been confirmed.
2. **Understand key causality first**: When there are knowledge gaps, explain mechanisms and trade-offs; ask only one key question at a time; do not force teaching at every step.
   Questioning follows the `grill-me` discipline: model the plan as a decision tree, walk each branch to completion in dependency order, and give your recommended answer **before** asking each question. Resolve anything answerable by reading the codebase yourself instead of asking. The session ends when every branch is resolved; close with a summary of the decisions actually made.
3. **Clarify exceptions**: If the user says "just do it / use your judgment / don't ask" or provides a complete risk-free handoff, questions may be skipped but not stages, logs, Testing, or Review. Record the actual authorization basis.
4. **Accurate accounting**: Only record operations, approvals, and evidence actually completed; do not treat timeouts, no replies, annotations, or tool unavailability as approvals.
5. **Minimal authorization**: Task confirmation does not mean authorization for commit, push, deployment, file deletion, or installation copy sync. Git changes are confirmed separately based on risk protocol.
6. **Minimal change**: Maintain project conventions and prefer reversible modifications; do not delete history, refactor unrelated modules, or expand dependencies.
7. **Stoppable**: Stop immediately when the user terminates; report failures or capability limitations honestly, do not retry infinitely or fabricate success.
8. **Interception is a stop signal**: When an ops gate returns `deny` or `ask`, pause the operation, report the exact command and the gate's reason, ask the user whether to authorize it, and wait for explicit confirmation. Do not work around an interception by another command, wrapper, rewording, or indirect route. For a state change (`ask`), when the target is production or a stateful service, the authorization request must carry an interruption-risk assessment: the interruption surface, why it will not interrupt or what the interruption is, and the rollback point. Production is declared, not inferred: `opsRegister` requires `--env <prod|staging|dev>` and binds it into `stepDigest`. The gate is a cautious-execution gate, not a prohibition gate. Local system commands (`rm`, `mkfs`, `dd`, `shutdown`, etc.) are not ops commands and are not managed by this gate. For purely local development projects, set `HELLODEV_OPSGATE_SKIP_DIRS=<project-dir-name>` to bypass the gate entirely. See [ops-execution.md](modules/core/approval/ops-execution.md).

## Startup and On-demand Loading

First read the target project's AGENTS.md and existing related documents. Use skill path to find scripts; cwd is the target project; do not write state into the installation directory.

| Current Need                                                  | Read                                                                                                        |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| First execution, host differences, installation sync          | [runtime-adapters.md](references/runtime-adapters.md)                                                       |
| User expresses tasks in natural language                      | [intent-resolver.md](modules/core/task/intent-resolver.md) maps to path                                     |
| Assess cost before changing protocol / replay experience      | [cost-metrics.md](references/cost-metrics.md), [scenario-replay.md](references/scenario-replay.md)          |
| Determine read-only/design/implementation, path               | [classifier.md](modules/core/task/classifier.md)                                                            |
| State exists, or persistent changes needed                    | [state-protocol.md](modules/core/state-protocol.md); resume first, then decide whether to restore or create |
| Will modify code, scripts, configuration, or documentation    | [Log Rules](docs/progress_coding/_RULES.md)                                                                 |
| Involves Git operations                                       | [git-gate.md](modules/core/approval/git-gate.md)                                                            |
| Involves ops commands (kubectl/systemctl/terraform, etc.)     | [ops-execution.md](modules/core/approval/ops-execution.md)                                                  |
| Needs design module approval                                  | [design-flow.md](modules/core/approval/design-flow.md)                                                      |
| Need to find other materials                                  | [modules/index.md](modules/index.md), load only relevant entries                                            |
| Decompose subtasks after requirement confirmation (mandatory) | [decomposition.md](modules/core/task/decomposition.md) decomposition, order table, and dispatch mode        |

Do not pre-read all stages, historical designs, or templates. Answer read-only consultations directly; do not write state "for using the process".

## Start with Natural Language

No need to learn framework terminology first. Just describe the task in your language; [intent mapping](modules/core/task/intent-resolver.md) converts it to a path:

| You Say                                 | Internal Path                           |
| --------------------------------------- | --------------------------------------- |
| Give me a plan first, don't change code | design/full, stop before implementation |
| Plan is confirmed, implement directly   | implementation                          |
| Fix a small bug                         | fast, skip design approval              |
| Trivial one-line change                 | tiny, single-file minimal change        |
| Help me research / what's the principle | Read-only, no state initialization      |
| Continue last task                      | resume                                  |
| Stop this task                          | Stop immediately                        |

Classification only determines the path, not authorization: deployment, Git write operations, installation sync, and deletion still require separate confirmation.  
The underlying `scripts/state.js` is retained as a recovery and audit interface and can be used directly when state is abnormal.

## Execution Paths

- **Design full**: Bootstrap -> Initialization -> Requirement -> Tool Research -> Feature Design -> Architecture -> Prototype -> Implementation -> Testing -> Review -> Ship -> Learn -> Evolution -> Reflection -> Archive.
- **Clear plan implementation/fast/other with writes**: Bootstrap -> Initialization -> Requirement -> Implementation -> Testing -> Review -> Ship -> Learn -> Evolution -> Reflection -> Archive.
- Small changes can use fast, but the decision must follow the scope-survey output rather than a bare line count: the affected-file list, the number of logical change units, and whether the change spans business modules. A de-duplicated estimate of <50 lines with no new dependencies and no architecture changes is only the **lower-bound evidence** produced by the scope survey, not a standalone threshold that overrides risk judgment.
- Design or documentation tasks only: Implementation is organizing approved documents; Testing verifies consistency and examples, does not generate code the user did not request.

**Scope survey (a precondition of routing)**: before giving a WF-Fast / WF-Standard decision, first produce four items — the affected-file list, the number of logical change units, whether the change spans business modules, and whether any undecided design point exists. Without a completed scope survey, no fast/standard path decision may be given.

**"Spans business modules" -- a decidable definition**: judged mechanically by **module root**, not by impression. Full definition in [escalation](modules/core/task/escalation.md). Map each landing path to its module root: `modules/<subtree>/...` -> `modules/<subtree>` (current subtrees: core, stages, paths, hosts); `expert-packages/<host>/<package>/...` -> `expert-packages/<host>/<package>` (an expert package is its own release unit, with its own `plugin.json` and version); any other in-repo top-level directory (`scripts/`, `hooks/`, `templates/`, `references/`, `docs/`, `archive/`, ...) -> that top-level directory; loose files directly under `modules/` (e.g. `modules/index.md`) -> `modules`; loose files at the repo root (`SKILL.md`, `README.md`, `README.zh-CN.md`, `_quick-reference.md`, `AGENTS.md`, `CONTRIBUTING.md`, `self-check.yml`) -> the repo root; install copies / generated copies outside the repo are attributed by their **source path**; generated artifacts (whose only legitimate source is a generator, e.g. `modules/index.md`) **do not participate**. Landing in >= 2 distinct module roots => spans business modules. Rationale: this repository has no independently runnable backend/frontend subsystems; the units that do carry an independent release boundary and lifecycle are `expert-packages/<host>/<package>`, and cutting the rest at top-level directories matches the authoritativeness grouping in `modules/index.md`; the rule is pure path-prefix matching, so it can be mechanically re-checked.


**Change-complexity checkpoint**: before dispatch, output the estimated affected-file count, the number of logical change units, and the de-duplicated estimated logical change lines.

**Escalation criterion -- cite, do not restate**: the escalation criterion is defined **once** in [escalation.md](modules/core/task/escalation.md), section "Change-complexity checkpoint". This document **does not define its own threshold**; when a routing decision is needed, read that file. The definition, for reference only: counted by logical change unit rather than touched-file count, with four branches (>= 2 logical change units, spans business modules, undecided design point, de-duplicated estimated > 50 logical change lines), plus the carve-out that one unit synchronized across N locations counts as one unit and does not accumulate lines while all N locations are listed in the boundary contract. **Cross-module judgment is by module root**: if all N locations fall within the same module root -> not cross-module; if the N locations span different module roots -> cross-module, and in that case both "N-location sync" and "cross-module" hold simultaneously without overriding each other.

Supplementary notes (these do not add thresholds): "spans business modules" is judged by the decidable definition above (module root); that definition attributes install copies / generated copies outside the repo to the module root of their **source path**, so copy sync never produces a module root of its own — consistent with the cross-module carve-out above (where all N locations must share one module root), the two do not conflict; touched-file count only serves as the scope survey's lower-bound evidence, not as an independent escalation threshold.

**Escalation criterion vs decomposition criterion**: these are **two different questions with two different thresholds**, both consuming **the same** scope-survey output, and their conclusions are **independent** — **escalate != decompose**. The escalation criterion answers "should this request take the standard loop" (team-lead SOP section cited above); the decomposition criterion answers "should this request be split into subtasks" (the "When Decomposition Is Mandatory" tables in [requirement](modules/stages/requirement.md) and [decomposition](modules/core/task/decomposition.md): >= 2 logical change units, clear sequential dependencies, de-duplicated estimated > 50 lines). Both can hold differently: "escalate yet have only 1 change unit so decomposition may be skipped" (a single change unit with an undecided design point, or landing in 2 module roots) is valid, and so is "decompose without escalating" (2 change units, same module, no undecided design point, de-duplicated <50 lines).

| Stage                         | Required Output                                                               | On-demand Details                                  |
| ----------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------- |
| Bootstrap                     | Current state, scope, related documents, execution path                       | [bootstrap](modules/stages/bootstrap.md)           |
| Initialization                | Scope survey (affected files, change units, module roots, design points) and the COARSE decomposition; confirms no scope, owes no dispatch | [initialization](modules/stages/initialization.md) |
| Requirement                   | Basis for user confirmation or explicit execution authorization               | [requirement](modules/stages/requirement.md)       |
| Feature Design / Architecture | This round's modules submitted -> approved, with real evidence                | [architecture](modules/stages/architecture.md)     |
| Prototype                     | Runnable HTML prototype with interleaved UX+UI decisions verified per round; specifications extracted from working prototype | [prototype](modules/stages/prototype.md) |
| Implementation                | Scoped changes and immediate append-only log                                  | [implementation](modules/stages/implementation.md) |
| Testing                       | Applicable four-layer verification evidence and `test` pass                   | [testing](modules/stages/testing.md)               |
| Review                        | Requirement/implementation/documentation consistency review and `review` pass | [review](modules/stages/review.md)                 |
| Ship                          | Results, tests, documentation, limitations; no release without approval       | [ship](modules/stages/ship.md)                     |

Explicitly enter the next stage after completing the current one; implicit completion, skipping gates, or using old tests to prove correctness after rework is prohibited. Failures go through rolled_back, preserving history. Commands and complete conditions follow the state protocol.

## Task Decomposition and Sub-Agent Dispatch

Decomposition is **mandatory** after requirement confirmation (unless the scope survey shows a single logical change unit: one file, de-duplicated <50 lines, no dependencies). Each subtask declares `affectedFiles` for file conflict detection.

```bash
# Decompose with affectedFiles
node scripts/state.js decompose --tasks '[
  {"id":"t1","name":"Data model","depends":[],"affectedFiles":["src/models/user.js"]},
  {"id":"t2","name":"API","depends":["t1"],"affectedFiles":["src/api/user.js"]}
]'

# Dispatch mode (parallel is the default)
node scripts/state.js dispatch-mode serial     # explicit opt-out: main agent executes all

# Mandatory dispatch: show the plan, then record each parallel wave you dispatch
node scripts/state.js dispatch-plan
node scripts/state.js dispatch --wave 2 --subtasks t2,t3 --agent <name>
node scripts/state.js dispatch-waive --wave 2 --reason "..."   # authorized serial instead
```

**Dispatch modes**: `parallel` (default) or `serial` (explicit opt-out). Every wave the analysis marks `parallel` **must** be dispatched to sub-agents and the dispatch recorded with `dispatch`; `stage implementation completed` is rejected until each such wave has a `dispatch` or `dispatch-waive` record. States written before this policy have no `dispatches` field and are not retroactively blocked. Sub-agents are constrained: no state writes, no Git operations, no user interaction. Main agent verifies all sub-agent output. File conflicts within a wave force sequential execution, so such a wave never enters the dispatch plan. See [decomposition.md](modules/core/task/decomposition.md) for full constraints.

### Codex Sub-Agent Dispatch

When running on Codex, parallel waves dispatch via `create_thread` / `wait_threads`. Use `codex-prompt.js` to generate prompts from the decomposition:

```bash
# Generate prompts for an entire wave
node scripts/codex-prompt.js wave --wave 1 --project "my-app" --project-path /abs/path
# => JSON: { wave, mode, tasks: [{subtaskId, title, prompt, affectedFiles}] }

# Generate prompt for a single subtask
node scripts/codex-prompt.js generate --subtask t1

# Parallel task: read .hello-dev/state.sibling-<id>.json instead of state.json
node scripts/codex-prompt.js wave --wave 1 --task <id> --project "my-app" --project-path /abs/path
```

`--task <id>` works before or after the command and fails rather than falling back to `state.json` when the sibling is missing.

Each prompt conforms to the [Codex host adapter](modules/hosts/codex.md) specification: scope, file boundaries, acceptance criteria, constraints block. The agent then calls `mcp__codex_app__create_thread` with the generated prompt and title, followed by `mcp__codex_app__wait_threads` to collect results.

## Memory

- **State and development logs**: Execution state, approvals, retries go to `.hello-dev/state.json` (parallel tasks use `--task <id>` to write to `.hello-dev/state.sibling-<id>.json`); development process goes to `docs/progress_coding/`.
- **Memory storage**: The only storage is the target project's `.hello-dev/memory.json`, read and written by `scripts/memory.js`; the L0-L4 five layers in global instruction files are its **layered labels**, not a second system (Claude Code writes to `~/.claude/CLAUDE.md`, WorkBuddy writes to `~/.workbuddy/user-*/MEMORY.md`, with `scripts/patch-claude-md.js --host=<claude|workbuddy>` automatically selecting based on host).
- **Write gate**: **Candidate -> Validation -> Merge/Reject -> Write**. Only accept confirmed facts; reject speculation, temporary solutions, and logs. Merge is preferred over creating new entries. `memory.js` is the only reader and writer.
- **Language and strength boundary**: The write gate uses **English-only** predicate/speculation/temporary/log word lists by an existing user decision. Chinese and other languages are not semantically screened by these lists; structural/source checks are not factual validation. It is **the first fence of discipline, not a security boundary**. Manually confirm non-English content and evidence truthfulness. No automatic language translation or restoration of a bilingual gate.
- **Detailed rules**: Write gate details, known false positives, CLI quick reference, and portable package manifest are in [references/memory-guide.md](references/memory-guide.md).

```bash
node scripts/memory.js recall --layer L2 --limit 5   # Bootstrap retrieval
node scripts/memory.js add --layer L2 --content "..." --source <real evidence>   # Ship write
```

## Authority and Conflicts

| Topic                                   | Authoritative Source                                                                                                                                       |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scope and authorization                 | User's explicit requests, target project conventions; explain and confirm if there are conflicts                                                           |
| Execution contract and routing          | This file; stage files provide details but do not override this contract                                                                                   |
| Global mandatory rules                  | Host global instructions (Claude Code: `~/.claude/CLAUDE.md`; WorkBuddy: `~/.workbuddy/user-*/MEMORY.md`); aligned with SKILL.md Execution Contract item 3 |
| State semantics                         | [state-protocol.md](modules/core/state-protocol.md) and scripts/state.js; both must be updated together if they drift                                      |
| Git risk                                | [git-gate.md](modules/core/approval/git-gate.md); actual capability is constrained by host boundaries                                                      |
| Ops command risk and execution approval | [ops-execution.md](modules/core/approval/ops-execution.md); risk table must match hooks/opsgate.js                                                         |
| Change log                              | [Log Rules](docs/progress_coding/_RULES.md)                                                                                                                |

`agents/`, archived `automation/`, and `core/memory/` historical designs are not current execution bases. Learn, Evolution, Reflection, and Archive are **mandatory on every execution path** -- including `fast`, `tiny`, and `other` -- and are not optional; their completion checkpoints cannot be skipped and are not waived by delivery. See [modules/index.md](modules/index.md) for details.

## Verify This Skill

After modifications, run `bash scripts/self-check.sh`: syntax, links, index, risk classification, and state behavior tests. It verifies limited invariants but does not prove that platform hooks are registered or that all safety scenarios are protected.

Version optimization basis is in `OPTIMIZATION-REPORT.md` (archived; not part of this distribution). Installation copy sync requires separate confirmation; only dry-run by default.

Host integration is conditional: select the real host/settings/skill paths with `scripts/register-hooks.js` before registration. Its default is read-only; writes require `--apply` plus separate authorization. WorkBuddy Desktop defaults to `~/.workbuddy/settings.json`. CodeBuddy CLI injected (default) skills do **not** register frontmatter hooks; fork-context hooks additionally require explicit host trust. This entry intentionally does not switch to fork or enable trust. The frontmatter's single resolver command carries no host home path and is not evidence of host support or active loading. Configuration inspection, direct probes and marked-version traces do not prove real host consumption of ask/deny. See [runtime boundaries](references/runtime-adapters.md).
