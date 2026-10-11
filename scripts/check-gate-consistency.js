#!/usr/bin/env node
'use strict';

/**
 * Consistency check: documentation risk table vs hook actual judgments
 *
 * Why needed: v15's disease was "docs claim gate exists, platform layer has none".
 * This script prevents a close relative -- docs say an operation is HIGH but code
 * judges it as MED (or vice versa). Both drifts cause users to operate with wrong
 * mental models.
 *
 * Authority order: modules/core/approval/git-gate.md risk table must match hooks/git-gate.js.
 * Usage: node scripts/check-gate-consistency.js
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DOC = path.join(ROOT, 'modules/core/approval/git-gate.md');
const HOOK = path.join(ROOT, 'hooks/git-gate.js');

function parseDocTables() {
 const text = fs.readFileSync(DOC, 'utf8');
 const grab = (from, to) => {
 const seg = text.slice(text.indexOf(from), to ? text.indexOf(to) : undefined);
 const out = [];
 for (const line of seg.split('\n')) {
 const m = line.match(/^\|\s*`(git[^`]+)`\s*\|/);
 if (m) out.push(m[1].trim());
 }
 return out;
 };
 return {
 HIGH: grab('### High Risk', '### Medium Risk'),
 MED: grab('### Medium Risk', '### Low Risk'),
 LOW: grab('### Low Risk', '## Approval Interface'),
 };
}

function judge(command) {
 const out = execFileSync('node', [HOOK], {
 input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
 encoding: 'utf8',
 });
 if (!out.trim()) return 'LOW';
 const reason = JSON.parse(out).hookSpecificOutput.permissionDecisionReason;
 // Hook output contains " HIGH", " MED", or " LOW" in the first line
 if (/\bHIGH\b/.test(reason)) return 'HIGH';
 if (/\bMED\b/.test(reason)) return 'MED';
 return 'LOW';
}

const doc = parseDocTables();
const mismatches = [];
let checked = 0;

for (const level of ['HIGH', 'MED', 'LOW']) {
 for (const cmd of doc[level]) {
 checked++;
 const actual = judge(cmd);
 if (actual !== level) mismatches.push({ cmd, doc: level, actual });
 }
}

console.log(`Doc risk table: HIGH ${doc.HIGH.length} / MED ${doc.MED.length} / LOW ${doc.LOW.length}`);
if (mismatches.length) {
 console.log(`\n ${mismatches.length} inconsistency(ies):`);
 for (const m of mismatches) console.log(` ${m.cmd.padEnd(30)} doc ${m.doc.padEnd(5)} actual ${m.actual}`);
 console.log('\nFix direction: first determine which is correct (criterion: "would it irreversibly lose content"), then fix the other side.');
 process.exit(1);
}
console.log(` All ${checked} items consistent (no drift between doc and hook behavior)`);
