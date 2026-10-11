# Host Adapter: Codex

> Sub-agent dispatch via Codex desktop app's `create_thread` / `fork_thread` / `wait_threads` toolchain. Side tasks appear in the Codex sidebar, giving the user per-subtask visibility during parallel dispatch.

## Host Identification

- **Host name**: Codex
- **Detection**: The agent is running inside Codex when the system context declares the product identity as Codex desktop, **and** the `mcp__codex_app__*` tool family is available in the tool set (e.g. `mcp__codex_app__create_thread`, `mcp__codex_app__wait_threads`, `mcp__codex_app__list_threads`, `mcp__codex_app__send_message_to_thread`). The presence of these MCP tools is the reliable signal; environment variables and working directory are not.
- **Version constraints**: Requires the `codex-app-tools` MCP plugin to be installed and connected. The tools referenced here (`create_thread`, `fork_thread`, `wait_threads`, `send_message_to_thread`, `list_threads`, `list_projects`, `set_thread_title`, `set_thread_archived`) have been stable across the versions shipped before 2026-10-08.

## Sub-Agent Invocation

Codex does not expose a short-lived anonymous sub-agent primitive. The closest semantic match is **side tasks**: each subtask becomes an independent Codex thread that appears in the user's sidebar. The main agent dispatches by creating these threads and collects results by waiting on them.

### Tool Signatures

```
mcp__codex_app__create_thread({
  prompt: string,          -- Required. Initial prompt (the subtask prompt).
  title: string,           -- Optional but recommended. Normalized title shown in sidebar.
  target: {                -- Required. Where to create the thread.
    type: "project" | "projectless" | "chatgptWorkCloud",
    projectId?: string,    -- Required when type is "project". From list_projects.
    environment: { type: "local" | "worktree" }
  },
  model?: string,          -- Optional model override.
  thinking?: string        -- Optional reasoning effort override.
})

mcp__codex_app__fork_thread({
  threadId?: string,       -- Optional. Source thread to fork. Omit to fork calling thread.
  environment?: { type: "same-directory" | "worktree" }
})

mcp__codex_app__wait_threads({
  targets: [{              -- Required. 1-8 threads to wait on.
    threadId: string,
    hostId?: string,
    afterCursor?: string
  }],
  timeoutMs?: number       -- Optional. Max wait ms, default 120000.
})

mcp__codex_app__send_message_to_thread({
  threadId: string,        -- Required.
  prompt: string,          -- Required. Follow-up message.
  model?: string,
  thinking?: string
})

mcp__codex_app__list_projects({})  -- No args. Returns available projects with isGitRepository flag.
mcp__codex_app__set_thread_title({ threadId, title })
mcp__codex_app__set_thread_archived({ threadId, archived: true })
```

### Dispatch Pattern

Hello Dev uses **`create_thread`** for parallel subtask dispatch. Each subtask in a parallel wave becomes one Codex thread. The main agent launches all threads for a wave, then waits for completion via `wait_threads`.

**Prompt generation**: Use `scripts/codex-prompt.js` to generate prompts from the decomposition state. This avoids manually constructing prompts and ensures consistency with the constraints below.

```
Wave N (parallel, dispatchMode=parallel, host=codex):
  1. Main agent generates prompts:
       node scripts/codex-prompt.js wave --wave N --project "<name>" --project-path <abs-path> [--task <id>]
     This returns JSON with { wave, mode, tasks: [{subtaskId, title, prompt, affectedFiles}] }.
     Add --task <id> when the decomposition lives in a parallel task's sibling state file.
  2. Main agent calls list_projects to resolve projectId for the target project.
  3. For each task in the JSON output:
       create_thread({
         prompt: <task.prompt from codex-prompt.js>,
         title: <task.title from codex-prompt.js>,
         target: {
           type: "project",
           projectId: "<id>",
           environment: { type: "worktree" }   // preferred for isolation
         }
       })
     All create_thread calls in the same turn for concurrency.
  4. create_thread returns threadId (or clientThreadId if worktree setup is pending).
     If clientThreadId, use get_worktree_creation_status to wait for readiness,
     then retrieve threadId from list_threads.
  5. Call wait_threads({ targets: [{threadId}, ...], timeoutMs: 300000 })
     to wait for the first completion or attention need.
  6. Loop wait_threads with updated afterCursor until all targets are resolved
     or timeout is reached.
  7. For each completed thread, read final output via read_thread if needed
     for verification.
  8. Main agent independently verifies file changes against acceptance criteria.
  9. Mark subtasks completed/failed. Archive side tasks if appropriate.
```

