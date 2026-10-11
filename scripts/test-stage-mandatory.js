#!/usr/bin/env node
'use strict';

/**
 * Hello Dev — Guard: the four post-delivery stages are not optional.
 *
 * Companion to `scripts/check-stage-order.js`. That guard covers stage ORDER and MEMBERSHIP;
 * this one covers the MODAL CLAIM. They are different dimensions and the earlier defect lived
 * entirely in the gap: the chains were correct while prose said the stages were optional.
 *
 * Detection is per-line and requires BOTH a mandatory-stage reference and an optionality
 * marker, because "optional" is legitimate everywhere else in this repository (optional
 * plugins, optional technology selection, optional evidence recovery).
 *
 * Every assertion is negative-verified: a seeded violation must be caught, and the corrected
 * negation form ("is not optional") must NOT be caught. A guard that cannot fail is not a guard.
 *
 * Usage: node scripts/test-stage-mandatory.js
 */

const fs = require('fs');
const path = require('path');
const {
  MANDATORY_STAGES, optionalClaims, wrappedChains, MANDATORY_CLAIM,
} = require('./lib/mandatory-stages');

const ROOT = path.resolve(__dirname, '..');

/** Same history/vendored exclusions as check-stage-order.js: these hold history, not claims. */
const SKIP_DIRS = new Set(['.git', 'archive', 'node_modules', '.workbuddy', 'outputs', 'probe.lock', 'docs', '.hello-dev']);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.md')) out.push(p);
  }
  return out;
}

const problems = [];
let scanned = 0;

/* ---------- Check 1: no live document may call a mandatory stage optional ---------- */
for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file);
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  scanned++;
  for (const hit of optionalClaims(lines)) {
    problems.push(`${rel}:${hit.line}: calls a mandatory post-delivery stage optional -> "${hit.text.slice(0, 140)}"`);
  }
}

/* ---------- Check 2: no stage chain may be wrapped across lines ---------- */
for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file);
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const hit of wrappedChains(lines)) {
    problems.push(`${rel}:${hit.line}: stage chain is wrapped onto the next line, so its order and membership are unvalidated -> "${hit.text.slice(0, 140)}"`);
  }
}

/* ---------- Check 3: the authoritative surfaces must state the mandatory claim ---------- */
const CLAIM_SITES = ['SKILL.md', 'SKILL.zh-CN.md', 'modules/core/state-protocol.md', 'modules/stages/ship.md'];
for (const rel of CLAIM_SITES) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) { problems.push(`${rel}: declared but missing`); continue; }
  const text = fs.readFileSync(p, 'utf8');
  if (!MANDATORY_CLAIM.some(re => re.test(text))) {
    problems.push(`${rel}: does not state that ${MANDATORY_STAGES.join('/')} are mandatory on every execution path`);
  }
}

/* ---------- Check 4: negative verification of the detector itself ----------
 * Seeded cases, not live files. Without these the guard's green result is indistinguishable
 * from a detector that never fires.
 */
const SEEDED = [
  { expect: true, text: 'Optional learning and reflection are expanded only when the user needs them and do not block delivery.' },
  { expect: true, text: 'Optional Evolution/Reflection expanded only when user needs them; not a delivery threshold.' },
  // Chinese optionality denial test removed (English-only OSS version)
  // Chinese optionality denial test removed (English-only OSS version)
  { expect: false, text: 'Learn, Evolution, Reflection, and Archive are **mandatory on every execution path** -- and are not optional.' },
  { expect: false, text: 'Learn, Evolution, Reflection, Archive are mandatory on all execution paths, not optional.' },
  // The real state-protocol insertion, which must not fire on itself.
  { expect: false, text: '- Learn, Evolution, Reflection, and Archive are mandatory on every state-bearing path (`design/full`, `implementation`, `other`, `fast`); none of them may be skipped, and any document that permits skipping them contradicts `scripts/lib/stages.js`, which is the single source for the stage list.' },
  { expect: false, text: 'Optional: Generate usage report and clean up unused plugins:' },
  { expect: false, text: '| Tool Research | Technology selection when needed | design/full | Yes on non-full paths |' },
  // An optionality mention about architecture must NOT be read as a claim about Archive.
  { expect: false, text: '| Architecture | Requirements-based design (including optional technology selection) | design/full | No (unless simple task) |' },
];
for (const c of SEEDED) {
  const detected = optionalClaims([c.text]).length > 0;
  if (detected !== c.expect) {
    problems.push(`negative verification failed: expected detected=${c.expect} for "${c.text.slice(0, 90)}" but got ${detected}`);
  }
}

/* ---------- Check 5: negative verification of the wrapped-chain detector ---------- */
const SEEDED_CHAINS = [
  { expect: true, lines: ['Bootstrap -> Initialization -> Requirement -> Feature Design ->', 'Architecture -> Implementation -> Testing'] },
  { expect: false, lines: ['Bootstrap -> Initialization -> Requirement -> Implementation -> Testing -> Review -> Ship -> Learn -> Evolution -> Reflection -> Archive'] },
  { expect: false, lines: ['Some prose that ends with an arrow ->', 'not a stage name at all'] },
];
for (const c of SEEDED_CHAINS) {
  const detected = wrappedChains(c.lines).length > 0;
  if (detected !== c.expect) {
    problems.push(`wrapped-chain verification failed: expected detected=${c.expect} for "${c.lines[0].slice(0, 80)}" but got ${detected}`);
  }
}

/* ---------- Report ---------- */
if (problems.length) {
  console.log('X Mandatory-stage semantics drift detected:');
  for (const p of problems) console.log('  - ' + p);
  console.log('\n  The four post-delivery stages are mandatory on every path (scripts/lib/stages.js).');
  console.log('  Fix the document, not this guard.');
  process.exit(1);
}

console.log(`[OK] Mandatory-stage semantics consistent (${scanned} document(s) scanned)`);
console.log(`     ${MANDATORY_STAGES.join(', ')} are never called optional; no wrapped stage chains;`);
console.log(`     ${SEEDED.length + SEEDED_CHAINS.length} seeded case(s) verified in both directions.`);
