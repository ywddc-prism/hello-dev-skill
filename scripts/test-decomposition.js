#!/usr/bin/env node
'use strict';

/**
 * Regression tests for task decomposition order analysis.
 *
 * Covers four measured defects, each reproduced by the test that guards it:
 *
 *  1. Order-dependent wave derivation. `state.js` derived waves with a forward pass
 *     reading `waveMap[dependency]`, so a subtask listed before a dependency it
 *     declared produced NaN and **0 waves**, while still printing "[OK]".
 *     Measured before the fix:
 *       decompose --tasks '[{"id":"t2","depends":["t1"]},{"id":"t1","depends":[]}]'
 *       -> [OK] Decomposition complete: 2 subtasks, 0 waves
 *
 *  2. Divergent derivations. state.js and codex-prompt.js each derived waves, and
 *     disagreed on that same state file (0 waves vs t1=1/t2=2). A printed plan must
 *     not differ from the plan dispatched to sub-agents.
 *
 *  3. `validate` accepted a wave set that referenced no subtask, so `{"tasks":[...],
 *     "waves":[]}` reported "[OK] State file valid" and Implementation could then be
 *     completed without any wave having run.
 *
 *  4. `--replace false` overwrote anyway: parseArgs always yields a string, and the
 *     guard was `if (!args.flags.replace ...)`, inverting the documented meaning.
 *
 * Usage: node scripts/test-decomposition.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const child_process = require('child_process');

const LIB = require('./lib/decomposition');
const STATE = path.join(__dirname, 'state.js');
const CODEX = path.join(__dirname, 'codex-prompt.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try { fn(); passed++; console.log('  OK: ' + name); }
  catch (e) { failed++; console.log('  FAIL: ' + name + ' -- ' + e.message); }
}

/** Run state.js in a fixture directory. */
function run(args, cwd) {
  const r = child_process.spawnSync(process.execPath, [STATE].concat(args), {
    cwd, encoding: 'utf8', timeout: 20000,
  });
  return { out: r.stdout + r.stderr, code: r.status };
}

function runCodex(args, cwd) {
  const r = child_process.spawnSync(process.execPath, [CODEX].concat(args), {
    cwd, encoding: 'utf8', timeout: 20000,
  });
  return { out: r.stdout + r.stderr, code: r.status };
}

/** Fresh isolated project with an initialized state file. */
function project() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'decomp-test-'));
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
  const r = run(['init', '--name', 'Decomp test', '--type', 'implementation'], dir);
  assert.strictEqual(r.code, 0, 'fixture init failed: ' + r.out);
  return dir;
}

function tasksJson(tasks) { return JSON.stringify(tasks); }

/**
 * Drive a fixture from bootstrap through to implementation-in_progress with every
 * subtask marked completed. Used by the gate tests, which vary only the dispatch records.
 */
function driveToImplementation(dir, ids) {
  run(['stage', 'bootstrap', 'completed'], dir);
  run(['stage', 'initialization', 'in_progress'], dir);
  run(['checkpoint', 'Scope survey', 'pass', '--reason', 'fixture scope survey reasoning: required checkpoints need substantive evidence'], dir);
  run(['checkpoint', 'Coarse decomposition plan', 'pass', '--reason', 'fixture scope survey reasoning: required checkpoints need substantive evidence'], dir);
  run(['stage', 'initialization', 'completed'], dir);
  run(['stage', 'requirement', 'in_progress'], dir);
  run(['checkpoint', 'Requirement confirmed', 'pass', '--reason', 'fixture scope survey reasoning: required checkpoints need substantive evidence'], dir);
  run(['checkpoint', 'Decomposition plan', 'pass', '--reason', 'fixture scope survey reasoning: required checkpoints need substantive evidence'], dir);
  run(['stage', 'requirement', 'completed'], dir);
  // Full-chain default: record user-approved skips of the four design stages before
  // entering implementation (replaces the retired --path auto-filter).
  for (const st of ['tool-research', 'feature-design', 'architecture', 'prototype']) {
    run(['skip', st, '--reason', 'User approved: skip design stage, fixture has no undecided design point to settle'], dir);
  }
  run(['stage', 'implementation', 'in_progress'], dir);
  for (const t of ids) {
    run(['subtask', t, 'in_progress'], dir);
    run(['subtask', t, 'completed'], dir);
  }
}

console.log('decomposition order analysis tests');

/* ---------- 1. Order independence ---------- */

test('wave derivation ignores declaration order (defect 1)', () => {
  const forward = [
    { id: 't1', name: 'A', depends: [] },
    { id: 't2', name: 'B', depends: ['t1'] },
    { id: 't3', name: 'C', depends: ['t1'] },
    { id: 't4', name: 'D', depends: ['t2', 't3'] },
  ];
  const reversed = [forward[3], forward[2], forward[1], forward[0]];
  const a = LIB.deriveWaves(forward);
  const b = LIB.deriveWaves(reversed);
  assert.strictEqual(a.t1, 1, 'forward t1 should be wave 1');
  assert.strictEqual(a.t4, 3, 'forward t4 should be wave 3');
  assert.deepStrictEqual(b, a, 'reverse declaration must yield the same waves');
});

test('dependent listed before its dependency does not yield 0 waves (defect 1)', () => {
  const dir = project();
  const r = run(['decompose', '--tasks', tasksJson([
    { id: 't2', name: 'api', depends: ['t1'], affectedFiles: ['b.js'] },
    { id: 't1', name: 'model', depends: [], affectedFiles: ['a.js'] },
  ])], dir);
  assert.strictEqual(r.code, 0, 'decompose should succeed: ' + r.out);
  assert.ok(!/0 waves/.test(r.out), 'must not report 0 waves: ' + r.out);
  assert.match(r.out, /2 subtasks, 2 waves/, 'should derive 2 waves: ' + r.out);
  const s = JSON.parse(fs.readFileSync(path.join(dir, '.hello-dev/state.json'), 'utf8'));
  assert.strictEqual(s.decomposition.waves.length, 2, 'stored waves must be 2, not 0');
});

test('waves are a pure function of the graph, not input order', () => {
  const a = LIB.analyze([
    { id: 'x', depends: [] }, { id: 'y', depends: ['x'] },
  ]);
  const b = LIB.analyze([
    { id: 'y', depends: ['x'] }, { id: 'x', depends: [] },
  ]);
  assert.deepStrictEqual(a.waveOf, b.waveOf, 'waveOf must match across input orders');
  assert.deepStrictEqual(a.waves, b.waves, 'wave structure must match across input orders');
});

