#!/usr/bin/env node
'use strict';

/**
 * Hello Dev — Task decomposition analysis (dependency, wave and parallel groups)
 *
 * Origin: wave derivation previously existed twice and disagreed. `state.js`
 * derived waves with a single forward pass over `tasks`, reading
 * `waveMap[dependency]` directly. When a subtask was listed before a
 * dependency it declared, that dependency's wave was still `undefined`, so
 * `Math.max(...)` produced NaN, no wave satisfied the `w <= maxWave` loop, and
 * the command reported success with **zero waves**:
 *
 *   node scripts/state.js decompose --tasks '[{"id":"t2","depends":["t1"]},{"id":"t1","depends":[]}]'
 *   -> [OK] Decomposition complete: 2 subtasks, 0 waves
 *
 * `scripts/codex-prompt.js` had its own recursive `deriveWaves`, which handled
 * that same input correctly and returned t1=1, t2=2. Two derivations over one
 * state file meant the printed order table and the dispatched prompts could
 * describe different execution plans.
 *
 * This module is the single source of that derivation. Consumers must not
 * re-implement it: a second copy is how the two drifted in the first place.
 *
 * Contract notes:
 *   - Derivation is a pure function of the task list. Declaration order must
 *     not change the result; only the dependency graph may.
 *   - Output order within a wave follows input order, so existing order-table
 *     assertions stay stable.
 *   - Cycles are rejected here rather than silently producing dropped tasks.
 */

/** Recursively resolve each subtask's earliest wave. Order-independent. */
function deriveWaves(tasks) {
  if (!Array.isArray(tasks)) throw new Error('deriveWaves requires an array of subtasks');
  const byId = new Map();
  for (const t of tasks) {
    if (!t || typeof t.id !== 'string' || !t.id) throw new Error('every subtask needs a non-empty id');
    if (byId.has(t.id)) throw new Error(`duplicate subtask id: ${t.id}`);
    byId.set(t.id, t);
  }
  const waveOf = Object.create(null);
  const visiting = new Set();
  const resolved = new Set();

  function resolve(id) {
    if (resolved.has(id)) return waveOf[id];
    const task = byId.get(id);
    if (!task) throw new Error(`subtask depends on unknown task: ${id}`);
    // A node revisited while still on the recursion stack is a cycle. Reporting
    // the id is what turns an infinite loop into an actionable message.
    if (visiting.has(id)) throw new Error(`circular dependency involving: ${id}`);
    visiting.add(id);
    let depth = 1;
    for (const dep of task.depends || []) {
      depth = Math.max(depth, resolve(dep) + 1);
    }
    visiting.delete(id);
    resolved.add(id);
    waveOf[id] = depth;
    return depth;
  }

  for (const t of tasks) resolve(t.id);
  return waveOf;
}

/**
 * Pairwise file conflict detection within a single wave.
 * Comparison is trimmed and case-insensitive: `src/Config.js` and `src/config.js`
 * collide on case-insensitive filesystems, which is the platform this framework
 * is used on.
 */
function findConflicts(waveTasks) {
  const conflicts = [];
  for (let i = 0; i < waveTasks.length; i++) {
    for (let j = i + 1; j < waveTasks.length; j++) {
      const a = new Set((waveTasks[i].affectedFiles || []).map(f => String(f).trim().toLowerCase()));
      const shared = (waveTasks[j].affectedFiles || [])
        .map(f => String(f).trim().toLowerCase())
        .filter(f => a.has(f));
      if (shared.length) {
        conflicts.push({ tasks: [waveTasks[i].id, waveTasks[j].id], files: shared });
      }
    }
  }
  return conflicts;
}

/**
 * Full execution-order analysis: waves, dependency edges, the serial chain the
 * dependency graph forces, the groups that may run concurrently, and any file
 * conflicts that override concurrency.
 */
