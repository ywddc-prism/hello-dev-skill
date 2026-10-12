#!/usr/bin/env node
'use strict';

/**
 * Hello Dev -- Codex sub-agent prompt constructor
 *
 * Reads decomposition from .hello-dev/state.json and generates prompts
 * conforming to modules/hosts/codex.md specification.
 *
 * Usage:
 *   node scripts/codex-prompt.js generate --subtask <id> [--project <name>] [--project-path <abs-path>]
 *   node scripts/codex-prompt.js wave --wave <n> [--project <name>] [--project-path <abs-path>]
 *   node scripts/codex-prompt.js list   # show all subtasks with wave and status
 *
 * Add `--task <id>` (before or after the command) to read a parallel task's
 * decomposition from .hello-dev/state.sibling-<id>.json instead of state.json.
 *
 * Output: JSON to stdout with prompt text ready for mcp__codex_app__create_thread.
 */

const fs = require('fs');
const path = require('path');
// Wave derivation comes from the shared module so the dispatched prompts and the
// printed order table can never describe different execution plans. This file
// previously carried its own recursive copy; the two disagreed on identical state
// (this copy resolved the graph correctly, state.js produced 0 waves).
const decomp = require('./lib/decomposition');

const DIR = '.hello-dev';
const FILE = 'state.json';
// Plan-intent handoff artifact filename. Must match state.js PLAN_INTENT_FILE -- the
// state records this bare name and this module reads the same file. Kept as a literal
// here (not imported) because codex-prompt.js deliberately avoids requiring state.js
// (it is a read-only consumer of the state file, not a writer).
const PLAN_INTENT_FILE = 'plan-intent.md';

/**
 * Read the plan-intent artifact for a state, if one was recorded. Returns '' when
 * absent or unreadable: a missing artifact must not fail prompt generation (the
 * Context block still carries working directory and off-limits), but a present one
 * is injected verbatim.
 */
function readPlanIntent(root, state) {
  var f = state && state.decomposition && state.decomposition.planIntentFile;
  if (!f || typeof f !== 'string') return '';
  if (path.basename(f) !== f) return ''; // reject any directory component (same rule as state.js validate)
  try { return fs.readFileSync(path.join(root, DIR, f), 'utf8').trim(); }
  catch (e) { return ''; }
}

function fail(msg) { console.error('Error: ' + msg); process.exit(1); }

// isStateFile: character-for-character identical to state.js and memory.js
function isStateFile(dir) {
  var d = path.join(dir, DIR);
  if (!fs.existsSync(d)) return false;
  return fs.readdirSync(d).some(function(f) {
    return f === 'memory.json' || f === 'evolve.json' || /^state(\.sibling-.+)?\.json$/.test(f);
  });
}