test('unknown dependency and cycles are rejected with the offending id', () => {
  assert.throws(() => LIB.analyze([{ id: 'a', depends: ['ghost'] }]), /unknown task: ghost/);
  assert.throws(() => LIB.analyze([{ id: 'a', depends: ['b'] }, { id: 'b', depends: ['a'] }]), /circular dependency/);
  const dir = project();
  const cyc = run(['decompose', '--tasks', tasksJson([
    { id: 'a', name: 'A', depends: ['b'] }, { id: 'b', name: 'B', depends: ['a'] },
  ])], dir);
  assert.notStrictEqual(cyc.code, 0, 'cyclic graph must fail');
  assert.match(cyc.out, /circular/i, 'cycle error must be reported: ' + cyc.out);
});

/* ---------- 2. Both consumers agree ---------- */

test('state.js and codex-prompt.js agree on an out-of-order decomposition (defect 2)', () => {
  const dir = project();
  const tasks = [
    { id: 't4', name: 'docs', depends: ['t2', 't3'], affectedFiles: ['d.md'] },
    { id: 't3', name: 'ui', depends: ['t1'], affectedFiles: ['c.js'] },
    { id: 't2', name: 'api', depends: ['t1'], affectedFiles: ['b.js'] },
    { id: 't1', name: 'model', depends: [], affectedFiles: ['a.js'] },
  ];
  const d = run(['decompose', '--tasks', tasksJson(tasks)], dir);
  assert.strictEqual(d.code, 0, 'decompose failed: ' + d.out);

  const stored = JSON.parse(fs.readFileSync(path.join(dir, '.hello-dev/state.json'), 'utf8'));
  const fromState = {};
  for (const w of stored.decomposition.waves) for (const id of w.tasks) fromState[id] = w.wave;

  const list = runCodex(['list'], dir);
  assert.strictEqual(list.code, 0, 'codex-prompt list failed: ' + list.out);
  const payload = JSON.parse(list.out);
  const fromCodex = {};
  for (const t of payload.tasks) fromCodex[t.id] = t.wave;

  assert.deepStrictEqual(fromCodex, fromState,
    'codex-prompt waves must equal the stored/printed waves');
});

/* ---------- 3. validate rejects uncovered waves ---------- */

test('validate rejects a wave set that covers no subtask (defect 3)', () => {
  const dir = project();
  const f = path.join(dir, '.hello-dev/state.json');
  const s = JSON.parse(fs.readFileSync(f, 'utf8'));
  const now = new Date().toISOString();
  s.decomposition = {
    dispatchMode: 'serial',
    tasks: [
      { id: 't1', name: 'A', depends: [], status: 'pending', affectedFiles: [], updatedAt: now },
      { id: 't2', name: 'B', depends: ['t1'], status: 'pending', affectedFiles: [], updatedAt: now },
    ],
    waves: [],
    createdAt: now, updatedAt: now,
  };
  fs.writeFileSync(f, JSON.stringify(s, null, 2));

  const v = run(['validate'], dir);
  assert.notStrictEqual(v.code, 0, 'a 0-wave decomposition must fail validation: ' + v.out);
  assert.match(v.out, /do not cover subtasks|missing from every wave/, 'must explain the coverage gap: ' + v.out);
});

test('validate rejects a subtask listed in two waves and unknown ids', () => {
  assert.deepStrictEqual(LIB.coverageProblems([{ id: 't1' }], [{ wave: 1, tasks: ['t1', 't1'] }]),
    ['subtask listed in more than one wave: t1']);
  assert.deepStrictEqual(LIB.coverageProblems([{ id: 't1' }], [{ wave: 1, tasks: ['ghost'] }]),
    ['wave 1 references unknown subtask: ghost', 'subtask missing from every wave: t1']);
  assert.deepStrictEqual(LIB.coverageProblems([{ id: 't1' }], [{ wave: 1, tasks: ['t1'] }]), [],
    'a correct wave set must report no problems');
});

test('a coverage-broken state can still be repaired (gate must not block its remedy)', () => {
  const dir = project();
  const f = path.join(dir, '.hello-dev/state.json');
  const s = JSON.parse(fs.readFileSync(f, 'utf8'));
  const now = new Date().toISOString();
  s.decomposition = {
    dispatchMode: 'serial',
    tasks: [{ id: 't1', name: 'A', depends: [], status: 'pending', affectedFiles: [], updatedAt: now }],
    waves: [], createdAt: now, updatedAt: now,
  };
  fs.writeFileSync(f, JSON.stringify(s, null, 2));

  const repair = run(['decompose', '--replace', 'true', '--tasks',
    tasksJson([{ id: 't1', name: 'A', depends: [], affectedFiles: [] }])], dir);
  assert.strictEqual(repair.code, 0, 'decompose --replace must be able to repair: ' + repair.out);
  assert.strictEqual(run(['validate'], dir).code, 0, 'state must validate after repair');
});

test('order degrades to a warning on a stale stored graph instead of failing', () => {
  const dir = project();
  const f = path.join(dir, '.hello-dev/state.json');
  const s = JSON.parse(fs.readFileSync(f, 'utf8'));
  const now = new Date().toISOString();
  s.decomposition = {
    dispatchMode: 'serial',
    tasks: [{ id: 'a', name: 'A', depends: ['b'], status: 'pending', affectedFiles: [], updatedAt: now }],
    waves: [{ wave: 1, tasks: ['a'], mode: 'sequential' }],
    createdAt: now, updatedAt: now,
  };
  fs.writeFileSync(f, JSON.stringify(s, null, 2));
  const r = run(['order'], dir);
  assert.strictEqual(r.code, 0, 'order is read-only and must not fail: ' + r.out);
  assert.match(r.out, /WARN|Execution Order Analysis/, 'should still emit the table: ' + r.out);
});

/* ---------- 4. --replace semantics ---------- */

test('--replace false refuses to overwrite (defect 4)', () => {
  const dir = project();
  const original = tasksJson([{ id: 'orig', name: 'Original', depends: [], affectedFiles: ['o.js'] }]);
  assert.strictEqual(run(['decompose', '--tasks', original], dir).code, 0, 'first decompose must succeed');

  const replaced = run(['decompose', '--tasks',
    tasksJson([{ id: 'other', name: 'Other', depends: [], affectedFiles: ['z.js'] }]), '--replace', 'false'], dir);
  assert.notStrictEqual(replaced.code, 0, '--replace false must not overwrite: ' + replaced.out);

  const s = JSON.parse(fs.readFileSync(path.join(dir, '.hello-dev/state.json'), 'utf8'));
  assert.deepStrictEqual(s.decomposition.tasks.map(t => t.id), ['orig'],
    'original decomposition must be intact');
});