### Why `create_thread` over `fork_thread`

| Aspect | `create_thread` | `fork_thread` |
|--------|----------------|---------------|
| Context inheritance | Fresh thread, no parent history | Inherits parent turn history |
| Use case | Independent subtasks with bounded scope | Continuing an existing conversation branch |
| Side effect | New sidebar entry | New sidebar entry + duplicated context |

Hello Dev subtasks have their scope fully described in the prompt. Inheriting the parent's conversation history is a liability -- the subtask agent may misinterpret prior turns as instructions. **Always use `create_thread`** for HelloDev dispatch.

## Prompt Construction

**Preferred**: Use `scripts/codex-prompt.js` to generate prompts automatically. It reads the decomposition from `state.json` -- or, for parallel tasks, from `.hello-dev/state.sibling-<id>.json` when given `--task <id>` -- and produces prompts that include all required elements below.

```bash
# Single subtask
node scripts/codex-prompt.js generate --subtask t1 --project "my-app" --project-path /abs/path
# => JSON: { subtaskId, wave, status, affectedFiles, title, prompt }

# Entire wave
node scripts/codex-prompt.js wave --wave 2 --project "my-app" --project-path /abs/path
# => JSON: { wave, mode, taskCount, hasFileConflict, tasks: [...] }

# Parallel task: read .hello-dev/state.sibling-<id>.json instead of state.json
node scripts/codex-prompt.js wave --wave 1 --task <id> --project "my-app" --project-path /abs/path
```

`--task` accepts the same safe 1-64 character identifiers as `state.js`, may appear before or after the command, and **fails rather than falling back** to `state.json` when the sibling does not exist (a silent fallback would generate prompts for the wrong task).

**Manual construction**: When `codex-prompt.js` is unavailable or prompts need customization, build each sub-agent's prompt from the decomposition subtask. The prompt is the **only** context the side task receives (no inheritance from the parent thread).

### Required Elements

1. **Role declaration**: Identify this as a Hello Dev subtask and name the target project.

2. **Scope statement**: One sentence describing what this subtask implements.

3. **File boundaries**: Explicit list of files the subtask may read and modify (from `affectedFiles`). State clearly that files outside this list are off-limits.

4. **Implementation description**: The subtask's `name` field from decomposition, expanded with any additional context from the approved design or requirement.

5. **Acceptance criteria**: Observable conditions that must be true for the subtask to be considered complete.

6. **Constraints block**: Copy the universal constraints from `decomposition.md`, plus Codex-specific additions:
   - No writes to `.hello-dev/state.json`, `.hello-dev/memory.json`, or any HelloDev state file.
   - No Git operations (`git add`, `git commit`, `git push`, etc.). The main agent handles commits.
   - **No user interaction.** Side tasks appear in the Codex sidebar; the user may see them but must not be asked questions. If blocked, describe what is blocking you in your final response. The main agent will read this thread to determine success or failure.
   - Do not modify files outside `affectedFiles`.
   - Do not create new side tasks, threads, or forks.

7. **Working directory**: Absolute path to the target project.

8. **Context completeness**: Because the prompt is the **only** context the side task receives (see
   manual construction note above), everything the main agent already knows and the side task would
   otherwise have to rediscover must be in the prompt: exact file paths with line anchors, the
   verbatim text to be changed, the target state, the upstream/downstream relationship, the
   already-measured facts and baselines, and the off-limits list with reasons. This is constraint 7
   of `decomposition.md` Sub-Agent Constraints. One-line dispatches and "based on your findings" are
   prohibited -- they outsource understanding. Adequacy test: the side task can locate the change
   without any additional search. Note that `codex-prompt.js` does not emit a Context block today, so
   manual customization must add it.

### Prompt Template