function findRoot(start) {
  let dir = path.resolve(start || process.cwd());
  for (;;) {
    if (isStateFile(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    if (fs.existsSync(path.join(dir, '.git'))) return null;
    dir = parent;
  }
}

// Task selected by --task. undefined = default main state file (state.json).
let TASK_ID;

// Mirrors state.js validId(): same character class and prototype-key rejection, so a
// typo cannot spell its way out of .hello-dev/ into an arbitrary filename.
function validId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(id) &&
    !['__proto__', 'prototype', 'constructor'].includes(id);
}

function assertTaskId(id) {
  if (id !== undefined && !validId(id)) fail('--task must be a safe 1-64 character identifier (alphanumeric/underscore/hyphen)');
}

// Selection happens only here, mirroring state.js statePath(): omitting --task must keep
// the historical state.json behavior.
function statePath(root, taskId) {
  return taskId
    ? path.join(root, DIR, FILE.replace(/\.json$/, '') + '.sibling-' + taskId + '.json')
    : path.join(root, DIR, FILE);
}

function siblingTaskIds(root) {
  var dir = path.join(root, DIR);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .map(function(f) { return /^state\.sibling-(.+)\.json$/.exec(f); })
    .filter(Boolean)
    .map(function(m) { return m[1]; })
    .filter(validId);
}

function loadState(root) {
  var p = statePath(root, TASK_ID);
  if (!fs.existsSync(p)) {
    var known = siblingTaskIds(root);
    var hint = known.length ? '\n   Known parallel tasks: ' + known.join(', ') : '';
    // Do not silently fall back to state.json: that would generate prompts from the wrong
    // task and dispatch the wrong wave (same rationale as state.js requireRoot()).
    if (TASK_ID !== undefined) fail('--task ' + TASK_ID + ' not found: ' + p + hint);
    fail('No state file found at ' + p + hint);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/**
 * Wave derivation, delegated to scripts/lib/decomposition.js.
 *
 * Kept as a thin wrapper: this file's `fail()` writes to stderr and exits 1, while
 * the shared module throws. Translating here keeps the CLI contract (non-zero exit
 * plus a message containing the offending id) intact for existing expectations.
 * Do not reintroduce a local derivation — a second implementation is exactly how
 * this copy and state.js drifted apart.
 */
function deriveWaves(tasks) {
  try {
    return decomp.deriveWaves(tasks);
  } catch (e) {
    // Preserve the historical wording for an unknown dependency where possible,
    // since it is asserted by tests and read by operators.
    var m = /subtask depends on unknown task: (.+)$/.exec(e.message);
    if (m) fail('Task depends on unknown task ' + m[1]);
    fail(e.message);
  }
}

function buildPrompt(subtask, opts) {
  var projectName = opts.project || 'target project';
  var projectPath = opts.projectPath || process.cwd();
  var affectedFiles = (subtask.affectedFiles || []).join('\n');
  var acceptanceCriteria = (subtask.acceptanceCriteria || []).map(function(c) { return '- ' + c; }).join('\n');
  var planIntent = opts.planIntent || '';

  // "## Context (already established -- do not re-derive)" -- the block the codex.md
  // prompt template specifies but this constructor historically did not emit (codex.md:
  // "codex-prompt.js does not emit a Context block today"). Sub-agents inherit no caller
  // context (decomposition.md constraint 7), so the plan-intent artifact is the side
  // task's only source of the *why* behind the design: layering, data flow, and
  // cross-cutting decisions (e.g. prepare/stream separation, disconnect semantics).
  // When no plan-intent artifact exists the block still appears with the structural
  // context (working directory + off-limits), so its absence is never ambiguous.
  var contextBlock = '## Context (already established -- do not re-derive)\n' +
    '- Working directory (absolute): ' + projectPath + '\n' +
    '- Off-limits (do NOT touch, and why): everything outside the Files list above.\n' +
    (planIntent
      ? '- Global design intent (from .hello-dev/' + PLAN_INTENT_FILE + ') -- read it before changing anything; it carries the layering, data flow, and rationale your subtask must stay consistent with:\n' +
        planIntent.split('\n').map(function(l) { return '  ' + l; }).join('\n') + '\n'
      : '- Global design intent: (none recorded -- ask main agent for the architecture rationale if a decision here would span files beyond your list)\n');

  return 'You are a Hello Dev subtask agent. Implement the following scoped change.\n\n' +
    '## Project\n' + projectName + ' (' + projectPath + ')\n\n' +
    '## Scope\n' + subtask.name + '\n\n' +
    '## Files\nYou may READ and MODIFY only these files:\n' +
    (affectedFiles || '(none declared -- ask main agent for clarification)') + '\n\n' +
    'Do NOT read, modify, or create any other files in this project.\n\n' +
    '## Implementation\n' + (subtask.description || subtask.name) + '\n\n' +
    '## Acceptance Criteria\n' +
    (acceptanceCriteria || '- Changes compile/build without errors\n- Affected regression tests pass\n- No modifications outside the listed files') + '\n\n' +
    '## Constraints\n' +
    '- Do NOT write to .hello-dev/state.json, .hello-dev/memory.json, or any HelloDev state file.\n' +
    '- Do NOT perform any Git operations (add, commit, push, branch, etc.).\n' +
    '- Do NOT ask the user questions. If blocked, describe blockers in your final response.\n' +
    '- Do NOT modify files outside the list above.\n' +
    '- Do NOT create side tasks, threads, or forks.\n' +
    '- Follow Hello Dev four-layer verification on your affected files.\n\n' +
    contextBlock + '\n\n' +
    '## Working Directory\n' + projectPath;
}

function parseFlag(args, name) {
  var idx = args.indexOf('--' + name);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
}

function cmdGenerate(args) {
  var subtaskId = parseFlag(args, 'subtask');
  if (!subtaskId) fail('--subtask <id> required');
  var project = parseFlag(args, 'project');
  var projectPath = parseFlag(args, 'project-path');

  var root = findRoot() || process.cwd();
  var state = loadState(root);
  if (!state.decomposition || !state.decomposition.tasks)
    fail('No decomposition found. Run `node scripts/state.js decompose --tasks ...` first.');

  var subtask = state.decomposition.tasks.find(function(t) { return t.id === subtaskId; });
  if (!subtask) fail('Subtask ' + subtaskId + ' not found. Known: ' + state.decomposition.tasks.map(function(t) { return t.id; }).join(', '));

  var waves = deriveWaves(state.decomposition.tasks);
  var prompt = buildPrompt(subtask, {
    project: project || state.name || 'target project',
    projectPath: projectPath || root,
    planIntent: readPlanIntent(root, state),
  });

  console.log(JSON.stringify({
    subtaskId: subtask.id,
    wave: waves[subtask.id],
    status: subtask.status || 'pending',
    affectedFiles: subtask.affectedFiles || [],
    title: 'HelloDev: ' + subtask.name + ' (' + subtask.id + ')',
    prompt: prompt,
  }, null, 2));
}

function cmdWave(args) {
  var waveNum = parseInt(parseFlag(args, 'wave'), 10);
  if (isNaN(waveNum)) fail('--wave <n> required');
  var project = parseFlag(args, 'project');
  var projectPath = parseFlag(args, 'project-path');

  var root = findRoot() || process.cwd();
  var state = loadState(root);
  if (!state.decomposition || !state.decomposition.tasks) fail('No decomposition found.');

  var waves = deriveWaves(state.decomposition.tasks);
  var waveTasks = state.decomposition.tasks.filter(function(t) { return waves[t.id] === waveNum; });
  if (waveTasks.length === 0) fail('No tasks in wave ' + waveNum);

  var fileMap = {};
  var hasConflict = false;
  waveTasks.forEach(function(t) {
    (t.affectedFiles || []).forEach(function(f) {
      if (fileMap[f]) { hasConflict = true; console.error('Warning: file conflict between ' + fileMap[f] + ' and ' + t.id + ' on ' + f); }
      else fileMap[f] = t.id;
    });
  });

  var planIntent = readPlanIntent(root, state);
  var prompts = waveTasks.map(function(t) {
    return {
      subtaskId: t.id,
      wave: waveNum,
      status: t.status || 'pending',
      affectedFiles: t.affectedFiles || [],
      title: 'HelloDev: ' + t.name + ' (' + t.id + ')',
      prompt: buildPrompt(t, { project: project || state.name || 'target project', projectPath: projectPath || root, planIntent: planIntent }),
    };
  });

  console.log(JSON.stringify({ wave: waveNum, mode: hasConflict ? 'sequential' : 'parallel', taskCount: waveTasks.length, hasFileConflict: hasConflict, tasks: prompts }, null, 2));
}

function cmdList() {
  var root = findRoot() || process.cwd();
  var state = loadState(root);
  if (!state.decomposition || !state.decomposition.tasks) fail('No decomposition found.');

  var waves = deriveWaves(state.decomposition.tasks);
  var sorted = state.decomposition.tasks.slice().sort(function(a, b) { return waves[a.id] - waves[b.id]; });

  console.log(JSON.stringify({ tasks: sorted.map(function(t) {
    return { id: t.id, name: t.name, wave: waves[t.id], status: t.status || 'pending', depends: t.depends || [], affectedFiles: t.affectedFiles || [] };
  }) }, null, 2));
}

// --task is a global selector: accept it before or after the command, mirroring state.js.
// Removing it from the arg list keeps parseFlag() from mistaking its value for a subtask id.
var rawArgv = process.argv.slice(2);
var argv = [];
for (var i = 0; i < rawArgv.length; i++) {
  if (rawArgv[i] === '--task') {
    if (i + 1 >= rawArgv.length || rawArgv[i + 1].indexOf('--') === 0) fail('parameter missing value: --task');
    if (TASK_ID !== undefined) fail('duplicate parameter: --task');
    TASK_ID = rawArgv[++i];
    assertTaskId(TASK_ID);
    continue;
  }
  argv.push(rawArgv[i]);
}

var cmd = argv[0];
var rest = argv.slice(1);
switch (cmd) {
  case 'generate': cmdGenerate(rest); break;
  case 'wave': cmdWave(rest); break;
  case 'list': cmdList(); break;
  default:
    console.log('Usage:\n' +
      '  node scripts/codex-prompt.js generate --subtask <id> [--project <name>] [--project-path <path>] [--task <id>]\n' +
      '  node scripts/codex-prompt.js wave --wave <n> [--project <name>] [--project-path <path>] [--task <id>]\n' +
      '  node scripts/codex-prompt.js list [--task <id>]\n' +
      '  --task <id>  read .hello-dev/state.sibling-<id>.json instead of state.json');
    process.exit(cmd ? 1 : 0);
}