test('--replace true still overwrites, and a bad value is rejected', () => {
  const dir = project();
  assert.strictEqual(run(['decompose', '--tasks',
    tasksJson([{ id: 'orig', name: 'Original', depends: [], affectedFiles: ['o.js'] }])], dir).code, 0);
  const ok = run(['decompose', '--replace', 'true', '--tasks',
    tasksJson([{ id: 'new', name: 'New', depends: [], affectedFiles: ['n.js'] }])], dir);
  assert.strictEqual(ok.code, 0, '--replace true must overwrite: ' + ok.out);
  const s = JSON.parse(fs.readFileSync(path.join(dir, '.hello-dev/state.json'), 'utf8'));
  assert.deepStrictEqual(s.decomposition.tasks.map(t => t.id), ['new']);
  assert.throws(() => LIB.parseBooleanFlag('yes', '--replace'), /must be true or false/);
});

/* ---------- Analysis content ---------- */

test('analysis reports dependencies, serial chain and parallel groups', () => {
  const a = LIB.analyze([
    { id: 't1', depends: [], affectedFiles: ['a.js'] },
    { id: 't2', depends: ['t1'], affectedFiles: ['b.js'] },
    { id: 't3', depends: ['t1'], affectedFiles: ['c.js'] },
    { id: 't4', depends: ['t2', 't3'], affectedFiles: ['d.md'] },
  ]);
  assert.deepStrictEqual(a.roots, ['t1'], 't1 is the only root');
  assert.deepStrictEqual(a.leaves, ['t4'], 't4 is the only leaf');
  assert.deepStrictEqual(a.parallelGroups, [{ wave: 2, tasks: ['t2', 't3'] }], 't2/t3 may run in parallel');
  assert.deepStrictEqual(a.serialChain.map(s => s.wave), [1, 3], 'waves 1 and 3 are single-subtask');
  assert.deepStrictEqual(a.criticalPath, ['t1', 't2', 't4'], 'critical path should be derived');
  assert.deepStrictEqual(a.conflicts, [], 'no file conflicts expected');
});

test('a shared file downgrades a wave and is reported as a conflict', () => {
  const a = LIB.analyze([
    { id: 'a', depends: [], affectedFiles: ['shared.js'] },
    { id: 'b', depends: [], affectedFiles: ['shared.js'] },
    { id: 'c', depends: [], affectedFiles: ['other.js'] },
  ]);
  assert.strictEqual(a.waves[0].mode, 'sequential', 'conflicting wave must be sequential');
  assert.strictEqual(a.conflicts.length, 1, 'one conflict expected');
  assert.deepStrictEqual(a.conflicts[0].tasks, ['a', 'b']);
  assert.deepStrictEqual(a.parallelGroups, [], 'no parallel group when the wave conflicts');
});

test('formatAnalysis emits every required section', () => {
  const a = LIB.analyze([
    { id: 't1', depends: [], affectedFiles: ['a.js'] },
    { id: 't2', depends: ['t1'], affectedFiles: ['b.js'] },
  ]);
  const text = LIB.formatAnalysis(a).join('\n');
  for (const section of ['Execution Order Analysis', 'Prerequisites', 'Serial chain', 'Parallel groups', 'File conflicts']) {
    assert.ok(text.includes(section), 'analysis must include: ' + section);
  }
});

test('order keeps its existing lines and appends the analysis', () => {
  const dir = project();
  const d = run(['decompose', '--tasks', tasksJson([
    { id: 't1', name: 'A', depends: [], affectedFiles: ['a.js'] },
    { id: 't2', name: 'B', depends: ['t1'], affectedFiles: ['b.js'] },
    { id: 't3', name: 'C', depends: ['t1'], affectedFiles: ['c.js'] },
  ])], dir);
  assert.strictEqual(d.code, 0, 'decompose failed: ' + d.out);
  // decompose must already print the analysis, without a separate request.
  assert.match(d.out, /Execution Order Analysis/, 'decompose should append the analysis: ' + d.out);

  const o = run(['order'], dir);
  assert.strictEqual(o.code, 0, 'order failed: ' + o.out);
  assert.match(o.out, /Wave 1/, 'legacy order line must remain');
  assert.match(o.out, /Progress: 0\/3/i, 'legacy progress line must remain');
  assert.match(o.out, /Dispatch: serial/i,
    'legacy dispatch line must remain (its value is the serial default; parallel is opt-in)');
  assert.match(o.out, /Parallel groups/, 'analysis sections must be appended');
});

/* ---------- Mandatory sub-agent dispatch ---------- */

test('default dispatch mode is serial after decompose', () => {
  const dir = project();
  const d = run(['decompose', '--tasks', tasksJson([
    { id: 't1', name: 'A', depends: [], affectedFiles: ['a.js'] },
    { id: 't2', name: 'B', depends: [], affectedFiles: ['b.js'] },
  ])], dir);
  assert.strictEqual(d.code, 0, 'decompose failed: ' + d.out);
  const s = JSON.parse(fs.readFileSync(path.join(dir, '.hello-dev/state.json'), 'utf8'));
  assert.strictEqual(s.decomposition.dispatchMode, 'serial',
    'serial must be the default: the main agent executes every subtask; parallel is an explicit opt-in');
  assert.ok(Array.isArray(s.decomposition.dispatches),
    'decompose must initialise the dispatches array (it marks the state as governed by this policy)');
});

test('dispatch-mode parallel is an explicit opt-in that arms the dispatch gate', () => {
  const dir = project();
  assert.strictEqual(run(['decompose', '--tasks', tasksJson([
    { id: 't1', name: 'A', depends: [], affectedFiles: ['a.js'] },
    { id: 't2', name: 'B', depends: [], affectedFiles: ['b.js'] },
  ])], dir).code, 0, 'decompose must succeed first');
  // Opting in flips the write default off and arms the gate: after this, every parallel
  // wave must carry a dispatch or waiver before `stage implementation completed`.
  assert.strictEqual(run(['dispatch-mode', 'parallel'], dir).code, 0, 'opt-in must succeed');
  const s = JSON.parse(fs.readFileSync(path.join(dir, '.hello-dev/state.json'), 'utf8'));
  assert.strictEqual(s.decomposition.dispatchMode, 'parallel',
    'explicit opt-in must persist dispatchMode=parallel');
});

