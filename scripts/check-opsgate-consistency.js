#!/usr/bin/env node
'use strict';

/**
 * Consistency check: ops-execution.md risk table vs opsgate.js actual judgments
 *
 * Why needed: v15's disease was "docs claim gate exists, platform layer has none".
 * check-gate-consistency.js already does the same for git; without corresponding check
 * for opsgate, if docs say `kubectl delete` is L3 but hook actually judges L5,
 * users would operate with wrong mental models.
 *
 * Authority order: modules/core/approval/ops-execution.md risk table must match hooks/opsgate.js.
 *
 * Difference from git version: opsgate is three-valued (pass / ask / deny), not binary.
 * Therefore each table row must explicitly state expected decision, cannot infer from icons.
 *
 * Usage: node scripts/check-opsgate-consistency.js
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DOC = path.join(ROOT, 'modules/core/approval/ops-execution.md');
const HOOK = path.join(ROOT, 'hooks/opsgate.js');

/**
 * Parse risk table from documentation. Each row looks like:
 * | `kubectl delete pod x` | L3 | ask | State change |
 * Three columns: command, risk level, expected decision (pass|ask|deny).
 */
function parseDocTable() {
 const text = fs.readFileSync(DOC, 'utf8');
 const rows = [];
 for (const line of text.split('\n')) {
 const m = line.match(/^\|\s*`([^`]+)`\s*\|\s*(L[0-5])\s*\|\s*(pass|ask|deny)\s*\|/);
 if (m) rows.push({ cmd: m[1].trim(), risk: m[2], want: m[3] });
 }
 return rows;
}

/** Call hook, return three-valued decision. */
function judge(command) {
 const out = execFileSync('node', [HOOK], {
 input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
 encoding: 'utf8',
 });
 if (!out.trim()) return 'pass';
 const d = JSON.parse(out).hookSpecificOutput;
 if (d.permissionDecision === 'deny') return 'deny';
 if (d.permissionDecision === 'allow') return 'ALLOW(violation)';
 return 'ask';
}

/** Extract risk level from hook's prompt text, used to validate doc L-level. */
function riskOf(command) {
 const out = execFileSync('node', [HOOK], {
 input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
 encoding: 'utf8',
 });
 if (!out.trim()) return null; // Passed commands have no risk level prompt
 const reason = JSON.parse(out).hookSpecificOutput.permissionDecisionReason;
 // Header format: "Hello Dev · Ops approval gate -> [TAG] Ln · Pre-execution approval required".
 // The level sits AFTER the tag and BEFORE the middot, so the old /·\s*(L[0-5])/ never matched
 // (it looked for the level after the middot). The tag is not fixed -- it varies by risk level
 // ([WARN] for L2/L3, [HIGH] for L4, [BLOCKED] for L5; unclassified denies carry "[BLOCKED]
 // Default block" with no level) -- so it is matched generically rather than enumerated, and
 // anchored on the gate's "-> " arrow. A fixed tag list would silently return null again the
 // moment a level's tag changes, which is the exact defect being fixed here.
 const m = reason.match(/->\s*\[[A-Z]+\]\s*(L[0-5])/);
 return m ? m[1] : null;
}

const rows = parseDocTable();
if (!rows.length) {
 console.error(' No risk table rows parsed from ops-execution.md (format: | `cmd` | L3 | ask | ... |)');
 process.exit(1);
}

const problems = [];
let checked = 0;
for (const row of rows) {
 checked++;
 const actual = judge(row.cmd);
 if (actual !== row.want) {
 problems.push(`Decision mismatch: ${row.cmd.padEnd(34)} doc ${row.want.padEnd(5)} actual ${actual}`);
 continue;
 }
 // Passed commands don't show L-level, skip risk level comparison
 if (actual === 'pass') continue;
 const risk = riskOf(row.cmd);
 if (risk && risk !== row.risk) {
 problems.push(`Risk mismatch: ${row.cmd.padEnd(34)} doc ${row.risk.padEnd(5)} actual ${risk}`);
 }
}

console.log(`Doc risk table: ${rows.length} rows (pass ${rows.filter(r => r.want === 'pass').length} / ask ${rows.filter(r => r.want === 'ask').length} / deny ${rows.filter(r => r.want === 'deny').length})`);
if (problems.length) {
 console.log(`\n ${problems.length} inconsistency(ies):`);
 for (const p of problems) console.log(` ${p}`);
 console.log('\nFix direction: first determine which is correct (criterion: "does it change target state / is it reversible"), then fix the other side.');
 process.exit(1);
}
console.log(` All ${checked} items consistent (no drift between doc and hook behavior)`);
