#!/usr/bin/env node
'use strict';

/**
 * Hello Dev — Evolution controller gate validation (pure functions, no I/O)
 *
 * Reason: First step of permission domain separation. If a candidate executor can
 * modify scripts/evolve.js, it can bypass FORBIDDEN_PATTERNS and validate* checks.
 * Extracting this logic into a standalone module means even if a candidate executor
 * can modify evolve.js, it cannot touch the gate (unless it can also modify the guard module).
 *
 * Design constraints:
 *   - All pure functions, no file I/O, no throws
 *   - Returns {ok, reasons} letting caller decide how to handle (evolve.js read() wraps as fail)
 *   - Same convention as scripts/lib/ops-policy.js, ops-approval.js (module.exports = {...})
 *
 * Not in this module:
 *   - enforceBudget() -- modifies passed object (sets stopped) + calls fail(), not pure
 *   - emptyEvolve() -- contains default budget values, is evolve.js responsibility
 *   - read()/write() -- file I/O
 */

const SCHEMA = 1;

// --- Hard gates: unauthorized candidates rejected directly ---
// Execution point of charter S3.1 "benefit cannot offset".
// **Known limitation** (test-evolve section 6 solidifies): text regex can be bypassed by wording.
// This is the "first fence"; the second is that activated is always false in observe mode.
const FORBIDDEN_PATTERNS = [
  { id: 'approval-rule', re: /\b(approval|approval[_-]?rule|permission[_-]?allow)/i,
    why: 'Candidate involves approval rules/permissions, belongs to permanent human scope' },
  { id: 'scorer', re: /\b(scorer|grading|acceptance[_-]?criteria)/i,
    why: 'Candidate involves scorer/acceptance criteria, evaluator must not modify scoring rules' },
  { id: 'protected-test', re: /(protected[\s_-]?test|golden[\s_-]?set)/i,
    why: 'Candidate involves protected test set' },
  { id: 'git-side-effect', re: /\b(git\s+(push|commit|reset)|deploy|rsync\s+--delete)/i,
    why: 'Candidate changes trigger conditions for external side-effect operations (charter S2.1 dual condition)' },
  { id: 'stage-skip', re: /(skip[\s_-]?(testing|review))/i,
    why: 'Candidate skips required Testing/Review' },
];

function checkForbidden(textValue) {
  const hits = [];
  for (const p of FORBIDDEN_PATTERNS) if (p.re.test(textValue)) hits.push(p);
  return hits;
}

// --- State validation: read() call, fail on failure ---
// Extract validation logic from evolve.js read() into pure functions for independent testing.
// All return {ok: bool, reasons: string[]}, no throws.

function validateSchema(state) {
  const reasons = [];
  const object = x => x && typeof x === 'object' && !Array.isArray(x);
  const stamp = v => typeof v === 'string' && Number.isFinite(Date.parse(v));

  if (!object(state)) reasons.push('state is not an object');
  else {
    if (state.schema !== SCHEMA) reasons.push(`schema version mismatch: ${state.schema} != ${SCHEMA}`);
    if (!['observe'].includes(state.mode)) reasons.push(`invalid mode: ${state.mode}`);
    if (!Array.isArray(state.candidates)) reasons.push('candidates is not an array');
    if (!Array.isArray(state.evaluations)) reasons.push('evaluations is not an array');
    if (!object(state.budget)) reasons.push('budget is not an object');
    if (!stamp(state.createdAt)) reasons.push('invalid createdAt');
    if (!stamp(state.updatedAt)) reasons.push('invalid updatedAt');
  }
  return { ok: reasons.length === 0, reasons };
}

function validateBudget(budget) {
  const reasons = [];
  const object = x => x && typeof x === 'object' && !Array.isArray(x);
  const stamp = v => typeof v === 'string' && Number.isFinite(Date.parse(v));
  const nat = v => Number.isSafeInteger(v) && v >= 0;

  if (!object(budget)) {
    reasons.push('budget is not an object');
    return { ok: false, reasons };
  }

  if (!nat(budget.maxCandidates)) reasons.push('maxCandidates must be a non-negative integer');
  if (!nat(budget.maxEvaluations)) reasons.push('maxEvaluations must be a non-negative integer');
  if (!nat(budget.used)) reasons.push('used must be a non-negative integer');

  if (!(budget.stopped === null || (object(budget.stopped) && stamp(budget.stopped.at) &&
      typeof budget.stopped.reason === 'string' && budget.stopped.reason.trim()))) {
    reasons.push('stopped must be null or {at, reason}');
  }

  // Backward compatibility: missing fields treated as "unset", not invalid
  if (budget.maxElapsedMs !== undefined && !nat(budget.maxElapsedMs)) {
    reasons.push('maxElapsedMs must be a non-negative integer (milliseconds)');
  }
  if (budget.startedAt !== undefined && budget.startedAt !== null && !stamp(budget.startedAt)) {
    reasons.push('startedAt must be null or a valid timestamp');
  }

  return { ok: reasons.length === 0, reasons };
}

function validateCandidates(candidates) {
  const reasons = [];
  const object = x => x && typeof x === 'object' && !Array.isArray(x);

  if (!Array.isArray(candidates)) {
    reasons.push('candidates is not an array');
    return { ok: false, reasons };
  }

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (!object(c)) { reasons.push(`candidates[${i}] is not an object`); continue; }
    if (typeof c.path !== 'string') reasons.push(`candidates[${i}].path must be a string`);
    if (typeof c.status !== 'string') reasons.push(`candidates[${i}].status must be a string`);
  }

  return { ok: reasons.length === 0, reasons };
}

function validateEvaluations(evaluations) {
  const reasons = [];
  const object = x => x && typeof x === 'object' && !Array.isArray(x);
  const stamp = v => typeof v === 'string' && Number.isFinite(Date.parse(v));

  if (!Array.isArray(evaluations)) {
    reasons.push('evaluations is not an array');
    return { ok: false, reasons };
  }

  for (let i = 0; i < evaluations.length; i++) {
    const v = evaluations[i];
    if (!object(v)) { reasons.push(`evaluations[${i}] is not an object`); continue; }
    if (typeof v.verdict !== 'string') reasons.push(`evaluations[${i}].verdict must be a string`);
    if (!stamp(v.at)) reasons.push(`evaluations[${i}].at must be a valid timestamp`);
  }

  return { ok: reasons.length === 0, reasons };
}

module.exports = {
  SCHEMA,
  FORBIDDEN_PATTERNS,
  checkForbidden,
  validateSchema,
  validateBudget,
  validateCandidates,
  validateEvaluations,
};
