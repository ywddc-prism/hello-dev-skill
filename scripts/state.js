#!/usr/bin/env node
'use strict';

/**
 * Hello Dev — State file protocol CLI v1
 *
 * Single state file: {project}/.hello-dev/state.json
 * Reason for existence: stages, approvals, retry counts must not live only in conversation —
 * they must be persistable, recoverable, and auditable.
 *
 * Usage:
 *   node scripts/state.js init --name "User auth design" --type design [--path full|fast]
 *   node scripts/state.js show
 *   node scripts/state.js stage <name> <pending|in_progress|completed|failed|rolled_back>
 *   node scripts/state.js module <id> <design|submitted|approved|rejected|annotated>
 *   node scripts/state.js reject <id> --reason "Missing error handling"
 *   node scripts/state.js checkpoint <name> <pass|fail>
 *   node scripts/state.js resume      # session resume entry: print current state and next action
 *   node scripts/state.js validate
 */

const fs = require('fs');
const path = require('path');
// Single source of wave derivation and execution-order analysis.
// **Do not re-implement derivation here**: state.js and codex-prompt.js each had
// their own copy and disagreed on the same state file (order-dependent forward
// pass produced 0 waves, the recursive copy produced the correct 2). The second
// implementation is precisely how they drifted.
const decomp = require('./lib/decomposition');

const DIR = '.hello-dev';
const FILE = 'state.json';
const SCHEMA = 1;
const RETRY = { perModuleMax: 3, totalMax: 10 };
// Stage order lives once, in scripts/lib/stages.js. A local copy here is how the
// five restatements drifted apart in the first place.
const { STAGES, DESIGN_ONLY_STAGES, route } = require('./lib/stages');
// Imported rather than restated: the mandatory post-delivery stage list has one source of
// truth, and a literal copy here is how the five restatements drifted apart before.
const { MANDATORY_STAGES } = require('./lib/mandatory-stages');
const STAGE_STATUS = ['pending', 'in_progress', 'completed', 'failed', 'rolled_back'];
const MODULE_STATUS = ['design', 'submitted', 'approved', 'rejected', 'annotated'];
const SUBTASK_STATUS = ['pending', 'in_progress', 'completed', 'failed'];
// Ops step statuses. Leaner than yunwei_loop: no independent execution stage (HelloDev's
// execution is within Implementation), no dead states like drift_detected/approval_expired —
// expiry and invalidation are judged in real-time by verifyApproval at the gate.
const OPS_STEP_STATUS = ['pending', 'awaiting_approval', 'approved', 'rejected', 'expired'];

/** Minimum characters of `--reason` for a REQUIRED checkpoint. A length floor is a
 * discipline guard, not a semantic one: it stops `done`/`ok`/omission from closing a
 * stage, but it cannot judge whether the reasoning is correct. Content judgment stays
 * with the human, per state-protocol.md's limitation clause. */
const REQUIRED_REASON_MIN = 40;

/** Lower placeholder floor, used on the `fast` path for the post-delivery retrospective
 * stages only (MANDATORY_STAGES: learn/evolution/reflection/archive). The argument above
 * applies unchanged: this is a placeholder/absence detector, not a semantic judge, and 12
 * still rejects an empty string, `done`, `ok`, `pass` and `n-a`. Those four stages carry no
 * authorization and no delivery evidence -- they record what was learned after ship -- so
 * their reason text does not need to clear the same bar as a gate. The authorization gates
 * (initialization, requirement) and the evidence gates (testing, review) keep 40 on every
 * path: the framework exists to prevent "tests went green but nothing was verified", and
 * that risk does not scale down with task size. */
const LITE_REASON_MIN = 12;

function fail(msg) { throw new Error(msg); }
function now() { return new Date().toISOString(); }

