# Runtime adapters and installation boundaries

## Identify capabilities before execution

Treat the current host's actual tool declarations and permissions as authoritative. Do not call a tool merely because an example names it. Never change host permissions or disable safeguards to satisfy a workflow.

| Operation | Available capability | Fallback |
|-----------|----------------------|----------|
| Confirm scope / approve a module | A permitted interactive question tool | Ask one concise question in the conversation and wait for an explicit answer |
| Present a design | The host's supported plan/review surface | Present the bounded proposal in the conversation; approval does not change tool permissions |
| Execute CLI | A permitted shell tool with explicit cwd | Explain the missing capability; do not pretend the CLI ran |
| Parallel execution | Explicit user or applicable workflow authorization plus available agents | Work serially; “comprehensive” alone is not authorization |
| Git approval | A verified, registered pre-execution hook and host permission flow | Obtain explicit approval before the exact mutating command; do not claim platform enforcement |

Silence, timeout, a denied tool call, and unavailable interactive UI never count as approval. "Do it directly" is a user instruction to skip questioning within the established scope, not a universal approval for destructive operations.

## What this repository actually provides

`hooks/git-gate.js` understands the `PreToolUse` payload with `tool_name: Bash`. The entrypoint retains that host-specific hook declaration. Loading this directory elsewhere does not prove the hook was registered, and differently named execution tools are not intercepted by this script.

The hook classifies command text, returns an approval request, and does not execute Git, record final approval, or enforce permissions independently. It fails open on malformed payloads/internal errors. It is not a complete shell parser or security sandbox: wrappers, aliases and indirect execution require host controls and operator judgment. Do not describe “all Git operations are mechanically blocked” as a cross-platform guarantee.

The state CLI is host-independent Node.js code. It validates recorded transitions, not the identity or truth of the actor writing evidence. Repository read/write permissions remain the trust boundary.

## Source path versus target project

Resolve the selected skill directory from its actual location, not from a fixed home-directory assumption. Run its script using an absolute path with the target project as cwd. State discovery stops at a repository boundary. Do not initialize workflow state merely for read-only observation.

## New-machine restoration

`scripts/setup.sh` orchestrates source check, the selected skill symlink, explicitly selected hook settings, a supported host memory block and optional Codex sync preview. It defaults to read-only; `--apply` needs separate approval, `--only=STEP` selects a step and `--list` lists them. No automatic Codex sync.

Setup, `scripts/register-hooks.js` and release inspection share explicit host/path selection. Use `--host`, optional absolute `--settings`, `--skill-dir` and `--node-bin` (or HELLODEV_HOST/HELLODEV_SETTINGS/HELLODEV_SKILL_DIR). Directory fingerprints do not select the active host. WorkBuddy Desktop defaults to `~/.workbuddy/settings.json`; override with `--settings` when needed.

| Host | Default skill directory | Hook settings |
|------|------------------------|---------------|
| Claude Code | `~/.claude/skills/hello-dev` | `~/.claude/settings.json`; explicit override supported |
| CodeBuddy CLI | `~/.codebuddy/skills/hello-dev` | `~/.codebuddy/settings.json`; CLI-specific official contract |
| WorkBuddy Desktop | `~/.workbuddy/skills/hello-dev` | `~/.workbuddy/settings.json`; explicit override supported |
| Codex | `~/.codex/skills/hello-dev` | `~/.codex/hooks.json`; registration supported, current `ask` consumption unsupported |

The selected hook command uses the selected actual skill path; it does not reuse another host's default. Existing symlinks/physical installs are preserved; script readability and content consistency are independent. Unknown registration interfaces are preflighted before any setup apply writes.

Both entries' frontmatter now invoke `scripts/hook-resolver.js` through `HELLODEV_SKILL_DIR`; no host home directory appears in the command. That resolver locates its own hooks via `__dirname`, so one command works for Codex, Claude Code and WorkBuddy alike. `HELLODEV_SKILL_DIR` must be set to the skill directory; when it is unset the command fails fast instead of guessing a path. This is not active-host detection. The [CodeBuddy CLI guide](https://www.workbuddy.cn/docs/cli/hooks-guide) states that only fork-context skills support frontmatter hooks and require explicit trust; default injected skills do not register them. It also requires host-panel confirmation for external hook edits. WorkBuddy Desktop hook registration now uses `~/.workbuddy/settings.json` via `register-hooks.js --host=workbuddy`; host panel confirmation and real ask/deny acceptance must still be verified separately.

Codex registration writes the documented user-level `~/.codex/hooks.json` entry with the same preservation, lock, backup and validation path used by other hosts. This fixes configuration registration only. The official Codex hooks contract states that `permissionDecision: "ask"` is parsed but not supported yet: Codex reports the hook run as failed and continues the tool call. `deny` is documented as a supported `PreToolUse` decision, but HelloDev's Git and ops approval flows depend on `ask`, so those flows remain non-enforcing on Codex until the host contract changes or the gates are redesigned. Frontmatter visibility is not evidence of registration or consumption.