test('decompose prints the mandatory dispatch plan', () => {
  const dir = project();
  const d = run(['decompose', '--tasks', tasksJson([
    { id: 't1', name: 'A', depends: [], affectedFiles: ['a.js'] },
    { id: 't2', name: 'B', depends: [], affectedFiles: ['b.js'] },
  ])], dir);
  assert.match(d.out, /Sub-Agent Dispatch Plan/, 'plan must be printed: ' + d.out);
  assert.match(d.out, /Wave 1: t1, t2/, 'plan must name the parallel group: ' + d.out);
});

test('dispatchPlan marks only parallel waves, and reports serial tasks', () => {
  const tasks = [
    { id: 't1', depends: [], status: 'pending', affectedFiles: ['a.js'] },
    { id: 't2', depends: ['t1'], status: 'pending', affectedFiles: ['b.js'] },
    { id: 't3', depends: ['t1'], status: 'pending', affectedFiles: ['c.js'] },
    { id: 't4', depends: ['t2', 't3'], status: 'pending', affectedFiles: ['d.md'] },
  ];
  const plan = LIB.dispatchPlan(tasks);
  assert.deepStrictEqual(plan.requiredWaves, [2], 'only wave 2 is parallel');
  assert.deepStrictEqual(plan.groups[0].tasks, ['t2', 't3']);
  assert.deepStrictEqual(plan.serialTasks.sort(), ['t1', 't4'],
    'single-subtask waves stay with the main agent');
});

test('dispatch validation rejects non-parallel waves, bad waves and foreign subtasks', () => {
  const dir = project();
  // Wave 1 is sequential (single task), wave 2 is parallel.
  assert.strictEqual(run(['decompose', '--tasks', tasksJson([
    { id: 't1', name: 'A', depends: [], affectedFiles: ['a.js'] },
    { id: 't2', name: 'B', depends: ['t1'], affectedFiles: ['b.js'] },
    { id: 't3', name: 'C', depends: ['t1'], affectedFiles: ['c.js'] },
  ])], dir).code, 0);

  const seq = run(['dispatch', '--wave', '1', '--agent', 'sa'], dir);
  assert.notStrictEqual(seq.code, 0, 'a sequential wave must not accept a dispatch: ' + seq.out);
  assert.match(seq.out, /dispatch applies to parallel waves only/);

  const badWave = run(['dispatch', '--wave', '99', '--agent', 'sa'], dir);
  assert.notStrictEqual(badWave.code, 0, 'unknown wave must be rejected: ' + badWave.out);

  const foreign = run(['dispatch', '--wave', '2', '--subtasks', 't1', '--agent', 'sa'], dir);
  assert.notStrictEqual(foreign.code, 0, 'a subtask from another wave must be rejected: ' + foreign.out);

  const missingAgent = run(['dispatch', '--wave', '2'], dir);
  assert.notStrictEqual(missingAgent.code, 0, '--agent is required');
});

test('Implementation is blocked until every parallel wave is dispatched', () => {
  const dir = project();
  assert.strictEqual(run(['decompose', '--tasks', tasksJson([
    { id: 't1', name: 'A', depends: [], affectedFiles: ['a.js'] },
    { id: 't2', name: 'B', depends: [], affectedFiles: ['b.js'] },
  ])], dir).code, 0);
  // A1: parallel is an explicit opt-in; the mandatory-dispatch gate only arms under
  // dispatchMode=parallel (serial default owes no dispatch records).
  run(['dispatch-mode', 'parallel'], dir);
  // Drive the flow to implementation-in-progress with every subtask completed.
  run(['stage', 'bootstrap', 'completed'], dir);
  run(['stage', 'initialization', 'in_progress'], dir);
  run(['checkpoint', 'Scope survey', 'pass', '--reason', 'fixture scope survey reasoning: required checkpoints need substantive evidence'], dir);
  run(['checkpoint', 'Coarse decomposition plan', 'pass', '--reason', 'fixture scope survey reasoning: required checkpoints need substantive evidence'], dir);
  run(['stage', 'initialization', 'completed'], dir);
  run(['stage', 'requirement', 'in_progress'], dir);
  run(['checkpoint', 'Requirement confirmed', 'pass', '--reason', 'fixture scope survey reasoning: required checkpoints need substantive evidence'], dir);
  run(['checkpoint', 'Decomposition plan', 'pass', '--reason', 'fixture scope survey reasoning: required checkpoints need substantive evidence'], dir);
  run(['stage', 'requirement', 'completed'], dir);
  for (const st of ['tool-research', 'feature-design', 'architecture', 'prototype']) {
    run(['skip', st, '--reason', 'User approved: skip design stage, fixture has no undecided design point to settle'], dir);
  }
  run(['stage', 'implementation', 'in_progress'], dir);
  for (const t of ['t1', 't2']) {
    run(['subtask', t, 'in_progress'], dir);
    run(['subtask', t, 'completed'], dir);
  }
  const blocked = run(['stage', 'implementation', 'completed'], dir);
  assert.notStrictEqual(blocked.code, 0, 'gate must block an undispatched parallel wave: ' + blocked.out);
  assert.match(blocked.out, /requires every parallel subtask dispatched/, 'must say why: ' + blocked.out);
  assert.match(blocked.out, /wave 1/, 'must name the missing wave: ' + blocked.out);

  // dispatch-plan reports the outstanding wave before it is resolved.
  const plan = run(['dispatch-plan'], dir);
  assert.strictEqual(plan.code, 0, 'dispatch-plan is read-only: ' + plan.out);
  assert.match(plan.out, /Outstanding \(blocks Implementation completion\): wave 1/);

  // Recording the dispatch opens the gate.
  assert.strictEqual(run(['dispatch', '--wave', '1', '--agent', 'sa-1'], dir).code, 0,
    'dispatch record should succeed');
  assert.strictEqual(run(['stage', 'implementation', 'completed'], dir).code, 0,
    'gate must open once the wave has a dispatch record');
});

