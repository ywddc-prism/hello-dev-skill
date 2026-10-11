#!/usr/bin/env node
'use strict';

/**
 * Hello Dev — Collaboration matrix consistency check
 *
 * Validates that references/collaboration-matrix.md matches the actual behavior
 * of scripts/state.js and scripts/memory.js.
 *
 * Checks:
 *   1. Stage names ∈ state.js STAGES
 *   2. Memory layers ∈ memory.js LAYERS
 *   3. Ship's hard prerequisite (testing+review) is marked
 *   4. Gate types match state-protocol.md
 *   5. S4.2 generated block structure (no extra/duplicate lines; count is self-consistent)
 *   6. S4.2 generated block matches live skill detection row-by-row (name/source/applicable rule)
 *   7. S4.1 route labels match detector RULES table bidirectionally (including "unclassified" fallback label)
 *
 * Usage: node scripts/check-collaboration-matrix.js
 */

const fs = require('fs');
const path = require('path');

// Single source. A local copy here was worse than useless: it was consumed only as a
// regex vocabulary, so the document was validated against itself — a row naming a stage
// the state machine does not have passed, and deleting rows for stages it does have also
// passed. Stage coverage is now enforced by scripts/check-stage-order.js.
const { STAGES } = require('./lib/stages');
const LAYERS = ['L0', 'L1', 'L2', 'L3', 'L4'];
const GATES = ['checkpoint', 'module-approved', 'gitdec', 'ops', 'hook'];

function fail(msg) {
  console.error(`X ${msg}`);
  process.exit(1);
}

function pass(msg) {
  console.log(`[OK] ${msg}`);
}

// Read the collaboration matrix document. --doc is for testing: adversarial
// cases must run on **copies**. This file is not tracked in version control yet;
// if tests modify it directly and crash midway, they leave a broken document
// with no recovery source — and drift tests are exactly the most likely to
// fail midway.
const argv = process.argv.slice(2);
const docArgIdx = argv.indexOf('--doc');
const matrixPath = docArgIdx >= 0 && argv[docArgIdx + 1]
  ? path.resolve(argv[docArgIdx + 1])
  : path.join(__dirname, '..', 'references', 'collaboration-matrix.md');
if (!fs.existsSync(matrixPath)) {
  fail(`Collaboration matrix document not found: ${matrixPath}`);
}
const content = fs.readFileSync(matrixPath, 'utf8');

// Check 1: Stage names ∈ STAGES
const stagePattern = new RegExp(`\\b(${STAGES.join('|')})\\b`, 'g');
const foundStages = new Set();
let match;
while ((match = stagePattern.exec(content)) !== null) {
  foundStages.add(match[1]);
}
const unknownStages = [...foundStages].filter(s => !STAGES.includes(s));
if (unknownStages.length > 0) {
  fail(`Collaboration matrix contains unknown stages: ${unknownStages.join(', ')}`);
}
pass(`Stage name validation passed (${foundStages.size}/${STAGES.length})`);

// Check 2: Memory layers ∈ LAYERS
const layerPattern = new RegExp(`\\b(${LAYERS.join('|')})\\b`, 'g');
const foundLayers = new Set();
while ((match = layerPattern.exec(content)) !== null) {
  foundLayers.add(match[1]);
}
const unknownLayers = [...foundLayers].filter(l => !LAYERS.includes(l));
if (unknownLayers.length > 0) {
  fail(`Collaboration matrix contains unknown memory layers: ${unknownLayers.join(', ')}`);
}
pass(`Memory layer validation passed (${foundLayers.size}/${LAYERS.length})`);

// Check 3: Ship's hard prerequisite is marked
if (!content.includes('prerequisite testing+review') && !content.includes('prereq testing+review')) {
  fail('Collaboration matrix has not marked ship\'s hard prerequisite (testing+review)');
}
pass('Ship hard prerequisite marked');

// Check 4: Gate types match state-protocol.md
const gatePattern = new RegExp(`\\b(${GATES.join('|')})\\b`, 'g');
const foundGates = new Set();
while ((match = gatePattern.exec(content)) !== null) {
  foundGates.add(match[1]);
}
const unknownGates = [...foundGates].filter(g => !GATES.includes(g));
if (unknownGates.length > 0) {
  fail(`Collaboration matrix contains unknown gate types: ${unknownGates.join(', ')}`);
}
pass(`Gate type validation passed (${foundGates.size}/${GATES.length})`);

// Check 5: All four tables exist
const requiredTables = [
  'Stage x Approval Gate',
  'Stage x Memory Layer',
  'Stage x Deliverable',
  'skill x skill'
];
const missingTables = requiredTables.filter(t => !content.includes(t));
if (missingTables.length > 0) {
  fail(`Collaboration matrix missing tables: ${missingTables.join(', ')}`);
}
pass('All four tables exist');

