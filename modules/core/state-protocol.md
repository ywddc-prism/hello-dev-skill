# State Protocol - State Persistence Protocol

> Default active state is the target project's `.hello-dev/state.json`, operated through `scripts/state.js` in the skill installation directory. Commands execute in the target project cwd; examples in this document assume cwd is this repository.
>
> For parallel tasks, add `--task <id>` to write to `.hello-dev/state.sibling-<id>.json`; omitting `--task` behaves exactly the same as historically (see "Parallel Tasks" below).

## Execution Paths and Transitions

- `design/full`: bootstrap -> initialization -> requirement -> tool-research -> feature-design -> architecture -> prototype -> implementation -> testing -> review -> ship -> learn -> evolution -> reflection -> archive.
- `implementation`, `other`, or `fast`: bootstrap -> initialization -> requirement -> implementation -> testing -> review -> ship -> learn -> evolution -> reflection -> archive.
- Pure read-only consultation does not need init; `other` path is for confirmed tasks requiring persistence.
- Learn, Evolution, Reflection, and Archive are mandatory on every state-bearing path (`design/full`, `implementation`, `other`, `fast`); none of them may be skipped, and any document that permits skipping them contradicts `scripts/lib/stages.js`, which is the single source for the stage list.
- `init` creates bootstrap/in_progress. After completing the current stage, you must explicitly enter the in_progress of the immediately next stage; no auto-completion or arbitrary jumping.
- Fast path reduces design, not requirement confirmation, Testing, or Review. For design/documentation tasks, Testing verifies documentation and examples, not irrelevant UI.

```bash
node scripts/state.js init --name "Task name" --type implementation --path full
node scripts/state.js stage bootstrap completed
node scripts/state.js stage requirement in_progress
node scripts/state.js checkpoint "Requirement confirmed" pass --reason "User confirmation message and scope, quoted verbatim from the approval"
node scripts/state.js stage requirement completed
node scripts/state.js stage implementation in_progress
```

## Completion Conditions

| Stage | Required Evidence |
|------|----------|
| All stages | Not blocked, not exceeding retry limits; latest result for each checkpoint this round is pass. **Additionally, every REQUIRED checkpoint (the named stages below) must carry a `--reason` at or above the floor in `REQUIRED_REASON_MIN` (`scripts/state.js`)** -- the gate fails the completion if it is absent or shorter. The value is deliberately not restated here: it is a tunable guard, and a hardcoded copy would silently go stale when it changes |
| requirement | This round's `Requirement confirmed` pass + `Decomposition plan` pass; explicit direct execution authorization is also recorded as evidence, not treated as Q&A |
| tool-research / feature-design / architecture | At least one module this stage; all registered modules must be resubmitted -> approved this round (no old modules omitted) |
| prototype | All UX and UI concern decisions resolved (approved or binding user resolution); final prototype verified by user; specifications extracted from the working prototype; did not exceed 5-round limit without explicit authorization |
| implementation | When a `decomposition` exists, **every subtask must be `completed`**. Unfinished subtasks (`pending` / `in_progress` / `failed`) block the stage; the check reads `decomposition.tasks` directly, not a checkpoint. A decomposition whose waves do not cover every subtask is rejected at read time, so a 0-wave state cannot reach this gate at all. **Additionally, when `dispatchMode` is not `serial` and the state has a `dispatches` field, every parallel wave must carry a `dispatch` or `dispatch-waive` record** — see "Mandatory sub-agent dispatch" below |
| testing | This round's `Testing` pass; evidence includes applicable build, regression, behavior, and boundary verification |
| review | This round's `Review` pass |
| ship | Valid testing and review completion records; does not mean commit/push/deploy is authorized |
| learn | `Learning summary` pass; captures knowledge cards, decision reviews, and error learnings from all preceding stages |
| evolution | `Evolution report` pass; diagnostics run, candidates generated, approved candidates applied |
| reflection | `Agent reflection` pass; agent self-evaluation of execution quality (decision quality, detours, efficiency) with actionable improvement recommendations |
| archive | `Archive complete` pass; all artifacts organized, memory index updated, loop closure record written |

"This round" starts from checkpointStart when entering the stage. Old pass cannot prove correctness after rework; same-round fail -> pass preserves history but judges by latest result.