test('dispatch-waive opens the gate with a recorded reason', () => {
  const dir = project();
  assert.strictEqual(run(['decompose', '--tasks', tasksJson([
    { id: 't1', name: 'A', depends: [], affectedFiles: ['a.js'] },
    { id: 't2', name: 'B', depends: [], affectedFiles: ['b.js'] },
  ])], dir).code, 0);
  // A1: arm the gate by opting into parallel dispatch.
  run(['dispatch-mode', 'parallel'], dir);
  run(['stage', 'bootstrap', 'completed'], dir);
  run(['stage', 'initialization', 'in_progress'], dir);
  run(['checkpoint', 'Scope survey', 'pass', '--reason', 'fixture scope survey reasoning: required checkpoints need substantive evidence'], dir);
  run(['checkpoint', 'Coarse decomposition plan', 'pass', '--reason', 'fixture scope survey reasoning: required checkpoints need substantive evidence'], dir);
  run(['stage', 'initialization', 'completed'], dir);
  run(['stage', 'requirement', 'in_progress'], dir);
  run(['checkpoint', 'Requirement confirmed', 'pass', '--reason', 'fixture scope survey reasoning: required checkpoints need substantive evidence'], dir);
  run(['checkpoint', 'Decomposition plan', 'pass', '--reason', 'fixture scope survey reasoning: required checkpoints need substantive evidence'], dir);
  run(['stage', 'requirement', 'completed'], dir);
  for (const st of ['tool-research', 'feature-design', 'architecture', 'prototype']) {
    run(['skip', st, '--reason', 'User approved: skip design stage, fixture has no undecided design point to settle'], dir);
  }
  run(['stage', 'implementation', 'in_progress'], dir);
  for (const t of ['t1', 't2']) {
    run(['subtask', t, 'in_progress'], dir);
    run(['subtask', t, 'completed'], dir);
  }
  assert.notStrictEqual(run(['stage', 'implementation', 'completed'], dir).code, 0, 'gate should block first');
  const noReason = run(['dispatch-waive', '--wave', '1'], dir);
  assert.notStrictEqual(noReason.code, 0, 'a waiver must state a reason');
  const waived = run(['dispatch-waive', '--wave', '1', '--reason', 'host has no sub-agent tool'], dir);
  assert.strictEqual(waived.code, 0, 'waiver should be recorded: ' + waived.out);
  const done = run(['stage', 'implementation', 'completed'], dir);
  assert.strictEqual(done.code, 0, 'gate must open after an explicit waiver: ' + done.out);
});

test('serial mode bypasses the dispatch gate (explicit opt-out)', () => {
  const dir = project();
  assert.strictEqual(run(['decompose', '--tasks', tasksJson([
    { id: 't1', name: 'A', depends: [], affectedFiles: ['a.js'] },
    { id: 't2', name: 'B', depends: [], affectedFiles: ['b.js'] },
  ])], dir).code, 0);
  assert.strictEqual(run(['dispatch-mode', 'serial'], dir).code, 0, 'serial must remain available');
  run(['stage', 'bootstrap', 'completed'], dir);
  run(['stage', 'initialization', 'in_progress'], dir);
  run(['checkpoint', 'Scope survey', 'pass', '--reason', 'fixture scope survey reasoning: required checkpoints need substantive evidence'], dir);
  run(['checkpoint', 'Coarse decomposition plan', 'pass', '--reason', 'fixture scope survey reasoning: required checkpoints need substantive evidence'], dir);
  run(['stage', 'initialization', 'completed'], dir);
  run(['stage', 'requirement', 'in_progress'], dir);
  run(['checkpoint', 'Requirement confirmed', 'pass', '--reason', 'fixture scope survey reasoning: required checkpoints need substantive evidence'], dir);
  run(['checkpoint', 'Decomposition plan', 'pass', '--reason', 'fixture scope survey reasoning: required checkpoints need substantive evidence'], dir);
  run(['stage', 'requirement', 'completed'], dir);
  for (const st of ['tool-research', 'feature-design', 'architecture', 'prototype']) {
    run(['skip', st, '--reason', 'User approved: skip design stage, fixture has no undecided design point to settle'], dir);
  }
  run(['stage', 'implementation', 'in_progress'], dir);
  for (const t of ['t1', 't2']) {
    run(['subtask', t, 'in_progress'], dir);
    run(['subtask', t, 'completed'], dir);
  }
  const done = run(['stage', 'implementation', 'completed'], dir);
  assert.strictEqual(done.code, 0, 'serial mode must not require dispatch records: ' + done.out);
});

test('pre-policy state without a dispatches field is grandfathered', () => {  const dir = project();
  const f = path.join(dir, '.hello-dev/state.json');
  const s = JSON.parse(fs.readFileSync(f, 'utf8'));
  const now = new Date().toISOString();
  // Historical shape: decomposition exists, parallel wave, but NO dispatches field.
  s.decomposition = {
    dispatchMode: 'serial',
    tasks: [
      { id: 't1', name: 'A', depends: [], status: 'completed', affectedFiles: ['a.js'], updatedAt: now },
      { id: 't2', name: 'B', depends: [], status: 'completed', affectedFiles: ['b.js'], updatedAt: now },
    ],
    waves: [{ wave: 1, tasks: ['t1', 't2'], mode: 'parallel' }],
    createdAt: now, updatedAt: now,
  };
  s.stage.current = 'implementation';
  s.stage.status = 'in_progress';
  s.stage.history = s.stage.history.concat([
    { stage: 'bootstrap', status: 'completed', at: now },
    { stage: 'requirement', status: 'completed', at: now },
    { stage: 'implementation', status: 'in_progress', at: now },
  ]);
  fs.writeFileSync(f, JSON.stringify(s, null, 2));
  const done = run(['stage', 'implementation', 'completed'], dir);
  assert.strictEqual(done.code, 0,
    'a state predating mandatory dispatch must not be retroactively blocked: ' + done.out);
});

/* ---------- Review findings (Change #107 independent review) ---------- */