function analyze(tasks) {
  if (!Array.isArray(tasks) || !tasks.length) throw new Error('analyze requires a non-empty array of subtasks');
  const waveOf = deriveWaves(tasks);
  const maxWave = Math.max(...tasks.map(t => waveOf[t.id]));

  const waves = [];
  const conflicts = [];
  for (let w = 1; w <= maxWave; w++) {
    const waveTasks = tasks.filter(t => waveOf[t.id] === w);
    const waveConflicts = waveTasks.length > 1 ? findConflicts(waveTasks) : [];
    for (const c of waveConflicts) conflicts.push({ wave: w, tasks: c.tasks, files: c.files });
    waves.push({
      wave: w,
      tasks: waveTasks.map(t => t.id),
      // A wave holding several mutually independent subtasks may run concurrently,
      // unless a shared file would let two writers clobber each other.
      mode: waveTasks.length > 1 && !waveConflicts.length ? 'parallel' : 'sequential',
    });
  }

  // Dependency edges, dependent-oriented: "everything t1 unblocks".
  const dependentsOf = Object.create(null);
  for (const t of tasks) dependentsOf[t.id] = [];
  for (const t of tasks) {
    for (const dep of t.depends || []) dependentsOf[dep].push(t.id);
  }
  const roots = tasks.filter(t => !(t.depends || []).length).map(t => t.id);
  // Leaves: nothing depends on them. Informational, but it is what tells an
  // operator where the graph actually terminates.
  const leaves = tasks.filter(t => !dependentsOf[t.id].length).map(t => t.id);
  const edges = tasks
    .filter(t => (t.depends || []).length)
    .map(t => ({ id: t.id, depends: t.depends.slice() }));

  // One representative longest chain. Ties resolve on input order so repeated
  // runs over the same decomposition print the same path.
  const criticalPath = [];
  const deepest = tasks.filter(t => waveOf[t.id] === maxWave)[0];
  if (deepest) {
    let cursor = deepest;
    while (cursor) {
      criticalPath.unshift(cursor.id);
      const preds = cursor.depends || [];
      cursor = preds.length ? tasks.find(t => t.id === preds[0]) : null;
    }
  }

  return {
    waveOf,
    maxWave,
    waves,
    conflicts,
    edges,
    dependentsOf,
    roots,
    leaves,
    criticalPath,
    // Waves that must execute one at a time, in ascending order. These are the
    // real serialization the graph forces, as opposed to a wave narrowed by a
    // file conflict.
    serialChain: waves.filter(w => w.mode === 'sequential' && w.tasks.length === 1).map(w => ({ wave: w.wave, tasks: w.tasks })),
    parallelGroups: waves.filter(w => w.mode === 'parallel').map(w => ({ wave: w.wave, tasks: w.tasks })),
  };
}