// Check if this directory is a "project root with state files".
// **Must be character-for-character identical**: each of three scripts has its own copy,
// test-memory.js:9d does character-level comparison (excluding comments).
function isStateFile(dir) {
  const d = path.join(dir, DIR);
  if (!fs.existsSync(d)) return false;
  return fs.readdirSync(d).some(f =>
    f === 'memory.json' || f === 'evolve.json' || /^state(\.sibling-.+)?\.json$/.test(f));
}
function findRoot(start) {
  let dir = path.resolve(start || process.cwd());
  for (;;) {
    // Recognize **any** state file under .hello-dev/, not just its own.
    // Recognizing only its own creates two stores: root already has state.json,
    // cwd is in subdirectory, memory walks up to .git and returns null,
    // cold start lands in subdirectory — measured `state.json@<R>` vs
    // `memory.json@<R>/src`, `recall @src=1` / `@R=0`.
    // Reverse is the same (root only has memory.json, state cold-starts from subdirectory).
    // **All three must be updated together and be character-for-character identical after
    // comment removal**: test-memory.js:9d does cross-file character comparison,
    // changing only one immediately turns red. Task selection (--task) stays in statePath, not findRoot.
    if (isStateFile(dir)) return dir;
    if (fs.existsSync(path.join(dir, '.git'))) return null;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function statePath(root, taskId) {
  // **--task selection happens only here**. Default behavior must be character-for-character
  // consistent with history (state.json), otherwise all existing state files would suddenly
  // become "not found".
  // Note: do not put selection into findRoot — memory.js copied findRoot verbatim and has
  // cross-tests (test-memory.js:325), changing it would break that binding too.
  return taskId ? path.join(root, DIR, `${FILE.replace(/\.json$/, '')}.sibling-${taskId}.json`) : path.join(root, DIR, FILE);
}

// Task ID selected by the current command (value of --task). undefined = default main state file.
// Module-level single read: CLI is a one-shot process, each command parsed only once.
let TASK_ID;

/** Validate whether --task value itself is legal; reject illegal values before selection to avoid malformed filenames. */
function assertTaskId(id) {
  if (id !== undefined && !validId(id)) fail('--task must be a safe 1-64 character identifier (alphanumeric/underscore/hyphen)');
}

/** List existing sibling task IDs under .hello-dev/. */
function siblingTaskIds(root) {
  const dir = path.join(root, DIR);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .map(f => /^state\.sibling-(.+)\.json$/.exec(f))
    .filter(Boolean).map(m => m[1]).filter(validId);
}

function read(root) {
  return readState(root, false);
}

/**
 * Read the state file.
 *
 * `lenient` exists for **repair paths only** — the commands whose job is to fix a
 * state that strict validation rejects (`decompose --replace true`,
 * `decompose-clear`). Without it, the very state the coverage check above is meant
 * to catch becomes unrepairable: strict validation fails the read, so the command
 * that would rebuild the waves can never run, and the operator is told to restore a
 * backup instead. A gate that blocks its own remedy is a trap, not a gate.
 *
 * Do **not** use lenient reads for progress commands. Strict validation is what
 * prevents quietly continuing on a corrupt state.
 */
function readState(root, lenient) {
  const p = statePath(root, TASK_ID);
  let s;
  try { s = JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { fail(`State file unreadable or malformed: ${p} (${e.message})`); }
  const object = x => x && typeof x === 'object' && !Array.isArray(x);
  const count = x => Number.isSafeInteger(x) && x >= 0;
  if (!object(s) || s.schema !== SCHEMA || !object(s.task) ||
      typeof s.task.name !== 'string' || !s.task.name.trim() || !validId(s.task.id) ||
      !['design', 'implementation', 'other'].includes(s.task.type) ||
      !['full', 'fast'].includes(s.task.path) || !object(s.stage) ||
      !STAGES.includes(s.stage.current) || !STAGE_STATUS.includes(s.stage.status) ||
      !Array.isArray(s.stage.history) || !object(s.modules) ||
      !Array.isArray(s.checkpoints) || !object(s.retry) ||
      !count(s.retry.total) || !count(s.retry.totalMax) || s.retry.totalMax < 1 ||
      !count(s.retry.perModuleMax) || s.retry.perModuleMax < 1 || !object(s.retry.perModule) ||
      !(s.blocked === null || typeof s.blocked === 'string')) fail('State file structure illegal; restore a trusted backup, do not auto-overwrite');
  if (s.stage.history.some(h => !object(h) || !STAGES.includes(h.stage) || !STAGE_STATUS.includes(h.status)) ||
      s.checkpoints.some(c => !object(c) || typeof c.name !== 'string' || !['pass', 'warn', 'fail'].includes(c.result) || !STAGES.includes(c.stage)) ||
      Object.entries(s.modules).some(([id, m]) => !validId(id) || !object(m) || !MODULE_STATUS.includes(m.status) || !count(m.versions) || !count(m.rejections))) fail('State history, modules, or checkpoint format illegal');
  const stamp = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
  if (!stamp(s.createdAt) || !stamp(s.updatedAt) ||
      !object(s.git) || !Array.isArray(s.git.decisions) ||
      (s.stage.attempt !== undefined && !count(s.stage.attempt)) ||
      (s.stage.checkpointStart !== undefined && (!count(s.stage.checkpointStart) || s.stage.checkpointStart > s.checkpoints.length)) ||
      s.checkpoints.some(c => !stamp(c.at)) ||
      Object.entries(s.retry.perModule).some(([id, n]) => !validId(id) || !count(n)) ||
      (s.retry.exceeded != null && (!object(s.retry.exceeded) || !stamp(s.retry.exceeded.at))) ||
      (s.retry.history !== undefined && (!Array.isArray(s.retry.history) || s.retry.history.some(h => !object(h) || !validId(h.module) || !stamp(h.at)))) ||
      (s.retry.extensions !== undefined && !Array.isArray(s.retry.extensions)) ||
      (s.blockedHistory !== undefined && !Array.isArray(s.blockedHistory))) fail('State metadata, counters, or time fields illegal');
  // ops section: execution intent approval.
  // **Backward compatible**: existing valid state in schema 1 doesn't have this field;
  // when reading, treat as "no ops steps" rather than error — state-protocol explicitly
  // requires existing state to be readable, mandatory fields would make all old state unreadable.
  // But once the field exists, validate strictly: adding a field without validation =
  // claiming to have a gate while actually having none.
  if (s.ops !== undefined) {
    if (!object(s.ops) || !object(s.ops.steps) || !Array.isArray(s.ops.approvals)) fail('ops section structure illegal; restore a trusted backup, do not auto-overwrite');
    if (Object.entries(s.ops.steps).some(([id, st]) => !validId(id) || !object(st) ||
        typeof st.command !== 'string' || !st.command.trim() ||
        !/^[a-f0-9]{64}$/.test(st.digest || '') ||
        !['auto_read', 'pre_execution', 'blocked'].includes(st.approvalMode) ||
        !OPS_STEP_STATUS.includes(st.status))) fail('ops step format illegal');
    if (s.ops.approvals.some(a => !object(a) || !/^[a-f0-9]{64}$/.test(a.stepDigest || '') ||
        !stamp(a.approvedAt) || !stamp(a.expiresAt) || typeof a.approvedBy !== 'string' || !a.approvedBy.trim()))
      fail('ops approval credential format illegal');
  }
  // collaboration section: snapshot of this task's collaboration table
  // (Bootstrap detects skill set for later stages and audit review).
  // **Backward compatible**: same policy as ops section — field absent treated as "not detected",
  // existing state still readable; once present, validate strictly, otherwise equals declaring
  // a field with no gate capability.
  if (s.collaboration !== undefined) {
    if (!object(s.collaboration) || !stamp(s.collaboration.detectedAt) ||
        !Array.isArray(s.collaboration.skills)) fail('collaboration section structure illegal; restore a trusted backup, do not auto-overwrite');
    if (s.collaboration.skills.some(k => !object(k) ||
        typeof k.name !== 'string' || !k.name.trim() ||
        typeof k.source !== 'string' || !k.source.trim() ||
        (k.rule !== undefined && (typeof k.rule !== 'string' || !k.rule.trim()))))
      fail('collaboration skill name/source must be non-empty text');
  }
  // coarseDecomposition section: the INITIALIZATION-stage plan.
  // **Two levels, machine-distinguishable** (D2): initialization writes the coarse plan,
  // requirement the fine one, into two fields of the SAME shape — so wave derivation is
  // reused instead of re-implemented, and a reader can never mistake one level for the
  // other. The coarse level carries **no dispatch obligation** (D4): the Implementation
  // gate reads `decomposition.dispatches` only.
  // **Backward compatible**: absent field means "no coarse plan yet"; once present, strict.
  if (s.coarseDecomposition !== undefined) {
    if (!object(s.coarseDecomposition) || !Array.isArray(s.coarseDecomposition.tasks) ||
        !Array.isArray(s.coarseDecomposition.waves))
      fail('coarseDecomposition section structure illegal; restore a trusted backup, do not auto-overwrite');
    if (!stamp(s.coarseDecomposition.createdAt) || !stamp(s.coarseDecomposition.updatedAt))
      fail('coarseDecomposition time fields illegal');
    if (s.coarseDecomposition.tasks.some(t => !object(t) || !validId(t.id) ||
        typeof t.name !== 'string' || !t.name.trim() ||
        !Array.isArray(t.depends) || !SUBTASK_STATUS.includes(t.status) ||
        (t.affectedFiles !== undefined && (!Array.isArray(t.affectedFiles) ||
          t.affectedFiles.some(f => typeof f !== 'string' || !f.trim())))))
      fail('coarseDecomposition subtask format illegal');
    if (s.coarseDecomposition.waves.some(w => !object(w) || !Number.isSafeInteger(w.wave) || w.wave < 1 ||
        !Array.isArray(w.tasks) || !w.tasks.length ||
        !['sequential', 'parallel'].includes(w.mode || 'sequential')))
      fail('coarseDecomposition wave format illegal');
    const coarseCoverage = decomp.coverageProblems(s.coarseDecomposition.tasks, s.coarseDecomposition.waves);
    if (coarseCoverage.length && !lenient) fail(`coarseDecomposition waves do not cover subtasks: ${coarseCoverage.join('; ')}`);
    if (!lenient) {
      const cids = new Set(s.coarseDecomposition.tasks.map(t => t.id));
      for (const t of s.coarseDecomposition.tasks) {
        for (const dep of t.depends) {
          if (!cids.has(dep)) fail(`coarse subtask ${t.id} depends on unknown task: ${dep}`);
          if (dep === t.id) fail(`coarse subtask ${t.id} cannot depend on itself`);
        }
      }
    }
  }
  // decomposition section: task decomposition and wave order table
  // (produced during Requirement stage, optional).
  // **Backward compatible**: same policy as ops/collaboration sections — field absent
  // treated as "not decomposed", existing state still readable; once present, validate strictly.
  if (s.decomposition !== undefined) {
    if (!object(s.decomposition) || !Array.isArray(s.decomposition.tasks) || !Array.isArray(s.decomposition.waves))
      fail('decomposition section structure illegal; restore a trusted backup, do not auto-overwrite');
    if (!stamp(s.decomposition.createdAt) || !stamp(s.decomposition.updatedAt))
      fail('decomposition time fields illegal');
    if (s.decomposition.dispatchMode !== undefined && !['serial', 'parallel'].includes(s.decomposition.dispatchMode))
      fail('decomposition dispatchMode must be serial or parallel');
    if (s.decomposition.tasks.some(t => !object(t) || !validId(t.id) ||
        typeof t.name !== 'string' || !t.name.trim() ||
        !Array.isArray(t.depends) || !SUBTASK_STATUS.includes(t.status) ||
        (t.affectedFiles !== undefined && (!Array.isArray(t.affectedFiles) ||
          t.affectedFiles.some(f => typeof f !== 'string' || !f.trim())))))
      fail('decomposition subtask format illegal');
    if (s.decomposition.waves.some(w => !object(w) || !Number.isSafeInteger(w.wave) || w.wave < 1 ||
        !Array.isArray(w.tasks) || !w.tasks.length ||
        !['sequential', 'parallel'].includes(w.mode || 'sequential')))
      fail('decomposition wave format illegal');
    // Coverage check. Per-wave shape alone accepted the broken output of the old
    // order-dependent derivation: `{"tasks":[t1,t2],"waves":[]}` validated clean
    // (`[OK] State file valid`) even though no wave referenced any subtask, and the
    // Implementation gate then saw "every subtask completed" trivially.
    const coverage = decomp.coverageProblems(s.decomposition.tasks, s.decomposition.waves);
    if (coverage.length && !lenient) fail(`decomposition waves do not cover subtasks: ${coverage.join('; ')}`);
    // Dependency integrity: a `depends` entry naming a task that does not exist passes the
    // per-field checks above (each entry is only checked as a string), and is only caught
    // later when something derives waves — `order` would warn, `stage implementation
    // completed` would fail with a graph error. Catching it here means `validate` reports
    // it, and every read-only diagnostic stays consistent with that verdict.
    if (!lenient) {
      const ids = new Set(s.decomposition.tasks.map(t => t.id));
      for (const t of s.decomposition.tasks) {
        for (const dep of t.depends) {
          if (!ids.has(dep)) fail(`subtask ${t.id} depends on unknown task: ${dep}`);
          if (dep === t.id) fail(`subtask ${t.id} cannot depend on itself`);
        }
      }
    }
    // Dispatch records: optional (states written before mandatory dispatch have none),
    // but once present each entry must be well formed and name real subtasks.
    //
    // Skipped when `lenient`, for the same reason as coverage above: these records cannot
    // be repaired in place, so a malformed entry would block `decompose --replace true` and
    // `decompose-clear` — the only two commands that can replace or drop them. A gate that
    // blocks its own remedy is a trap, not a gate.
    if (s.decomposition.dispatches !== undefined && !lenient) {
      if (!Array.isArray(s.decomposition.dispatches)) fail('decomposition dispatches must be an array');
      const known = new Set(s.decomposition.tasks.map(t => t.id));
      // A record must name a wave that actually exists, and only subtasks in it. Without
      // this, a record written for `wave 99`, or one claiming wave 2 while naming wave 1's
      // subtasks, would validate clean and then satisfy the gate (independent edits to the
      // state file are not prevented, so validation is where this must be caught).
      const waveMembers = new Map(s.decomposition.waves.map(w => [w.wave, new Set(w.tasks)]));
      for (const d of s.decomposition.dispatches) {
        if (!object(d) || !Number.isSafeInteger(d.wave) || d.wave < 1 ||
            !Array.isArray(d.tasks) || !d.tasks.length ||
            typeof d.agent !== 'string' || !d.agent.trim() || !stamp(d.at)) {
          fail('decomposition dispatch record format illegal');
        }
        if (!waveMembers.has(d.wave)) fail(`dispatch record references unknown wave: ${d.wave}`);
        const members = waveMembers.get(d.wave);
        for (const id of d.tasks) {
          if (!known.has(id)) fail(`dispatch record references unknown subtask: ${id}`);
          if (!members.has(id)) fail(`dispatch record for wave ${d.wave} lists ${id}, which belongs to a different wave`);
        }
        // A non-waived record must name a real delegated agent. Audited before adding this:
        // the only self-agent record in an **active** state is one with `waived: true` (which
        // this rule exempts), and the single `agent: main-agent` record lives in an archived
        // state, which `validate` does not read. So this does not retroactively fail existing
        // work. If a future archive is restored, expect that record to be rejected and to need
        // re-recording or a waiver.
        if (!d.waived && decomp.isSelfAgentName(d.agent)) {
          fail(`dispatch record for wave ${d.wave} names the main agent ("${d.agent}"), which does not evidence delegation; ` +
            `re-record with the real sub-agent id, or use dispatch-waive`);
        }
      }
    }
  }
  return s;
}

// A lock protects the whole read-modify-write operation, not just rename.
function write(root, state) {
  const p = statePath(root, TASK_ID);
  state.updatedAt = now();
  const tmp = `${p}.${process.pid}.${require('node:crypto').randomUUID()}.tmp`;
  let created = false;
  try {
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
    created = true;
    fs.renameSync(tmp, p);
  } finally { if (created && fs.existsSync(tmp)) fs.unlinkSync(tmp); }
  return p;
}

function validId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(id) &&
    !['__proto__', 'prototype', 'constructor'].includes(id);
}
function text(value, label) {
  if (typeof value !== 'string' || !value.trim() || value.length > 4096) fail(`${label} must be 1-4096 characters of non-empty text`);
  return value.trim();
}
function latestCheckpoints(s) {
  const latest = new Map();
  for (const c of s.checkpoints) latest.set(`${c.stage}:${c.name}`, c);
  return [...latest.values()];
}
function progressAllowed(s) {
  if (s.blocked) fail(`Task blocked: ${s.blocked}`);
  if (s.retry.exceeded) fail('Retry limit exceeded; run report first, then retry-resume --reason "..." after user decision');
}
function completed(s, stage) {
  const h = s.stage.history.filter(x => x.stage === stage).pop();
  return h && h.status === 'completed';
}
function completionAllowed(s, name) {
  const current = s.checkpoints.slice(s.stage.checkpointStart || 0).filter(c => c.stage === name);
  const latest = new Map(current.map(c => [c.name, c]));
  if ([...latest.values()].some(c => c.result !== 'pass')) fail('Current stage still has unpassed checkpoints');
  const required = {
    // Initialization produces the scope survey and the COARSE plan. Both are its own
    // evidence, distinct from requirement's `Requirement confirmed` / `Decomposition plan`.
    initialization: ['Scope survey', 'Coarse decomposition plan'],
    // Prototype replaces the former sequential ux-design + ui-design. It is gated on
    // checkpoints (convergence evidence) rather than modules, since its deliverable is
    // a working prototype with extracted specifications, not module-by-module approval.
    prototype: ['Prototype converged', 'Specifications extracted'],
    requirement: ['Requirement confirmed', 'Decomposition plan'], testing: 'Testing', review: 'Review',
    learn: 'Learning summary', evolution: 'Evolution report', reflection: 'Agent reflection', archive: 'Archive complete' }[name];
  if (required) {
    const reqs = Array.isArray(required) ? required : [required];
    // The lower floor applies to the post-delivery retrospective stages on the `fast` path
    // only. Every other stage -- the authorization gates (initialization, requirement) and
    // the evidence gates (testing, review) alike -- keeps the full floor on both paths.
    const litePath = s.task.path === 'fast' && MANDATORY_STAGES.includes(name);
    const reasonMin = litePath ? LITE_REASON_MIN : REQUIRED_REASON_MIN;
    for (const req of reqs) {
      const cp = latest.get(req);
      if (cp?.result !== 'pass') fail(`Completing ${name} requires current-round checkpoint: ${req} pass`);
      // A required checkpoint is evidence only if it records WHY it passed. Omitting
      // `--reason` at record time stays allowed (scratch notes are cheap), so the floor
      // lives here, where the reason is actually used to close a stage. This is a length
      // floor, not a semantic one: it rejects absence and placeholders (done/ok/pass/n-a)
      // and nothing more — judging whether the reasoning is sound stays with the human.
      const reason = typeof cp.reason === 'string' ? cp.reason.trim() : '';
      if (reason.length < reasonMin) {
        fail(`Completing ${name} requires a substantive reason on checkpoint '${req}': got ` +
          `${reason.length} chars${reason ? ` ("${reason}")` : ' (no --reason)'}, ` +
          `need at least ${reasonMin} (${litePath ? 'fast path floor' : 'full path floor'}). ` +
          `Re-record it with the evidence, e.g. ` +
          `node scripts/state.js checkpoint "${req}" pass --reason "<what was verified and how>"`);
      }
    }
  }
  // Design stages whose modules are approval-gated. prototype is NOT here:
  // its deliverable is a working prototype with extracted specifications, and no module
  // CLI path exists for it — adding it here would require a module gate that
  // `cmdModule` (design-stage allowlist) does not grant. It is gated on checkpoints
  // instead, in the `required` map above.
  if (['feature-design', 'architecture'].includes(name)) {
    const modules = Object.values(s.modules).filter(m => m.stage === name);
    if (!modules.length || modules.some(m => m.status !== 'approved' || m.attempt !== s.stage.attempt)) fail('Current design round must submit at least one module and all approved; annotated != approved');
  }
  // Implementation gate: with a decomposition, every wave must be finished before the stage
  // can complete. Without this, a wave whose subtasks all failed still passed the gate
  // (measured: t1/t2 failed, `stage implementation completed` succeeded), contradicting
  // state-protocol.md "Current wave all completed before entering next wave".
  // Checked against decomposition.tasks directly rather than a checkpoint: a checkpoint can be
  // recorded as pass without the work being done, the task statuses are the actual evidence.
  if (name === 'implementation' && s.decomposition && s.decomposition.tasks.length) {
    const unfinished = s.decomposition.tasks.filter(t => t.status !== 'completed');
    if (unfinished.length) {
      fail(`Completing implementation requires all decomposition subtasks completed; unfinished: ${unfinished.map(t => `${t.id}=${t.status}`).join(', ')}`);
    }
    // Mandatory dispatch gate. Every wave the analysis marks parallel must have been
    // dispatched to sub-agents (or explicitly waived with a reason) before Implementation
    // can complete.
    //
    // Grandfathering boundary: a state with **no** `dispatches` field predates this policy
    // (several tasks were already at `ship` with parallel waves and no records), and must
    // not be retroactively invalidated. Presence of the field means the task was created
    // under this policy, so the gate applies. This must NOT be keyed off subtask status:
    // the check above already requires every subtask completed, so a status-based skip
    // would always be true and the gate would never fire.
    //
    // Like the subtask check, this reads decomposition state rather than a checkpoint — a
    // checkpoint is a record the agent writes, whereas the dispatch list carries the outcome.
    const hasDispatchField = Array.isArray(s.decomposition.dispatches);
    if (hasDispatchField && s.decomposition.dispatchMode !== 'serial') {
      const { required, plan } = decomp.undispatchedWaves(s.decomposition.tasks, s.decomposition.dispatches);
      if (required.length) {
        // Report the missing SUBTASK ids, not just the wave: a partial dispatch leaves
        // specific subtasks unaccounted for, and naming them is what makes the message
        // actionable rather than a bare refusal.
        const covered = new Set();
        for (const r of s.decomposition.dispatches) {
          if (r && !r.waived) for (const id of r.tasks) covered.add(id);
        }
        const detail = required.map(w => {
          const g = plan.groups.find(x => x.wave === w);
          const missing = g.tasks.filter(id => !covered.has(id));
          return `wave ${w} (${missing.join(', ')})`;
        }).join('; ');
        fail(`Completing implementation requires every parallel subtask dispatched to a sub-agent; ` +
          `missing: ${detail}. Record with: node scripts/state.js dispatch --wave <n> --subtasks <ids> --agent <name> ` +
          `(or dispatch-waive --wave <n> --reason "...")`);
      }
    }
  }
  if (name === 'ship' && (!completed(s, 'testing') || !completed(s, 'review'))) fail('Ship requires valid Testing and Review completion records');
}

function requireRoot() {
  const root = findRoot();
  if (!root) fail(`${DIR}/${FILE} not found. Run first: node scripts/state.js init --name "<task-name>" --type <design|implementation|other>`);
  // sibling state file pointed to by --task must **actually exist**, otherwise read()
  // only reports "state file unreadable" — that's a bad-file error that would mislead
  // the operator into thinking they need to restore a backup.
  if (TASK_ID !== undefined && !fs.existsSync(statePath(root, TASK_ID))) {
    const known = siblingTaskIds(root);
    fail(`--task ${TASK_ID} not found: ${statePath(root, TASK_ID)}` +
      (known.length ? `\n   Known parallel tasks: ${known.join(', ')}` : '\n   No parallel tasks currently') +
      `\n   Run first: node scripts/state.js init --task ${TASK_ID} --name "<task-name>" --type <design|implementation|other>`);
  }
  return root;
}

function parseArgs(argv) {
  const positional = [];
  const flags = Object.create(null);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      if (Object.hasOwn(flags, a.slice(2))) fail(`duplicate parameter: ${a}`);
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) fail(`parameter missing value: ${a}`);
      flags[a.slice(2)] = argv[++i];
    }
    else positional.push(a);
  }
  return { positional, flags };
}