Required-checkpoint `--reason` is a **length floor, not a semantic test**. It rejects omission and short placeholder text (`done`, `ok`, `pass`, `n/a`) because an empty record cannot be audited afterwards, but it does not judge whether the reasoning is correct -- that judgment stays with the human. This is the same boundary the CLI already has (see the limitation note below) and does not widen it: a well-written reason can still describe work that was never done.

The four post-delivery stages (`learn`, `evolution`, `reflection`, `archive`) are mandatory on every path; `learn` follows `ship` directly, exactly as `scripts/lib/stages.js` orders them. The `archive` **command** and the `archive` **stage** are different things that unfortunately share a name: the command relocates `.hello-dev/state.json`, so invoking it before the Archive stage completes leaves no active state and makes every later stage unreachable. Run the command only after `stage archive completed`.

CLI validates record consistency but **cannot authenticate user identity, prove tests were actually executed, or prevent direct JSON editing**. Agents can only account based on real authorization/results and must not fabricate pass.

The implementation gate is checked against subtask status rather than a required checkpoint on purpose: a checkpoint is a record the agent writes, so it can be marked `pass` without the work existing, whereas `decomposition.tasks` carries the actual per-subtask outcome. States with no `decomposition` section (a scope survey reporting a single logical change unit) are unaffected.

**Decomposition Plan (Mandatory)**: Requirement stage must produce a decomposition plan (see [decomposition.md](task/decomposition.md)). Decomposition is mandatory unless the scope survey reports a single logical change unit (one file, de-duplicated <50 lines, no dependencies, not spanning business modules, no undecided design point) — counted by logical change unit, not by touched-file count. "Spans business modules" is decided mechanically by module root; the definition and the escalation criterion are defined once in [escalation.md](task/escalation.md); [SKILL.md](../../SKILL.md) only cites that section. The plan includes: subtasks with `affectedFiles`, wave order, and dispatch mode (`serial` or `parallel`). Record conclusion in `Decomposition plan` checkpoint. Must decompose or justify skipping; not assessing is not acceptable.

## Module Approval and Retry

```bash
node scripts/state.js module api submitted
node scripts/state.js module api approved --reason "User-approved scope"
node scripts/state.js module storage submitted
node scripts/state.js reject storage --reason "Missing failure recovery plan"
node scripts/state.js report
node scripts/state.js retry-resume --reason "User approved continuation after reviewing report"
```

Modules only operate during in-progress design stages. approved/annotated must come from this round's submitted; annotated is pending annotations, not approval. After rejection, must resubmit before re-approving.
Default module 3 times, global 10 times rejection triggers stop. retry-resume is only used after explicit user approval, extends the limit at least once, preserves count and extension reason; does not reset retries.

## Rollback, Blocking, and Recovery

```bash
node scripts/state.js stage implementation rolled_back
node scripts/state.js stage implementation in_progress
node scripts/state.js block "Waiting for user decision"
node scripts/state.js unblock "User has confirmed"
node scripts/state.js resume
node scripts/state.js validate
node scripts/state.js gitdec approved --reason "Exact Git commands approved by user"
node scripts/state.js finalize
```

Rolling back to the current or earlier stage invalidates that stage and downstream completion records. Must redo subsequent Testing/Review. Fix failed stages before entering in_progress.
`finalize` saves current snapshot and removes active file; can be used for completed or explicitly terminated tasks. **Finalizing itself is not proof of completion**. Resume existing state first; do not overwrite or silently finalize others' tasks.
Git hook does not write state and does not know final approval results; after the user makes a decision, the Agent uses gitdec to record it.

## Execution Intent Approval (ops)

`gitdec` records "someone agreed"; `ops` records "what command was agreed upon". The difference is `stepDigest`:
approval binds immutable execution intent (command, working directory, target, declared environment, source document summary, risk conclusion); any change invalidates it.

`--env <prod|staging|dev>` is required and validated against a closed enum: the environment is declared,
not inferred from free text, and it participates in `stepDigest` (so declaring a different environment
voids the prior approval). `prod` marks the step as one requiring an interruption-risk assessment before
authorization; see [ops-execution.md](approval/ops-execution.md) section 3.2.

```bash
node scripts/state.js opsRegister --id restart --command "systemctl restart nginx" \
  --env staging --cwd /etc/nginx --target staging/web-01 --source runbooks/nginx.md --source-digest <sha256> --purpose "Load new configuration"
node scripts/state.js opsShow restart                 # Display stepDigest for user verification
node scripts/state.js opsApprove --id restart --approved-by user --confirm-digest <stepDigest> [--ttl-seconds 300]
node scripts/state.js opsStatus [ID...]               # Gate: whether executable now
node scripts/state.js opsReject --id restart --reason "Wrong timing"
```