test('a PARTIAL dispatch does not satisfy the gate (every parallel subtask required)', () => {
  const dir = project();
  assert.strictEqual(run(['decompose', '--tasks', tasksJson([
    { id: 't1', name: 'A', depends: [], affectedFiles: ['a.js'] },
    { id: 't2', name: 'B', depends: [], affectedFiles: ['b.js'] },
    { id: 't3', name: 'C', depends: [], affectedFiles: ['c.js'] },
  ])], dir).code, 0);
  // A1: arm the gate by opting into parallel dispatch.
  run(['dispatch-mode', 'parallel'], dir);
  // Drive to implementation with all subtasks completed, then dispatch only ONE of three.
  driveToImplementation(dir, ['t1', 't2', 't3']);
  const partial = run(['dispatch', '--wave', '1', '--subtasks', 't1', '--agent', 'sa-part'], dir);
  assert.strictEqual(partial.code, 0, 'a partial dispatch is allowed to be recorded: ' + partial.out);
  const blocked = run(['stage', 'implementation', 'completed'], dir);
  assert.notStrictEqual(blocked.code, 0,
    'the gate must still demand the un-dispatched subtasks: ' + blocked.out);
  // The message must name the missing SUBTASK ids, not just the wave, or it is not actionable.
  assert.match(blocked.out, /t2, t3/, 'must name the missing subtasks: ' + blocked.out);

  // Completing the coverage opens the gate.
  assert.strictEqual(run(['dispatch', '--wave', '1', '--subtasks', 't2,t3', '--agent', 'sa-rest'], dir).code, 0);
  assert.strictEqual(run(['stage', 'implementation', 'completed'], dir).code, 0,
    'full coverage must satisfy the gate');
});

test('a waiver satisfies the wave entirely; duplicate dispatches do not confuse the gate', () => {
  const dir = project();
  assert.strictEqual(run(['decompose', '--tasks', tasksJson([
    { id: 't1', name: 'A', depends: [], affectedFiles: ['a.js'] },
    { id: 't2', name: 'B', depends: [], affectedFiles: ['b.js'] },
  ])], dir).code, 0);
  // A1: arm the gate by opting into parallel dispatch.
  run(['dispatch-mode', 'parallel'], dir);
  driveToImplementation(dir, ['t1', 't2']);
  run(['dispatch', '--wave', '1', '--subtasks', 't1', '--agent', 'sa-1'], dir);
  run(['dispatch', '--wave', '1', '--subtasks', 't1', '--agent', 'sa-2'], dir);
  assert.notStrictEqual(run(['stage', 'implementation', 'completed'], dir).code, 0,
    'repeated partial records must not sum into full coverage');
  assert.strictEqual(run(['dispatch-waive', '--wave', '1', '--reason', 'no sub-agent tool'], dir).code, 0);
  assert.strictEqual(run(['stage', 'implementation', 'completed'], dir).code, 0,
    'a waiver authorizes the whole wave');
});

test('validate rejects a dispatch record bound to a wave it does not belong to', () => {
  const dir = project();
  // Two separate waves so "belongs to a different wave" is meaningful: t1 in wave 1,
  // t2 in wave 2.
  assert.strictEqual(run(['decompose', '--tasks', tasksJson([
    { id: 't1', name: 'A', depends: [], affectedFiles: ['a.js'] },
    { id: 't2', name: 'B', depends: ['t1'], affectedFiles: ['b.js'] },
  ])], dir).code, 0);
  const f = path.join(dir, '.hello-dev/state.json');
  const s = JSON.parse(fs.readFileSync(f, 'utf8'));
  // Record claims wave 99 (non-existent).
  s.decomposition.dispatches = [{ wave: 99, tasks: ['t1'], agent: 'sa', at: new Date().toISOString() }];
  fs.writeFileSync(f, JSON.stringify(s, null, 2));
  const bad = run(['validate'], dir);
  assert.notStrictEqual(bad.code, 0, 'an unknown wave must be rejected: ' + bad.out);
  assert.match(bad.out, /unknown wave/);

  // Record claims wave 2 but names t1, which is in wave 1.
  s.decomposition.dispatches = [{ wave: 2, tasks: ['t1'], agent: 'sa', at: new Date().toISOString() }];
  fs.writeFileSync(f, JSON.stringify(s, null, 2));
  const mismatch = run(['validate'], dir);
  assert.notStrictEqual(mismatch.code, 0, 'a mismatched subtask must be rejected: ' + mismatch.out);
  assert.match(mismatch.out, /different wave/);
});

test('a malformed dispatch record does not block its own repair (lenient path)', () => {
  const dir = project();
  assert.strictEqual(run(['decompose', '--tasks', tasksJson([
    { id: 't1', name: 'A', depends: [], affectedFiles: ['a.js'] },
  ])], dir).code, 0);
  const f = path.join(dir, '.hello-dev/state.json');
  const s = JSON.parse(fs.readFileSync(f, 'utf8'));
  s.decomposition.dispatches = [{ wave: 1, tasks: ['t1'], agent: '', at: new Date().toISOString() }];
  fs.writeFileSync(f, JSON.stringify(s, null, 2));

  assert.notStrictEqual(run(['validate'], dir).code, 0, 'malformed record must fail strict validation');
  // The remedy must still work: a gate that blocks its own repair is a trap.
  const repair = run(['decompose', '--replace', 'true', '--tasks',
    tasksJson([{ id: 't1', name: 'A', depends: [], affectedFiles: ['a.js'] }])], dir);
  assert.strictEqual(repair.code, 0, 'decompose --replace must not be blocked by its own validation: ' + repair.out);
  assert.strictEqual(run(['validate'], dir).code, 0, 'state must be valid after repair');
});

test('diagnostic commands stay read-only (exit 0) on an invalid state', () => {
  const dir = project();
  assert.strictEqual(run(['decompose', '--tasks', tasksJson([
    { id: 't1', name: 'A', depends: [], affectedFiles: ['a.js'] },
    { id: 't2', name: 'B', depends: ['t1'], affectedFiles: ['b.js'] },
  ])], dir).code, 0);
  const f = path.join(dir, '.hello-dev/state.json');
  const s = JSON.parse(fs.readFileSync(f, 'utf8'));
  s.decomposition.tasks[0].depends = ['ghost']; // dangling dependency
  fs.writeFileSync(f, JSON.stringify(s, null, 2));

  assert.notStrictEqual(run(['validate'], dir).code, 0, 'validate must still reject the bad graph');
  const dp = run(['dispatch-plan'], dir);
  assert.strictEqual(dp.code, 0, 'dispatch-plan is read-only: ' + dp.out);
  assert.match(dp.out, /WARN/, 'must degrade to a warning: ' + dp.out);
  const o = run(['order'], dir);
  assert.strictEqual(o.code, 0, 'order is read-only: ' + o.out);
});