/* ---------- Commands ---------- */

function cmdInit(args) {
  const { flags } = args;
  const name = text(flags.name, '--name');
  const type = flags.type || 'other';
  if (flags.path !== undefined && !['full', 'fast'].includes(flags.path)) fail('--path must be full|fast');
  if (!['design', 'implementation', 'other'].includes(type)) fail(`--type must be design|implementation|other, got ${type}`);

  let root = findRoot();
  if (!root) { root = process.cwd(); fs.mkdirSync(path.join(root, DIR), { recursive: true }); }
  const p = statePath(root, TASK_ID);
  if (fs.existsSync(p)) fail(`State file already exists: ${p} (if starting over, archive it first, do not overwrite directly)`);

  const state = {
    schema: SCHEMA,
    task: {
      id: 'dl-' + Date.now().toString(36),
      name,
      type,
      path: flags.path === 'fast' ? 'fast' : 'full',
    },
    stage: { current: STAGES[0], status: 'in_progress', history: [], attempt: 1, checkpointStart: 0 },
    modules: {},
    retry: { perModuleMax: RETRY.perModuleMax, totalMax: RETRY.totalMax, perModule: {}, total: 0 },
    checkpoints: [],
    git: { decisions: [] },
    // Execution intent approval. Empty structure written at init time:
    // check-state-fields.js judges dead fields by "field appearance count in file",
    // declaring without reading/writing would be judged as a fake capability.
    ops: { steps: {}, approvals: [] },
    blocked: null,
    createdAt: now(),
    updatedAt: now(),
  };
  const written = write(root, state);
  console.log(`[OK] State initialized: ${written}`);
  console.log(`   Task: ${name} (${type} / ${state.task.path} flow)`);
  console.log(`   Current stage: ${state.stage.current}`);
}

function cmdShow() {
  const root = requireRoot();
  const s = read(root);
  const done = route(s).filter(stage => completed(s, stage)).length;
  console.log(`\nTask: ${s.task.name}  [${s.task.type} / ${s.task.path}]`);
  console.log(`State file: ${statePath(root, TASK_ID)}`);
  console.log(`Current stage: ${s.stage.current} (${s.stage.status})   Completed stages: ${done}/${route(s).length}`);
  if (s.blocked) console.log(`[BLOCKED] ${s.blocked}`);
  if (Object.keys(s.modules).length) {
    console.log('\nModule approvals:');
    for (const [id, m] of Object.entries(s.modules)) {
      console.log(`  ${id.padEnd(20)} ${m.status.padEnd(10)} v${m.versions} rejected ${m.rejections}/${s.retry.perModuleMax}`);
    }
  }
  if (s.retry.total) console.log(`\nRetries: total ${s.retry.total}/${s.retry.totalMax}`);
  if (s.checkpoints.length) {
    const last = s.checkpoints.slice(-3);
    console.log('\nRecent checkpoints:');
    for (const c of last) console.log(`  ${c.at.slice(0, 19)}  ${c.name}  ${c.result}`);
  }
  if (s.decomposition) {
    const { tasks, waves } = s.decomposition;
    const done = tasks.filter(t => t.status === 'completed').length;
    const mode = s.decomposition.dispatchMode || 'serial';
    console.log(`\nDecomposition: ${tasks.length} subtasks, ${waves.length} waves (completed ${done}/${tasks.length}), dispatch: ${mode}`);
    const current = tasks.filter(t => t.status === 'in_progress');
    if (current.length) console.log(`  In progress: ${current.map(t => t.id).join(', ')}`);
    const failed = tasks.filter(t => t.status === 'failed');
    if (failed.length) console.log(`  Failed: ${failed.map(t => t.id).join(', ')}`);
  }
  console.log('');
}

function cmdStage(args) {
  const root = requireRoot();
  const [name, status] = args.positional;
  if (!STAGES.includes(name)) fail(`Unknown stage "${name}", options: ${STAGES.join(', ')}`);
  if (!STAGE_STATUS.includes(status)) fail(`Unknown status "${status}", options: ${STAGE_STATUS.join(', ')}`);
  const s = read(root);
  const stages = route(s);
  const target = stages.indexOf(name);
  const current = stages.indexOf(s.stage.current);
  if (target < 0) fail(`Stage ${name} is not in current execution path`);
  if (status === 'rolled_back') {
    if (target > current) fail('Can only roll back to current or earlier stage');
    for (const downstream of stages.slice(target)) {
      s.stage.history.push({ stage: downstream, status: 'rolled_back', at: now() });
    }
    s.stage.current = name;
    s.stage.status = status;
  } else {
    if (status === 'in_progress' || status === 'completed') progressAllowed(s);
    if (name !== s.stage.current) {
      if (target !== current + 1 || s.stage.status !== 'completed' || status !== 'in_progress') {
        fail('Must explicitly complete current stage and advance to next adjacent stage per execution path; use rolled_back to roll back');
      }
      s.stage.current = name;
      s.stage.attempt = (s.stage.attempt || 0) + 1;
      s.stage.checkpointStart = s.checkpoints.length;
    } else if (status === 'in_progress' && s.stage.status !== 'in_progress') {
      if (s.stage.status === 'completed') fail('Reopening a completed stage must first roll_back, invalidating downstream evidence');
      s.stage.attempt = (s.stage.attempt || 0) + 1;
      s.stage.checkpointStart = s.checkpoints.length;
    }
    if (status === 'completed') {
      if (s.stage.status !== 'in_progress') fail('Only in_progress stages can be completed');
      completionAllowed(s, name);
    }
    if (status === 'pending' && s.stage.status !== 'pending') fail('Cannot reset stage with pending; use rolled_back');
    if (status === 'failed' && s.stage.status !== 'in_progress') fail('Only in_progress stages can be marked failed');
    s.stage.status = status;
    s.stage.history.push({ stage: name, status, at: now() });
  }
  write(root, s);
  console.log(`[OK] Stage ${name} -> ${status}`);
}

function cmdModule(args) {
  const root = requireRoot();
  const [id, status] = args.positional;
  if (!validId(id)) fail('module id must be a safe 1-64 character identifier');
  if (!MODULE_STATUS.includes(status)) fail(`Unknown module status: ${status}`);
  if (status === 'rejected') fail('Rejection must use reject --reason, preserving count and reason');
  const s = read(root);
  progressAllowed(s);
  if (!['feature-design', 'architecture'].includes(s.stage.current) || s.stage.status !== 'in_progress') fail('Modules can only change during an in-progress design stage');
  const existing = s.modules[id];
  if (existing && existing.stage !== undefined && existing.stage !== s.stage.current) fail('Module ID already belongs to another stage, use a separate ID');
  if (status === 'approved' || status === 'annotated') {
    if (!existing || existing.status !== 'submitted' || existing.attempt !== s.stage.attempt) fail('Must submit current-round module before approval or annotation');
  }
  const reason = status === 'approved' ? text(args.flags.reason, 'approval basis --reason') : null;
  const m = existing || { versions: 0, rejections: 0, createdAt: now() };
  if (status === 'submitted') m.versions++;
  Object.assign(m, { status, stage: s.stage.current, attempt: s.stage.attempt, updatedAt: now() });
  m.history = m.history || [];
  m.history.push({ status, version: m.versions, reason, at: now() });
  s.modules[id] = m;
  write(root, s);
  console.log(`[OK] Module ${id} -> ${status} (v${s.modules[id].versions})`);
}

