#!/usr/bin/env node
'use strict';

/**
 * Local markdown link checker
 *
 * Why needed: This framework previously had multiple references to non-existent files
 * (index stuck at v9.0, broken links, pointing to uncreated approval history files).
 * "Referencing things that don't exist" is one of the root causes of documentation
 * untrustworthiness and must be regression-testable.
 *
 * Usage: node scripts/check-links.js
 * Non-zero exit code means broken links exist.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP_DIRS = new Set(['.git', 'archive', 'node_modules', '.workbuddy']);

function walk(dir, out = []) {
 for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
 if (SKIP_DIRS.has(e.name)) continue;
 const p = path.join(dir, e.name);
 if (e.isDirectory()) walk(p, out);
 else if (e.name.endsWith('.md')) out.push(p);
 }
 return out;
}

const LINK = /\[([^\]]+)\]\(([^)]+)\)/g;
let checked = 0, broken = 0;

// Strip fenced code blocks: paths in examples/templates (screenshots/, l2-episodic/ etc.)
// and code like `arr[fn](x)` are not predicated on existence; skipping them is less
// prone to decay than maintaining a whitelist
function stripFences(text) {
 return text.replace(/^\s*```[\s\S]*?^\s*```/gm, '');
}

for (const file of walk(ROOT)) {
 const text = stripFences(fs.readFileSync(file, 'utf8'));
 for (const m of text.matchAll(LINK)) {
 const target = m[2].split('#')[0].trim();
 if (!target || /^(https?:|mailto:)/.test(target)) continue;
 checked++;
 if (!fs.existsSync(path.resolve(path.dirname(file), target))) {
 console.log(` ${path.relative(ROOT, file)} -> ${target}`);
 broken++;
 }
 }
}

console.log(`\nLink check: ${checked - broken}/${checked} resolvable`);
if (broken) { console.log(`${broken} broken link(s), please fix and rerun.`); process.exit(1); }
console.log(' No broken links');