test('dispatch is refused for a stale stored mode that contradicts the derived plan', () => {
  const dir = project();
  assert.strictEqual(run(['decompose', '--tasks', tasksJson([
    { id: 't1', name: 'A', depends: [], affectedFiles: ['a.js'] },
    { id: 't2', name: 'B', depends: ['t1'], affectedFiles: ['b.js'] },
    { id: 't3', name: 'C', depends: ['t1'], affectedFiles: ['c.js'] },
  ])], dir).code, 0);
  // Corrupt the stored mode so it claims sequential while the derived plan says parallel.
  const f = path.join(dir, '.hello-dev/state.json');
  const s = JSON.parse(fs.readFileSync(f, 'utf8'));
  s.decomposition.waves.forEach(w => { w.mode = 'sequential'; });
  fs.writeFileSync(f, JSON.stringify(s, null, 2));
  // Both the gate and its remedies must agree: derive, do not read the stale field.
  const d = run(['dispatch', '--wave', '2', '--agent', 'sa'], dir);
  assert.strictEqual(d.code, 0,
    'dispatch must derive parallelity, not trust the stale stored mode: ' + d.out);
  const w = run(['dispatch-waive', '--wave', '2', '--reason', 'stale mode'], dir);
  assert.strictEqual(w.code, 0, 'dispatch-waive must agree with dispatch: ' + w.out);
});

/* ---------- A dispatch must name a real delegated sub-agent ---------- */

/**
 * Read the stored dispatch records. Returns [] when the field is absent, so the
 * "nothing was written" assertions below cannot be satisfied by an absent field
 * being mistaken for a missing one.
 */
function dispatches(dir) {
  const s = JSON.parse(fs.readFileSync(path.join(dir, '.hello-dev/state.json'), 'utf8'));
  const d = (s.decomposition && s.decomposition.dispatches) || [];
  return Array.isArray(d) ? d : [];
}

test('dispatch --agent main-agent is rejected and writes NO record', () => {
  const dir = project();
  assert.strictEqual(run(['decompose', '--tasks', tasksJson([
    { id: 't1', name: 'A', depends: [], affectedFiles: ['a.js'] },
    { id: 't2', name: 'B', depends: [], affectedFiles: ['b.js'] },
  ])], dir).code, 0, 'decompose must succeed first');
  assert.deepStrictEqual(dispatches(dir), [], 'decompose starts with no dispatch records');

  const r = run(['dispatch', '--wave', '1', '--agent', 'main-agent'], dir);
  assert.notStrictEqual(r.code, 0, 'naming the main agent must be rejected: ' + r.out);
  assert.match(r.out, /main agent/, 'the error must say it denotes the main agent: ' + r.out);
  assert.match(r.out, /dispatch-waive/, 'the error must point at the waiver remedy: ' + r.out);
  // The whole point of the rule: the record is never created, so a policy that requires
  // sub-agent dispatch cannot be satisfied by the main agent dispatching to itself.
  assert.deepStrictEqual(dispatches(dir), [],
    'a rejected self-dispatch must not leave a dispatch record behind');
});

test('every self-agent spelling is rejected and writes NO record', () => {
  const dir = project();
  assert.strictEqual(run(['decompose', '--tasks', tasksJson([
    { id: 't1', name: 'A', depends: [], affectedFiles: ['a.js'] },
    { id: 't2', name: 'B', depends: [], affectedFiles: ['b.js'] },
  ])], dir).code, 0, 'decompose must succeed first');

  const denials = ['self', 'n/a', 'Main_Agent', 'sub-agent: main-agent', 'main agent', '  MAIN  '];
  for (const agent of denials) {
    const r = run(['dispatch', '--wave', '1', '--agent', agent], dir);
    assert.notStrictEqual(r.code, 0, `--agent ${JSON.stringify(agent)} must be rejected: ` + r.out);
    assert.deepStrictEqual(dispatches(dir), [],
      `--agent ${JSON.stringify(agent)} must leave no record behind`);
  }
});

test('a real sub-agent name is accepted and the record IS written', () => {
  const dir = project();
  assert.strictEqual(run(['decompose', '--tasks', tasksJson([
    { id: 't1', name: 'A', depends: [], affectedFiles: ['a.js'] },
    { id: 't2', name: 'B', depends: [], affectedFiles: ['b.js'] },
  ])], dir).code, 0, 'decompose must succeed first');

  const r = run(['dispatch', '--wave', '1', '--agent', 'subagent-1'], dir);
  assert.strictEqual(r.code, 0, 'a real sub-agent name must be accepted: ' + r.out);
  const recs = dispatches(dir);
  assert.strictEqual(recs.length, 1, 'exactly one dispatch record expected');
  assert.strictEqual(recs[0].agent, 'subagent-1', 'the record must name the real sub-agent');
  assert.strictEqual(recs[0].wave, 1);
  assert.deepStrictEqual(recs[0].tasks.sort(), ['t1', 't2'], 'a whole-wave record covers both subtasks');
});

test('a rejected self-dispatch leaves the gate closed; a real one opens it', () => {
  const dir = project();
  assert.strictEqual(run(['decompose', '--tasks', tasksJson([
    { id: 't1', name: 'A', depends: [], affectedFiles: ['a.js'] },
    { id: 't2', name: 'B', depends: [], affectedFiles: ['b.js'] },
  ])], dir).code, 0, 'decompose must succeed first');
  driveToImplementation(dir, ['t1', 't2']);

  // The gate needs dispatchMode != serial and a dispatches field to exist. The default is
  // now serial, so this fixture explicitly opts into parallel to arm the gate -- that
  // opt-in is exactly what makes dispatch records mandatory.
  assert.strictEqual(run(['dispatch-mode', 'parallel'], dir).code, 0, 'opt-in must succeed');
  const stored = JSON.parse(fs.readFileSync(path.join(dir, '.hello-dev/state.json'), 'utf8'));
  assert.strictEqual(stored.decomposition.dispatchMode, 'parallel', 'fixture must opt into parallel mode');
  assert.ok(Array.isArray(stored.decomposition.dispatches), 'fixture must carry the dispatches field');

  assert.notStrictEqual(run(['dispatch', '--wave', '1', '--agent', 'main-agent'], dir).code, 0,
    'the self-dispatch itself must be refused');
  const blocked = run(['stage', 'implementation', 'completed'], dir);
  assert.notStrictEqual(blocked.code, 0,
    'an attempted self-dispatch must not satisfy the gate: ' + blocked.out);
  assert.match(blocked.out, /requires every parallel subtask dispatched/, 'gate must say why: ' + blocked.out);
  assert.match(blocked.out, /wave 1/, 'gate must name the outstanding wave: ' + blocked.out);

  assert.strictEqual(run(['dispatch', '--wave', '1', '--agent', 'subagent-1'], dir).code, 0,
    'the real dispatch must be recorded');
  assert.strictEqual(run(['stage', 'implementation', 'completed'], dir).code, 0,
    'the gate must open only once a real sub-agent is named');
});