function cmdReject(args) {
  const root = requireRoot();
  const [id] = args.positional;
  const reason = text(args.flags.reason, '--reason');
  if (!validId(id)) fail('Invalid module ID');
  const s = read(root);
  progressAllowed(s);
  const m = s.modules[id];
  if (!m || m.status !== 'submitted' || m.stage !== s.stage.current || m.attempt !== s.stage.attempt || s.stage.status !== 'in_progress') fail('Can only reject modules submitted in current design round');
  m.status = 'rejected';
  m.rejections++;
  m.updatedAt = now();
  s.retry.total++;
  s.retry.perModule[id] = m.rejections;
  s.retry.history = s.retry.history || [];
  s.retry.history.push({ module: id, at: now(), reason });

  const overModule = m.rejections >= s.retry.perModuleMax;
  const overTotal = s.retry.total >= s.retry.totalMax;
  if (overModule || overTotal) {
    s.retry.exceeded = { at: now(), module: overModule ? id : null, total: overTotal };
    console.log(`[WARN] Retry limit exceeded: ${overModule ? `Module ${id} rejected ${m.rejections} times consecutively` : `Total retries ${s.retry.total} times`}`);
    console.log('   -> Stopping auto-retry, next: generate contrast report (modules/core/contrast-report.md) and await user decision');
  } else {
    console.log(`[OK] Module ${id} rejection recorded (${m.rejections}/${s.retry.perModuleMax}, total ${s.retry.total}/${s.retry.totalMax})`);
    console.log('   -> Return to design rework, retry record persisted');
  }
  write(root, s);
}

function cmdCheckpoint(args) {
  const root = requireRoot();
  const [name, result] = args.positional;
  text(name, 'checkpoint name');
  if (!['pass', 'fail'].includes(result)) fail('checkpoint requires <name> <pass|fail>');
  const s = read(root);
  if (s.stage.status !== 'in_progress') fail('Can only record checkpoints for in-progress stages');
  const reason = args.flags.reason === undefined ? null : text(args.flags.reason, '--reason');
  s.checkpoints.push({ name, result, reason, at: now(), stage: s.stage.current });
  write(root, s);
  console.log(`[OK] Checkpoint ${name} -> ${result}`);
}

function cmdResume() {
  const root = requireRoot();
  const s = read(root);
  const stages = route(s);
  const idx = stages.indexOf(s.stage.current);
  const remaining = stages.slice(idx + 1);
  console.log('\n=== HelloDev Session Resume ===');
  console.log(`Task: ${s.task.name}  [${s.task.type} / ${s.task.path}]`);
  console.log(`Stage: ${s.stage.current} (${s.stage.status})`);
  if (s.blocked) console.log(`[BLOCKED] ${s.blocked}`);
  if (s.retry.exceeded) console.log(`[WARN] Retry limit exceeded (${s.retry.exceeded.at.slice(0, 10)}), generate contrast report first`);
  const pending = Object.entries(s.modules).filter(([, m]) => m.status !== 'approved');
  if (pending.length) {
    console.log('\nUnpassed modules:');
    for (const [id, m] of pending) console.log(`  ${id} - ${m.status} (rejected ${m.rejections} times)`);
  }
  const openCp = latestCheckpoints(s).filter(c => c.result !== 'pass');
  if (openCp.length) {
    console.log('\nUnpassed checkpoints:');
    for (const c of openCp) console.log(`  ${c.at.slice(0, 10)} ${c.name} — ${c.result}`);
  }
  console.log('\nNext steps:');
  if (s.blocked) console.log('  1. Resolve blocking items first, then continue');
  else if (s.retry.exceeded) console.log('  1. Generate contrast report and await user decision');
  else if (s.stage.status === 'in_progress') console.log(`  1. Continue ${s.stage.current} stage, or stage ${s.stage.current} completed`);
  else if (s.stage.status !== 'completed') console.log(`  1. After fixing, stage ${s.stage.current} in_progress`);
  else if (!remaining.length) console.log('  1. Completed; run node scripts/state.js finalize after delivery');
  else console.log(`  1. Enter ${remaining[0]}: stage ${remaining[0]} in_progress`);
  if (remaining.length) console.log(`  2. Subsequent stages: ${remaining.join(' -> ')}`);
  if (s.decomposition) {
    const { tasks, waves } = s.decomposition;
    const done = tasks.filter(t => t.status === 'completed').length;
    const nextWave = waves.find(w => w.tasks.some(tid => {
      const t = tasks.find(x => x.id === tid);
      return t.status === 'pending' || t.status === 'in_progress';
    }));
    console.log(`\nWave order: ${done}/${tasks.length} completed`);
    if (nextWave) {
      const label = nextWave.mode === 'parallel' ? 'parallel' : 'sequential';
      console.log(`  Next Wave ${nextWave.wave} [${label}]: ${nextWave.tasks.join(', ')}`);
    } else if (done === tasks.length) {
      console.log('  All subtasks completed');
    }
  }
  console.log(`  3. After each step, persist: node scripts/state.js stage <name> completed\n`);
}

function cmdReport() {
  const root = requireRoot();
  const s = read(root);
  const hist = s.retry.history || [];
  if (!hist.length && !s.retry.exceeded) {
    console.log('[INFO] No rejection records yet, no contrast report needed.');
    return;
  }
  const byModule = {};
  for (const h of hist) (byModule[h.module] = byModule[h.module] || []).push(h);

  console.log('\n=== Contrast Analysis Report - Facts ===');
  console.log('(Generated from .hello-dev/state.json; suggestions and root cause by model, do not fabricate data)\n');
  console.log(`Task: ${s.task.name}  [${s.task.type} / ${s.task.path}]`);
  console.log(`Stage: ${s.stage.current} (${s.stage.status})`);
  const ex = s.retry.exceeded;
  if (ex) console.log(`Trigger: ${ex.module ? `Module ${ex.module} hit limit` : 'Total retries hit limit'}  (${ex.at.slice(0, 19)})`);
  console.log(`Retry count: total ${s.retry.total}/${s.retry.totalMax}`);

  console.log('\n1. Rejection timeline');
  hist.forEach((h, i) => console.log(`   ${i + 1}. ${h.at.slice(0, 19)}  ${h.module}  —  ${h.reason}`));

  console.log('\n2. Module aggregation');
  for (const [id, list] of Object.entries(byModule)) {
    const m = s.modules[id] || {};
    console.log(`   ${id}: rejected ${list.length} times / limit ${s.retry.perModuleMax}, current ${m.status || 'unknown'}, versions ${m.versions || 0}`);
    list.forEach((h, i) => console.log(`      Rejection #${i + 1} reason: ${h.reason}`));
  }

  const others = Object.entries(s.modules).filter(([id]) => !byModule[id]);
  if (others.length) {
    console.log('\n3. Modules without rejections');
    for (const [id, m] of others) console.log(`   ${id}: ${m.status} (v${m.versions})`);
  }
  const cps = latestCheckpoints(s).filter(c => c.result !== 'pass');
  if (cps.length) {
    console.log('\n4. Unpassed checkpoints');
    for (const c of cps) console.log(`   ${c.at.slice(0, 10)}  ${c.name}  —  ${c.result}`);
  }

  console.log('\n5. Awaiting user decision (see modules/core/contrast-report.md)');
  console.log('   A. Continue retry per suggestion   B. User provides direction   C. Choose from options');
  console.log('   D. Pause and preserve state    E. Terminate this task');
  console.log('\nNext: model summarizes root cause, lists options, then asks user to choose.\n');
}

function cmdRetryResume(args) {
  const reason = text(args.flags.reason, 'user decision --reason');
  const root = requireRoot();
  const s = read(root);
  if (!s.retry.exceeded) fail('Not currently over limit, no need to resume retry');
  s.retry.extensions = s.retry.extensions || [];
  s.retry.extensions.push({ at: now(), reason, previous: { perModuleMax: s.retry.perModuleMax, totalMax: s.retry.totalMax }, exceeded: s.retry.exceeded });
  s.retry.perModuleMax = Math.max(s.retry.perModuleMax, ...Object.values(s.retry.perModule).map(n => n + 1));
  s.retry.totalMax = Math.max(s.retry.totalMax, s.retry.total + 1);
  s.retry.exceeded = null;
  write(root, s);
  console.log('Retry limit extended; historical count preserved, will stop at new limit');
}

function cmdBlock(args) {
  const root = requireRoot();
  const reason = args.positional.join(' ') || args.flags.reason;
  text(reason, 'block reason');
  const s = read(root);
  s.blocked = reason;
  write(root, s);
  console.log(`[BLOCKED] Marked blocked: ${reason}`);
  console.log('   -> After resolving: node scripts/state.js unblock "confirmed"');
}

function cmdUnblock(args) {
  const root = requireRoot();
  const s = read(root);
  if (!s.blocked) { console.log('[INFO] No block marker currently'); return; }
  const note = text(args.positional.join(' '), 'unblock note');
  const reason = s.blocked;               // save first, then clear — otherwise history records null
  console.log(`[UNBLOCKED] Was: ${reason} - ${note}`);
  s.blocked = null;
  s.blockedHistory = s.blockedHistory || [];
  s.blockedHistory.push({ reason, note, at: now() });
  write(root, s);
}

function cmdGitDecision(args) {
  const root = requireRoot();
  const [decision] = args.positional;
  const reason = text(args.flags.reason, 'Git decision basis --reason');
  if (!['approved', 'rejected'].includes(decision)) {
    fail('gitdec requires <approved|rejected> [--reason "..."]');
  }
  const s = read(root);
  s.git = s.git || { decisions: [] };
  s.git.decisions.push({ at: now(), decision, reason, stage: s.stage.current });
  write(root, s);
  console.log(`[OK] Git approval decision recorded: ${decision}${reason ? ' (' + reason + ')' : ''}`);
  console.log('   Note: decision recorded after user provides it; hook only intercepts, cannot auto-know result.');
}

/* ---------- Execution intent approval (ops) ----------
 *
 * gitdec records "someone agreed", ops records "which command was agreed to".
 * The distinction is stepDigest: approval binds to immutable execution intent,
 * any change to command, target, or source invalidates old approval immediately.
 *
 * Here we **validate credential authenticity** (digest, TTL, target match),
 * but do not authenticate user identity — who pressed confirm, whether the
 * "approve" in conversation is from the real person, CLI cannot judge.
 * Consistent with state-protocol: CLI validates record consistency, cannot authenticate actors.
 */

const OPS_APPOVAL = require('./lib/ops-approval.js');

function opsIntentOf(flags) {
  return {
    command: text(flags.command, 'execution command --command'),
    cwd: flags.cwd || null,
    target: flags.target || null,
    env: flags.env || null,
    source: flags.source || null,
    sourceDigest: flags['source-digest'] || null,
    purpose: flags.purpose || null,
  };
}

function riskOfCommand(command) {
  try {
    return require('./lib/ops-policy.js').assessCommand(command.split(/\s+/), { fromShell: true });
  } catch (e) { return null; }
}

