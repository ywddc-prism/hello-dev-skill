#!/usr/bin/env node
'use strict';

/**
 * Hello Dev — Execution intent approval (stepDigest)
 *
 * Origin: digest and approval semantics from yunwei_loop/approval.js, trimmed
 * for HelloDev's actual needs.
 *
 * Why this is needed: HelloDev's existing `gitdec` only records
 * `{at, decision, reason, stage}` — not bound to any command, not bound to any
 * digest, so the log could be rewritten to say anything after the fact. It proves
 * "someone said yes", but cannot prove "yes to which specific command".
 *
 * stepDigest binds to an **immutable execution intent**: target command line,
 * working directory, target environment, source document digest, risk
 * disposition. Any field change invalidates the old approval immediately.
 *
 * Differences from yunwei_loop (intentional):
 *   - No planner / runbook dependency. HelloDev has no Runbook compiler; the
 *     approval target is a precise command, not a step in an Operation Plan.
 *   - No Review Card generation. Card display is the host conversation layer's
 *     responsibility; this module only manages credentials.
 *   - canonicalize is preserved: without it, JSON key order changes would
 *     cause meaningless digest drift.
 */

const crypto = require('crypto');

const APPROVAL_TYPE = 'step_pre_execution';

/**
 * Declared environments. This is a **closed enum on purpose**.
 *
 * Why declared rather than inferred: the ops gate's interruption-risk obligation
 * (ops-execution.md 3.2) only applies when the target is production. Inferring that
 * from the free-text `target` field was measured to be unsound — `preprod`, `nonprod`
 * and `prod-clone-dev` would all be flagged as production, while a genuine production
 * target named `payment-cluster` would be missed. A wrong "not production" silently
 * skips the assessment, so the environment is declared by the registrant instead of
 * guessed by the tool.
 *
 * `prod` is the only value that requires an interruption-risk assessment.
 */
const ENVIRONMENTS = ['prod', 'staging', 'dev'];

/** Validator shared by the CLI and its tests, so the enum has exactly one definition. */
function isValidEnvironment(value) {
  return typeof value === 'string' && ENVIRONMENTS.includes(value);
}

/**
 * Recursively sort by key before serializing.
 * Without this step, `{a:1,b:2}` and `{b:2,a:1}` would produce different
 * digests, and they express the same intent — approvals would fail due to
 * meaningless key order changes.
 */
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
  }
  return value;
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

/**
 * Normalized structure for execution intent — stepDigest input.
 *
 * `command` must be a precise single command-line text, not a task description.
 * "Fix Nginx" cannot be verified; `systemctl restart nginx` can.
 *
 * @param {object} intent
 * @param {string} intent.command     Precise command line
 * @param {string} [intent.cwd]       Working directory
 * @param {string} [intent.target]    Target environment/resource
 * @param {string} [intent.env]       Declared environment: prod | staging | dev
 * @param {string} [intent.source]    Source document path
 * @param {string} [intent.sourceDigest] Source document SHA-256
 * @param {object} [intent.risk]      Policy conclusion { disposition, risk, reason }
 * @param {string} [intent.purpose]   Operation purpose (for human readability)
 */
function executionIntent(intent) {
  if (!intent || typeof intent.command !== 'string' || !intent.command.trim()) {
    throw new Error('Execution intent must contain a non-empty command');
  }
  return {
    schemaVersion: 1,
    command: intent.command.trim(),
    cwd: intent.cwd || null,
    target: intent.target || null,
    env: intent.env || null,
    source: intent.source || null,
    sourceDigest: intent.sourceDigest || null,
    purpose: intent.purpose || null,
    risk: intent.risk
      ? {
          disposition: intent.risk.disposition || null,
          risk: intent.risk.risk || null,
          reason: intent.risk.reason || null,
        }
      : null,
  };
}

/** Calculate execution intent digest. Takes an intent object, not a plan object. */
function calculateStepDigest(intent) { return digest(executionIntent(intent)); }

