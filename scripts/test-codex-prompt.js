#!/usr/bin/env node
'use strict';

/**
 * Tests for codex-prompt.js
 */

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var os = require('os');
var child_process = require('child_process');

var SCRIPT = path.join(__dirname, 'codex-prompt.js');
var passed = 0;
var failed = 0;

function test(name, fn) {
  try { fn(); passed++; console.log('  OK: ' + name); }
  catch (e) { failed++; console.log('  FAIL: ' + name + ' -- ' + e.message); }
}

function setupProject(dir) {
  // Create .hello-dev/state.json with decomposition
  var helloDev = path.join(dir, '.hello-dev');
  fs.mkdirSync(helloDev, { recursive: true });
  fs.writeFileSync(path.join(dir, '.git-marker'), '');
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true });

  var state = {
    schema: 1,
    name: 'test-project',
    type: 'implementation',
    path: 'full',
    stages: {},
    decomposition: {
      tasks: [
        { id: 't1', name: 'Data model', depends: [], affectedFiles: ['src/models/user.js'], status: 'pending' },
        { id: 't2', name: 'API endpoint', depends: ['t1'], affectedFiles: ['src/api/user.js'], status: 'pending' },
        { id: 't3', name: 'Frontend form', depends: ['t1'], affectedFiles: ['src/components/Form.vue'], status: 'pending' },
        { id: 't4', name: 'Integration', depends: ['t2', 't3'], affectedFiles: ['src/app.js'], status: 'pending' },
      ],
      dispatchMode: 'parallel',
    },
    metadata: { createdAt: new Date().toISOString() },
  };
  fs.writeFileSync(path.join(helloDev, 'state.json'), JSON.stringify(state, null, 2));

  // Sibling task state (--task selector target). Separate decomposition so a test that
  // reads the wrong file cannot pass by coincidence.
  var sibling = JSON.parse(JSON.stringify(state));
  sibling.name = 'sibling-project';
  sibling.decomposition.tasks = [
    { id: 's1', name: 'Sibling task', depends: [], affectedFiles: ['src/sibling.js'], status: 'pending' },
  ];
  fs.writeFileSync(path.join(helloDev, 'state.sibling-par1.json'), JSON.stringify(sibling, null, 2));

  return dir;
}

function run(args, cwd) {
  var result = child_process.spawnSync('node', [SCRIPT].concat(args), {
    cwd: cwd,
    encoding: 'utf8',
    timeout: 5000,
  });
  return { stdout: result.stdout, stderr: result.stderr, code: result.status };
}

// Setup temp dir
var tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-prompt-test-'));
var projDir = setupProject(tmpBase);

console.log('codex-prompt.js tests (cwd=' + projDir + ')');

test('list shows all 4 tasks with correct waves', function() {
  var r = run(['list'], projDir);
  assert.strictEqual(r.code, 0, 'exit 0; stderr=' + r.stderr);
  var data = JSON.parse(r.stdout);
  assert.strictEqual(data.tasks.length, 4);
  assert.strictEqual(data.tasks[0].wave, 1); // t1
  assert.strictEqual(data.tasks[0].id, 't1');
  // t2, t3 in wave 2
  var wave2 = data.tasks.filter(function(t) { return t.wave === 2; });
  assert.strictEqual(wave2.length, 2);
  // t4 in wave 3
  var wave3 = data.tasks.filter(function(t) { return t.wave === 3; });
  assert.strictEqual(wave3.length, 1);
  assert.strictEqual(wave3[0].id, 't4');
});

test('generate produces prompt for t1', function() {
  var r = run(['generate', '--subtask', 't1', '--project', 'my-app', '--project-path', '/tmp/my-app'], projDir);
  assert.strictEqual(r.code, 0, 'exit 0; stderr=' + r.stderr);
  var data = JSON.parse(r.stdout);
  assert.strictEqual(data.subtaskId, 't1');
  assert.strictEqual(data.wave, 1);
  assert.strictEqual(data.title, 'HelloDev: Data model (t1)');
  assert(data.prompt.indexOf('my-app') >= 0, 'prompt contains project name');
  assert(data.prompt.indexOf('/tmp/my-app') >= 0, 'prompt contains project path');
  assert(data.prompt.indexOf('src/models/user.js') >= 0, 'prompt contains affected file');
  assert(data.prompt.indexOf('Do NOT write to .hello-dev/') >= 0, 'prompt contains constraints');
  assert(data.prompt.indexOf('Do NOT perform any Git') >= 0, 'prompt contains git constraint');
});

test('generate for unknown subtask fails', function() {
  var r = run(['generate', '--subtask', 't999'], projDir);
  assert.notStrictEqual(r.code, 0);
  assert(r.stderr.indexOf('not found') >= 0);
});