/** Register step: idempotent. Re-registering same command does not reset existing approval; command change invalidates old approval. */
function cmdOpsRegister(args) {
  const root = requireRoot();
  const id = text(args.flags.id, 'step ID --id');
  if (!validId(id)) fail('--id can only contain letters, numbers, _ and -');
  // The environment is a required declaration, not something the tool infers.
  // Inferring production from the free-text --target was measured unsound (see
  // ENVIRONMENTS in scripts/lib/ops-approval.js), and a wrong "not production"
  // would silently skip the interruption-risk assessment required by
  // ops-execution.md 3.2. So it is validated as a closed enum here.
  if (args.flags.env === undefined) {
    fail(`--env is required; declare the target environment as one of: ${OPS_APPOVAL.ENVIRONMENTS.join('|')}`);
  }
  if (!OPS_APPOVAL.isValidEnvironment(args.flags.env)) {
    fail(`--env must be one of: ${OPS_APPOVAL.ENVIRONMENTS.join('|')}, got ${JSON.stringify(args.flags.env)}`);
  }
  const intent = opsIntentOf(args.flags);
  const digest = OPS_APPOVAL.calculateStepDigest(intent);
  const risk = riskOfCommand(intent.command);
  const approvalMode = risk && risk.disposition === 'auto_read' ? 'auto_read'
    : risk && risk.disposition === 'block' ? 'blocked' : 'pre_execution';

  const s = read(root);
  s.ops = s.ops || { steps: {}, approvals: [] };   // backward compat with state created before ops field
  const existing = s.ops.steps[id];
  if (existing && existing.digest !== digest) {
    // Content changed -> old approval must be invalidated, back to awaiting.
    console.log(`[WARN] Step ${id} content changed, old approval invalidated`);
    s.ops.approvals = s.ops.approvals.filter(a => a.stepDigest !== existing.digest);
  }
  const status = existing && existing.digest === digest ? existing.status
    : approvalMode === 'blocked' ? 'rejected'
    : approvalMode === 'auto_read' ? 'approved' : 'awaiting_approval';
  s.ops.steps[id] = {
    digest,
    command: intent.command,
    intent,
    risk: risk ? { disposition: risk.disposition, risk: risk.risk, reason: risk.reason } : null,
    approvalMode,
    status,
    history: (existing && existing.digest === digest ? existing.history : []).concat([{
      status, at: now(),
      reason: existing && existing.digest === digest ? 'duplicate registration (content unchanged)'
        : approvalMode === 'blocked' ? 'policy blocked, cannot approve'
        : approvalMode === 'auto_read' ? 'safe read-only, no approval needed' : 'step registered',
    }]),
  };
  write(root, s);
  console.log(`[OK] Step registered: ${id} -> ${status}`);
  console.log(`   Environment: ${intent.env}`);
  if (approvalMode === 'blocked') console.log(`   Policy conclusion: ${risk.reason}`);
  else if (approvalMode === 'auto_read') console.log('   Safe read-only: execute directly after display, no approval needed');
  else console.log(`   stepDigest: ${digest}`);
  // Declared production is the trigger for the interruption-risk assessment
  // (ops-execution.md 3.2). Pointing at it here means a prod step cannot be
  // registered without the obligation having been stated at least once.
  if (intent.env === 'prod' && approvalMode === 'pre_execution') {
    console.log('   [PROD] Interruption-risk assessment required before requesting approval:');
    console.log('          interruption surface / why it will not interrupt (or what the interruption is) / rollback point.');
  }
}

/** Pre-execution approval. Must fill back the stepDigest just shown to user — prevents Agent self-approval. */
function cmdOpsApprove(args) {
  const root = requireRoot();
  const id = text(args.flags.id, 'step ID --id');
  const s = read(root);
  s.ops = s.ops || { steps: {}, approvals: [] };
  const step = s.ops.steps[id];
  if (!step) fail(`Step does not exist: ${id}; run opsRegister first`);
  if (step.approvalMode === 'auto_read') fail('Safe read-only steps need no approval; can execute directly after transparent display');
  if (step.approvalMode === 'blocked') fail(`Step blocked by policy, cannot approve: ${step.risk && step.risk.reason}`);

  const confirmed = text(args.flags['confirm-digest'], 'confirmed digest --confirm-digest');
  const approvedBy = text(args.flags['approved-by'], 'approver --approved-by');
  const ttlSeconds = args.flags['ttl-seconds'] ? Number(args.flags['ttl-seconds']) : 300;

  let approval;
  try {
    approval = OPS_APPOVAL.createApproval(step.intent, {
      approvedBy,
      confirmedStepDigest: confirmed,
      ttlSeconds,
    });
  } catch (e) { fail(e.message); }

  step.status = 'approved';
  step.history.push({ status: 'approved', at: now(), reason: `approvedBy=${approvedBy} ttl=${ttlSeconds}s` });
  s.ops.approvals.push({ ...approval, stepId: id, stage: s.stage.current });
  write(root, s);
  console.log(`[OK] Step pre-execution approval received: ${id}`);
  console.log(`   stepDigest: ${approval.stepDigest}`);
  console.log(`   Valid until:   ${approval.expiresAt}`);
  console.log('   Note: after command/target/source changes, this approval invalidates immediately, re-review required.');
}

/** Record rejection. Rejection is also accounting, cannot only record successes. */
function cmdOpsReject(args) {
  const root = requireRoot();
  const id = text(args.flags.id, 'step ID --id');
  const reason = text(args.flags.reason, 'rejection reason --reason');
  const s = read(root);
  s.ops = s.ops || { steps: {}, approvals: [] };
  const step = s.ops.steps[id];
  if (!step) fail(`Step does not exist: ${id}`);
  step.status = 'rejected';
  step.history.push({ status: 'rejected', at: now(), reason });
  s.ops.approvals = s.ops.approvals.filter(a => a.stepDigest !== step.digest);
  write(root, s);
  console.log(`[REJECTED] Step rejected: ${id} (${reason})`);
}

/** Gate: verify step is currently executable. Execution path calls it before preflight. */
function cmdOpsStatus(args) {
  const root = requireRoot();
  const s = read(root);
  s.ops = s.ops || { steps: {}, approvals: [] };
  const ids = args.positional.length ? args.positional : Object.keys(s.ops.steps);
  if (!ids.length) { console.log('[INFO] No ops steps registered yet'); return; }
  let blocked = 0;
  for (const id of ids) {
    const step = s.ops.steps[id];
    if (!step) { console.log(`[FAIL] ${id}  not registered`); blocked++; continue; }
    let verdict;
    if (step.approvalMode === 'auto_read') verdict = { valid: true, reasons: ['safe read-only, no approval needed'] };
    else if (step.approvalMode === 'blocked') verdict = { valid: false, reasons: [step.risk && step.risk.reason || 'policy blocked'] };
    else {
      // Take the latest credential for this step to verify; no credential means no approval.
      const ap = [...s.ops.approvals].reverse().find(a => a.stepDigest === step.digest);
      verdict = ap ? OPS_APPOVAL.verifyApproval(step.intent, ap)
        : { valid: false, reasons: ['missing approval credential for this step'] };
      if (step.status === 'rejected') verdict = { valid: false, reasons: ['user has rejected this step'] };
    }
    const mark = verdict.valid ? '[OK]' : '[FAIL]';
    console.log(`${mark} ${id.padEnd(24)} ${step.approvalMode.padEnd(15)} ${verdict.reasons.join('；')}`);
    if (!verdict.valid) blocked++;
  }
  if (blocked) { console.log(`\n[BLOCKED] ${blocked} steps not executable; expired/invalidated steps need re-review.`); process.exitCode = 1; }
}

/** Display step summary for user to verify and fill back --confirm-digest. */
function cmdOpsShow(args) {
  const root = requireRoot();
  const s = read(root);
  s.ops = s.ops || { steps: {}, approvals: [] };
  const id = args.positional[0];
  if (!id) {
    if (!Object.keys(s.ops.steps).length) { console.log('[INFO] No ops steps registered yet'); return; }
    console.log('\nops steps:');
    for (const [k, st] of Object.entries(s.ops.steps)) {
      console.log(`  ${k.padEnd(24)} ${st.status.padEnd(18)} ${st.command.slice(0, 60)}`);
    }
    console.log('');
    return;
  }
  const step = s.ops.steps[id];
  if (!step) fail(`Step does not exist: ${id}`);
  console.log(`Step:       ${id}`);
  console.log(`Command:    ${step.command}`);
  if (step.intent.cwd) console.log(`Work dir:   ${step.intent.cwd}`);
  if (step.intent.target) console.log(`Target:     ${step.intent.target}`);
  if (step.intent.env) console.log(`Environment: ${step.intent.env}`);
  if (step.intent.source) console.log(`Source doc: ${step.intent.source}`);
  if (step.risk) console.log(`Policy:     ${step.risk.disposition} / ${step.risk.risk} - ${step.risk.reason}`);
  console.log(`Mode:       ${step.approvalMode}   Status: ${step.status}`);
  console.log(`stepDigest: ${step.digest}`);
  if (step.approvalMode === 'pre_execution' && step.intent.env === 'prod') {
    console.log('\n[PROD] This step declares a production target. The approval request must carry an');
    console.log('interruption-risk assessment (interruption surface, why it will not interrupt or what');
    console.log('the interruption is, and the rollback point) before the user is asked to approve.');
  }
  if (step.approvalMode === 'pre_execution' && step.status === 'awaiting_approval') {
    console.log(`\nApproval command:\n  node scripts/state.js opsApprove --id ${id} \\`);
    console.log(`    --approved-by <name> --confirm-digest ${step.digest}`);
  }
}

/**
 * Task collaboration snapshot: at Bootstrap, persist locally detected skill set
 * into state file, making "which skills are present for this task" auditable
 * rather than only in the conversation.
 *
 * Detection failure does **not block** the flow (same policy as memory retrieval):
 * host missing skills, script missing, parse error — all just report and maintain
 * status quo. A task with no skills should not be prevented from starting.
 */
function cmdCollab(args) {
  const root = requireRoot();
  const s = read(root);
  const [action] = args.positional;

  if (action === 'detect') {
    let detect;
    try { detect = require('./detect-skills.js'); }
    catch (e) { console.log(`[INFO] Not detected: cannot load scripts/detect-skills.js (${e.message}); not blocking flow`); return; }
    const result = detect.detectSkills({ cwd: root });
    s.collaboration = {
      detectedAt: now(),
      roots: result.roots.map(r => ({ kind: r.kind, path: r.path, skills: r.skills })),
      skills: result.skills.map(k => ({ name: k.name, source: k.source, rule: detect.ruleOf(k) })),
    };
    write(root, s);
    console.log(`[OK] Task collaboration recorded: ${result.skills.length} skills`);
    if (result.missingRoots) console.log(`   (${result.missingRoots} detection roots not found, normal: plugin not installed or no project-level skill)`);
    return;
  }

  // Unknown action must be rejected: silently treating as show would make
  // `collab detectt` (typo) look successful while user thinks snapshot was recorded.
  // Consistent with other commands' "reject unknown positional args" policy.
  if (action !== undefined && action !== 'show') fail(`Unknown action "${action}", options: detect | show`);
  // Default show: read snapshot
  if (!s.collaboration) {
    console.log('[INFO] skills not yet detected; use: node scripts/state.js collab detect');
    return;
  }
  const { detectedAt, skills } = s.collaboration;
  console.log(`detectedAt: ${detectedAt}   total ${skills.length} skills`);
  const byRule = {};
  for (const k of skills) (byRule[k.rule || 'uncategorized'] = byRule[k.rule || 'uncategorized'] || []).push(k.name);
  for (const [rule, names] of Object.entries(byRule).sort()) {
    console.log(`  ${rule.padEnd(30)} ${names.length}   ${names.slice(0, 4).join(', ')}${names.length > 4 ? ` ...${names.length} total` : ''}`);
  }
}

/**
 * Task decomposition: after requirement confirmation, split scope into
 * subtasks + dependencies + wave order table.
 * Optional: works normally when existing state has no decomposition section.
 */