// Check 6: Related files exist
const relatedFiles = [
  'modules/core/state-protocol.md',
  'references/automation-charter.md',
  'modules/core/approval/git-gate.md',
  'modules/core/approval/ops-execution.md',
  'modules/core/approval/design-flow.md'
];
const missingFiles = relatedFiles.filter(f => !fs.existsSync(path.join(__dirname, '..', f)));
if (missingFiles.length > 0) {
  fail(`Related files missing: ${missingFiles.join(', ')}`);
}
pass('All related files exist');

// Checks 7-9: S4 skill inventory vs live detection comparison.
// This section depends on local disk (whether a certain skill is installed),
// so **must distinguish "root doesn't exist" from "detection failed"**,
// otherwise switching to a machine without plugins would false-fail, while
// the real symlink trap failures get drowned out.
const { detectSkills, analyzeBlock, ruleOf, RULES, BLOCK_BEGIN, BLOCK_END } =
  require('./detect-skills.js');

const block = analyzeBlock(content);
const blockRows = block.rows;
const detection = detectSkills({ cwd: path.join(__dirname, '..') });

// Check 7: Generation markers exist
if (!content.includes(BLOCK_BEGIN) || !content.includes(BLOCK_END)) {
  fail(`S4.2 missing generation markers ${BLOCK_BEGIN} / ${BLOCK_END}; rebuild with node scripts/detect-skills.js --write`);
}
if (blockRows === null) fail('S4.2 generated block format unparseable (markers exist but content invalid)');
pass('S4.2 generation markers exist and are parseable');

// Check 7b: Structure outside the table. Generator only produces
// "blockquote + blank line + table"; prose in the block, handwritten notes
// outside the table, or duplicate lines all indicate manual editing —
// these shapes can't be caught by row-by-row comparison (duplicates get
// swallowed by Map dedup), must be checked separately.
if (block.anomalies.length) {
  fail(`S4.2 generated block has non-table rows (generator never produces these, suspected manual edit): ${block.anomalies.slice(0, 3).map(a => a.slice(0, 60)).join(' | ')}`);
}
if (block.duplicates.length) fail(`S4.2 generated block has duplicate entries: ${block.duplicates.slice(0, 5).join(', ')}`);
pass('S4.2 block structure valid (no extra rows or duplicate entries)');