/** True only for the literal strings "true"/"false", so a typo cannot flip meaning. */
function parseBooleanFlag(value, label) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${label} must be true or false (got ${JSON.stringify(value)})`);
}

/**
 * Build the mandatory sub-agent dispatch plan.
 *
 * Policy: every wave that `analyze` marked `parallel` is a group of subtasks that can
 * run concurrently, so each such wave MUST be dispatched to sub-agents rather than
 * executed by the main agent. A wave holding one subtask, or one narrowed by a file
 * conflict, is inherently sequential and is not part of the plan.
 *
 * Returns one entry per parallel wave plus the totals the gate reports.
 */
function dispatchPlan(tasks) {
  const a = analyze(tasks);
  const groups = a.parallelGroups.map(g => ({
    wave: g.wave,
    tasks: g.tasks,
    // Why this wave qualifies: several subtasks with no shared affectedFiles.
    reason: `${g.tasks.length} independent subtasks, no shared affectedFiles`,
  }));
  return {
    groups,
    requiredWaves: groups.map(g => g.wave),
    // Subtasks that a sequential wave forces the main agent to do itself.
    serialTasks: a.waves.filter(w => w.mode !== 'parallel').reduce((acc, w) => acc.concat(w.tasks), []),
    totalParallelSubtasks: groups.reduce((n, g) => n + g.tasks.length, 0),
  };
}

/**
 * Which parallel waves are not yet fully dispatched.
 *
 * `records` is the `decomposition.dispatches` array actually written to state.
 *
 * A wave counts as dispatched only when the records **cover every subtask in that wave**.
 * Matching on the wave number alone is not enough: `dispatch --subtasks t1` on a wave of
 * three would otherwise satisfy the gate while two subtasks were silently executed by the
 * main agent, which contradicts the requirement that *every* parallel task be dispatched.
 * Coverage is therefore compared as a set of subtask ids, so partial and duplicated
 * records both fall short.
 *
 * A record whose `waived` is set satisfies the wave entirely: a waiver is an explicit,
 * reasoned authorization to run the whole wave serially, not a partial dispatch.
 *
 * Note on the grandfathering boundary: this function deliberately knows nothing about
 * subtask status. An earlier version skipped waves whose subtasks were already
 * `completed`, intending to avoid retroactively invalidating older tasks — but the
 * Implementation gate requires every subtask completed *before* it checks dispatch, so
 * that condition was always true and the gate could never fire (dead code). The correct
 * marker is whether the state was created under this policy at all, which the caller
 * decides by the presence of the `dispatches` field; see cmdStage.
 */
function undispatchedWaves(tasks, records) {
  const plan = dispatchPlan(tasks);
  const list = Array.isArray(records) ? records : [];
  const required = [];
  for (const group of plan.groups) {
    if (list.some(r => r && r.wave === group.wave && r.waived)) continue;
    const covered = new Set();
    for (const r of list) {
      if (!r || r.wave !== group.wave || r.waived) continue;
      for (const id of r.tasks || []) covered.add(id);
    }
    const missing = group.tasks.filter(id => !covered.has(id));
    if (missing.length) required.push(group.wave);
  }
  return { required, plan };
}

/** Format the dispatch plan for CLI output. */
function formatDispatchPlan(plan) {
  const lines = [];
  lines.push('=== Sub-Agent Dispatch Plan (mandatory) ===');
  if (!plan.groups.length) {
    lines.push('No parallel group detected: every wave is single-subtask or narrowed by a file conflict.');
    lines.push('Nothing to dispatch; the main agent executes all subtasks sequentially.');
    return lines;
  }
  lines.push(`${plan.groups.length} parallel wave(s), ${plan.totalParallelSubtasks} subtask(s) must be dispatched to sub-agents:`);
  for (const g of plan.groups) lines.push(`  Wave ${g.wave}: ${g.tasks.join(', ')}   (${g.reason})`);
  if (plan.serialTasks.length) {
    lines.push(`Main agent keeps (sequential waves): ${plan.serialTasks.join(', ')}`);
  }
  lines.push('Record each dispatch after it completes, then verify results independently:');
  lines.push('  node scripts/state.js dispatch --wave <n> --subtasks <ids> --agent <name>');
  return lines;
}

/**
 * Names that denote the main agent rather than a delegated sub-agent.
 *
 * Why this exists: the duty to dispatch a parallel wave to a sub-agent is recorded by a
 * `dispatch` entry, and that entry carried no constraint on `agent`. Measured before this
 * check: `dispatch --wave 1 --agent main-agent` returned `[OK]` and the gate then treated
 * wave 1 as satisfied, so the policy could be fulfilled by the main agent dispatching to
 * itself. A record that names the main agent is not evidence of delegation.
 *
 * The denylist is intentionally a known-names list rather than a required `subagent-*`
 * prefix, so operators can use their own real agent names. It cannot be exhaustive; it
 * closes the self-assignment loophole, it does not prove a sub-agent existed.
 */
const SELF_AGENT_NAMES = new Set([
  'main', 'mainagent', 'self', 'selfagent', 'myself', 'me',
  'none', 'null', 'na', 'nil', 'noop', 'noone', 'nobody',
  'waived', 'waiver', 'skip', 'skipped', 'serial', 'local', 'inline',
]);

/**
 * Words that carry no identity of their own, in two closed classes: role nouns (`main`,
 * `self`, `agent`) and English function words (`the`, `is`, `and`).
 *
 * A name assembled entirely from these describes a role rather than naming a distinct actor:
 * `main`, `main agent`, `the main agent` and `it is the main agent` all point at the main
 * agent. Any other word carries identity, so `mainframe-worker` and `agent-of-record` are
 * untouched. This is a closed-class list, not a phrase blacklist: enumerating phrasings would
 * be unbounded.
 */
const ROLE_FILLER_WORDS = new Set([
  'main', 'self', 'agent', 'subagent', 'sub', 'myself', 'me',
  'the', 'a', 'an', 'is', 'are', 'it', 'its', 'itself', 'and', 'or', 'of', 'as', 'vs', 'to', 'be',
  // placeholders: a name like `none-agent` names no actor
  'none', 'null', 'na', 'nil', 'noop', 'noone', 'nobody', 'waived', 'waiver',
  'skip', 'skipped', 'serial', 'local', 'inline',
]);

/**
 * Reduce a name to its letters and digits only.
 *
 * Why not a separator list: an earlier version collapsed only `\s`, `_` and `-`, so
 * `main.agent` and `main/agent` were accepted, wrote a dispatch record, and opened the gate —
 * the same loophole this module exists to close. Any enumerated separator list is a guess about
 * which punctuation someone will use. Stripping everything that is not a letter or digit makes
 * every separator equivalent by construction, so `main agent`, `main_agent`, `main.agent`,
 * `main/agent` and `main-agent` all reduce to the same key.
 *
 * Non-ASCII letters are removed too: this deliberately does not attempt homoglyph folding
 * (a Cyrillic `а` is not an ASCII `a`), because the goal is to catch the plain spellings of
 * the main agent and not to be a general identity system.
 */
function normalizeAgentKey(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * True when `name` denotes the main agent itself (or an empty placeholder), case-insensitively,
 * ignoring surrounding whitespace, punctuation, and a leading `sub-agent`/`agent` prefix.
 */
function isSelfAgentName(name) {
  if (typeof name !== 'string') return true;
  const normalized = name.trim();
  if (!normalized) return true;
  const whole = normalizeAgentKey(normalized);
  if (!whole) return true;
  if (SELF_AGENT_NAMES.has(whole)) return true;
  // A leading role prefix carries no identity of its own: `agent:main`, `subagent-main` and
  // bare `main` all refer to the same actor, so strip it and test again.
  const stripped = whole.replace(/^(?:subagent|agent)/, '');
  if (stripped !== whole && SELF_AGENT_NAMES.has(stripped)) return true;
  // A name assembled only from role words names no distinct agent. Tokenized on the original
  // text so the boundary between words survives: `mainframe-worker` keeps `mainframe`, which is
  // not a role word, while `the main agent` reduces to role words only.
  const words = normalized.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (words.length && words.every(w => ROLE_FILLER_WORDS.has(w))) return true;
  return false;
}

/** Wave coverage check for the state loader. A wave set that does not account for
 * every subtask exactly once is the shape that the order-dependent derivation
 * produced, and it validated clean because only per-wave shape was inspected.
 */
function coverageProblems(tasks, waves) {
  const problems = [];
  if (!Array.isArray(tasks) || !Array.isArray(waves)) return ['decomposition tasks or waves missing'];
  const known = new Set(tasks.map(t => t.id));
  const seen = new Set();
  for (const w of waves) {
    if (!w || !Array.isArray(w.tasks)) continue;
    for (const id of w.tasks) {
      if (!known.has(id)) problems.push(`wave ${w.wave} references unknown subtask: ${id}`);
      else if (seen.has(id)) problems.push(`subtask listed in more than one wave: ${id}`);
      seen.add(id);
    }
  }
  for (const t of tasks) {
    if (!seen.has(t.id)) problems.push(`subtask missing from every wave: ${t.id}`);
  }
  if (!waves.length && tasks.length) problems.push(`no waves derived for ${tasks.length} subtask(s)`);
  return problems;
}

/** Human-readable analysis block. Returned as lines so callers own the framing. */
function formatAnalysis(a) {
  const lines = [];
  lines.push('=== Execution Order Analysis ===');
  lines.push(`Subtasks: ${Object.keys(a.waveOf).length}   Waves: ${a.waves.length}   Longest chain: ${a.criticalPath.length}`);

  lines.push('');
  lines.push('Prerequisites (each subtask <- what must finish first):');
  if (!a.edges.length) lines.push('  (none; all subtasks are independent)');
  for (const e of a.edges) lines.push(`  ${e.id} <- ${e.depends.join(', ')}`);
  lines.push(`  Roots (no prerequisites): ${a.roots.join(', ') || '(none)'}`);
  lines.push(`  Leaves (nothing waits on them): ${a.leaves.join(', ') || '(none)'}`);

  lines.push('');
  lines.push('Serial chain the dependencies force:');
  if (!a.serialChain.length) lines.push('  (none; every wave holds more than one subtask)');
  for (const s of a.serialChain) lines.push(`  Wave ${s.wave}: ${s.tasks.join(', ')} (single subtask, runs alone)`);
  lines.push(`  Wave order is strictly serial: ${a.waves.map(w => 'Wave ' + w.wave).join(' -> ')}`);
  lines.push(`  Longest dependency chain: ${a.criticalPath.join(' -> ')}`);

  lines.push('');
  lines.push('Parallel groups (safe to run concurrently):');
  if (!a.parallelGroups.length) lines.push('  (none; no wave is both multi-subtask and conflict-free)');
  for (const g of a.parallelGroups) lines.push(`  Wave ${g.wave}: ${g.tasks.join(', ')}`);

  lines.push('');
  lines.push('File conflicts forcing sequential execution inside a wave:');
  if (!a.conflicts.length) lines.push('  (none)');
  for (const c of a.conflicts) lines.push(`  Wave ${c.wave}: ${c.tasks[0]} and ${c.tasks[1]} share ${c.files.join(', ')}`);

  return lines;
}

module.exports = {
  deriveWaves, analyze, formatAnalysis, coverageProblems, findConflicts, parseBooleanFlag,
  dispatchPlan, undispatchedWaves, formatDispatchPlan,
  isSelfAgentName, SELF_AGENT_NAMES,
};