function cmdDecompose(args) {
  const root = requireRoot();
  const tasksJson = text(args.flags.tasks, '--tasks');
  let tasks;
  try { tasks = JSON.parse(tasksJson); }
  catch (e) { fail(`--tasks must be a valid JSON array: ${e.message}`); }
  if (!Array.isArray(tasks) || !tasks.length) fail('--tasks must be a non-empty JSON array');

  // Validate each subtask
  const ids = new Set();
  for (const t of tasks) {
    if (!t || typeof t !== 'object') fail('Each subtask must be an object');
    if (!validId(t.id)) fail(`Invalid subtask id: ${t.id}`);
    if (typeof t.name !== 'string' || !t.name.trim()) fail(`Subtask ${t.id} missing name`);
    if (!Array.isArray(t.depends)) fail(`Subtask ${t.id} depends must be an array`);
    if (t.affectedFiles !== undefined) {
      if (!Array.isArray(t.affectedFiles)) fail(`Subtask ${t.id} affectedFiles must be an array`);
      for (const f of t.affectedFiles) {
        if (typeof f !== 'string' || !f.trim()) fail(`Subtask ${t.id} affectedFiles entries must be non-empty strings`);
      }
    }
    if (ids.has(t.id)) fail(`Duplicate subtask id: ${t.id}`);
    ids.add(t.id);
  }
  // Validate dependency references
  for (const t of tasks) {
    for (const dep of t.depends) {
      if (!ids.has(dep)) fail(`Subtask ${t.id} depends on non-existent ${dep}`);
      if (dep === t.id) fail(`Subtask ${t.id} cannot depend on itself`);
    }
  }
  // Cycle detection is delegated to the shared module (it detects during derivation).
  // Keeping a second implementation here is how the two derivations drifted apart.

  // Derive waves, dependency edges and parallel groups through the shared module.
  // The previous inline pass read `waveMap[dep]` while walking tasks in declaration
  // order, so a subtask listed before a dependency it declared still saw
  // `undefined`, `Math.max` yielded NaN, the `w <= maxWave` loop body never ran,
  // and the command reported "[OK] ... 0 waves". Derivation must depend on the
  // graph, never on declaration order.
  let analysis;
  try { analysis = decomp.analyze(tasks); }
  catch (e) { fail(`Invalid dependency graph: ${e.message}`); }
  const waves = analysis.waves;
  const fileConflicts = analysis.conflicts;

  // Lenient read on purpose: this command is the documented remedy for a state whose
  // waves are inconsistent, so strict validation must not block the repair itself.
  const s = readState(root, true);
  // `--replace` is an explicit boolean. The previous guard was `if (!args.flags.replace ...)`,
  // and parseArgs always yields a **string**, so the documented "--replace false" still
  // overwrote an existing decomposition — the flag's stated meaning was inverted.
  const replace = args.flags.replace === undefined
    ? false
    : (() => { try { return decomp.parseBooleanFlag(args.flags.replace, '--replace'); }
               catch (e) { fail(e.message); } })();
  // Coarse mode (initialization stage). Same derivation, same validation, different field:
  // the coarse plan answers "which units exist and in what order" and carries **no dispatch
  // obligation**, so it writes no `dispatches` list and no `dispatchMode`. Both levels share
  // one derivation (`decomp.analyze`) — a second one is how the original two copies drifted.
  if (args.flags.coarse !== undefined &&
      !['true', 'false'].includes(String(args.flags.coarse))) {
    fail('--coarse must be a boolean flag (--coarse true)');
  }
  const coarse = args.flags.coarse === 'true';
  if (coarse) {
    if (!replace && s.coarseDecomposition && s.coarseDecomposition.tasks.length) {
      fail('Coarse decomposition already exists; use --replace true to overwrite');
    }
    s.coarseDecomposition = {
      tasks: tasks.map(t => ({
        id: t.id, name: t.name.trim(), depends: t.depends,
        status: 'pending',
        affectedFiles: (t.affectedFiles || []).map(f => f.trim()),
        updatedAt: now(),
      })),
      waves,
      createdAt: s.coarseDecomposition && !replace ? s.coarseDecomposition.createdAt : now(),
      updatedAt: now(),
    };
    write(root, s);
    console.log(`[OK] Coarse decomposition complete: ${tasks.length} units, ${waves.length} waves (no dispatch obligation)`);
    for (const w of waves) {
      console.log(`   Wave ${w.wave} [${w.mode}]: ${w.tasks.join(', ')}`);
    }
    console.log('');
    for (const line of decomp.formatAnalysis(analysis)) console.log(line);
    return;
  }
  if (!replace && s.decomposition && s.decomposition.tasks.length) {
    fail('Decomposition already exists; use --replace true to overwrite, or decompose-clear first');
  }
  s.decomposition = {
    // Default is `parallel`: every wave the analysis marks parallel MUST be dispatched to
    // sub-agents rather than executed by the main agent. `serial` remains available as an
    // explicit escape hatch (record the reason), but it is no longer the default.
    dispatchMode: 'parallel',
    tasks: tasks.map(t => ({
      id: t.id, name: t.name.trim(), depends: t.depends,
      status: 'pending', estimate: t.estimate || null,
      affectedFiles: (t.affectedFiles || []).map(f => f.trim()),
      updatedAt: now(),
    })),
    waves,
    // Dispatch records. Each entry is one actually-performed sub-agent dispatch for a
    // parallel wave. Written by `state.js dispatch`; read by the Implementation gate.
    dispatches: [],
    createdAt: now(),
    updatedAt: now(),
  };
  write(root, s);
  console.log(`[OK] Decomposition complete: ${tasks.length} subtasks, ${waves.length} waves`);
  for (const w of waves) {
    console.log(`   Wave ${w.wave} [${w.mode}]: ${w.tasks.join(', ')}`);
  }
  if (fileConflicts.length) {
    console.log(`   File conflicts detected (waves downgraded to sequential):`);
    for (const c of fileConflicts) {
      console.log(`     Wave ${c.wave}: ${c.tasks[0]} and ${c.tasks[1]} share ${c.files.join(', ')}`);
    }
  }
  // Order analysis runs as part of decomposition rather than on request, so the
  // dependency edges and parallel groups are never merely implied by wave numbers.
  console.log('');
  for (const line of decomp.formatAnalysis(analysis)) console.log(line);
  // Mandatory dispatch plan: a parallel group is not merely reported, it must be dispatched.
  console.log('');
  for (const line of decomp.formatDispatchPlan(decomp.dispatchPlan(s.decomposition.tasks))) console.log(line);
}

function cmdDecomposeClear(args) {
  const root = requireRoot();
  // Lenient read: clearing must remain possible on a state strict validation rejects.
  const s = readState(root, true);
  if (!s.decomposition) { console.log('[INFO] No decomposition yet'); return; }
  delete s.decomposition;
  write(root, s);
  console.log('[OK] Decomposition cleared');
}

/**
 * Set or display dispatch mode for decomposition.
 * Without argument: display current mode.
 * With argument: set mode to 'serial' or 'parallel'.
 */
function cmdDispatchMode(args) {
  const root = requireRoot();
  const s = read(root);
  if (!s.decomposition) fail('No decomposition yet; run decompose first');
  const [mode] = args.positional;
  if (mode === undefined) {
    const current = s.decomposition.dispatchMode || 'serial';
    console.log(`Dispatch mode: ${current}`);
    const parallelWaves = s.decomposition.waves.filter(w => w.mode === 'parallel');
    if (current === 'parallel' && parallelWaves.length) {
      console.log(`  ${parallelWaves.length} parallel wave(s) will use sub-agents`);
    } else if (current === 'parallel' && !parallelWaves.length) {
      console.log('  No parallel waves detected; all waves will run serially regardless');
    }
    return;
  }
  if (!['serial', 'parallel'].includes(mode)) fail('Dispatch mode must be serial or parallel');
  s.decomposition.dispatchMode = mode;
  s.decomposition.updatedAt = now();
  write(root, s);
  console.log(`[OK] Dispatch mode -> ${mode}`);
  if (mode === 'parallel') {
    const parallelWaves = s.decomposition.waves.filter(w => w.mode === 'parallel');
    if (parallelWaves.length) {
      console.log(`  ${parallelWaves.length} parallel wave(s) will use sub-agents during implementation`);
    } else {
      console.log('  No parallel waves; all waves will run serially regardless of mode');
    }
  }
}

/**
 * Record a sub-agent dispatch for a parallel wave.
 *
 * Policy: a wave the analysis marks `parallel` must be dispatched to sub-agents, not
 * executed by the main agent. This command records that the dispatch happened.
 *
 * Honest limitation, consistent with the rest of this CLI: this records and checks
 * consistency only. It cannot prove a sub-agent actually ran, nor that its result was
 * verified — an agent could write a record without dispatching. It makes the intent
 * explicit and auditable; it is not a security boundary.
 */
function cmdDispatch(args) {
  const root = requireRoot();
  const s = read(root);
  if (!s.decomposition) fail('No decomposition yet; run decompose first');
  const wave = Number(args.flags.wave);
  const agent = text(args.flags.agent, '--agent');
  // The recorded agent must not be the main agent itself. Measured before this check:
  // `dispatch --wave 1 --agent main-agent` returned [OK] and the gate treated the wave as
  // satisfied, so the duty to delegate could be discharged by the main agent dispatching to
  // itself. Rejected at write time so the record is never created and cannot satisfy the gate.
  // This closes the self-assignment loophole; it does not prove a sub-agent existed.
  if (decomp.isSelfAgentName(agent)) {
    fail(`--agent "${agent}" denotes the main agent, not a delegated sub-agent. ` +
      `A dispatch record naming the main agent does not evidence delegation. ` +
      `Use the real sub-agent identifier, or use dispatch-waive --wave ${wave} --reason "..." to authorize serial execution.`);
  }
  const subtasksFlag = args.flags.subtasks === undefined ? null : text(args.flags.subtasks, '--subtasks');
  if (!Number.isSafeInteger(wave) || wave < 1) fail('--wave must be a positive integer');

  const { tasks, waves } = s.decomposition;
  const target = waves.find(w => w.wave === wave);
  if (!target) fail(`Wave ${wave} does not exist (waves 1..${waves.length})`);

  const plan = decomp.dispatchPlan(tasks);
  // The derived plan — not `target.mode` — decides dispatchability. The gate derives the
  // same plan, so both sides must agree: consulting the stored mode here while the gate
  // derives produced a deadlock where the gate demanded a record that this command refused
  // to write (stale stored waves from an older CLI). Only a genuinely parallel wave may
  // be dispatched; a single-subtask or conflict-narrowed wave cannot be, by derivation.
  const group = plan.groups.find(g => g.wave === wave);
  if (!group) {
    const stored = target.mode === 'parallel'
      ? 'stored mode says parallel but the derived plan disagrees (stale waves; re-run decompose --replace true)'
      : `${target.mode} (single subtask or file conflict)`;
    fail(`Wave ${wave} is not dispatchable: ${stored}; dispatch applies to parallel waves only`);
  }
  const dispatched = subtasksFlag
    ? subtasksFlag.split(',').map(x => x.trim()).filter(Boolean)
    : group.tasks.slice();
  if (!dispatched.length) fail('--subtasks must list at least one subtask id');
  for (const id of dispatched) {
    if (!group.tasks.includes(id)) fail(`Subtask ${id} is not in wave ${wave} (wave ${wave}: ${group.tasks.join(', ')})`);
  }
  s.decomposition.dispatches = s.decomposition.dispatches || [];
  s.decomposition.dispatches.push({ wave, tasks: dispatched, agent, at: now() });
  s.decomposition.updatedAt = now();
  write(root, s);
  console.log(`[OK] Dispatch recorded: wave ${wave} -> sub-agent ${agent} (${dispatched.join(', ')})`);
  console.log('   Main agent must still verify each sub-agent result before marking subtasks completed.');
  const covered = new Set();
  for (const r of s.decomposition.dispatches) if (!r.waived) for (const id of r.tasks) covered.add(id);
  const still = group.tasks.filter(id => !covered.has(id));
  if (still.length) console.log(`   Wave ${wave} still needs: ${still.join(', ')} (a partial dispatch does not satisfy the gate)`);
}