test('dispatch-waive still satisfies the gate (a waiver is exempt from the agent rule)', () => {
  const dir = project();
  assert.strictEqual(run(['decompose', '--tasks', tasksJson([
    { id: 't1', name: 'A', depends: [], affectedFiles: ['a.js'] },
    { id: 't2', name: 'B', depends: [], affectedFiles: ['b.js'] },
  ])], dir).code, 0, 'decompose must succeed first');
  // A1: arm the gate by opting into parallel dispatch.
  run(['dispatch-mode', 'parallel'], dir);
  driveToImplementation(dir, ['t1', 't2']);
  assert.notStrictEqual(run(['stage', 'implementation', 'completed'], dir).code, 0, 'gate should block first');

  assert.strictEqual(run(['dispatch-waive', '--wave', '1', '--reason', 'host has no sub-agent tool'], dir).code, 0,
    'a waiver must remain the documented escape hatch');
  assert.strictEqual(run(['stage', 'implementation', 'completed'], dir).code, 0,
    'a recorded waiver must open the gate without naming any agent');
});

test('isSelfAgentName denies the main agent and accepts real sub-agent names', () => {
  const denied = [
    'main-agent', 'main', 'self', 'none', 'null', 'n/a', 'waived', 'skip', 'local',
    'inline', 'myself', '', '   ', 'sub-agent: main-agent', 'agent:main',
    'main agent', 'Main_Agent', 'MAIN-AGENT', '  main  ',
    // Separator variants. Regression: an earlier version collapsed only `\s`, `_` and `-`, so
    // `main.agent` was ACCEPTED, wrote a dispatch record, and opened the Implementation gate —
    // the exact loophole this rule exists to close. Any enumerated separator list is a guess,
    // so the rule now drops every non-alphanumeric character.
    'main.agent', 'main/agent', 'main\\agent', 'main:agent', 'main|agent', 'main,agent',
    'MAIN.AGENT', ' main.agent ', 'main\tagent', 'm-a-i-n', 'main＿agent',
    // Role/placeholder phrases that name no distinct actor.
    'agent', 'subagent', 'sub-agent', 'the main agent', 'main (self)', 'main main agent',
    'main self', 'main and self', 'it is the main agent', 'a main agent', 'none-agent', 'me',
  ];
  for (const name of denied) {
    assert.strictEqual(LIB.isSelfAgentName(name), true,
      JSON.stringify(name) + ' must be treated as the main agent');
  }
  const accepted = [
    'subagent-1', 'dev-a', 'codex-1', 'worker-2', 'tencent-docs',
    'agent-teammate-1', 'subtask-t3-runner', 'verifier',
    // Must not over-reject: these merely CONTAIN a role word, they do not consist of one.
    'mainframe-worker', 'self-healing-agent', 'nonexistent-check', 'maintainer',
    'mainline-dev', 'me-1', 'noah', 'skipjack', 'localizer', 'agent-of-record',
    'hello-dev-team-lead', 'hello-dev-scope-gatekeeper',
  ];
  for (const name of accepted) {
    assert.strictEqual(LIB.isSelfAgentName(name), false,
      JSON.stringify(name) + ' must be treated as a real delegated sub-agent');
  }
  assert.ok(LIB.SELF_AGENT_NAMES instanceof Set, 'SELF_AGENT_NAMES must be exported as a Set');
});

test('separator bypasses cannot open the gate through the CLI', () => {
  // The library test above pins the predicate; this pins the end-to-end consequence, which is
  // what actually matters: a bypass must not produce a record, and therefore cannot satisfy
  // `stage implementation completed`.
  const dir = project();
  assert.strictEqual(run(['decompose', '--tasks', tasksJson([
    { id: 't1', name: 'A', depends: [], affectedFiles: ['a.js'] },
    { id: 't2', name: 'B', depends: [], affectedFiles: ['b.js'] },
  ])], dir).code, 0, 'decompose must succeed first');
  // A1: arm the gate by opting into parallel dispatch.
  run(['dispatch-mode', 'parallel'], dir);

  for (const agent of ['main.agent', 'main/agent', 'the main agent', 'agent']) {
    const r = run(['dispatch', '--wave', '1', '--agent', agent], dir);
    assert.notStrictEqual(r.code, 0,
      JSON.stringify(agent) + ' must be rejected: ' + r.out);
  }
  assert.deepStrictEqual(dispatches(dir), [],
    'no rejected self-dispatch may leave a record behind');

  // With no record, the gate must still refuse.
  driveToImplementation(dir, ['t1', 't2']);
  assert.notStrictEqual(run(['stage', 'implementation', 'completed'], dir).code, 0,
    'the gate must remain closed after only rejected self-dispatch attempts');
});

test('validate rejects a stored dispatch record whose agent is the main agent', () => {
  const dir = project();
  assert.strictEqual(run(['decompose', '--tasks', tasksJson([
    { id: 't1', name: 'A', depends: [], affectedFiles: ['a.js'] },
    { id: 't2', name: 'B', depends: [], affectedFiles: ['b.js'] },
  ])], dir).code, 0, 'decompose must succeed first');
  const f = path.join(dir, '.hello-dev/state.json');
  const s = JSON.parse(fs.readFileSync(f, 'utf8'));
  // A record smuggled in outside the CLI (e.g. hand-edited) must not validate either.
  s.decomposition.dispatches = [{ wave: 1, tasks: ['t1', 't2'], agent: 'main-agent', at: new Date().toISOString() }];
  fs.writeFileSync(f, JSON.stringify(s, null, 2));
  const bad = run(['validate'], dir);
  assert.notStrictEqual(bad.code, 0, 'a main-agent dispatch record must fail validation: ' + bad.out);
  assert.match(bad.out, /main agent/, 'the error must say the agent denotes the main agent: ' + bad.out);

  // A waived record is exempt, so serial execution stays authorizable.
  s.decomposition.dispatches = [{ wave: 1, tasks: ['t1', 't2'], agent: 'main-agent', waived: true,
    reason: 'no sub-agent tool', at: new Date().toISOString() }];
  fs.writeFileSync(f, JSON.stringify(s, null, 2));
  assert.strictEqual(run(['validate'], dir).code, 0,
    'a waived record must remain valid: ' + run(['validate'], dir).out);
});

console.log('');
console.log(`test-decomposition.js: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