/**
 * Generate approval credential.
 *
 * `confirmedStepDigest` is key to anti-automation: the caller must fill back
 * the digest it just showed to the user. An Agent that cannot access the
 * user-typed digest cannot forge a valid credential — this is how "Agents must
 * not create approval evidence on behalf of users" is enforced in code.
 *
 * @param {object} intent      Execution intent (see executionIntent)
 * @param {object} options
 * @param {string} options.approvedBy        Approver (required)
 * @param {string} options.confirmedStepDigest Must equal calculateStepDigest(intent)
 * @param {number} [options.ttlSeconds=300]  30–3600
 * @param {string} [options.approvedAt]      ISO timestamp, for testing
 */
function createApproval(intent, options) {
  const normalized = executionIntent(intent);
  const stepDigest = digest(normalized);
  if (!options || typeof options.approvedBy !== 'string' || !options.approvedBy.trim()) {
    throw new Error('approvedBy is required');
  }
  if (options.confirmedStepDigest !== stepDigest) {
    throw new Error('Confirmed digest mismatch; user must review the current step\'s stepDigest');
  }
  const ttlSeconds = options.ttlSeconds === undefined ? 300 : Number(options.ttlSeconds);
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 30 || ttlSeconds > 3600) {
    throw new Error('ttlSeconds must be 30-3600 seconds');
  }
  const approvedAt = options.approvedAt ? new Date(options.approvedAt) : new Date();
  if (!Number.isFinite(approvedAt.getTime())) throw new Error('Invalid approvedAt');
  const expiresAt = new Date(approvedAt.getTime() + ttlSeconds * 1000);
  return {
    schemaVersion: 1,
    approvalType: APPROVAL_TYPE,
    stepDigest,
    intent: normalized,
    targetDigest: digest(normalized.target),
    approvedBy: options.approvedBy.trim(),
    approvedAt: approvedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * Verify whether an approval credential is still valid for the **current**
 * execution intent.
 *
 * Returns a reasons array instead of boolean: failure usually has multiple
 * causes (both expired and command changed), and returning only false would
 * make it impossible to judge what needs re-review.
 */
function verifyApproval(intent, approval, at = new Date()) {
  const reasons = [];
  if (!approval || approval.approvalType !== APPROVAL_TYPE) {
    return { valid: false, reasons: ['Approval credential type is invalid'] };
  }
  let normalized;
  try { normalized = executionIntent(intent); }
  catch (e) { return { valid: false, reasons: [e.message] }; }
  const current = digest(normalized);

  if (approval.stepDigest !== current) reasons.push('stepDigest mismatch; command, target, or context has changed');
  if (approval.targetDigest !== digest(normalized.target)) reasons.push('targetDigest mismatch; target environment has changed');
  if (approval.intent && approval.intent.sourceDigest && normalized.sourceDigest &&
      approval.intent.sourceDigest !== normalized.sourceDigest) {
    reasons.push('Source document digest mismatch; the document the approval was based on has changed');
  }
  if (typeof approval.approvedBy !== 'string' || !approval.approvedBy.trim()) reasons.push('approvedBy is missing');

  const now = at instanceof Date ? at : new Date(at);
  const approvedAt = new Date(approval.approvedAt);
  const expiresAt = new Date(approval.expiresAt);
  if (![now, approvedAt, expiresAt].every(v => Number.isFinite(v.getTime()))) reasons.push('Invalid approval timestamp');
  else {
    if (now < approvedAt) reasons.push('Approval has not yet taken effect');
    if (now >= expiresAt) reasons.push('Approval has expired');
  }
  return { valid: reasons.length === 0, reasons };
}

module.exports = {
  APPROVAL_TYPE,
  ENVIRONMENTS,
  calculateStepDigest,
  canonicalize,
  createApproval,
  digest,
  executionIntent,
  isValidEnvironment,
  verifyApproval,
};
