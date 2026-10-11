# Hooks — Conditional Host Integration

Both `git-gate.js` and `opsgate.js` classify `PreToolUse` input with `tool_name: Bash`. They do not execute commands, grant permissions or record final approval. Host loading and permission-decision consumption must be verified separately.

## Decisions and exceptions

- Git MED/HIGH commands return `permissionDecision: ask`. Readable LOW commands produce no permission override. Codex currently parses `ask` but does not support it and continues the tool call, so this approval flow is not enforcing there.
- Ops read-only classification, approval requests and policy denial follow [ops execution](../modules/core/approval/ops-execution.md).
- Both scripts have user-controlled master switches, skip directories, trace/caller variables and fail-open/fail-closed modes. The agent must not change real switches or permissions to obtain a passing result.
- Bad input and classification exceptions have documented limits. These are classifiers, not a complete shell parser, security sandbox or cross-platform permission system.

## Explicit registration

`scripts/register-hooks.js` defaults to a read-only plan. Select `--host=<claude|codebuddy|workbuddy|codex>`, an optional confirmed absolute `--settings` and `--skill-dir`; only separately authorized `--apply` writes. Setup and release inspection share this contract.

| Host | Settings contract | Evidence boundary |
|------|-------------------|------------------|
| Claude Code | `~/.claude/settings.json` or explicit file | Configuration alone does not prove current session loading |
| CodeBuddy CLI | `~/.codebuddy/settings.json` or explicit file | External edits need host-panel confirmation per the official guide |
| WorkBuddy Desktop | No inferred path; explicit confirmed `--settings` required | CLI documentation is not Desktop loading evidence |
| Codex | `~/.codex/hooks.json` or explicit file | Registration is supported; `ask` is parsed but unsupported and frontmatter alone is not registration |

Registration inspection accepts one direct Node command targeting the selected absolute handler with the correct per-hook `CALLER=host` and `TRACE`. Basename mentions, `echo`, unrelated paths, other hosts, disabled hooks, non-command handlers or fallback chains do not count. Configuration writes preserve nested keys and original entries, use an exclusive lock and verified backup, and refuse malformed/symlink settings.

The frontmatter invokes `scripts/hook-resolver.js` (host-agnostic: `__dirname`-based, no host home path). It is a declaration only, not proof of loading. [CodeBuddy CLI's official guide](https://www.workbuddy.cn/docs/cli/hooks-guide) states that default injected skills parse but do **not** register frontmatter hooks. Fork-context skills require explicit frontmatter trust; the agent must not enable that control. None of this proves WorkBuddy Desktop support. See [runtime adapters](../references/runtime-adapters.md).

## Verification: three different layers

```bash
node hooks/test-git-gate.js
node hooks/test-opsgate.js
bash scripts/test-setup.sh
node scripts/test-release-check.js
bash scripts/release-check.sh --hook-smoke
```

1. **Source tests/direct probes** prove a classifier or trace writer behaves for tested input. They are not real host invocations.
2. **Selected settings inspection and recent marked traces** check named configuration/version facts. `CALLER=host` is caller-controlled, not authenticated. A trace absent from the file does not prove no invocation occurred.
3. **Real host acceptance** requires the actual selected host to invoke both handlers and observable consumption of their ask/deny outputs. Save host call IDs/results and harmless fixture behavior; do not execute destructive smoke commands. The release report keeps this layer UNKNOWN without such evidence.

Both trace writers require explicit TRACE **and** CALLER. Direct release probes use `caller=release-check`; host registration inlines variables per command, never globally in settings env. Runtime version PASS checks all valid recent matching records and excludes stale, future, wrong gate/event/caller and malformed lines. Missing/unknown versions stay UNKNOWN; any explicit mismatch is FAIL.

Exact Git operations need separate user approval and [Git Gate](../modules/core/approval/git-gate.md) accounting. Neither a task confirmation nor this README grants registration or Git-write authority.