/**
 * Waive mandatory dispatch for a parallel wave, with a recorded reason.
 *
 * Escape hatch required by the Execution Contract's "clarify exceptions": if the host
 * has no sub-agent capability, or the user authorizes serial execution, the workflow
 * must be able to proceed without fabricating a dispatch. The waiver is explicit and
 * auditable rather than silent.
 */
function cmdDispatchWaive(args) {
  const root = requireRoot();
  const s = read(root);
  if (!s.decomposition) fail('No decomposition yet; run decompose first');
  const wave = Number(args.flags.wave);
  const reason = text(args.flags.reason, '--reason');
  if (!Number.isSafeInteger(wave) || wave < 1) fail('--wave must be a positive integer');
  const target = s.decomposition.waves.find(w => w.wave === wave);
  if (!target) fail(`Wave ${wave} does not exist`);
  // Derived plan, not `target.mode`: the gate derives the same plan, so the remedy must
  // agree with it or a stale stored mode makes the gate unanswerable (see cmdDispatch).
  const plan = decomp.dispatchPlan(s.decomposition.tasks);
  const group = plan.groups.find(g => g.wave === wave);
  if (!group) fail(`Wave ${wave} is not parallel under the derived plan; only parallel waves need a waiver`);
  s.decomposition.dispatches = s.decomposition.dispatches || [];
  // A waiver is recorded in the same list with an explicit flag, so the gate can tell
  // "dispatched to an agent" apart from "authorized to run serially".
  s.decomposition.dispatches.push({ wave, tasks: group.tasks.slice(), agent: 'waived', waived: true, reason, at: now() });
  s.decomposition.updatedAt = now();
  write(root, s);
  console.log(`[OK] Mandatory dispatch waived for wave ${wave} (${group.tasks.join(', ')})`);
  console.log(`   Reason: ${reason}`);
}

/**
 * Subtask status update.
 */
function cmdSubtask(args) {
  const root = requireRoot();
  const [id, status] = args.positional;
  if (!validId(id)) fail('Invalid subtask id');
  if (!SUBTASK_STATUS.includes(status)) fail(`Unknown subtask status "${status}", options: ${SUBTASK_STATUS.join(', ')}`);
  const s = read(root);
  if (!s.decomposition) fail('No decomposition yet; run decompose first');
  const task = s.decomposition.tasks.find(t => t.id === id);
  if (!task) fail(`Subtask does not exist: ${id}`);

  // Pre-check: when marking in_progress, all dependencies must be completed
  if (status === 'in_progress') {
    const unmet = task.depends.filter(depId => {
      const dep = s.decomposition.tasks.find(t => t.id === depId);
      return dep && dep.status !== 'completed';
    });
    if (unmet.length) fail(`Subtask ${id} prerequisites not met: ${unmet.join(', ')}`);
  }
  // When marking completed, must be in_progress
  if (status === 'completed' && task.status !== 'in_progress') {
    fail(`Subtask ${id} current status is ${task.status}, only in_progress can complete`);
  }

  task.status = status;
  task.updatedAt = now();
  s.decomposition.updatedAt = now();
  write(root, s);
  console.log(`[OK] Subtask ${id} -> ${status}`);
}

/**
 * Show the mandatory sub-agent dispatch plan and what is still outstanding.
 * Read-only.
 */
function cmdDispatchPlan() {
  const root = requireRoot();
  // Lenient read: a diagnostic command must be able to inspect the state that strict
  // validation rejects. Dying on the same error `validate` reports just removes the tool
  // an operator needs to see what is wrong (and it is declared read-only, so it must
  // never turn a bad state into a write failure).
  const s = readState(root, true);
  if (!s.decomposition) {
    console.log('[INFO] not yet decomposed; after requirement confirmation run decompose');
    return;
  }
  const tasks = s.decomposition.tasks;
  // Read-only contract: this command must not exit non-zero. `dispatchPlan` derives from
  // the graph and can throw on a malformed stored state (dangling dependency, cycle), so
  // any failure degrades to a warning — the same treatment `order` already applies. A
  // read-only command that refuses to report is useless exactly when it is needed.
  let plan, required = [];
  try {
    plan = decomp.dispatchPlan(tasks);
    const res = decomp.undispatchedWaves(tasks, s.decomposition.dispatches);
    required = res.required;
  } catch (e) {
    console.log('[WARN] Could not derive the dispatch plan: ' + e.message);
    console.log('       Stored waves may be stale; re-run decompose --replace true to rebuild.');
    console.log('');
    return;
  }
  console.log('');
  for (const line of decomp.formatDispatchPlan(plan)) console.log(line);
  const hasField = Array.isArray(s.decomposition.dispatches);
  const records = s.decomposition.dispatches || [];
  console.log('');
  console.log('Dispatch status:');
  if (!records.length) console.log('  No dispatch recorded yet.');
  for (const r of records) {
    console.log(`  Wave ${r.wave} -> ${r.waived ? 'WAIVED' : r.agent} (${r.tasks.join(', ')})${r.waived ? ' reason: ' + r.reason : ''}`);
  }
  if (!hasField) {
    console.log('  No dispatches field in this state: the gate does not apply (state created before the mandatory-dispatch policy, or decomposed before it).');
  } else if (required.length) {
    console.log(`  Outstanding (blocks Implementation completion): wave ${required.join(', wave ')}`);
  } else if (plan.requiredWaves.length) {
    console.log('  All required parallel waves have a dispatch or waiver record.');
  }
  console.log(`  Dispatch mode: ${s.decomposition.dispatchMode || 'serial'}`);
  console.log('');
}

/**
 * Display wave order table. Read-only command.
 */
function cmdOrder(args) {
  const root = requireRoot();
  // Lenient read, same reasoning as dispatch-plan: `order` is the command you reach for
  // to SEE what is wrong with a decomposition, so it must survive invalid state rather
  // than failing with the same message as `validate`.
  const s = readState(root, true);
  if (!s.decomposition) {
    console.log('[INFO] not yet decomposed; after requirement confirmation run decompose');
    return;
  }
  const { tasks, waves } = s.decomposition;
  const mode = s.decomposition.dispatchMode || 'serial';
  console.log('\n=== Wave Order ===');
  console.log(`Subtasks: ${tasks.length}   Waves: ${waves.length}   Dispatch: ${mode}\n`);
  for (const w of waves) {
    const label = w.mode === 'parallel' ? 'parallel' : 'sequential';
    console.log(`Wave ${w.wave} [${label}]:`);
    for (const tid of w.tasks) {
      const t = tasks.find(x => x.id === tid);
      const dep = t.depends.length ? ` (deps: ${t.depends.join(', ')})` : '';
      const files = t.affectedFiles && t.affectedFiles.length ? ` [files: ${t.affectedFiles.join(', ')}]` : '';
      console.log(`  ${t.status === 'completed' ? '[x]' : t.status === 'in_progress' ? '[>]' : t.status === 'failed' ? '[!]' : '[ ]'} ${t.id.padEnd(16)} ${t.name}${dep}${files}`);
    }
    console.log('');
  }
  const done = tasks.filter(t => t.status === 'completed').length;
  const total = tasks.length;
  console.log(`Progress: ${done}/${total}`);
  if (done === total) console.log('all subtasks completed');
  console.log('');
  // Append the explicit analysis after the existing table. Existing lines are kept
  // verbatim so callers (and existing assertions) that read the order table keep working.
  // `order` is read-only, so a stored-but-inconsistent graph degrades to a warning
  // instead of the `[FAIL]` + non-zero exit that would break read-only callers.
  try {
    for (const line of decomp.formatAnalysis(decomp.analyze(tasks))) console.log(line);
  } catch (e) {
    console.log('[WARN] Could not derive execution-order analysis: ' + e.message);
    console.log('       Stored waves may be stale; re-run decompose --replace true to rebuild.');
  }
  console.log('');
}

function cmdArchive() {
  const root = requireRoot();
  const s = read(root);
  const p = statePath(root, TASK_ID);
  const dir = path.join(root, DIR, 'archive');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = (s.updatedAt || now()).slice(0, 19).replace(/[:T]/g, '-');
  const dest = path.join(dir, `state-${stamp}-${s.task.id}.json`);
  fs.renameSync(p, dest);
  console.log(`[OK] State archived: ${dest}`);
  // **Recovery hint must point to correct file** (review M-e): originally said
  // "move back to state.json location", but --task archives state.sibling-<id>.json —
  // following that hint would overwrite sibling content to main state file path:
  // main task state gets displaced, while --task <id> can't find its file.
  console.log(`   History always accessible; to continue this task, move back to ${path.basename(statePath(root, TASK_ID))} position.`);
  console.log('   Next init after archive creates new task state file.');
}

function cmdValidate() {
  const root = requireRoot();
  const s = read(root);
  const problems = [];
  if (s.schema !== SCHEMA) problems.push(`schema version mismatch: ${s.schema} != ${SCHEMA}`);
  if (!s.task || !s.task.name) problems.push('missing task.name');
  if (!STAGES.includes(s.stage.current)) problems.push(`Unknown stage: ${s.stage.current}`);
  if (!STAGE_STATUS.includes(s.stage.status)) problems.push(`Unknown stage status: ${s.stage.status}`);
  for (const [id, m] of Object.entries(s.modules || {})) {
    if (!MODULE_STATUS.includes(m.status)) problems.push(`Module ${id} status illegal: ${m.status}`);
  }
  if (problems.length) { console.log('[FAIL] Validation failed:'); problems.forEach(p => console.log('  - ' + p)); process.exit(1); }
  console.log(`[OK] State file valid (schema ${s.schema}, stage ${s.stage.current}/${s.stage.status})`);
}

/* ---------- Entry ---------- */

const COMMANDS = {
  init: cmdInit, show: cmdShow, status: cmdShow, stage: cmdStage, module: cmdModule,
  reject: cmdReject, 'retry-resume': cmdRetryResume, checkpoint: cmdCheckpoint, resume: cmdResume, report: cmdReport, validate: cmdValidate,
  block: cmdBlock, unblock: cmdUnblock, gitdec: cmdGitDecision, finalize: cmdArchive, archive: cmdArchive,
  collab: cmdCollab,
  decompose: cmdDecompose, 'decompose-clear': cmdDecomposeClear, 'dispatch-mode': cmdDispatchMode, subtask: cmdSubtask, order: cmdOrder,
  dispatch: cmdDispatch, 'dispatch-waive': cmdDispatchWaive, 'dispatch-plan': cmdDispatchPlan,
  // Execution intent approval (stepDigest). opsStatus / opsShow allow positional args, spec is [0,inf]/[0,1].
  // Note: command names use camelCase opsXxx not hyphenated ops-xxx, consistent with existing module command naming.
  opsRegister: cmdOpsRegister, opsApprove: cmdOpsApprove, opsReject: cmdOpsReject,
  opsStatus: cmdOpsStatus, opsShow: cmdOpsShow,
};