test('generate without --subtask fails', function() {
  var r = run(['generate'], projDir);
  assert.notStrictEqual(r.code, 0);
});

test('wave 2 returns t2 and t3 in parallel mode', function() {
  var r = run(['wave', '--wave', '2'], projDir);
  assert.strictEqual(r.code, 0, 'stderr=' + r.stderr);
  var data = JSON.parse(r.stdout);
  assert.strictEqual(data.wave, 2);
  assert.strictEqual(data.taskCount, 2);
  assert.strictEqual(data.mode, 'parallel');
  assert.strictEqual(data.hasFileConflict, false);
});

test('wave 3 returns t4', function() {
  var r = run(['wave', '--wave', '3'], projDir);
  assert.strictEqual(r.code, 0);
  var data = JSON.parse(r.stdout);
  assert.strictEqual(data.taskCount, 1);
  assert.strictEqual(data.tasks[0].subtaskId, 't4');
});

test('wave with file conflict detects and reports', function() {
  // Modify state so t2 and t3 share a file
  var statePath = path.join(projDir, '.hello-dev', 'state.json');
  var state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  state.decomposition.tasks[2].affectedFiles = ['src/api/user.js']; // same as t2
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

  var r = run(['wave', '--wave', '2'], projDir);
  assert.strictEqual(r.code, 0);
  var data = JSON.parse(r.stdout);
  assert.strictEqual(data.mode, 'sequential');
  assert.strictEqual(data.hasFileConflict, true);

  // Restore
  state.decomposition.tasks[2].affectedFiles = ['src/components/Form.vue'];
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
});

test('prompt contains all required sections', function() {
  var r = run(['generate', '--subtask', 't2'], projDir);
  var data = JSON.parse(r.stdout);
  var p = data.prompt;
  assert(p.indexOf('## Project') >= 0);
  assert(p.indexOf('## Scope') >= 0);
  assert(p.indexOf('## Files') >= 0);
  assert(p.indexOf('## Implementation') >= 0);
  assert(p.indexOf('## Acceptance Criteria') >= 0);
  assert(p.indexOf('## Constraints') >= 0);
  assert(p.indexOf('## Working Directory') >= 0);
});

test('no decomposition gives clear error', function() {
  var emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-prompt-empty-'));
  fs.mkdirSync(path.join(emptyDir, '.git'), { recursive: true });
  var helloDev = path.join(emptyDir, '.hello-dev');
  fs.mkdirSync(helloDev, { recursive: true });
  fs.writeFileSync(path.join(helloDev, 'state.json'), JSON.stringify({
    schema: 1, name: 'empty', type: 'implementation', stages: {}, metadata: {},
  }));
  var r = run(['list'], emptyDir);
  assert.notStrictEqual(r.code, 0);
  assert(r.stderr.indexOf('No decomposition') >= 0);
});

// --- --task selector (regression: parallel waves could not be read at all) ---
// Before this fix loadState() hardcoded state.json and had no selector, so every
// documented prompt-generation command failed for a --task sibling wave.

test('--task reads the sibling state, not state.json', function() {
  var r = run(['list', '--task', 'par1'], projDir);
  assert.strictEqual(r.code, 0, 'exit 0; stderr=' + r.stderr);
  var data = JSON.parse(r.stdout);
  assert.strictEqual(data.tasks.length, 1, 'must read sibling decomposition');
  assert.strictEqual(data.tasks[0].id, 's1');
});

test('--task works when placed before the command', function() {
  var r = run(['--task', 'par1', 'list'], projDir);
  assert.strictEqual(r.code, 0, 'exit 0; stderr=' + r.stderr);
  assert.strictEqual(JSON.parse(r.stdout).tasks[0].id, 's1');
});

test('wave generation works for a sibling task', function() {
  var r = run(['wave', '--wave', '1', '--task', 'par1'], projDir);
  assert.strictEqual(r.code, 0, 'exit 0; stderr=' + r.stderr);
  var data = JSON.parse(r.stdout);
  assert.strictEqual(data.taskCount, 1);
  assert.strictEqual(data.tasks[0].subtaskId, 's1');
  assert(data.tasks[0].prompt.indexOf('src/sibling.js') >= 0, 'prompt uses sibling affectedFiles');
});

test('--task must not fall back to state.json when sibling is missing', function() {
  var r = run(['list', '--task', 'ghost'], projDir);
  assert.notStrictEqual(r.code, 0, 'missing sibling must fail, not read state.json');
  assert(r.stderr.indexOf('not found') >= 0, 'error should say not found; got: ' + r.stderr);
  assert(r.stderr.indexOf('Known parallel tasks') >= 0, 'error should list known siblings');
});

test('--task rejects an unsafe identifier', function() {
  var r = run(['list', '--task', '../escape'], projDir);
  assert.notStrictEqual(r.code, 0);
  assert(r.stderr.indexOf('safe 1-64 character identifier') >= 0, 'got: ' + r.stderr);
});