- **Auto-classified by policy on registration**: Safe read-only -> `approved` (transparent display for execution, no approval needed);
  State change -> `awaiting_approval`; policy blocks -> `rejected` (cannot be approved).
  `approvalMode` is derived from policy, **not specified by caller** -- otherwise registering a write operation as read-only would bypass approval.
- `opsApprove` must backfill the `stepDigest` just displayed by `opsShow`. This is where "Agent must not create approval basis on behalf of user" lands: without user-verified summary, credentials cannot be produced.
- `opsStatus` returns non-0 when not executable (not approved / expired / content changed / blocked / rejected);
  execution path should call it before preflight. It **validates credential authenticity but does not authenticate user identity** --
  who pressed confirm is unknowable to CLI, consistent with existing document caliber.
- Default TTL 300 seconds (30-3600). Expiration is not a state field but determined in real-time by the gate,
  avoiding "state shows approved but credentials have expired" inconsistency.
- After approval, if command, working directory, target, or source document changes, old credentials immediately become invalid and need re-approval.

## Task Collaboration Table (collab)

Records the skill set **present for this task**, written to the `collaboration` section of the state file. Detection scope, software boundaries, and
"_detection list is not authorization list_" explanation in [Collaboration Matrix Section 4.2](../../references/collaboration-matrix.md).

```bash
node scripts/state.js collab detect    # Detect and write snapshot (for Bootstrap)
node scripts/state.js collab show      # Read snapshot (default action)
```

- Detection failure (host has no skills, script missing, parse error) **does not block flow**: only reports and maintains current state.
- Skills in snapshot are "present at detection time", not "used this task", and certainly not "authorized to call".
- Fields are backward compatible: when `collaboration` is absent, existing state is still readable; once present, strict validation applies
  (`detectedAt` must be valid timestamp, each skill must have non-empty `name` and `source`).

## Task Decomposition and Order Table (decomposition)

Decomposition is **mandatory** after requirement confirmation. The only valid skip is a scope survey reporting a single logical change unit (one file, de-duplicated <50 lines, no dependencies, not spanning business modules, no undecided design point), counted by logical change unit rather than by touched-file count. This is the decomposition criterion; it is not the escalation criterion (defined once in [escalation.md](task/escalation.md); [SKILL.md](../../SKILL.md) only cites that section, and the module-root definition of "spans business modules" is in the same section). After decomposition, set dispatch mode to control sub-agent usage.

```bash
# Register subtasks (JSON array), auto-derive waves
# affectedFiles is required for conflict detection
node scripts/state.js decompose --tasks '[
  {"id":"t1","name":"Data model","depends":[],"affectedFiles":["src/models/user.js"]},
  {"id":"t2","name":"API","depends":["t1"],"affectedFiles":["src/api/user.js"]}
]'

# View order table
node scripts/state.js order

# Set dispatch mode (after decomposition, before implementation)
node scripts/state.js dispatch-mode parallel   # default
node scripts/state.js dispatch-mode serial     # explicit opt-out

# View current dispatch mode
node scripts/state.js dispatch-mode

# Mandatory sub-agent dispatch: show the plan and what is still outstanding
node scripts/state.js dispatch-plan

# After performing a sub-agent dispatch for a parallel wave, record it
node scripts/state.js dispatch --wave 2 --subtasks t2,t3 --agent agent-name

# Explicitly authorize serial execution instead (host has no sub-agent, etc.)
node scripts/state.js dispatch-waive --wave 2 --reason "Host has no sub-agent capability"

# Update subtask status
node scripts/state.js subtask t1 in_progress
node scripts/state.js subtask t1 completed

# Redecompose (overwrite existing results)
node scripts/state.js decompose --tasks '[...]' --replace true

# Clear decomposition results
node scripts/state.js decompose-clear
```

