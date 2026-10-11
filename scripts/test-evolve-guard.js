#!/usr/bin/env node
'use strict';

/**
 * evolve-guard.js standalone tests (pure function layer)
 *
 * Division of labor with test-evolve.js:
 *   - test-evolve.js tests CLI behavior (json(['evaluate', ...]))
 *   - test-evolve-guard.js tests guard pure functions (calling validateSchema etc. directly)
 *
 * Coverage:
 *   1. FORBIDDEN_PATTERNS hits (5 regexes)
 *   2. FORBIDDEN_PATTERNS evasion ("rewording" cases)
 *   3. validateSchema valid and invalid
 *   4. validateBudget valid and invalid
 *   5. validateCandidates valid and invalid
 *   6. validateEvaluations valid and invalid
 *   7. Mutation counterproof (FORBIDDEN_PATTERNS emptied, validateSchema always true, validateBudget always true)
 */

const assert = require('node:assert/strict');
const guard = require('./lib/evolve-guard');

let pass = 0, failN = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`  [OK] ${name}`); }
  else { failN++; console.log(`  [FAIL] ${name} -- ${detail || ''}`); }
}

// -- 1. FORBIDDEN_PATTERNS hits --
console.log('-- 1. FORBIDDEN_PATTERNS hits (5 regexes) --');
const hitCases = [
  ['approval-rule', '// approval rule allow all'],
  ['scorer', 'const scorer = { grade: () => 100 }'],
  ['protected-test', '// protected test suite'],
  ['git-side-effect', '# git push deploy'],
  ['stage-skip', '# skip testing'],
];
for (const [id, text] of hitCases) {
  const hits = guard.checkForbidden(text);
  ok(`[${id}] hit`, hits.some(h => h.id === id), JSON.stringify(hits.map(h => h.id)));
}

// -- 2. FORBIDDEN_PATTERNS evasion --
console.log('-- 2. FORBIDDEN_PATTERNS evasion ("rewording" cases) --');
const evadeCases = [
  ['"score results"', '// this module scores results, deciding pass or fail'],
  ['"evaluation mechanism"', '// evaluation mechanism: score above 80 passes'],
  ['"quality gate"', '// quality gate: must pass review'],
];
for (const [label, text] of evadeCases) {
  const hits = guard.checkForbidden(text);
  ok(`[${label}] evades (guard layer allows)`, hits.length === 0, JSON.stringify(hits.map(h => h.id)));
}

// -- 3. validateSchema --
console.log('-- 3. validateSchema valid and invalid --');
const validState = {
  schema: 1, mode: 'observe', candidates: [], evaluations: [],
  budget: { maxCandidates: 10, maxEvaluations: 20, used: 0, stopped: null },
  createdAt: '2026-09-29T00:00:00.000Z', updatedAt: '2026-09-29T00:00:00.000Z',
};
ok('valid state passes', guard.validateSchema(validState).ok);

ok('wrong schema version -> reject', !guard.validateSchema({...validState, schema: 2}).ok);
ok('invalid mode -> reject', !guard.validateSchema({...validState, mode: 'auto'}).ok);
ok('candidates not array -> reject', !guard.validateSchema({...validState, candidates: 'nope'}).ok);
ok('evaluations not array -> reject', !guard.validateSchema({...validState, evaluations: null}).ok);
ok('budget not object -> reject', !guard.validateSchema({...validState, budget: 123}).ok);
ok('invalid createdAt -> reject', !guard.validateSchema({...validState, createdAt: 'not-a-date'}).ok);

// -- 4. validateBudget --
console.log('-- 4. validateBudget valid and invalid --');
const validBudget = { maxCandidates: 10, maxEvaluations: 20, used: 0, stopped: null };
ok('valid budget passes', guard.validateBudget(validBudget).ok);

