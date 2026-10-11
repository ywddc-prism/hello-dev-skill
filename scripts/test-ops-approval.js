#!/usr/bin/env node
'use strict';

/**
 * ops-approval.js unit tests
 * Execution intent digest and approval credential semantic boundaries.
 * Run: node scripts/test-ops-approval.js
 */

const assert = require('assert');
const A = require('./lib/ops-approval.js');

const base = {
  command: 'systemctl restart nginx',
  cwd: '/etc/nginx',
  target: 'staging/web-01',
  source: 'runbooks/nginx.md',
  sourceDigest: 'a'.repeat(64),
  purpose: 'Load verified new configuration',
  risk: { disposition: 'approval_required', risk: 'L3', reason: 'systemd state change: restart' },
};

/* ---------- Digest stability ---------- */
const d = A.calculateStepDigest(base);
assert.match(d, /^[a-f0-9]{64}$/, 'stepDigest must be 64-char hex');

// JSON key order should not affect digest — otherwise meaningless key order
// changes would invalidate approval credentials
assert.strictEqual(
  A.calculateStepDigest({ purpose: 'p', command: 'x', target: 't' }),
  A.calculateStepDigest({ command: 'x', target: 't', purpose: 'p' }),
  'Key order must not affect digest');

// Default field normalization: null and default must be equivalent, otherwise
// "not written" and "written as null" would produce different approvals
assert.strictEqual(
  A.calculateStepDigest({ command: 'x', cwd: null }),
  A.calculateStepDigest({ command: 'x' }),
  'Default and null must be equivalent');

/* ---------- Intent validation ---------- */
assert.throws(() => A.calculateStepDigest({}), /command/);
assert.throws(() => A.calculateStepDigest({ command: '   ' }), /command/);
assert.throws(() => A.calculateStepDigest(null), /command/);

/* ---------- Declared environment ---------- */
//
// The environment is a declared closed enum, not inferred from the free-text target.
// Inference was measured unsound: substring-matching would flag `preprod`/`nonprod` as
// production and miss a genuine production target named `payment-cluster`. A wrong
// "not production" silently skips the interruption-risk assessment (ops-execution.md 3.2),
// which is why an unknown value must be rejected rather than coerced to a default.
assert.deepStrictEqual(A.ENVIRONMENTS, ['prod', 'staging', 'dev'], 'Enum values are part of the contract');
for (const ok of ['prod', 'staging', 'dev']) {
  assert.strictEqual(A.isValidEnvironment(ok), true, `${ok} must be accepted`);
}
for (const bad of ['production', 'PROD', 'preprod', 'nonprod', '', null, undefined, 'prod ', 1]) {
  assert.strictEqual(A.isValidEnvironment(bad), false, `${JSON.stringify(bad)} must be rejected, not coerced`);
}

// The declared environment must bind into the digest: the same command aimed at prod and
// at staging carry different obligations, so an approval for one must not cover the other.
const digestStaging = A.calculateStepDigest({ ...base, env: 'staging' });
const digestProd = A.calculateStepDigest({ ...base, env: 'prod' });
assert.notStrictEqual(digestStaging, digestProd, 'Declared environment must change the digest');

// Omitting env and writing null must stay equivalent to each other (default normalization),
// but must NOT be equivalent to any declared value -- otherwise an undeclared step would
// silently inherit a declared one's approval.
assert.strictEqual(
  A.calculateStepDigest({ command: 'x', env: null }),
  A.calculateStepDigest({ command: 'x' }),
  'Absent env and null env must be equivalent');
assert.notStrictEqual(
  A.calculateStepDigest({ command: 'x' }),
  A.calculateStepDigest({ command: 'x', env: 'prod' }),
  'Undeclared must not equal declared');

// An approval issued for staging must be rejected when the step is re-declared as prod.
{
  const stgIntent = { ...base, env: 'staging' };
  const ap = A.createApproval(stgIntent, {
    approvedBy: 'reviewer', confirmedStepDigest: A.calculateStepDigest(stgIntent), ttlSeconds: 300,
  });
  const r = A.verifyApproval({ ...base, env: 'prod' }, ap);
  assert.strictEqual(r.valid, false, 'Approval for staging must not authorize prod');
  assert.ok(r.reasons.some(x => /stepDigest mismatch/.test(x)), `Expected digest mismatch, got: ${r.reasons.join('; ')}`);
}