- **Subtask status**: `pending` -> `in_progress` -> `completed` | `failed`
- **Wave derivation**: Subtask's earliest wave = max(all predecessor waves) + 1; no predecessors = Wave 1. Derivation is a pure function of the dependency graph, **independent of declaration order**, implemented once in `scripts/lib/decomposition.js` and shared by `state.js` and `codex-prompt.js`. A per-consumer reimplementation previously produced 0 waves for a dependent listed before its dependency, while `codex-prompt.js` resolved the same state correctly.
- **Execution order analysis**: `decompose` prints the dependency edges, the serial chain the graph forces, the critical path, and the parallel groups (waves that are multi-subtask and conflict-free) as part of its own output; `order` appends the same block after the existing table. See [decomposition.md](task/decomposition.md) for the section-by-section meaning.
- **Wave mode**: When tasks in same wave > 1, initially `parallel`; automatically downgraded to `sequential` if any two tasks share `affectedFiles` (file conflict detection; comparison is trimmed and case-insensitive)
- **`--replace` is an explicit boolean**: `--replace true` overwrites, `--replace false` (or omitting it) refuses when a decomposition already exists. Any other value is rejected. The flag must be passed a value; a bare `--replace` is rejected by argument parsing.
- **Wave coverage is validated**: a decomposition whose waves do not reference every subtask exactly once is rejected by `validate` and by any progress command. This closes the gap where a 0-wave decomposition reported "[OK] State file valid" and Implementation could then be completed with no wave executed. `decompose --replace true` and `decompose-clear` read leniently on purpose, so the remedy for a broken decomposition is not blocked by the validation that rejects it.
- **Predecessor check**: `subtask <id> in_progress` automatically verifies all predecessor subtasks are `completed`
- **Dispatch mode**: `parallel` (default) or `serial`. `parallel` means the main agent must delegate each parallel group to sub-agents; `serial` is an explicit opt-out in which the main agent executes every subtask itself. See [decomposition.md](task/decomposition.md) for sub-agent constraints.
- **Backward compatibility**: `decomposition` section is optional; when absent, existing state is still readable; once present, strict validation applies. `dispatchMode` and `affectedFiles` fields default to `parallel` and `[]` when a new decomposition is created; a state written before this policy simply lacks them and is read as-is.
- **Connection with Implementation**: Implementation executes by wave; current wave must all be completed before entering next wave. When `dispatchMode` is `parallel`, parallel waves dispatch to sub-agents.

### Mandatory sub-agent dispatch

A parallel group is not merely *reported* — it must be **dispatched**. `decompose` derives the plan and prints it; `dispatch-plan` shows it again with what is outstanding.

```bash
node scripts/state.js dispatch-plan
node scripts/state.js dispatch --wave 2 --subtasks t2,t3 --agent my-subagent
node scripts/state.js dispatch-waive --wave 2 --reason "Host exposes no sub-agent tool"
```

- **When it binds**: the Implementation gate requires a `dispatch` (or `dispatch-waive`) record for **every wave whose `mode` is `parallel`**, before `stage implementation completed` is accepted. The record is checked against `decomposition.dispatches`, not a checkpoint, for the same reason as the subtask gate: a checkpoint is a record the agent writes, whereas the dispatch list is the stated outcome.
- **Grandfathering**: the gate applies only when the state **has** a `dispatches` field. `decompose` creates that field from now on; states written earlier have none, so tasks that already reached `ship` with parallel waves and no records are not retroactively blocked. Do not key this off subtask status — the subtask gate runs first and already requires everything `completed`, so a status-based skip could never fire.
- **Escape hatch**: `dispatch-waive` records an explicit, reasoned authorization to run a wave serially, and `dispatch-mode serial` opts the whole task out of the gate. Neither fabricates a dispatch. Note that only `dispatch-waive` stores a reason in the state file; `dispatch-mode serial` takes no `--reason` flag, so record that justification in the development log instead.
- **Agent identity**: the `--agent` value must denote a real delegated sub-agent. `dispatch` rejects a value that denotes the main agent and writes **no record**, so a rejected command cannot satisfy the gate above; the message points to `dispatch-waive` as the correct alternative when no sub-agent exists. Matching is case-insensitive, whitespace-trimmed, and **ignores punctuation entirely** — every character that is not a letter or digit is dropped, so `main agent`, `main_agent`, `main.agent`, `main/agent` and `main-agent` are the same value. A leading `subagent` / `agent` prefix is stripped, and a name assembled only from role or placeholder words (`main`, `self`, `agent`, `the`, `is`, `none`, `waived`, ...) is rejected as naming no distinct actor. Denied examples: `main`, `main-agent`, `main.agent`, `the main agent`, `self`, `none`, `n/a`, `waived`, `skip`, `local`, `inline`, `myself`, and empty or whitespace-only text. Real identifiers such as `subagent-1`, `dev-a`, `codex-1`, `worker-2`, `agent-teammate-1`, `maintainer`, and `verifier` remain valid. Homoglyphs (for example a Cyrillic `а`) are **not** folded — this catches the plain spellings of the main agent, it is not an identity system.
- **Waiver exemption**: a record carrying `waived: true` (written by `dispatch-waive`) is exempt from the identity check. A waiver authorizes serial execution; it is not a dispatch, so it makes no delegation claim to check.
- **Read-time check**: `validate` rejects a non-waived dispatch record whose agent is a self name, with the same message caliber as `dispatch`.
- **Honest limitation**: like every CLI record in this framework, the `dispatch` entry proves *the command ran*, not that a sub-agent existed, executed correctly, or was verified. The identity rule narrows one specific loophole — a wave can no longer be recorded as dispatched to the main agent — but it cannot prove the named sub-agent existed, ran, or produced verified output; it only rejects names that denote the main agent. The main agent remains responsible for independently verifying sub-agent output before marking subtasks `completed`. This is a consistency and audit mechanism, not a security boundary.

