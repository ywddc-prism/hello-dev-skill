# Hello Dev Quick Start

> Confirm requirements first, approve designs as needed, track changes, deliver with evidence.

## Usage

Describe your task directly, e.g., "implement registration flow", "fix callback duplicate handling", "optimize existing skill". Perform read-only checks first, then confirm what to change, what not to change, and what constitutes success. Do not re-ask about confirmed scope.

- Plan not confirmed: Requirement confirmation -> Feature design -> Architecture approval -> Implementation -> Testing -> Review -> Delivery.
- Plan confirmed: Requirement confirmation -> Implementation -> Testing -> Review -> Delivery.
- Read-only consultation: Analyze directly, do not create process state.
- "Just do it / use your judgment / don't ask": Skip questions, but do not skip verification, logs, or necessary operation authorization.
- "Stop / terminate": Stop, preserve existing state, do not retry infinitely.

When approval tools are unavailable, confirmation will be requested in conversation. Timeouts and no-replies do not count as approval; modules with annotations still require approval after processing.

## State and Recovery

Scripts come from the skill directory; cwd is the target project. The following assumes you are in this repository:

```bash
node scripts/state.js show
node scripts/state.js resume
node scripts/state.js validate
```

Stages are not implicitly completed; rework invalidates downstream testing/review evidence. When retry limits are reached, execution stops; limits are expanded only after the user reviews the report and approves continuation; history is not reset.
State lock conflicts will fail explicitly; do not automatically delete unknown locks.

## Git and Delivery

Change tasks do not automatically authorize commits, pushes, deployments, or installation sync. Existing Git hooks only apply to registered PreToolUse/Bash hosts; other environments require explicit confirmation, and cannot falsely claim automatic gates.

Delivery reports describe actual changes, tests, documentation, and limitations. Green tests do not mean hooks are installed or all risks are covered.

## Recovery on a New Machine

When changing machines or reinstalling, `bash scripts/setup.sh` completes skill symlinks, settings.json hook registration, and global CLAUDE.md memory sections in one go (codex sync still requires separate approval).

```bash
bash scripts/setup.sh                     # Only check current state (equivalent to --check), do not write any files
bash scripts/setup.sh --list              # List 5 steps and order constraints
bash scripts/setup.sh --apply             # Execute all missing steps
bash scripts/setup.sh --apply --only=symlink   # Only execute specified steps
```

Defaults to dry-run; first `git clone` the source code to the local machine, then run setup. Step order has hard constraints:
symlinks must come before hooks -- if symlinks don't exist, hook paths don't exist, and registration will fail.

## Development and Installation Copies

After modifying the skill, run `bash scripts/self-check.sh`. The installation directory may be a copy or link and should be verified first.

`bash scripts/sync-to-codex.sh` is preview only; `--apply` will delete target-only files and must be evaluated for backup and recovery first, with separate approval. Source code modification authorization cannot be treated as sync authorization.

More: [Execution Contract](SKILL.md), [State Protocol](modules/core/state-protocol.md), [Log Rules](docs/progress_coding/_RULES.md), [Runtime Boundaries](references/runtime-adapters.md).

## Codex Sub-Agent Dispatch (parallel waves)

```bash
node scripts/codex-prompt.js wave --wave 1 --project "my-app" --project-path /path/to/app
# => JSON with prompts for each subtask in the wave
# Parallel task: append --task <id> to read .hello-dev/state.sibling-<id>.json
# Agent calls: mcp__codex_app__create_thread({ prompt, title, target })
# Then: mcp__codex_app__wait_threads({ targets, timeoutMs: 300000 })
```

See [modules/hosts/codex.md](modules/hosts/codex.md) for full dispatch pattern and [Codex Quick Reference](_quick-reference.md) for the 30-line overview.
