#!/usr/bin/env node
'use strict';

/**
 * Check for fields in state.js that "only appear in the initial literal, never referenced elsewhere".
 *
 * Origin: git.pending was declared in the init literal but had no write or read path --
 * a structure that "looks like it exists" but is actually dead. Such fields make people
 * mistakenly believe a capability exists.
 *
 * Criterion: field name appears exactly once in the entire file (only in initial literal) -> suspicious.
 * Whitelist: immutable records that are correctly written once and never touched again.
 *
 * Usage: node scripts/check-state-fields.js
 */

const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'state.js');
const src = fs.readFileSync(SRC, 'utf8');

// Immutable records written once correctly, never referenced again
const IMMUTABLE = new Set(['schema', 'createdAt']);

const lit = src.match(/const state = \{[\s\S]*?\n {2}\};/);
if (!lit) { console.error(' Cannot find state initial literal'); process.exit(1); }

const declared = [...lit[0].matchAll(/^\s{4}([a-zA-Z]+):/gm)].map(m => m[1]);
const suspect = [];

for (const field of declared) {
 if (IMMUTABLE.has(field)) continue;
 // Count occurrences of this field name as a property (s.field / "field": / field:)
 const hits = [...src.matchAll(new RegExp(`\\b${field}\\b`, 'g'))].length;
 if (hits <= 1) suspect.push(field);
}

console.log(`Field check: ${declared.length} declared, ${IMMUTABLE.size} whitelisted`);
if (suspect.length) {
 console.log(`\n ${suspect.length} field(s) only appear in initial literal, no read/write path:`);
 for (const f of suspect) console.log(` ${f} -> either add usage path or delete`);
 process.exit(1);
}
console.log(' No dead fields (every field has actual read/write path)');