```
You are a Hello Dev subtask agent. Implement the following scoped change.

## Project
<project name and absolute path>

## Scope
<one-sentence description>

## Files
You may READ and MODIFY only these files:
<affectedFiles list, one per line>

Do NOT read, modify, or create any other files in this project.

## Implementation
<expanded description of what to implement>

## Acceptance Criteria
- <criterion 1>
- <criterion 2>
- ...

## Constraints
- Do NOT write to .hello-dev/state.json, .hello-dev/memory.json, or any HelloDev state file.
- Do NOT perform any Git operations (add, commit, push, branch, etc.).
- Do NOT ask the user questions. If you are blocked, describe what is blocking you in your final response. The main agent will read this thread to determine success or failure.
- Do NOT modify files outside the list above.
- Do NOT create side tasks, threads, or forks.
- Follow Hello Dev four-layer verification: build, targeted regression, behavior check, boundary check on your affected files before declaring completion.

## Context (already established -- do not re-derive)
- Working directory (absolute): <path>
- Files and line anchors already located: <path:line -> what is there>
- Verbatim text to change: <quote>
- Target state: <what it should become>
- Already-measured facts / baselines: <command -> output>
- Off-limits (do NOT touch, and why): <paths/anchors -> reason>

## Working Directory
<absolute path to target project>
```

## Result Collection

Codex side tasks are **asynchronous**. The main agent collects results via `wait_threads`, which returns when the first target completes or needs attention. To collect all results, the main agent loops `wait_threads` with updated `afterCursor` values until every target has reported a terminal state.

### Reading Results

After a side task completes, the main agent can read its full output:

```
mcp__codex_app__read_thread({
  threadId: string,
  turnLimit?: number,
  includeOutputs?: boolean
})
```

Set `includeOutputs: true` to see tool outputs and command results. This is necessary for verification -- the subtask's final text summary alone is not sufficient evidence.

### Interpreting Results

| Sub-Task Final State | Interpretation |
|---------------------|----------------|
| Final response describes completed work matching acceptance criteria, file diffs confirm | **Success**. Proceed to verification. |
| Final response describes partial work, some criteria unmet | **Partial completion**. Main agent reviews, decides accept or retry. |
| Final response describes a blocker or failure | **Failure**. Apply Failure Handling below. |
| Final response does not address the prompt or addresses wrong scope | **Conflicting output**. Main agent resolves, may need to re-decompose. |
| Thread is still `in_progress` after `wait_threads` timeout | **Timeout**. Treat as partial completion; investigate via `read_thread`. |

### Verification (Mandatory)

After collecting results, the main agent **must** independently verify each subtask's output:

1. Read the files listed in `affectedFiles` to confirm changes match acceptance criteria.
2. Run relevant build/syntax checks if applicable.
3. Do not accept the subtask's self-report as evidence of correctness.

Only after verification passes should the main agent mark the subtask `completed`.

## Failure Handling

### Retry Strategy

When a subtask fails:

1. **First retry**: Use `send_message_to_thread` on the **same thread** to send a refined prompt. Include the failure reason from the first attempt. Add more specific guidance. This is cheaper than creating a new thread and preserves the agent's context about what it already tried.

2. **Second retry**: If the first retry also fails, send another `send_message_to_thread` with an even more constrained prompt -- smaller scope, more explicit file paths, simpler acceptance criteria.

3. **Fall back to serial**: If two retries fail, abandon parallel dispatch for this subtask. The main agent implements it directly in serial mode on the main thread.

### Failure Isolation

A subtask failure does not affect other subtasks in the same wave (they have no mutual dependencies). The main agent should:

1. Mark the failed subtask as `failed`.
2. Accept results from other subtasks in the wave that passed verification.
3. Record a checkpoint noting the partial wave completion.
4. Address the failed subtask before proceeding to the next wave (downstream waves are blocked until all predecessors are `completed`).

### Timeout Handling

`wait_threads` has a `timeoutMs` parameter (default 120000 ms). For HelloDev waves, use `timeoutMs: 300000` (5 minutes). If the timeout fires:

1. Call `wait_threads` again with the same targets and updated `afterCursor` values from the previous response.
2. For any thread that still has not completed after two consecutive timeouts, use `read_thread` to inspect its current state.
3. If the thread is stuck (e.g. waiting for user input despite the prompt forbidding it), send a clarification via `send_message_to_thread` or mark it as failed and fall back to serial.

## Constraints

### Codex-Specific Limitations

- **Side tasks are user-visible**: Each subtask appears in the Codex sidebar as an independent thread. The user can navigate to it, read its history, and even send follow-up messages. The prompt must explicitly instruct the subtask agent **not to interact with the user** and to report blockers in its final response instead.
- **No anonymous sub-agents**: Codex does not provide a short-lived anonymous sub-agent primitive. Every dispatch creates a persistent thread. The main agent should archive completed subtask threads (`set_thread_archived`) after verification to keep the sidebar clean.
- **Worktree creation is asynchronous**: When `environment.type` is `"worktree"`, `create_thread` may return `clientThreadId` instead of `threadId`, indicating the worktree is still being set up. The main agent must poll `get_worktree_creation_status` with the returned `operationId` until it reports `completed`, then retrieve the actual `threadId` from `list_threads`.
- **Model availability varies**: The `model` and `thinking` parameters depend on the host's configured models. Do not hardcode model names in prompts; let the thread use the user's default model unless there is a specific reason to override.
- **No cross-thread filesystem isolation without worktrees**: `environment.type: "local"` (same-directory) means all side tasks share the same working tree. Concurrent writes to the same file will conflict. This is why HelloDev's `affectedFiles` conflict detection must downgrade to sequential when files overlap. Prefer `environment.type: "worktree"` for parallel waves to get filesystem isolation.
- **Rate limits**: Codex applies account-level rate limits. Spawning too many parallel threads may cause throttling. Keep wave size reasonable (3-5 subtasks per wave is a good default).

### Sub-Agent Type Selection

Codex does not expose explicit sub-agent types (no "Explore" or "Plan" variants). All side tasks use the same general-purpose agent. Differentiation happens through prompt instructions:

| Subtask Characteristic | Prompt Adjustment |
|----------------------|-------------------|
| Code implementation (creates/modifies files) | Full prompt with file boundaries and acceptance criteria |
| File exploration or research (read-only) | Add explicit "READ ONLY -- do not modify any files" instruction |
| Architecture planning (read-only, analytical) | Add explicit "READ ONLY -- produce a design document in your response" instruction |

Default to full implementation prompt. Switch to read-only instructions only when the subtask is explicitly exploration-only.

## Optional: State Machine Integration

Execution order (the single source is `scripts/lib/stages.js`; `scripts/state.js` requires it):

```text
bootstrap -> initialization -> requirement -> tool-research -> feature-design -> architecture -> prototype -> implementation -> testing -> review -> ship -> learn -> evolution -> reflection -> archive
```

```text
bootstrap -> initialization -> requirement -> implementation -> testing -> review -> ship -> learn -> evolution -> reflection -> archive
```