ok('empty object -> reject', !guard.validateBudget({}).ok);
ok('negative maxCandidates -> reject', !guard.validateBudget({...validBudget, maxCandidates: -1}).ok);
ok('float used -> reject', !guard.validateBudget({...validBudget, used: 1.5}).ok);
ok('string stopped -> reject', !guard.validateBudget({...validBudget, stopped: 'oops'}).ok);
ok('invalid stopped.at -> reject', !guard.validateBudget({...validBudget, stopped: {at: 'bad', reason: 'x'}}).ok);
ok('blank stopped.reason -> reject', !guard.validateBudget({...validBudget, stopped: {at: new Date().toISOString(), reason: '  '}}).ok);
ok('negative maxElapsedMs -> reject', !guard.validateBudget({...validBudget, maxElapsedMs: -100}).ok);
ok('invalid startedAt -> reject', !guard.validateBudget({...validBudget, startedAt: 'not-a-date'}).ok);
ok('backward compatible: missing maxElapsedMs/startedAt not invalid', guard.validateBudget({...validBudget}).ok);

// -- 5. validateCandidates --
console.log('-- 5. validateCandidates valid and invalid --');
ok('empty array passes', guard.validateCandidates([]).ok);
ok('valid element passes', guard.validateCandidates([{path: '/x', status: 'pending'}]).ok);
ok('not array -> reject', !guard.validateCandidates('nope').ok);
ok('element contains null -> reject', !guard.validateCandidates([null]).ok);
ok('element missing path -> reject', !guard.validateCandidates([{status: 'pending'}]).ok);
ok('element missing status -> reject', !guard.validateCandidates([{path: '/x'}]).ok);
ok('path not string -> reject', !guard.validateCandidates([{path: 123, status: 'pending'}]).ok);

// -- 6. validateEvaluations --
console.log('-- 6. validateEvaluations valid and invalid --');
ok('empty array passes', guard.validateEvaluations([]).ok);
ok('valid element passes', guard.validateEvaluations([{verdict: 'REJECTED', at: '2026-09-29T00:00:00.000Z'}]).ok);
ok('not array -> reject', !guard.validateEvaluations(null).ok);
ok('element contains null -> reject', !guard.validateEvaluations([null]).ok);
ok('element missing verdict -> reject', !guard.validateEvaluations([{at: '2026-09-29T00:00:00.000Z'}]).ok);
ok('element missing at -> reject', !guard.validateEvaluations([{verdict: 'REJECTED'}]).ok);
ok('invalid at -> reject', !guard.validateEvaluations([{verdict: 'REJECTED', at: 'bad'}]).ok);

// -- 7. Mutation counterproof --
console.log('-- 7. Mutation counterproof (guard module discriminating power) --');

// 7a. FORBIDDEN_PATTERNS emptied -> hit tests must turn red
{
  const orig = [...guard.FORBIDDEN_PATTERNS];
  guard.FORBIDDEN_PATTERNS.length = 0;  // empty
  const hits = guard.checkForbidden('// approval rule');
  ok('checkForbidden returns empty after FORBIDDEN_PATTERNS emptied', hits.length === 0);
  guard.FORBIDDEN_PATTERNS.push(...orig);  // restore
}

// 7b. validateSchema always returns true -> invalid input tests must turn red
// (cannot test directly since validateSchema is a module-exported function, can't "replace" it)
// Instead: assert validateSchema returns non-empty reasons for invalid input
{
  const r = guard.validateSchema({schema: 999, mode: 'auto'});
  ok('validateSchema returns reasons for invalid input', !r.ok && r.reasons.length > 0, JSON.stringify(r));
}

// 7c. validateBudget always returns true -> invalid input tests must turn red
// Same approach: assert validateBudget returns non-empty reasons for invalid input
{
  const r = guard.validateBudget({maxCandidates: -1});
  ok('validateBudget returns reasons for invalid input', !r.ok && r.reasons.length > 0, JSON.stringify(r));
}

// -- summary --
console.log(`\n=== evolve-guard.js: ${pass} passed / ${failN} failed ===`);
process.exitCode = failN ? 1 : 0;
