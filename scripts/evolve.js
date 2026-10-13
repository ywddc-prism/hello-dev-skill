#!/usr/bin/env node
'use strict';

/**
 * Hello Dev — Evolution controller (**observe mode: evaluate only, no activation**)
 *
 * Reason for existence: evidence from "task ended/failed rework/user correction" dies if
 * only written to logs. What it needs to do is not write post-mortems, but turn evidence into
 * **comparably verifiable candidates** and take effect within authorized scope.
 * This stage **activates no candidates** — evaluation results only output verdict and rejection
 * reasons, awaiting human decision.
 *
 * Usage:
 *   node scripts/evolve.js status                 # current state of evidence and candidates
 *   node scripts/evolve.js evaluate --candidate <file> [--baseline <file>]
 *                                                  # legacy/candidate comparison evaluation (read-only, produces verdict)
 *   node scripts/evolve.js candidates              # list candidates and status
 *   node scripts/evolve.js budget                  # check current round budget consumption and whether stopped
 *   node scripts/evolve.js reject --candidate <file> --reason "..."   # record rejection reason
 *
 * **Boundaries (see references/automation-charter.md)**:
 *   - Can auto-activate: memory retrieval ranking, execution strategies that don't change external side-effect triggers
 *   - Permanently human: approval rules, permissions, graders, protected test sets, Git/deploy/install sync
 *   - This script does not write .hello-dev/state.json (evolution tasks don't preempt business task state, see
 *     state-protocol "only one active task per project")
 *   - Does not collect cost metrics (cost-metrics.md "no auto-collection"), only maintains **execution count**
 *
 * Storage: `.hello-dev/evolve.json` (runtime, like state.json not in version control)
 */

const fs = require('fs');
const path = require('path');

// Memory validation **reuses memory.js read()** (review M-2): previously only JSON.parse here,
// so the same file memory.js judges "top-level structure illegal" while evolve still produces
// total/retrieved numbers and evaluates based on them — the source file for evidence counts
// didn't pass validation itself, directly violating charter §5 (trusted premise of evidence three-separation).
// Reuse rather than copy: copying creates a second source of truth, when the two drift,
// illegal memories can pass through one of them.
// Requires memory.js to have require.main guard, otherwise require executes CLI (MINOR-6 fixed together).
const memRead = require('./memory.js').read;

const DIR = '.hello-dev';
const FILE = 'evolve.json';
const SCHEMA = 1;
const MEM_FILE = 'memory.json';

// **Must be character-for-character identical with state.js / memory.js findRoot** (see memory.js:findRoot comments).
// Copied here to locate the same project root; before changing, cross-check those two, otherwise three-way divergence.
// Check if this directory is a "project root with state files".
// **Character-for-character identical**: each of three scripts has its own copy, test-memory.js:9d compares (excluding comments).
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

function fail(msg) { throw new Error(msg); }
function now() { return new Date().toISOString(); }
function evolvePath(root) { return path.join(root, DIR, FILE); }

function emptyEvolve() {
  return {
    schema: SCHEMA,
    // Mode: observe = evaluate only, no activation (only legal value at this stage)
    mode: 'observe',
    candidates: [],     // {id, path, createdAt, status, verdict?, reason?, evaluatedAt?}
    // maxElapsedMs is the **elapsed time** limit required by charter §4 (alongside candidate count, execution count).
    // startedAt is set on first evaluate persist (read-only commands like status/budget don't start the timer).
    budget: { maxCandidates: 10, maxEvaluations: 20, used: 0, stopped: null,
      // Per-round candidate counter (charter §4: limits are per round). Counts candidates
      // ADDED this round; reset zeroes it. Legacy stores without it read as 0.
      candidatesThisRound: 0,
      maxElapsedMs: 15 * 60 * 1000, startedAt: null },
    evaluations: [],    // {candidateId, at, verdict, gates, evidence}
    createdAt: now(),
    updatedAt: now(),
  };
}