const argv = process.argv.slice(2);
// **Global flag allowed before command name** (`state.js --task x show`).
// Without this normalization, `--task x` would be treated as command name and show help —
// while requireRoot's error message teaches user to use `--task <id>`, giving a dead-end path.
// Only recognize `task` as global flag, don't allow arbitrary leading args (would hide typos).
const GLOBAL_FLAGS = new Set(['task']);
// Leading global flag parsing. **Must have its own try/catch**: this runs before
// main entry's try, and fail() directly would print raw stack (measured `--task a1 --task a2`
// prints Error: ... at ...), while main entry catch prints clean `[FAIL] <msg>` — formats must match.
// Returns { scan, leadFlags }, does not pollute globals (old version used global.__leadFlags, removed).
function parseLeadingGlobalFlags(argv) {
  let scan = 0;
  const leadFlags = Object.create(null);
  try {
    while (scan < argv.length && argv[scan] && argv[scan].startsWith('--')) {
      const key = argv[scan].slice(2);
      if (!GLOBAL_FLAGS.has(key)) break;
      // Missing value must be rejected here: otherwise scan overflows, cmd becomes undefined,
      // reaches "print help + exit(cmd ? 1 : 0)" -> **exit 0** (review MINOR-3),
      // script treats "missing value" as success, inconsistent with trailing `show --task` (exit 1).
      if (scan + 1 >= argv.length || (argv[scan + 1] && argv[scan + 1].startsWith('--'))) {
        fail(`parameter missing value: ${argv[scan]}`);
      }
      scan += 2;
    }
    for (let i = 0; i + 1 < scan; i += 2) {
      const k = argv[i].slice(2);
      // **Leading flag must deduplicate**: previously overwrote silently, `--task a1 --task a2`
      // would silently pick a2 while user thought a1 — writes to wrong sibling file (review M-1).
      // Trailing flag deduplicated by parseArgs, both sides must be consistent.
      if (Object.hasOwn(leadFlags, k)) fail(`duplicate parameter: --${k}`);
      leadFlags[k] = argv[i + 1];
    }
  } catch (e) {
    process.stderr.write('[FAIL] ' + e.message + '\n');
    process.exit(1);
  }
  return { scan, leadFlags };
}
const { scan, leadFlags } = parseLeadingGlobalFlags(argv);
// Command name = first positional after skipping leading global flags (scan points to it).
// **This line is essential**: early refactoring deleted it along with old block, causing
// `cmd is not defined` breaking all commands — syntax check (node --check) doesn't catch undefined identifiers.
const cmd = argv[scan];

if (!cmd || !Object.hasOwn(COMMANDS, cmd)) {
  console.log('Hello Dev State file protocol - Available commands:\n');
  console.log('  init --name "<task-name>" --type <design|implementation|other> [--path full|fast] [--task <id>]');
  console.log('  --task <id>  select parallel task state file .hello-dev/state.sibling-<id>.json;');
  console.log('               defaults to state.json. Omitting --task behaves exactly as before.');
  console.log('  show | resume | report | validate | finalize');
  console.log('  block "<reason>" | unblock "<note>"     # block/unblock');
  console.log('  gitdec <approved|rejected> --reason "..."   # record Git approval decision');
  console.log('  opsRegister --id ID --command "..." --env <prod|staging|dev> [--cwd DIR] [--target T] [--source S] [--source-digest SHA] [--purpose P]');
  console.log('  opsApprove  --id ID --approved-by USER --confirm-digest SHA [--ttl-seconds 300]');
  console.log('  opsReject   --id ID --reason "rejection reason"');
  console.log('  opsStatus [ID...]   # gate: verify step executable (expired/invalid returns non-0)');
  console.log('  opsShow [ID]        # show stepDigest for user to verify and fill --confirm-digest');
  console.log('  stage <name> <pending|in_progress|completed|failed|rolled_back>');
  console.log('  module <id> <design|submitted|approved|annotated> [--reason "approval basis"]');
  console.log('  reject <id> --reason "..."');
  console.log('  checkpoint <name> <pass|fail> [--reason "evidence"]');
  console.log('  retry-resume --reason "user authorization to continue"');
  console.log('  collab [detect|show]   # collaboration: detect skills and snapshot, show reads (default)');
  console.log('  decompose --tasks \'[{"id":"t1","name":"...","depends":[],"affectedFiles":[]}]\' [--replace]   # task decomposition');
  console.log('  decompose --coarse true --tasks \'[{"id":"c1","name":"...","depends":[]}]\'   # coarse (initialization) plan; no dispatch obligation');
  console.log('  decompose-clear          # clear decomposition');
  console.log('  dispatch-mode [serial|parallel]   # set or view sub-agent dispatch mode (default parallel)');
  console.log('  dispatch --wave <n> --subtasks <ids> --agent <name>   # record a sub-agent dispatch for a parallel wave');
  console.log('  dispatch-waive --wave <n> --reason "..."   # authorize serial execution for a parallel wave');
  console.log('  dispatch-plan            # show mandatory dispatch plan and outstanding waves');
  console.log('  subtask <id> <pending|in_progress|completed|failed>   # update subtask status');
  console.log('  order                    # show wave order table');
  console.log(`\nStages: ${STAGES.join(', ')}`);
  process.exit(cmd ? 1 : 0);
}
let ownedLock;
let lockOwnerToken; // unique token written to owner.json; used to verify ownership on release
try {
  // slice(scan) not slice(1): scan skips global flags before command name (--task x).
  // Hardcoding slice(1) would treat --task's **value** as first positional, causing
  // "stage wrong arg count" — arg validation would catch it but error points to wrong cause.
  const args = parseArgs(argv.slice(scan + 1));
  // Merge leading global flags (--task can go before or after command name, both equivalent).
  for (const [k, v] of Object.entries(leadFlags)) {
    if (Object.hasOwn(args.flags, k)) fail(`duplicate parameter: --${k}`);
    args.flags[k] = v;
  }
  // --task is **global task selector**: consistently valid for all commands (including read-only).
  // Must be stripped before spec whitelist validation — if stuffed into 20 specs individually,
  // missing one creates split: "some commands recognize --task, some don't" — same command
  // writes to different files in different invocations.
  if (Object.hasOwn(args.flags, 'task')) {
    assertTaskId(args.flags.task);
    TASK_ID = args.flags.task;
    delete args.flags.task;
  }
  const spec = {
    init: [0, 0, ['name', 'type', 'path']],
    stage: [2, 2, []], module: [2, 2, ['reason']],
    reject: [1, 1, ['reason']], 'retry-resume': [0, 0, ['reason']],
    checkpoint: [2, 2, ['reason']], block: [0, Infinity, ['reason']],
    unblock: [1, Infinity, []], gitdec: [1, 1, ['reason']],
    collab: [0, 1, []],
    decompose: [0, 0, ['tasks', 'replace', 'coarse']],
    'decompose-clear': [0, 0, []],
    'dispatch-mode': [0, 1, []],
    dispatch: [0, 0, ['wave', 'subtasks', 'agent']],
    'dispatch-waive': [0, 0, ['wave', 'reason']],
    'dispatch-plan': [0, 0, []],
    subtask: [2, 2, []],
    order: [0, 0, []],
    opsRegister: [0, 0, ['id', 'command', 'cwd', 'target', 'env', 'source', 'source-digest', 'purpose']],
    opsApprove: [0, 0, ['id', 'approved-by', 'confirm-digest', 'ttl-seconds']],
    opsReject: [0, 0, ['id', 'reason']],
    opsStatus: [0, Infinity, []],
    opsShow: [0, 1, []],
  }[cmd] || [0, 0, []];
  if (args.positional.length < spec[0] || args.positional.length > spec[1]) fail(`Command ${cmd} wrong number of arguments`);
  for (const key of Object.keys(args.flags)) {
    if (!spec[2].includes(key)) fail(`Command ${cmd} does not support flag --${key}`);
  }
  // Read-only commands don't take write lock: they only read() never write().
  // Locking makes two things worse — concurrent reads unnecessarily rejected,
  // and can't view state while write process holds lock (exactly when you need to look).
  const READONLY_CMDS = ['show', 'status', 'resume', 'report', 'validate', 'opsShow', 'opsStatus', 'order', 'dispatch-plan'];
  // collab's read-only depends on action: detect writes snapshot, show (default) doesn't.
  // Judging by whole command name gets both wrong — treating show as write (can't view during lock),
  // or treating detect as read (bypasses lock for writes). Measured the former:
  // `collab show` rejected when lock held, exactly when state reading is most needed.
  const collabReadonly = cmd === 'collab' && (args.positional[0] || 'show') === 'show';
  if (!READONLY_CMDS.includes(cmd) && !collabReadonly) {


    const root = cmd === 'init' ? (findRoot() || process.cwd()) : requireRoot();
    fs.mkdirSync(path.join(root, DIR), { recursive: true });
    // **Lock must be per-task granularity** (review M-5): writing state.sibling-<id>.json
    // but sharing one state.lock — two unrelated parallel tasks get serialized,
    // measured 8 concurrent (4xp1 + 4xp2) only 2 succeeded, directly violates --task design.
    // memory.js uses memory.lock, evolve.js uses evolve.lock, same here:
    // lock protects "complete read-modify-write of same state file", granularity matches file.
    const lock = path.join(root, DIR, TASK_ID ? `state.sibling-${TASK_ID}.lock` : 'state.lock');
    const LOCK_WAIT_MS = 3000;
    const LOCK_POLL_MS = 20;

    // Synchronous sleep using Atomics.wait (available in Node 12+).
    function syncSleep(ms) {
      const sab = new SharedArrayBuffer(4);
      const i32 = new Int32Array(sab);
      Atomics.wait(i32, 0, 0, ms);
    }

    // A lock is acquired by exclusive mkdir and is never automatically reclaimed. The gap
    // between mkdir and owner.json is real: a process can pause or crash there. Treating a
    // missing/old/malformed owner as stale lets a contender remove a live holder's lock and
    // enter the same read-modify-write critical section. Fail closed instead; if a process
    // crashes, the documented recovery is to verify that no writer is alive and remove the
    // stale lock manually. This also avoids unsafe rename-over-empty-directory behavior.
    let lockAcquired = false;
    const lockDeadline = Date.now() + LOCK_WAIT_MS;
    while (!lockAcquired && Date.now() < lockDeadline) {
      lockOwnerToken = `${process.pid}-${require('node:crypto').randomUUID()}`;
      let createdLock = false;
      try {
        fs.mkdirSync(lock); // atomic: exactly one process creates the lock directory
        createdLock = true;
        ownedLock = lock;
        lockAcquired = true;
        fs.writeFileSync(path.join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, token: lockOwnerToken, at: now(), command: cmd, task: TASK_ID || 'default' }), { encoding: 'utf8', flag: 'wx' });
        break;
      } catch (e) {
        if (createdLock) {
          // We created this path, so no competing writer can own it. Still keep the lock
          // directory if publication fails: releasing on an incomplete owner record cannot
          // be made safely distinguishable by another process, so manual recovery is safer.
          throw e;
        }
        if (e.code !== 'EEXIST' && !(e.message && e.message.includes('EEXIST'))) throw e;
        lockAcquired = false;
        // Poll until a wall-clock deadline so longer state mutations can finish.
        syncSleep(LOCK_POLL_MS);
      }
    }
    if (!lockAcquired) {
      fail(`state write lock conflict (${lock}); no write was performed after waiting ${LOCK_WAIT_MS}ms. Before manual cleanup, inspect owner.json if present and confirm no state writer for this task is active; owner-less locks require the same process check`);
    }
  }
  COMMANDS[cmd](args);
} catch (e) {
  process.stderr.write('[FAIL] ' + e.message + '\n');
  process.exitCode = 1;
} finally {
  if (ownedLock) {
    // Remove the whole directory only after confirming its unique owner token. Removing
    // owner.json separately would create an empty-directory window, and stale-lock takeover
    // is intentionally not part of this protocol.
    try {
      const ownerPath = path.join(ownedLock, 'owner.json');
      const raw = fs.readFileSync(ownerPath, 'utf8');
      const owner = JSON.parse(raw);
      if (owner.token === lockOwnerToken) {
        fs.rmSync(ownedLock, { recursive: true, force: true });
      }
    } catch (_) { /* unreadable owner: leave the lock for explicit recovery */ }
  }
}