test('--task requires a value and rejects duplicates', function() {
  var missing = run(['list', '--task'], projDir);
  assert.notStrictEqual(missing.code, 0);
  assert(missing.stderr.indexOf('parameter missing value') >= 0, 'got: ' + missing.stderr);

  var dup = run(['--task', 'par1', '--task', 'par2', 'list'], projDir);
  assert.notStrictEqual(dup.code, 0);
  assert(dup.stderr.indexOf('duplicate parameter') >= 0, 'got: ' + dup.stderr);
});

test('omitting --task keeps historical state.json behavior', function() {
  var r = run(['list'], projDir);
  assert.strictEqual(r.code, 0, 'exit 0; stderr=' + r.stderr);
  var data = JSON.parse(r.stdout);
  assert.strictEqual(data.tasks.length, 4, 'default path must still read state.json');
});

// ---- Plan-intent handoff (A2): Context block injection ----

test('prompt always carries a Context block even with no plan-intent artifact', function() {
  // Fixture state has no planIntentFile: the block must still appear (working dir +
  // off-limits), so its absence is never ambiguous to the side task.
  var r = run(['generate', '--subtask', 't1'], projDir);
  assert.strictEqual(r.code, 0, 'exit 0; stderr=' + r.stderr);
  var prompt = JSON.parse(r.stdout).prompt;
  assert(prompt.indexOf('## Context (already established -- do not re-derive)') >= 0,
    'Context block must always be emitted (codex.md prompt template requires it)');
  assert(prompt.indexOf('none recorded') >= 0,
    'without an artifact the block must say the design intent is not recorded, not omit the topic');
});

test('plan-intent artifact is injected verbatim into the Context block', function() {
  // Write the artifact and point the state at it -- mirrors what `decompose --plan-intent`
  // does in state.js (this suite builds fixtures by hand, it does not shell out to state.js).
  var intent = 'Layering: controller -> service -> repository. Cross-cutting: prepare()/stream() separation.';
  fs.writeFileSync(path.join(projDir, '.hello-dev', 'plan-intent.md'), intent + '\n');
  var statePath = path.join(projDir, '.hello-dev', 'state.json');
  var st = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  st.decomposition.planIntentFile = 'plan-intent.md';
  fs.writeFileSync(statePath, JSON.stringify(st, null, 2));

  var r = run(['generate', '--subtask', 't1'], projDir);
  assert.strictEqual(r.code, 0, 'exit 0; stderr=' + r.stderr);
  var prompt = JSON.parse(r.stdout).prompt;
  assert(prompt.indexOf(intent) >= 0, 'prompt must contain the artifact text verbatim: ' + prompt.slice(prompt.indexOf('## Context'), prompt.indexOf('## Context') + 300));
  assert(prompt.indexOf('plan-intent.md') >= 0, 'prompt must cite the artifact file so the side task knows the source');

  // Wave mode must inject the same block (all prompts in a wave share one artifact).
  var w = run(['wave', '--wave', '1'], projDir);
  assert.strictEqual(w.code, 0, 'wave exit 0; stderr=' + w.stderr);
  var waveData = JSON.parse(w.stdout);
  waveData.tasks.forEach(function(t) {
    assert(t.prompt.indexOf(intent) >= 0, 'wave prompt for ' + t.subtaskId + ' must carry the design intent');
  });

  // Restore the fixture to the no-artifact state for any later run order.
  delete st.decomposition.planIntentFile;
  fs.writeFileSync(statePath, JSON.stringify(st, null, 2));
  fs.rmSync(path.join(projDir, '.hello-dev', 'plan-intent.md'), { force: true });
});

test('a directory component in planIntentFile is rejected, not followed', function() {
  // state.js validate enforces the bare-filename rule; this reader must apply the same
  // rule rather than reading an arbitrary path (a path traversal in the state would
  // otherwise let a prompt pull content from outside .hello-dev/).
  var statePath = path.join(projDir, '.hello-dev', 'state.json');
  var st = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  st.decomposition.planIntentFile = '../outside.md';
  fs.writeFileSync(statePath, JSON.stringify(st, null, 2));

  var r = run(['generate', '--subtask', 't1'], projDir);
  assert.strictEqual(r.code, 0, 'exit 0; stderr=' + r.stderr);
  var prompt = JSON.parse(r.stdout).prompt;
  assert(prompt.indexOf('none recorded') >= 0,
    'a planIntentFile with a directory component must be ignored (treated as absent)');

  delete st.decomposition.planIntentFile;
  fs.writeFileSync(statePath, JSON.stringify(st, null, 2));
});

// Cleanup
fs.rmSync(tmpBase, { recursive: true, force: true });

console.log('\ncodex-prompt.js: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed > 0 ? 1 : 0);