function read(root) {
  const p = evolvePath(root);
  if (!fs.existsSync(p)) return emptyEvolve();
  let e;
  try { e = JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (ex) { fail(`Evolution state file unreadable: ${p} (${ex.message})`); }
  
  // Permission domain separation: validation logic in guard module, evolve.js only responsible for fail
  const schemaCheck = validateSchema(e);
  if (!schemaCheck.ok) {
    fail(`Evolution state structure illegal: ${schemaCheck.reasons.join('; ')}; restore trusted backup, do not auto-overwrite`);
  }
  
  const budgetCheck = validateBudget(e.budget);
  if (!budgetCheck.ok) {
    fail(`Evolution state budget field illegal: ${budgetCheck.reasons.join('; ')}; restore trusted backup, do not auto-overwrite`);
  }
  
  const candidatesCheck = validateCandidates(e.candidates);
  if (!candidatesCheck.ok) {
    fail(`Evolution state candidates element illegal: ${candidatesCheck.reasons.join('; ')}; restore trusted backup, do not auto-overwrite`);
  }
  
  const evaluationsCheck = validateEvaluations(e.evaluations);
  if (!evaluationsCheck.ok) {
    fail(`Evolution state evaluations element illegal: ${evaluationsCheck.reasons.join('; ')}; restore trusted backup, do not auto-overwrite`);
  }
  
  return e;
}

function write(root, e) {
  e.updatedAt = now();
  const p = evolvePath(root);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.${require('node:crypto').randomUUID()}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(e, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
    fs.renameSync(tmp, p);
  } finally { if (fs.existsSync(tmp)) { try { fs.unlinkSync(tmp); } catch (_) {} } }
  return p;
}

// ——— Complete read-modify-write: must be inside exclusive lock (same as state.js) ———
//
// **Measured defect**: using only "temp file + rename", 6 concurrent `evaluate` all exit 0,
// but only 3 persist — **silent data loss**. rename only guarantees not writing a bad file,
// doesn't guarantee read-modify-write isn't overwritten. state.js protocol says
// "protect complete read-modify-write via exclusive creation of `.hello-dev/state.lock/`",
// my initial implementation missed the lock.
//
// If lock can't be acquired, **fail explicitly** (same as state.js "conflict = explicit failure,
// no auto-retry or merge"), not degrade-and-continue — silent continuation is the source of data loss.
function withLockRMW(root, fn) {
  const dir = path.join(root, DIR);
  fs.mkdirSync(dir, { recursive: true });
  const lock = path.join(dir, 'evolve.lock');
  let owned = false;
  try {
    fs.mkdirSync(lock);
    owned = true;
    fs.writeFileSync(path.join(lock, 'owner.json'),
      JSON.stringify({ pid: process.pid, at: now() }));
  } catch (e) {
    if (e.code === 'EEXIST') {
      fail(`Evolution state write lock exists: ${lock}; another write may be in progress.` +
        `If process has exited, verify manually then remove stale lock (don't auto-delete unknown locks).`);
    }
    throw e;
  }
  try { return fn(read(root)); }
  finally { if (owned) fs.rmSync(lock, { recursive: true, force: true }); }
}

// ——— Evidence reading: memory is the only memory store (don't build a second set) ———
function readMemory(root) {
  const p = path.join(root, DIR, MEM_FILE);
  if (!fs.existsSync(p)) return { entries: [], working: [] };
  // Uses memory.js read(): when structure is illegal it fails (with .bak recovery guidance),
  // rather than treating illegal structure as evidence source. Error messages consistent with memory.js validate.
  return memRead(root);
}

/** Fold memory entries into evidence status — three-separation, state which layer is missing. */
function evidenceSummary(m) {
  const es = (m && m.entries) || [];
  const counts = { retrieved: 0, applied: 0, improved: 0, regressed: 0, no_effect: 0, unknown: 0 };
  const noEvidence = [];
  for (const e of es) {
    if (e.hits > 0) counts.retrieved++;
    const adopted = Array.isArray(e.adopted) ? e.adopted.length : 0;
    if (adopted > 0) counts.applied++;
    else if (e.hits > 0) noEvidence.push({ id: e.id, reason: `retrieved ${e.hits} times but no adopt record — retrieval != adoption` });
    const outcomes = Array.isArray(e.outcomes) ? e.outcomes : [];
    if (!outcomes.length && adopted > 0) {
      noEvidence.push({ id: e.id, reason: `adopted ${adopted} times but no outcome — result unknown` });
    }
    for (const o of outcomes) if (counts[o.result] !== undefined) counts[o.result]++;
  }
  return { total: es.length, counts, noEvidence };
}

// ——— Hard gate (cannot be offset by benefits, see charter §3.1) ———
// If a candidate touches any of these, reject regardless of how large the benefit.
// Permission domain separation: FORBIDDEN_PATTERNS and checkForbidden extracted to independent guard module.
// Even if candidate executor can modify evolve.js, they can't touch the gate (unless they can also modify guard module).
const guard = require('./lib/evolve-guard');
const { FORBIDDEN_PATTERNS, checkForbidden, validateSchema, validateBudget, validateCandidates, validateEvaluations } = guard;

// ——— status ——
function cmdStatus() {
  const root = findRoot() || process.cwd();
  const e = read(root);
  const m = readMemory(root);
  const ev = evidenceSummary(m);
  const pending = e.candidates.filter(c => c.status === 'pending');
  const out = {
    mode: e.mode,
    // Always 0: `read()` already constrains mode to ['observe'] (see read's mode validation),
    // the original `?'UNEXPECTED'` branch is **unreachable** — dead code (review MINOR-5).
    // Write 0 directly instead of ternary: unreachable branch suggests 'non-observe mode' exists,
    // conflicting with charter 'observe mode is only legal value'.
    // Real anti-bypass defense is in read()'s mode validation, not assembling a string here.
    activated: 0,
    evidence: {
      total: ev.total,
      retrieved: ev.counts.retrieved,
      applied: ev.counts.applied,
      outcomes: { improved: ev.counts.improved, regressed: ev.counts.regressed,
        no_effect: ev.counts.no_effect, unknown: ev.counts.unknown },
      missing: ev.noEvidence,
    },
    candidates: { total: e.candidates.length, pending: pending.length,
      approved: e.candidates.filter(c => c.status === 'approved').length,
      rejected: e.candidates.filter(c => c.status === 'rejected').length },
    budget: e.budget,
    note: e.mode === 'observe'
      ? 'Observe mode: this script only evaluates, activates no candidates (contract see references/automation-charter.md)'
      : null,
  };
  return out;
}

// ——— candidates ——
function cmdCandidates(args) {
  const root = findRoot() || process.cwd();
  const e = read(root);
  const statusFilter = args && args.flags && args.flags.status;
  const filtered = statusFilter
    ? e.candidates.filter(c => c.status === statusFilter)
    : e.candidates;
  return {
    total: filtered.length,
    candidates: filtered.map(c => ({
      id: c.id, path: c.path, status: c.status, createdAt: c.createdAt,
      evaluatedAt: c.evaluatedAt || null, verdict: c.verdict || null, reason: c.reason || null,
      type: c.type || null, target: c.target || null,
    })),
  };
}

// ——— budget ——
// ——— budget --reset: reopen a round after human decision (review M-b) ———
// charter §4 says "set limit **per round**", but startedAt once written only goes forward,
// no reset path (grep reset across entire file = zero hits), after second stop can only hand-edit evolve.json.
// This is the only way to align with charter "per round" semantics: **human explicitly starts new round**, system doesn't auto-reset.
function cmdBudgetReset(args) {
  const root = findRoot() || process.cwd();
  const reason = args.flags.reason;
  if (reason === undefined || !String(reason).trim()) {
    fail('Missing --reason: resetting elapsed/budget must leave a reason (consistent with gitdec/unblock policy)');
  }
  return withLockRMW(root, (e) => {
    const before = { startedAt: e.budget.startedAt, used: e.budget.used,
      stopped: e.budget.stopped, candidates: e.candidates.length,
      candidatesThisRound: e.budget.candidatesThisRound || 0 };
    e.budget.startedAt = null;          // new round starts timing from zero
    e.budget.used = 0;                  // execution count quota reopened
    e.budget.candidatesThisRound = 0;   // per-round candidate quota reopened (F1)
    e.budget.stopped = null;            // clear stopped
    // **Don't delete candidates/evaluations**: history must have trace, reset is quota not evidence.
    // Only append a reset record to candidates here, for audit trail of 'who reset when'.
    e.evaluations.push({ id: 'ev-' + Date.now().toString(36), candidateId: '(budget-reset)',
      at: now(), verdict: 'BUDGET_RESET', gates: ['manual-reset'],
      evidence: { reason: String(reason), before } });
    write(root, e);
    return { reset: true, reason: String(reason), before, after: {
      startedAt: e.budget.startedAt, used: e.budget.used, stopped: e.budget.stopped,
      candidates: e.candidates.length, candidatesThisRound: e.budget.candidatesThisRound },
      note: 'quota reopened; candidates/evaluations history preserved (reset does not erase evidence)' };
  });
}

function cmdBudget() {
  const root = findRoot() || process.cwd();
  const e = read(root);
  const b = e.budget;
  return {
    ...b,
    // Per-round view (F1): the quota counts candidates added THIS round, not lifetime store size.
    // candidatesInStore shows the historical total for auditability.
    candidatesThisRound: b.candidatesThisRound || 0,
    candidatesInStore: e.candidates.length,
    remainingCandidates: Math.max(0, b.maxCandidates - (b.candidatesThisRound || 0)),
    remainingEvaluations: Math.max(0, b.maxEvaluations - b.used),
    // Elapsed time dimension (charter §4 third dimension, M-6)
    maxElapsedMs: b.maxElapsedMs === undefined ? null : b.maxElapsedMs,
    startedAt: b.startedAt === undefined ? null : b.startedAt,
    elapsedMs: b.startedAt ? Date.now() - Date.parse(b.startedAt) : null,
    stopped: b.stopped,
    explanation: b.stopped
      ? `Stopped (${b.stopped.reason}): reached budget limit, human decision required to continue`
      : 'not stopped',
    // Cost metrics not auto-collected (cost-metrics.md); only report execution count here
    costMetrics: 'not auto-collected; cost attribution and judgment via manual records docs/progress_coding/',
  };
}

// ——— evaluate: legacy/candidate comparison evaluation (read-only verdict, no activation state) ———
// All judgment logic done inside lock: budget check writes stopped, rejection writes record,
// any 'read outside lock, write inside lock' overwrites concurrent writer's changes (measured 6 concurrent lose 3).
function cmdEvaluate(args) {
  const root = findRoot() || process.cwd();

  // File existence/readability checked outside lock (no state read-modify-write involved)
  const candPath = args.flags.candidate;
  if (!candPath) fail('--candidate required (candidate patch/strategy file path)');
  const abs = path.isAbsolute(candPath) ? candPath : path.join(process.cwd(), candPath);
  if (!fs.existsSync(abs)) fail(`Candidate file not found: ${abs}`);
  let candText;
  try { candText = fs.readFileSync(abs, 'utf8'); }
  catch (ex) { fail(`Candidate file unreadable: ${abs} (${ex.message})`); }

  const basePath = args.flags.baseline;
  let absBase = null;
  if (basePath) {
    absBase = path.isAbsolute(basePath) ? basePath : path.join(process.cwd(), basePath);
    if (!fs.existsSync(absBase)) fail(`Baseline file not found: ${absBase}`);
    // Note: **same-file check not here**. It must come **after** hard gate —
    // otherwise overreaching candidates (common pattern is same-file self-proof) get blocked by 'same file' first,
    // hard gate rejection reasons would never reach the caller (this refactor measured 15 regressions).
  }

  return withLockRMW(root, (e) => {
    // **Elapsed timing must be established before the budget gate** (review M-b): the original wrote
    // startedAt **after** the hard gate, so 5 consecutive overreaching candidates were rejected with
    // startedAt always null -- ran 5 state-writing evaluations, the time gate never timed anything.
    // Overreaching candidates are exactly the input most needing rate-limiting (can be repeatedly fed
    // via external files). The assignment itself now lives in enforceBudget (first line), so every
    // gated writer starts the clock; its ordering relative to the gate is unchanged here.
    // Budget gate (shared): stop at limit, no infinite retry (charter §4)
    // enforceBudget may set stopped, must persist before fail, otherwise stop state lost
    try { enforceBudget(e); }
    catch (err) { write(root, e); throw err; }

    // 1. Hard gate: touch forbidden zone = direct rejection, don't enter benefit comparison
    const forbidden = checkForbidden(candText);
    if (forbidden.length) {
      const reason = forbidden.map(f => f.why).join('；');
      recordReject(e, abs, reason, forbidden.map(f => f.id));
      write(root, e);
      return { verdict: 'REJECTED', phase: 'hard-gate', reasons: forbidden.map(f => f.why),
        candidate: abs, mode: e.mode, activated: false };
    }

    // 2. Comparison evidence: must have baseline to discuss improvement (charter §3.2)
    if (absBase && path.resolve(absBase) === path.resolve(abs)) {
      fail('--baseline and --candidate cannot be same file (comparison meaningless)');
    }
    if (!absBase) {
      const reason = 'Missing --baseline: improvement must compare with legacy in same scenario, no comparison = no judgment';
      recordReject(e, abs, reason, ['no-baseline']);
      write(root, e);
      return { verdict: 'INSUFFICIENT_EVIDENCE', phase: 'contrast', reason, candidate: abs,
        mode: e.mode, activated: false };
    }

    // 3. Observe mode: passing gate can only be CANDIDATE_PENDING, no activation
    e.budget.used++;
    const evalRecord = {
      id: 'ev-' + Date.now().toString(36),
      candidateId: path.basename(abs),
      at: now(),
      verdict: 'CANDIDATE_PENDING',
      gates: { hardGate: 'pass', contrast: 'baseline-present' },
      evidence: { candidate: abs, baseline: absBase, mode: e.mode },
    };
    e.evaluations.push(evalRecord);
    const existing = e.candidates.find(c => c.path === abs);
    if (existing) {
      existing.status = 'pending'; existing.evaluatedAt = now(); existing.verdict = 'CANDIDATE_PENDING';
    } else {
      e.candidates.push({ id: evalRecord.id, path: abs, createdAt: now(), status: 'pending',
        evaluatedAt: now(), verdict: 'CANDIDATE_PENDING' });
      bumpCandidateRound(e, 1);
    }
    write(root, e);

    return {
      verdict: 'CANDIDATE_PENDING',
      phase: 'observe',
      activated: false,
      candidate: abs,
      baseline: absBase,
      hardGate: 'pass',
      // Explicitly state what this stage **does not produce**, avoid reading 'passed gate' as 'activated'
      notProven: [
        'candidate not proven better than baseline (this round only confirmed no forbidden zone touched and baseline available)',
        'not activated: under observe mode no candidate changes running version',
        'benefit not verified: same-scenario old-vs-new comparison and counterexample retention not yet executed',
      ],
      next: 'human executes same-scenario old-vs-new comparison (preserve counterexamples), write conclusion to docs/progress_coding/ then decide whether to authorize activation',
      budget: e.budget,
    };
  });
}

// ——— Budget gate: shared by all state-writing entry points ———
// **Reason for extracting shared**: originally only cmdEvaluate checked, `reject` checked nothing —
// measured 8 rejects all succeeded, used=10 > maxEvaluations=2, candidates=8 > maxCandidates=3,
// `budget` still reports 'not stopped'. Budget working for only one entry = no budget (review C-4).
// When pre-existing stopped both entries must reject; when used hits limit, set stop and reject.
function enforceBudget(e) {
  // Elapsed clock (charter §4 third dimension): the round is timed from the FIRST state-writing
  // operation, not only from `evaluate`. Starting it here -- the single gate every writer passes --
  // closes the gap where a round that only generated or disposed candidates silently escaped the
  // time limit (same class as F1: a limit that cannot fire where its stated scope says it should).
  if (e.budget.startedAt === undefined || e.budget.startedAt === null) {
    e.budget.startedAt = now();
  }
  if (e.budget.stopped) {
    fail(`Budget stopped: ${e.budget.stopped.reason}\n   Human decision required to continue (run node scripts/evolve.js budget to view)`);
  }
  if (e.budget.used >= e.budget.maxEvaluations) {
    e.budget.stopped = { at: now(), reason: `Evaluation count reached limit ${e.budget.maxEvaluations}` };
    fail(`Budget stopped: ${e.budget.stopped.reason}`);
  }
  // Per-round candidate quota (charter §4: "per round"). Counting the store's lifetime length
  // here was the F1 defect: after 10 candidates ever, generation was permanently blocked and
  // reset could not reopen it (this same check re-tripped). The counter is incremented by
  // bumpCandidateRound at every candidate-creating path; reaching the limit stops the round.
  if ((e.budget.candidatesThisRound || 0) >= e.budget.maxCandidates) {
    e.budget.stopped = { at: now(), reason: `Candidate count reached limit ${e.budget.maxCandidates} (this round)` };
    fail(`Budget stopped: ${e.budget.stopped.reason}`);
  }
  // Elapsed time limit (charter §4 third dimension). startedAt set on **first evaluate**;
  // if not started timing (null / missing field), don't judge timeout, avoid sessions that only ran status being wrongly stopped.
  if (e.budget.maxElapsedMs !== undefined && e.budget.startedAt) {
    const elapsed = Date.now() - Date.parse(e.budget.startedAt);
    if (!Number.isFinite(elapsed)) fail('budget.startedAt timestamp unparseable; restore trusted backup');
    if (elapsed >= e.budget.maxElapsedMs) {
      e.budget.stopped = { at: now(),
        reason: `This round elapsed time reached limit ${Math.round(e.budget.maxElapsedMs / 1000)}s (used ${Math.round(elapsed / 1000)}s)` };
      fail(`Budget stopped: ${e.budget.stopped.reason}`);
    }
  }
}

// Per-round candidate counter (F1): every path that ADDS a candidate entry calls this with the
// number actually persisted. Reaching the limit sets stopped so the next state-writing call
// refuses -- "stop when reached" (charter §4). Reset zeroes the counter; history stays.
function bumpCandidateRound(e, n) {
  if (!n) return;
  e.budget.candidatesThisRound = (e.budget.candidatesThisRound || 0) + n;
  if (e.budget.candidatesThisRound >= e.budget.maxCandidates && !e.budget.stopped) {
    e.budget.stopped = { at: now(), reason: `Candidate count reached limit ${e.budget.maxCandidates} (this round)` };
  }
}

// **Only modify passed-in e, don't write yourself** — writing done uniformly by lock-holding caller,
// otherwise nesting another read-modify-write inside lock would break 'complete read-modify-write inside lock' constraint.
function recordReject(e, candPath, reason, gates) {
  enforceBudget(e);          // reject must not bypass budget (review C-4)
  e.budget.used++;
  e.evaluations.push({ id: 'ev-' + Date.now().toString(36), candidateId: path.basename(candPath),
    at: now(), verdict: 'REJECTED', gates, evidence: { reason } });
  const existing = e.candidates.find(c => c.path === candPath);
  if (existing) { existing.status = 'rejected'; existing.reason = reason; existing.evaluatedAt = now(); existing.verdict = 'REJECTED'; }
  else {
    e.candidates.push({ id: 'ev-' + Date.now().toString(36), path: candPath, createdAt: now(),
      status: 'rejected', reason, evaluatedAt: now(), verdict: 'REJECTED' });
    bumpCandidateRound(e, 1);
  }
}

// ——— reject: human records rejection reason ———
function cmdReject(args) {
  const root = findRoot() || process.cwd();
  const cand = args.flags.candidate;
  const reason = args.flags.reason;
  if (!cand) fail('--candidate required');
  if (typeof reason !== 'string' || !reason.trim()) fail('Missing --reason: rejection must leave a reason (consistent with gitdec/state policy)');
  if (reason.length > 4096) fail('--reason max 4096 characters');
  const abs = path.isAbsolute(cand) ? cand : path.join(process.cwd(), cand);
  return withLockRMW(root, (e) => {
    try { recordReject(e, abs, reason, ['manual']); }
    catch (err) { write(root, e); throw err; }   // must persist after enforceBudget sets stop
    write(root, e);
    return { verdict: 'REJECTED', candidate: abs, reason, activated: false };
  });
}

// ——— diagnose: detect failure patterns, waste, dead memories from evidence data ———
// Phase 2 core: fold memory.js adopt/outcome data into structured diagnostic signals.
// Diagnostic results output JSON, consumed by generate command to produce improvement candidates.
function cmdDiagnose() {
  const root = findRoot() || process.cwd();
  const m = readMemory(root);
  const entries = (m && m.entries) || [];
  const nowMs = Date.now();
  const DAY = 86400000;

  // Read state.json (read-only) to surface stage rollbacks. If absent/unreadable,
  // rollbacks simply stay empty -- diagnose must not fail because state.json is missing.
  let stateData = null;
  try {
    stateData = JSON.parse(fs.readFileSync(path.join(root, DIR, 'state.json'), 'utf8'));
  } catch (e) {
    // no state.json / unreadable -> treat as no rollback evidence
  }

  const diagnosis = {
    retrievalQuality: [],   // retrieved but never adopted
    harmfulMemories: [],    // outcome contains regressed
    deadPatterns: [],       // L3/L4 not retrieved for long time
    lowValueMemories: [],   // outcomes all no_effect
    evidenceGaps: [],       // has adopt but no outcome
    stageRollbacks: [],     // stage.history entries with status rolled_back
  };

  for (const e of entries) {
    const hits = e.hits || 0;
    const adopted = Array.isArray(e.adopted) ? e.adopted : [];
    const outcomes = Array.isArray(e.outcomes) ? e.outcomes : [];
    const age = nowMs - Date.parse(e.createdAt || nowMs);

    // Retrieval quality: retrieved but never adopted (retrieval != adoption)
    if (hits > 0 && adopted.length === 0) {
      diagnosis.retrievalQuality.push({
        id: e.id, layer: e.layer, hits,
        reason: `retrieved ${hits} times but never adopted — retrieval != adoption`,
      });
    }

    // Harmful memory: outcome contains regressed
    for (const o of outcomes) {
      if (o.result === 'regressed') {
        diagnosis.harmfulMemories.push({
          id: e.id, layer: e.layer, result: o.result,
          evidence: o.source || o.note || 'no detailed evidence',
          at: o.at,
        });
      }
    }

    // Dead pattern: L3/L4 created over 14 days ago and hits === 0
    if ((e.layer === 'L3' || e.layer === 'L4') && hits === 0 && age > 14 * DAY) {
      diagnosis.deadPatterns.push({
        id: e.id, layer: e.layer,
        ageDays: Math.round(age / DAY),
        reason: `created ${Math.round(age / DAY)} days ago, 0 retrievals`,
      });
    }

    // Low-value memory: outcomes all no_effect (at least 2 times)
    if (outcomes.length >= 2 && outcomes.every(o => o.result === 'no_effect')) {
      diagnosis.lowValueMemories.push({
        id: e.id, layer: e.layer, count: outcomes.length,
        reason: `${outcomes.length} outcomes all no_effect`,
      });
    }

    // Evidence gap: has adopt but no outcome
    if (adopted.length > 0 && outcomes.length === 0) {
      diagnosis.evidenceGaps.push({
        id: e.id, layer: e.layer, adoptedCount: adopted.length,
        reason: `adopted ${adopted.length} times but no outcome — result unknown`,
      });
    }
  }

  // Rollback visibility: count stage.history entries that were rolled back.
  // state.js pushes { stage, status: 'rolled_back', at } for each downstream stage on rollback.
  if (stateData && stateData.stage && Array.isArray(stateData.stage.history)) {
    for (const h of stateData.stage.history) {
      if (h.status === 'rolled_back') {
        diagnosis.stageRollbacks.push({
          stage: h.stage, status: h.status, at: h.at || null,
        });
      }
    }
  }

  const summary = {
    totalIssues: diagnosis.retrievalQuality.length + diagnosis.harmfulMemories.length +
      diagnosis.deadPatterns.length + diagnosis.lowValueMemories.length +
      diagnosis.evidenceGaps.length + diagnosis.stageRollbacks.length,
    critical: diagnosis.harmfulMemories.length + diagnosis.stageRollbacks.length,
    warning: diagnosis.retrievalQuality.length + diagnosis.deadPatterns.length,
    info: diagnosis.lowValueMemories.length + diagnosis.evidenceGaps.length,
    totalEntries: entries.length,
    stageRollbackCount: diagnosis.stageRollbacks.length,
  };

  return { diagnosis, summary };
}

// ——— generate: produce improvement candidates based on diagnostic results ———
// Phase 3 core: transform diagnostic signals into approvable candidates.
// Candidates pass FORBIDDEN_PATTERNS check, ensuring they don't touch permanently-human scope.
function cmdGenerate(args) {
  const root = findRoot() || process.cwd();
  const diag = cmdDiagnose();
  const m = readMemory(root);
  const entries = (m && m.entries) || [];
  const candidates = [];
  let candIdx = 0;

  function addCandidate(type, source, target, proposal) {
    // Check forbidden patterns: check both proposal text and target entry content
    const entry = entries.find(e => e.id === target);
    const entryContent = entry ? (entry.content || '') : '';
    const forbidden = checkForbidden(proposal + ' ' + entryContent);
    candidates.push({
      id: `gen-${Date.now().toString(36)}-${candIdx++}`,
      type, source, target, proposal,
      forbidden: forbidden.length > 0,
      forbiddenReasons: forbidden.map(f => f.why),
      status: 'generated',
      createdAt: now(),
    });
  }

  // Retrieval quality issue -> L4 process update (adjust entry description or tags)
  for (const rq of diag.diagnosis.retrievalQuality) {
    if (rq.layer === 'L3' || rq.layer === 'L4') {
      addCandidate('L4-update', 'retrieval-quality', rq.id,
        `Adjust ${rq.layer} entry ${rq.id} description or tags to be more precise (currently retrieved ${rq.hits} times but never adopted`);
    }
  }

  // Harmful memory -> L4 process correction (generate alternative process)
  for (const hm of diag.diagnosis.harmfulMemories) {
    addCandidate('L4-correction', 'harmful-memory', hm.id,
      `Generate alternative process for ${hm.layer} entry ${hm.id}, avoiding regressed pattern (evidence: ${hm.evidence})`);
  }

  // Dead pattern -> memory cleanup (mark deprecated)
  for (const dp of diag.diagnosis.deadPatterns) {
    addCandidate('memory-prune', 'dead-pattern', dp.id,
      `Mark ${dp.layer} entry ${dp.id} as deprecated (${dp.ageDays} days without retrieval`);
  }

  // Low-value memory -> memory optimization (suggest merge)
  for (const lv of diag.diagnosis.lowValueMemories) {
    addCandidate('memory-merge', 'low-value', lv.id,
      `Suggest merging ${lv.layer} entry ${lv.id} into a more general entry (${lv.count} times no_effect`);
  }

  // Save to evolve.json
  return withLockRMW(root, (e) => {
    // Generation consumes budget like any other state-writing entry point, so the same gate
    // applies here. enforceBudget may set e.budget.stopped, so the stop state must still be
    // persisted even though the call throws -- same wrapping as cmdReject.
    try { enforceBudget(e); }
    catch (err) { write(root, e); throw err; }
    // Generation is a state-writing entry point, so it consumes the round's execution quota as well
    // (the gate was already shared; without this, remainingEvaluations under-reported work and a
    // generate-only round looked like it had consumed nothing -- the comment above the gate already
    // promised "generation consumes budget like any other state-writing entry point").
    e.budget.used++;
    // Merge generated candidates into candidates array (don't overwrite existing)
    // F6: the return below must describe what was PERSISTED, not what was proposed --
    // dedup-skipped proposals used to be counted in `generated`, so a caller could hold
    // ids that do not exist in the store (returns derived from post-write truth).
    // F1 strictness: the batch is capped at the round's REMAINING quota -- otherwise one
    // generate call could overshoot `remainingCandidates` (the display must be a real promise).
    // Deferred proposals are not lost: they are re-proposed by the next round's generate.
    const addedCandidates = [];
    let skippedDuplicates = 0;
    let deferredByQuota = 0;
    let remaining = e.budget.maxCandidates - (e.budget.candidatesThisRound || 0);
    for (const c of candidates) {
      const existing = e.candidates.find(x => x.target === c.target && x.type === c.type);
      if (existing) { skippedDuplicates++; continue; }
      if (remaining <= 0) { deferredByQuota++; continue; }
      const row = { ...c, path: `(generated)`, evaluatedAt: null, verdict: null, reason: null };
      e.candidates.push(row);
      addedCandidates.push(row);
      remaining--;
    }
    bumpCandidateRound(e, addedCandidates.length);
    write(root, e);
    return {
      generated: addedCandidates.length,
      skippedDuplicates,
      deferredByQuota,
      candidates: addedCandidates,
      diagnosis: diag.summary,
      note: 'candidates generated, use approve or reject-candidate to review individually',
    };
  });
}

// ——— approve: human approves candidate (only charter-allowed categories) ———
function cmdApprove(args) {
  const root = findRoot() || process.cwd();
  const candId = args.flags.candidate;
  const reason = args.flags.reason || '';
  if (!candId) fail('--candidate required (candidate id)');

  return withLockRMW(root, (e) => {
    const c = e.candidates.find(x => x.id === candId);
    if (!c) fail(`Candidate not found: ${candId}`);
    if (c.status === 'approved') fail(`Candidate already approved: ${candId}`);

    // Check forbidden
    if (c.forbidden) {
      fail(`Candidate touches forbidden zone, cannot approve: ${c.forbiddenReasons.join('; ')}`);
    }

    // Budget gate (F2): dispositions are state-writing entry points like evaluate/reject
    // (review C-4: a budget enforced at only some entry points is no budget). Persist the
    // stop state before throwing -- same wrapping as cmdGenerate / cmdReject.
    try { enforceBudget(e); } catch (err) { write(root, e); throw err; }
    e.budget.used++;

    c.status = 'approved';
    c.approvedAt = now();
    c.approvalReason = reason;
    write(root, e);
    return { id: candId, status: 'approved', type: c.type, target: c.target,
      note: 'candidate approved, human must apply changes (this script does not auto-modify code)' };
  });
}

// ——— reject-candidate: reject candidate ———
function cmdRejectCandidate(args) {
  const root = findRoot() || process.cwd();
  const candId = args.flags.candidate;
  const reason = args.flags.reason;
  if (!candId) fail('--candidate required (candidate id)');
  if (!reason || !String(reason).trim()) fail('Missing --reason: rejection must leave a reason');

  return withLockRMW(root, (e) => {
    const c = e.candidates.find(x => x.id === candId);
    if (!c) fail(`Candidate not found: ${candId}`);
    if (c.status === 'rejected') fail(`Candidate already rejected: ${candId}`);

    // Budget gate (F2): same as approve/evaluate/reject -- dispositions consume the round's
    // execution quota and cannot run past a stop. Persist before throwing.
    try { enforceBudget(e); } catch (err) { write(root, e); throw err; }
    e.budget.used++;

    c.status = 'rejected';
    c.rejectedAt = now();
    c.rejectReason = reason;
    write(root, e);
    return { id: candId, status: 'rejected', type: c.type, target: c.target };
  });
}

// ——— recall-check: compare snapshot vs current hits, find entries retrieved but not adopted during this task ———
// Ship stage centralized recovery: batch-adopt all missed adopts at once, more reliable than calling at each stage.
// Read latest snapshot from memory.json snapshots array, compare each entry's current hits.
// If entry hits increased (recalled during this task) but no corresponding adopt record -> suggest backfill.
function cmdRecallCheck() {
  const root = findRoot() || process.cwd();
  const m = readMemory(root);
  const entries = (m && m.entries) || [];
  const snapshots = (m && m.snapshots) || [];

  if (snapshots.length === 0) {
    return { status: 'no-snapshot', message: 'no snapshot to compare (snapshot not run during Bootstrap stage)',
      entries: entries.length, suggestion: 'Run node scripts/memory.js snapshot before recall during Bootstrap stage' };
  }

  const latest = snapshots[snapshots.length - 1];
  const hitsBefore = latest.hits;
  const now2 = Date.now();
  const DAY = 86400000;
  const snapAge = now2 - Date.parse(latest.at);

  const results = {
    recalledButNotAdopted: [],  // hits increased but no adopt
    recalledAndAdopted: [],     // hits increased and has adopt (normal)
    noChange: 0,                // hits unchanged
  };

  for (const e of entries) {
    const before = hitsBefore[e.id] !== undefined ? hitsBefore[e.id] : 0;
    const current = e.hits || 0;
    const adopted = Array.isArray(e.adopted) ? e.adopted : [];
    // Check if there are adopts during this task (at later than snapshot time)
    const recentAdopts = adopted.filter(a => Date.parse(a.at) > Date.parse(latest.at));

    if (current > before) {
      // Retrieved during this task
      if (recentAdopts.length > 0) {
        results.recalledAndAdopted.push({ id: e.id, layer: e.layer,
          hitsBefore: before, hitsNow: current, recentAdopts: recentAdopts.length });
      } else {
        results.recalledButNotAdopted.push({ id: e.id, layer: e.layer, content: e.content,
          hitsBefore: before, hitsNow: current, hitIncrease: current - before,
          suggestion: `backfill: node scripts/memory.js adopt --id ${e.id} --source "used this ${e.layer === 'L3' ? 'pattern' : 'process'} in current task"` });
      }
    } else {
      results.noChange++;
    }
  }

  const summary = {
    snapshotTag: latest.tag,
    snapshotAt: latest.at,
    snapshotAgeHours: Math.round(snapAge / 3600000),
    totalEntries: entries.length,
    recalled: results.recalledButNotAdopted.length + results.recalledAndAdopted.length,
    recalledButNotAdopted: results.recalledButNotAdopted.length,
    recalledAndAdopted: results.recalledAndAdopted.length,
    noChange: results.noChange,
    action: results.recalledButNotAdopted.length > 0
      ? `Found ${results.recalledButNotAdopted.length} entries retrieved but not adopted, suggest backfill before completing Ship`
      : 'All retrieved entries have been adopted (or no new retrievals this task)',
  };

  return { results, summary };
}

/* ---------- CLI ---------- */

const SPEC = {
  status:    { pos: [0, 0], flags: [] },
  candidates:{ pos: [0, 0], flags: ['status'] },
  budget:    { pos: [0, 0], flags: [] },
  evaluate:  { pos: [0, 0], flags: ['candidate', 'baseline'] },
  reset:     { pos: [0, 0], flags: ['reason'] },
  reject:    { pos: [0, 0], flags: ['candidate', 'reason'] },
  diagnose:  { pos: [0, 0], flags: [] },
  generate:  { pos: [0, 0], flags: [] },
  approve:   { pos: [0, 0], flags: ['candidate', 'reason'] },
  'reject-candidate': { pos: [0, 0], flags: ['candidate', 'reason'] },
  'recall-check': { pos: [0, 0], flags: [] },
};
const COMMANDS = {
  status: cmdStatus, candidates: cmdCandidates, budget: cmdBudget,
  evaluate: cmdEvaluate, reject: cmdReject, reset: cmdBudgetReset,
  diagnose: cmdDiagnose, generate: cmdGenerate,
  approve: cmdApprove, 'reject-candidate': cmdRejectCandidate,
  'recall-check': cmdRecallCheck,
};

function parseArgs(cmd, argv) {
  const spec = SPEC[cmd];
  const flags = {}; const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const name = a.slice(2);
      if (!spec.flags.includes(name)) fail(`Command ${cmd} does not support flag --${name}`);
      if (i + 1 >= argv.length) fail(`Flag --${name} missing value`);
      if (flags[name] !== undefined) fail(`Flag --${name} duplicate (not merged, to avoid silent discard)`);
      flags[name] = argv[++i];
      continue;
    }
    positionals.push(a);
  }
  if (positionals.length < spec.pos[0] || positionals.length > spec.pos[1]) {
    fail(`Command ${cmd} wrong number of arguments, expected ${spec.pos[0]}-${spec.pos[1]} positional args`);
  }
  return { flags, positionals };
}

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || !Object.prototype.hasOwnProperty.call(COMMANDS, cmd)) {
    console.error('Usage: node scripts/evolve.js <status|candidates|budget|evaluate|reject|reset|diagnose|generate|approve|reject-candidate|recall-check> [flags]');
    console.error(Object.keys(COMMANDS).join(' | '));
    console.error('Observe mode: evaluate only, no activation. Contract see references/automation-charter.md');
    process.exit(cmd ? 2 : 0);
  }
  try {
    const out = COMMANDS[cmd](parseArgs(cmd, rest));
    console.log(JSON.stringify(out, null, 2));
  } catch (e) {
    console.error(`[FAIL] ${e.message}`);
    process.exit(1);
  }
}

// Only run when executed directly (allow tests to require it for pure functions)
if (require.main === module) main();

module.exports = { findRoot, read, evidenceSummary, checkForbidden, FORBIDDEN_PATTERNS, emptyEvolve, cmdDiagnose, cmdGenerate };