Portable packages (see below) install a real directory, so they exercise the
second form.

Boundaries:

- Hook registration preserves every pre-existing key and entry, writes atomically, and
  rolls back on verification failure. It refuses to run against a missing or malformed
  `settings.json` rather than creating or overwriting one.
- `--apply` never runs the codex sync: `rsync --delete` may remove destination-only
  files and requires its own explicit approval (see below).
- The `CALLER` and `TRACE` probe variables are inlined in each hook command, never in
  the `env` block — an `env` entry is shell-inherited and would record direct
  invocations as host evidence, which is exactly the self-contamination to avoid.
- These are configuration steps only. Marked runtime-version traces are also insufficient: CALLER is caller-controlled. Real host acceptance needs actual calls and observed ask/deny consumption for **both** hooks. `release-check.sh` keeps host approval acceptance UNKNOWN without that evidence.
- A fresh clone carries only committed work. Uncommitted changes do not exist on the
  new machine — `setup.sh` reports this in its source step.

### Carrying a machine's state across hosts

`setup.sh` assumes source code is already there (a fresh `git clone`). Three classes
of content a clone cannot carry are handled by `scripts/portable.js`:

| Missing from a clone | Why |
|----------------------|-----|
| Uncommitted changes | A fresh clone only has committed work |
| `.hello-dev/memory.json` | Excluded by `.gitignore` (runtime state) |
| `~/.claude/CLAUDE.md` | Outside the repository entirely |

```bash
node scripts/portable.js pack --apply              # old machine: write tar.gz + .sha256
tar -xzf hello-dev-portable-YYYYMMDD.tar.gz      # new machine: unpack
cd hello-dev && bash restore.sh --apply          # install + apply config snapshot
bash ~/.claude/skills/hello-dev/scripts/setup.sh --apply   # register hooks + CLAUDE.md block
```

Each command defaults to dry-run; `--apply` writes. `scripts/portable.js inspect <tarball>`
reports contents, checksum and config summary without unpacking, and
`node scripts/portable.js restore <tarball> --apply` does verify-then-install in one
step if unpacking by hand is unwanted. `scripts/portable.js install` is what
`restore.sh` calls — the package directory is its source, so no tarball path is
needed once extracted.

What is deliberately **not** carried:

- `mcpServers`, `env`, `enabledPlugins` — credentials and host-private config.
  `restore` leaves the target's values untouched.
- `permissions.allow` as measured on the packing machine — carrying `Bash(git *)`
  across hosts silently widens the new machine's approval surface. Restore writes a
  fixed default set and merges it with whatever the target already allows.

Safety valves (each covered by `scripts/test-portable.sh`): a non-empty target that
is not a valid HelloDev install is refused without `--force`; a symlink target is
refused unless it resolves back to the package itself (otherwise the write would
land in whatever the link points at); a corrupted archive fails its checksum; a
missing or malformed `settings.json` is never created or modified.

These are configuration steps only. They do not prove the host loaded anything —
same boundary as `setup.sh` above.

## Installation synchronization

This repository is the development source. Installed copies can differ; compare them before deciding which behavior the user is running. A symlink and a copied directory have different update behavior.

The install form is per host and is not the same on every machine. On the reference machine Claude Code, WorkBuddy and Codex are all **symlinks** into the source checkout, so their installed content is the source by construction and there is nothing to sync. A host that instead received a **physical copy** (portable packages install a real directory, see above) does drift and must be synced deliberately.

`scripts/sync-to-codex.sh` serves two independent jobs, and only the first is form-dependent:

1. **Skill tree** -- relevant only for a physical Codex install. When the target symlink resolves back to the source, the script detects the self-reference and skips `rsync` entirely, printing why; a self-referential `rsync --delete` is meaningless and easy to misread as a real sync.
2. **`~/.codex/AGENTS.md`** -- relevant under **both** forms. The file lives outside the repository, so a symlinked skill tree does not deliver it and this job must keep running.

The script defaults to a dry-run. Under the physical form its `--apply` mode uses `rsync --delete` and may remove destination-only files. Source editing does not authorize that deletion.

Before any apply: inspect the destination and preview, identify destination-only files, agree on preservation/backup and rollback, obtain explicit approval, then verify the installed result. This optimization does not execute apply or change the existing synchronization policy.

## Validator compatibility

The bundled generic skill validator rejects this repository's existing `hooks` frontmatter extension. Repository self-check passing is not generic skill-format certification. The extension is deliberately retained to avoid silently removing the original host's hook declaration. A future portable package should separate host-specific registration only after its installation and rollback behavior are confirmed; do not remove hooks merely to make a generic validator green.