// Check 8: Report SKIP when judgment is impossible, don't treat "not installed
// on this machine" as a document defect.
//
// Easy-to-get-wrong boundary here: S4.2 is **generated by a specific machine
// and committed to version control**; switching to another machine will almost
// certainly not match — that's not document drift, it's two machines having
// different skill sets. So distinguish three "detection = 0" cases:
//   a) All roots don't exist (new machine / bare env) -> no basis for judgment
//      on this machine, SKIP;
//   b) Roots exist but have no directory entries (empty dir) -> also no basis,
//      SKIP;
//   c) Roots exist, have entries, but 0 skills parsed -> **symlink trap signal,
//      must fail**.
// Only c is the real defect this script should catch.
if (detection.count === 0) {
  const suspicious = detection.roots.filter(r => r.entries > 0 && r.skills === 0);
  if (suspicious.length) {
    fail(`Detected directory entries but parsed 0 skills (symlinks not dereferenced?): ${suspicious.map(r => r.path).join(', ')}`);
  }
  if (!detection.roots.length) {
    console.log(`[SKIP] S4.2 comparison: no skill roots on this machine (${detection.missingRoots} roots don't exist) — cannot judge, not a failure`);
  } else {
    console.log(`[SKIP] S4.2 comparison: all skill roots empty on this machine (${detection.roots.map(r => r.path).join(', ')}) — cannot judge, not a failure`);
  }
  console.log(`   Document S4.2 currently has ${blockRows.length} entries from another machine; refresh on this machine with node scripts/detect-skills.js --write`);
} else {
  // Check 9: Row-by-row comparison (name + source + applicable rule). Using Map
  // not Set — same name different source must be distinguishable.
  // Summary line count also judged here: failing early would short-circuit the
  // row comparison, so "inject one fake skill" would only report count mismatch,
  // with the real cause blocked (observed in practice).
  //
  // Cross-machine tolerance: S4.2 is machine-generated and committed. Different
  // machines have different skill sets, so row-by-row comparison will always
  // fail when switching machines. Set HELLODEV_SKIP_S42_CONTENT=1 to skip the
  // content comparison (stale/missing/relabeled rows) while still validating
  // structure (markers, format, duplicates, count consistency).
  const skipContent = process.env.HELLODEV_SKIP_S42_CONTENT === '1';
  const countMismatch = block.declaredCount !== null && block.declaredCount !== blockRows.length;
  const key = r => `${r.name}\u0000${r.source}`;
  const actual = new Map(detection.skills.map(s => [key(s), ruleOf(s)]));
  const declared = new Map(blockRows.map(r => [key(r), r.rule]));
  const stale = [...declared.keys()].filter(k => !actual.has(k)).map(k => k.replace('\u0000', ' @ '));
  const missing = [...actual.keys()].filter(k => !declared.has(k)).map(k => k.replace('\u0000', ' @ '));
  const relabeled = [...actual.keys()].filter(k => declared.has(k) && declared.get(k) !== actual.get(k))
    .map(k => `${k.replace('\u0000', ' @ ')}: doc ${declared.get(k)} != detected ${actual.get(k)}`);
  if (skipContent) {
    if (countMismatch) {
      fail(`S4.2 summary declares ${block.declaredCount}, table actually has ${blockRows.length} rows (count is structure, not content)`);
    } else {
      pass(`S4.2 content comparison skipped (HELLODEV_SKIP_S42_CONTENT=1; ${detection.count} live skills vs ${blockRows.length} doc rows)`);
    }
  } else if (stale.length || missing.length || relabeled.length || countMismatch) {
    if (countMismatch) console.error(`  Summary declares ${block.declaredCount}, table actually has ${blockRows.length} rows`);
    if (stale.length) console.error(`  In doc but not on this machine: ${stale.slice(0, 8).join(', ')}${stale.length > 8 ? ` etc. ${stale.length} total` : ''}`);
    if (missing.length) console.error(`  On this machine but not in doc: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ` etc. ${missing.length} total` : ''}`);
    if (relabeled.length) console.error(`  Applicable rule mismatch: ${relabeled.slice(0, 5).join('; ')}`);
    fail('S4.2 inconsistent with live detection; run node scripts/detect-skills.js --write to refresh');
  } else {
    const bySource = [...new Set(detection.skills.map(s => s.source))].sort().join(', ');
    pass(`S4.2 consistent with live detection (${detection.count} skills; sources: ${bySource})`);
    if (detection.skipped.length) {
      console.log(`  Info: Entries not counted in table: ${detection.skipped.slice(0, 3).join(', ')}${detection.skipped.length > 3 ? ` etc. ${detection.skipped.length} total` : ''}`);
    }
  }
}

// Check 10: Rule label bidirectional comparison — fail if either side adds
// without the other following. Detector can't invent rules not in S4.1, and
// S4.1 can't list labels the detector doesn't recognize.
// Only parse the first column of tables within S4.1 paragraphs — S4.2's
// generated table first column is skill names; mixing them in would produce
// "S4.1 has labels the detector doesn't recognize" false failures (observed
// once during initial implementation).
// Title must match verbatim: if only splitting by '### 4.1' prefix, a title
// rewritten as "### 4.1 Routing Rules" (second half deleted) would still
// produce a section, docLabels would parse normally, and validation would
// silently pass — observed in practice. Title is this document's structural
// contract; changes must be visible.
const H41 = '### 4.1 Routing Rules (manually maintained, authoritative)';
const H42 = '### 4.2 Detected Skills (auto-generated)';
if (!content.includes(H41)) fail(`S4.1 title is not the contract title; expected verbatim "${H41}"`);
if (!content.includes(H42)) fail(`S4.2 title is not the contract title; expected verbatim "${H42}"`);
const sec41 = content.split(H41)[1].split(H42)[0];
if (!sec41.trim()) fail('S4.1 section is empty');
const docLabels = new Set(
  [...sec41.matchAll(/^\|\s*([^|]+?)\s*\|/gm)]
    .map(m => m[1].trim().replace(/^`|`$/g, ''))
    .filter(l => l && !/^-+$/.test(l) && l !== 'skill')
);
// Bidirectional comparison without exemptions: fallback label "unclassified" is
// also registered in RULES, so deleting it also fails. The previous approach of
// exempting it had a hole — truly deleting S4.1's unclassified row would still
// pass all checks green.
const ruleLabels = RULES.map(r => r.label);
const missingInDoc = ruleLabels.filter(l => !docLabels.has(l));
const notInDetector = [...docLabels].filter(l => !ruleLabels.includes(l));
if (missingInDoc.length) fail(`S4.1 missing rule labels already registered by detector: ${missingInDoc.join(', ')}`);
if (notInDetector.length) fail(`S4.1 has rule labels the detector doesn't recognize: ${notInDetector.join(', ')} (should be registered in detect-skills.js RULES table)`);
pass(`S4.1 route labels consistent with detector RULES (${ruleLabels.join(', ')})`);

console.log(`\n[OK] Collaboration matrix consistency check passed`);
