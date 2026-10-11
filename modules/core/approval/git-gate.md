# Git Approval Gate

> Risk classification describes existing hook behavior; does not equal complete shell security boundary. Only has interception when host actually registers `PreToolUse/Bash` hook; otherwise confirm exact command with user before executing write operations.

## Authorization Rules and Boundaries

All medium/high risk operations require explicit authorization; design or development task approval does not automatically approve Git write operations.
Low risk is the hook's pass classification; does not mean the command has no disk side effects. For example, fetch updates Git metadata but does not directly change the working directory.
When user requests local modifications, do not default to executing add/commit/push. Must not set `HELLODEV_GIT_GATE=off` independently; must not bypass host permissions.

### High Risk - Must Approve

| Operation | Risk | Recovery Boundary |
|------|------|----------|
| `git reset --hard` | Discards working directory and staging changes | reflog may help recover commits; cannot guarantee recovering uncommitted content |
| `git clean -fd` | Deletes untracked files | Git usually cannot recover; preview and backup first |
| `git push --force` | Overwrites remote history | Requires clear collaboration impact and known recovery points |
| `git branch -D` | Deletes branch reference | Commits may still be recoverable; no guarantee of long-term existence |
| `git rebase -i` | Rewrites history | Can abort during progress; after completion requires careful recovery |
| `git stash drop` | Deletes stash reference | Recovery not guaranteed |

### Medium Risk - Must Approve

| Operation | Risk | Scope |
|------|------|------|
| `git reset --mixed` | Moves HEAD/resets staging area | Does not directly overwrite working directory content |
| `git merge` | Introduces commits and conflicts | Current branch |
| `git checkout -b` | Creates and switches branch | Local reference and working directory |
| `git commit --amend` | Rewrites most recent commit | Commit history |
| `git revert` | Creates reverse change | May conflict |
| `git push` | Modifies remote reference | Visible to collaborators |

### Low Risk - Hook passes; still subject to host permissions

| Operation | Purpose | Notes |
|------|------|------|
| `git status` | View status | Observation |
| `git log` | View history | Observation |
| `git diff` | Compare changes | Observation |
| `git branch` | List branches | Without create/delete parameters |
| `git show` | View commit | Observation |
| `git fetch` | Update remote tracking info | Modifies Git metadata; not equivalent to pure read-only |
| `git stash list` | List stash | Observation |

## Approval Interface and Recording

Hook returns risk rationale and recovery clues, delegating to host for approval handling. It does not execute commands, does not write state, and does not know the final approval result.
After user decides, Agent can use `node scripts/state.js gitdec approved --reason "exact command and user approval basis"` or rejected to record; the record itself does not grant permissions.
More parameter combinations for actual risk classification are covered by [hooks/git-gate.js](../../../hooks/git-gate.js) and regression tests. Unlisted combinations are not automatically considered safe.

## Exception Strategy: fail-open / fail-closed

`HELLODEV_GIT_GATE_MODE` determines "what to do when risk cannot be determined"; default is `fail-open`, **does not change existing default behavior**.

| Value | When Classification Has Exception | Impact Scope |
|------|----------------|----------|
| `fail-open` (default) | Silently pass; gate does not become blocking source | No change to existing behavior |
| `fail-closed` | Returns `permissionDecision: deny` | **Only** when "confirmed as git command but classification failed" |

The following cases **pass in both modes**; `fail-closed` does not intervene at all:

- Commands that are not git;
- Input that cannot be identified as git (bad JSON, empty input, not `Bash` tool, cannot read command);
- `HELLODEV_GIT_GATE=off` disabled state;
- Illegal mode values (handled as `fail-open` with stderr warning).

Rationale: If `fail-closed` also rejects unidentifiable input, it equals using one gate to lock all Bash calls --
configuration errors, encoding issues, host payload changes would all cause work to completely stop, and these scenarios have nothing to do with Git risk.
The gate only tightens for **confirmed git but unclassifiable risk** commands: better to block and hand to human than release potentially irreversible operations.

Setup method (**set by user in shell or settings**; Agent must not set or modify independently):

```bash
HELLODEV_GIT_GATE_MODE=fail-closed   # Example only; not the default
```

## Host Smoke Test Probe

`HELLODEV_GIT_GATE_TRACE=<path>` when enabled, appends a line of JSON on invocation
(`event`, `caller`, `mode`, `sourceVersion`). File system can only prove hook exists;
trace is the only runtime evidence proving "host actually loaded and invoked it".

**Forensic caliber (determines whether evidence counts)**:

| `caller` Source | Meaning | Credited as Host Registration Evidence |
|---------------|------|--------------------|
| Not set | Direct command line invocation | **No**, and no trace written |
| `release-check` | Self-check invocation; proves script capability | No |
| Explicit `host` | Injected by registrant | Yes |

**Current state: `host` marker has no injector yet.** Host will not
additionally inject `HELLODEV_GIT_GATE_CALLER` just because you set
`HELLODEV_GIT_GATE_TRACE` in settings. Therefore before integrating an injector,
`runtime` is always `UNKNOWN` -- this is honest lack of evidence, not failure.
To get `PASS`, need:

1. Registrant (hook command itself in host configuration) sets both variables simultaneously, e.g.,
   `HELLODEV_GIT_GATE_CALLER=host HELLODEV_GIT_GATE_TRACE=<path> node <hook path>`;
2. Or user explicitly sets `HELLODEV_GIT_GATE_CALLER=host` in shell and explains how the trace was collected.

**Not recording traces of unknown origin is intentional**: Once the probe is enabled, direct shell invocations and host-injected invocations
cannot be distinguished -- recording them would make the report treat its own forensic action as "host has registered". Better to have one fewer record than give false evidence.

- Default off; does not write any files; does not change classification behavior; write failures silently ignored; never blocks Bash.
- Trace only proves hook **was invoked**; does not prove approval UI popped up; nor that user approved.
- Probe path and switch are set by user; Agent must not modify host configuration for forensics.

## Explicit Limitations

- Only parses Bash tool's command text; aliases, wrappers, and indirect execution are not fully provably covered.
- Empty input, bad JSON, and read failures pass in both modes (no way to judge if git); classification-stage exceptions handled by `HELLODEV_GIT_GATE_MODE`.
- Only returns ask, deny, or silently passes; never returns allow to reduce host restrictions.
- Whether hooks are registered and how host handles ask must be verified in actual runtime environment; cannot be inferred from unit tests.

```bash
node hooks/test-git-gate.js
node scripts/check-gate-consistency.js
```

These two verify parsing regression and table classification; do not verify host installation. See [runtime-adapters.md](../../../references/runtime-adapters.md) for platform differences.