## Plugin Auto-Installation (pluginInstallationPlan / pluginInstallationResult)

Auto-search and install skill plugins needed for the task. Agent analyzes available plugins based on task description, generates installation plan, then executes.

```bash
node scripts/search-install-skill.js analyze         # Generate judgment prompt (with impact analysis and scope constraints, for Bootstrap)
node scripts/search-install-skill.js install         # Execute installation plan (before Implementation)
node scripts/search-install-skill.js uninstall       # Uninstall installed but unused plugins (optional for Ship)
node scripts/search-install-skill.js usage-report    # Output plugin usage report (optional for Ship)
```

### Impact Analysis (P0-1)

`analyze` command performs directory scanning on available plugins on disk, extracts component information and calculates risk level:

- **safe**: Only skills/agents/commands, no hooks, no MCP. Does not modify session behavior; safest.
- **moderate**: Has hooks (like SessionStart/UserPromptSubmit/Stop that don't modify tool behavior) or commands. Slightly affects session.
- **elevated**: Has MCP servers or PreToolUse/PostToolUse hooks. Intercepts tool calls or connects to external services.

Scan scope:
- Installed plugins: `~/.claude/plugins/cache/<market>/<plugin>/<version>/`
- Marketplace plugins: `~/.claude/plugins/marketplaces/<market>/{plugins,external_plugins}/<plugin>/`

For each plugin, extract:
- `skills`: Number of SKILL.md files under skills/
- `agents`: Number of .md files under agents/
- `commands`: Number of .md files under commands/
- `hooks`: List of hook types declared in hooks/hooks.json (SessionStart/PreToolUse/PostToolUse, etc.)
- `mcpServers`: Number of MCP servers declared in .mcp.json

Generated judgment prompt includes impact summary for each plugin (e.g., `[ELEVATED] 1 skill(s), 2 MCP server(s)`).

### Scope Constraints (P0-2)

The following constraints are injected into the generated judgment prompt:

1. **Max per installation**: At most 3 plugins
2. **Priority order**: safe > moderate > elevated (prefer low-risk plugins)
3. **Task matching**: If task type is `implementation`, do not recommend pure testing/documentation plugins
4. **Elevated plugins need extra explanation**: When selecting elevated-level plugins, must explain in reason why safe/moderate plugins cannot meet needs

`install` command also enforces the limit; installs only first 3 when exceeding 3.

### Uninstall Capability (P1-1)

```bash
node scripts/search-install-skill.js uninstall           # Preview uninstallable plugins
node scripts/search-install-skill.js uninstall --execute # Execute uninstall
```

Reads `state.json.pluginInstallationResult.installed` list, compares with `state.json.collaboration.skills` snapshot, identifies `installed_but_unused` plugins (plugin:* sources not appearing in collab).

Without `--execute` parameter, only outputs suggestions; does not execute uninstall.

### Usage Tracking (P1-2)

```bash
node scripts/search-install-skill.js usage-report
```

Compares installed plugins vs skills in collab snapshot, outputs usage report:

- Each installed plugin marked as USED (appears in collab) or UNUSED (not appearing)
- Calculates usage percentage
- Suggests uninstalling unused plugins

### Compatibility Pre-check (P2-1)

Before executing installation, `install` command performs compatibility pre-check on all plugins to be installed:

1. Scans each plugin's directory structure, extracts all component names (skills/agents/commands/hooks/MCP servers)
2. Detects if same-name components appear in multiple plugins
3. Blocks installation and reports conflict details when conflicts found

```bash
# Conflict detection example output
Error: Plugin conflicts detected, installation blocked:
  - skill:my-skill duplicated in [plugin-a, plugin-b]
  - hook:SessionStart duplicated in [plugin-a, plugin-c]
```

Conflict types include:
- **skill conflict**: Two plugins provide same-named skill
- **agent conflict**: Two plugins define same-named agent
- **command conflict**: Two plugins register same-named command
- **hook conflict**: Two plugins register same-named hook type
- **MCP server conflict**: Two plugins define same-named MCP server

### Historical Feedback Loop (P2-2)

`analyze` command reads historical installation records, calculates utilization weight for each installed plugin:

1. Compares `pluginInstallationResult.installed` vs `collaboration.skills`
2. Calculates each plugin's usage rate (skills appearing in collab / total skills)
3. Adds "Historical Utilization Feedback" section to generated prompt
4. Lists plugins with 0% utilization (installed but never used), suggests cautious selection

```bash
# Historical utilization feedback example
## Historical Utilization Feedback (P2-2)

The following plugins were not used after last installation (utilization 0%), please select cautiously:
- plugin-unused-a
- plugin-unused-b

Recommend prioritizing plugins with high historical utilization to avoid repeatedly installing unused plugins.
```

### Offline Cache (P3-1)

`analyze` command caches available plugin list to `.hello-dev/plugin-cache.json`:

```json
{
  "timestamp": "2026-10-03T14:30:00.000Z",
  "plugins": [...]
}
```

Degradation strategy:
- If `claude plugin list --available --json` fails (network issues, CLI unavailable, etc.)
- Automatically falls back to cached plugin list
- Outputs hint: "Using cached plugin list (X hours old, N plugins)"
- If cache also doesn't exist, returns empty list with error

### Matrix Stratification (P3-2)

Installation plan JSON supports `scope` field, marking plugin's scope:

```json
{
  "plugins": [
    {
      "id": "hello-dev",
      "name": "hello-dev",
      "scope": "permanent"  // Long-term tool, used across tasks
    },
    {
      "id": "test-tool",
      "name": "test-tool",
      "scope": "temporary"  // Temporary tool, only used for this task
    }
  ]
}
```

- **permanent**: Long-term tools, used across tasks (e.g., hello-dev, superpowers)
- **temporary**: Temporary tools, only used for this task (e.g., domain-specific testing tools, one-time scripts)

`install` command records `scope` field to `pluginInstallationResult.installed`.

Ship stage will suggest cleaning up `temporary` plugins:
```bash
node scripts/search-install-skill.js uninstall  # Identify unused temporary plugins
```

### Installation Plan JSON Format Enhancement

Each plugin object in `pluginInstallationPlan.plugins` array now supports optional fields:

```json
{
  "id": "plugin-id",
  "name": "plugin-name",
  "reason": "specific reason for selecting this plugin",
  "risk_level": "safe/moderate/elevated",  // Optional, impact analysis result
  "impact": "impact summary",               // Optional, human-readable component summary
  "scope": "permanent/temporary"            // Optional, scope marker (P3-2)
}
```

- **`pluginInstallationPlan`**: Installation plan output by Agent, JSON format
  - `need_install: boolean` - Whether installation is needed
  - `reason: string` - Decision reason
  - `plugins: Array<{id, name, reason, risk_level?, impact?, scope?}>` - Plugins to install
- **`pluginInstallationResult`**: Installation result record
  - `timestamp: string` - Installation time
  - `installed: Array<{id, name, reason, risk_level?, impact?, scope?}>` - Successfully installed plugins
  - `failed: Array<{id, name, reason, error}>` - Failed plugins
  - `summary: {total, success, failure}` - Summary statistics
  - `uninstalled: Array<{id, name}>` - Uninstalled plugins (P1-1, optional)
  - `uninstallTimestamp: string` - Uninstall time (P1-1, optional)

- After installation completes, automatically calls `node scripts/detect-skills.js --write` to update collaboration matrix
- Fields are backward compatible: when `pluginInstallationPlan` and `pluginInstallationResult` are absent, existing state is still readable

## Storage, Concurrency, and Compatibility

- Searches upward from cwd for nearest state; stops at repository boundary identified by `.git` directory or file marker; does not mistakenly write to parent repository tasks.
- Each project supports only one active task by default. Write commands serialize complete read-modify-write of **the same state file** through exclusive creation of `.hello-dev/state.lock/` (default task) or `.hello-dev/state.sibling-<id>.lock/` (`--task` tasks); lock granularity matches file. Contenders wait up to 3 seconds, then report a lock conflict without writing. Successful writers queue; their changes are not merged.
- `owner.json` records PID/time/command after exclusive directory creation. A crash or interruption between those operations may leave an owner-less lock; process crash may also leave a complete stale lock. Both fail closed: the CLI never automatically reclaims a lock based on owner absence, PID liveness, elapsed time, or rename. Before manual cleanup, confirm no writer for that task is active; use `owner.json` when present, but absence of owner data is not proof that cleanup is safe. This avoids competing reclaimers deleting or replacing another writer's lock; the trade-off is manual recovery after a crash.
- Write process uses independent temporary file, then rename; atomic replacement is not equivalent to concurrency control and does not guarantee power-loss persistence.
- Schema 1 existing legal state can be read; new completion conditions still apply. Old design modules without stage/round information need explicit resubmission in new round; first resubmission binds to current design stage, preserving original version and rejection count; cannot skip validation based on old markers.
- Direct state editing to bypass conditions is prohibited; recovery should use trusted snapshot and revalidate.

## Parallel Tasks (`--task <id>`)

Purpose: When two tasks truly need to progress simultaneously (e.g., one stuck in review, another needs new start), no need to finalize or overwrite the former.

- Site selection only happens at `statePath(root, taskId)`. `--task <id>` -> `.hello-dev/state.sibling-<id>.json`; omitted -> `.hello-dev/state.json` (verbally identical to history).
- `--task` is a global selector, effective for **all** commands (including read-only), can be written before or after command name; both forms are equivalent.
- Each state file **is still single-active-task**: stages, approvals, retry counts, checkpoints are each independent and do not inherit from each other.
- **Three independent items per task**: **Locks** (one per state file: `state.lock` / `state.sibling-<id>.lock`, do not block each other -- this is the premise of parallelism; before fix they shared one `state.lock` and two unrelated tasks would reject each other; review M-5 tested 8 concurrent with only 2 succeeding), `git.decisions` (Git approvals don't cross-task reuse), `ops` approval credentials (intent and credentials bound within their respective tasks).
- **One shared item**: `.hello-dev/` directory itself and `memory.json` (memory is project-level shared, not split by task).
- File pointed to by `--task <id>` must already exist; when it doesn't, explicitly errors and lists known parallel tasks; **does not silently fall back to reading main state file** (fallback would write progress to wrong task). **Exception: `init --task <id>` is the sole creator** -- it goes through cold start (`findRoot() || cwd`) not `requireRoot()`; creates file when it doesn't exist (help text also teaches `init ... [--task <id>]`).
- `<id>` must be a safe 1-64 character identifier, validated before site selection to avoid `../` spelling out out-of-bounds filenames.
- `finalize` finalizes **the selected** file; does not touch main state file.
- **Limitation**: Parallel tasks do not change each task's own execution path -- `implementation`/`fast` still have no `feature-design`/`architecture`.
- **Not provided**: No interactive interface for task list/switching; use `ls .hello-dev/state*.json` combined with `--task` when needed.

## Verification and Related Protocols

`node scripts/test-state.js` validates legal and illegal transitions, rollbacks, lock conflicts, concurrent writes, recovery, and input boundaries in a temporary directory.

- [Git Gate](approval/git-gate.md)
- [Contrast Report](contrast-report.md)
- [Development Log](../../docs/progress_coding/_RULES.md)

## CLI Input Constraints

Commands must be registered names; reject unknown/duplicate options, missing-value options, and extra positional arguments. Module ID limited to 1-64 characters alphanumeric, underscore, or hyphen, excluding prototype keys; text evidence limited to 1-4096 characters. gitdec must provide --reason; unblock must provide description. Reading bad structure, illegal counts, or metadata failures does not auto-fix and overwrite original file.