The first chain is `--type design --path full`; the second is every other path. `initialization`
runs on **both** (it is the session's first planning step); the four design-only stages
(`feature-design`, `tool-research`, `architecture`, `prototype`) are skipped outside
the full path.

Codex provides a thread system visible in the sidebar. Hello Dev has its own state machine with 15 stages and 5 status values, persisted in `.hello-dev/state.json`. This section defines how the main agent can **optionally** reflect Hello Dev's stage progress into Codex thread titles or metadata, so the user can track the HelloDev process from the sidebar.

### Stage-to-Thread Mapping (Optional)

This is **not** a 1:1 mapping like WorkBuddy's task system. Codex threads are conversations, not checklist items. The main agent has two options:

**Option A: Single thread for the whole HelloDev process (default)**

The main HelloDev thread is the user's primary conversation. Stage transitions are reported in the main thread's messages. No additional threads are created for stages. This is the simplest and recommended approach for most tasks.

**Option B: Side threads for major stages (optional, for long-running tasks)**

For tasks expected to run across many hours or days, the main agent may create side threads for major stages (e.g. "HelloDev: Architecture Discussion", "HelloDev: Review"). This is only justified when the stage involves substantial back-and-forth that would clutter the main thread.

### Title-Based Progress Indication (Optional)

If the main agent wants to surface stage progress in the sidebar without creating extra threads, it can rename the main thread to reflect the current stage:

```
mcp__codex_app__set_thread_title({
  threadId: "<main-thread-id>",
  title: "HelloDev [<stage>]: <project/feature name>"
})
```

Call this after every `state.js stage <name> <status>` transition. The title gives the user a glanceable indicator of which stage is active.

### No Status Synchronization

Unlike WorkBuddy, Codex threads do not have a "status" field (pending/in_progress/completed). There is no status to synchronize. Progress is communicated through:
1. Thread titles (optional, as above).
2. Messages in the main thread (the main agent reports stage transitions conversationally).
3. The presence of side task threads (completed/archived threads indicate finished subtasks).

## Optional: Parallelism Limits

- **Recommended wave size**: 3-5 subtasks per parallel wave. Larger waves increase the risk of rate limiting and make verification harder.
- **Maximum concurrent threads**: Codex does not publish a hard limit, but practical experience suggests 5-8 concurrent active threads is a safe range. Beyond that, rate limits and context window pressure become significant.
- **Sequential fallback**: When in doubt, use `dispatchMode: serial`. It is slower but avoids all concurrency-related risks.

## Optional: Examples

### Example: Two-Task Parallel Wave on Codex

Given decomposition:

```json
{
  "tasks": [
    {"id": "t1", "name": "Data model", "depends": [], "affectedFiles": ["src/models/user.js"]},
    {"id": "t2", "name": "API endpoint", "depends": ["t1"], "affectedFiles": ["src/api/user.js"]},
    {"id": "t3", "name": "Frontend form", "depends": ["t1"], "affectedFiles": ["src/components/UserForm.vue"]}
  ]
}
```

Wave 2 contains t2 and t3 (both depend on t1, no file conflict). The main agent dispatches:

```
# 1. Resolve project
list_projects({})
# => returns projects; find the one matching the target project's path
# projectId: "proj_abc123"

# 2. Launch both subtasks concurrently
mcp__codex_app__create_thread({
  prompt: "You are a Hello Dev subtask agent...\n\n## Project\nmy-app (/path/to/my-app)\n\n## Scope\nImplement the user API endpoint...\n\n## Files\n- src/api/user.js\n\n## Implementation\n...\n\n## Acceptance Criteria\n...\n\n## Constraints\n...",
  title: "HelloDev: API endpoint (t2)",
  target: {
    type: "project",
    projectId: "proj_abc123",
    environment: { type: "worktree" }
  }
})

mcp__codex_app__create_thread({
  prompt: "...(similar structure for t3)...",
  title: "HelloDev: Frontend form (t3)",
  target: {
    type: "project",
    projectId: "proj_abc123",
    environment: { type: "worktree" }
  }
})

# 3. Collect threadIds from responses
# If worktree is ready: threadId is returned directly
# If worktree is pending: clientThreadId is returned; poll get_worktree_creation_status

# 4. Wait for completion
mcp__codex_app__wait_threads({
  targets: [
    { threadId: "thread_t2_id" },
    { threadId: "thread_t3_id" }
  ],
  timeoutMs: 300000
})

# 5. Loop wait_threads with afterCursor until both complete
# 6. Verify independently by reading affected files
# 7. Archive completed threads
mcp__codex_app__set_thread_archived({ threadId: "thread_t2_id", archived: true })
mcp__codex_app__set_thread_archived({ threadId: "thread_t3_id", archived: true })
```

### Example: Retry via send_message_to_thread

Subtask t2 fails with "cannot find type definition for User". Main agent retries:

```
mcp__codex_app__send_message_to_thread({
  threadId: "thread_t2_id",
  prompt: "Your previous attempt failed because the User type was not found. The type is defined in src/types/user.ts. Import it with `import { User } from '../types/user';` and retry the implementation."
})

# Then wait again
mcp__codex_app__wait_threads({
  targets: [{ threadId: "thread_t2_id", afterCursor: "<cursor from previous wait>" }],
  timeoutMs: 300000
})
```