/* ---------- Create credential ---------- */
assert.throws(() => A.createApproval(base, { confirmedStepDigest: d }), /approvedBy/);
assert.throws(() => A.createApproval(base, { approvedBy: 'x', confirmedStepDigest: '0'.repeat(64) }), /mismatch/);
assert.throws(() => A.createApproval(base, { approvedBy: 'x', confirmedStepDigest: d, ttlSeconds: 5 }), /ttlSeconds/);
assert.throws(() => A.createApproval(base, { approvedBy: 'x', confirmedStepDigest: d, ttlSeconds: 99999 }), /ttlSeconds/);

const ap = A.createApproval(base, {
  approvedBy: 'Larry',
  confirmedStepDigest: d,
  approvedAt: '2026-09-28T04:00:00Z',
  ttlSeconds: 300,
});
assert.strictEqual(ap.approvalType, 'step_pre_execution');
assert.strictEqual(ap.stepDigest, d);
assert.strictEqual(ap.expiresAt, '2026-09-28T04:05:00.000Z');
assert.match(ap.targetDigest, /^[a-f0-9]{64}$/);

/* ---------- Verify: validity period ---------- */
const inWindow = new Date('2026-09-28T04:02:00Z');
const expired = new Date('2026-09-28T04:06:00Z');
const beforeIssue = new Date('2026-09-28T03:59:00Z');
assert.strictEqual(A.verifyApproval(base, ap, inWindow).valid, true, 'Should pass within validity period');
assert.strictEqual(A.verifyApproval(base, ap, expired).valid, false, 'Must reject when expired');
assert.ok(A.verifyApproval(base, ap, expired).reasons.some(r => /expired/i.test(r)), 'Must give reason when expired');
assert.strictEqual(A.verifyApproval(base, ap, beforeIssue).valid, false, 'Must reject before effective time');

/* ---------- Verify: intent changes ---------- */
const cases = [
  [{ ...base, command: 'systemctl stop nginx' }, /stepDigest/, 'command change'],
  [{ ...base, cwd: '/var/www' }, /stepDigest/, 'working directory change'],
  [{ ...base, target: 'prod/web-01' }, /targetDigest/, 'target change'],
  [{ ...base, sourceDigest: 'b'.repeat(64) }, /source/i, 'source document change'],
  [{ ...base, purpose: 'different purpose' }, /stepDigest/, 'purpose change'],
  [{ ...base, risk: { disposition: 'block', risk: 'L5', reason: 'x' } }, /stepDigest/, 'risk conclusion change'],
];
for (const [mutated, re, label] of cases) {
  const r = A.verifyApproval(mutated, ap, inWindow);
  assert.strictEqual(r.valid, false, `Must fail after ${label}`);
  assert.ok(r.reasons.some(x => re.test(x)), `${label} should give corresponding reason (actual: ${r.reasons.join('; ')})`);
}

/* ---------- Verify: credential itself corrupted ---------- */
assert.strictEqual(A.verifyApproval(base, null, inWindow).valid, false);
assert.strictEqual(A.verifyApproval(base, { approvalType: 'other' }, inWindow).valid, false);
assert.strictEqual(A.verifyApproval(base, { ...ap, approvedBy: '' }, inWindow).valid, false, 'Must reject when approvedBy is empty');
assert.strictEqual(A.verifyApproval(base, { ...ap, expiresAt: 'not-a-date' }, inWindow).valid, false, 'Must reject when timestamp is invalid');

/* ---------- Multiple reasons reported simultaneously ---------- */
const multi = A.verifyApproval({ ...base, command: 'changed' }, { ...ap, expiresAt: '2020-01-01T00:00:00.000Z' }, inWindow);
assert.ok(multi.reasons.length >= 2, `Should report multiple reasons simultaneously, actual: ${multi.reasons.join('; ')}`);

console.log('[OK] ops-approval digest stability, credential creation, validity period, and intent invalidation tests passed');
