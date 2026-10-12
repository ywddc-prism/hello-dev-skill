#!/usr/bin/env node
'use strict';

/**
 * memory.js behavioral tests - run real CLI in temp directory, no mocks.
 *
 * Reason for existence: v15's lesson was 'docs promise X, implementation does Y'. Write gate is the core constraint,
 * it must have regressable assertions, not rely on people remembering to run it.
 *
 * Usage: node scripts/test-memory.js
 */

const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');

const CLI = path.resolve(__dirname, 'memory.js');
let pass = 0, fail = 0;

function run(root, args) {
 const r = cp.spawnSync(process.execPath, [CLI, ...args], { cwd: root, encoding: 'utf8' });
 return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

// **ok must support assertions** (M-4 counterexample exposed): previously `ok(name)` was unconditional print,
// when I wrote `ok('description', cond, detail)` in 9f/9g, cond was completely ignored -
// all 10 assertions were false, passed green regardless of correctness. This file differs from test-state/test-evolve
// API (those two use assert from the start), misused 5 times, so explicitly supported here.
// ok(name) -> unconditional pass (100+ existing calls unchanged)
// ok(name, cond, detail) -> count failure and print detail when cond is false
function ok(name, cond, detail) {
 if (cond === undefined || cond) { pass++; console.log(` ${name}`); return; }
 fail++; console.log(` ${name} — ${detail === undefined ? '(no detail provided)' : detail}`);
}
function no(name, detail) { fail++; console.log(` ${name} — ${detail}`); }

function chk(name, root, args, want) {
 const r = run(root, args);
 if (want === 'reject' && r.code !== 0) return ok(name);
 if (want === 'accept' && r.code === 0) return ok(name);
 if (want === 'reject' && r.code === 0) return no(name, 'Expected reject but exit=0');
 if (want === 'accept' && r.code !== 0) return no(name, `exit=${r.code} ${r.out.slice(0, 120)}`);
 no(name, `Unknown expectation ${want}`);
}

// want='ok' expects command success; want='fail' expects failure but still matches error text.
// Corrupt file test cases are 'must fail and error must be human-readable', both must be asserted.
function match(name, root, args, re, want = 'ok') {
 const r = run(root, args);
 const codeOk = want === 'ok' ? r.code === 0 : r.code !== 0;
 if (codeOk && re.test(r.out)) ok(name);
 else no(name, `exit=${r.code}(expected ${want}) doesn't match ${re} - ${r.out.slice(0, 160)}`);
}

const CREATED = [];
function fresh() {
 const d = fs.mkdtempSync(path.join(os.tmpdir(), 'hello-dev-mem-'));
 fs.mkdirSync(path.join(d, '.hello-dev'), { recursive: true });
 CREATED.push(d);
 return d;
}
// Not cleaning up would leave a directory each test run (51 accumulated on local machine)
function cleanup() {
 for (const d of CREATED) {
 try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* best effort cleanup */ }
 }
}

function readMem(root) {
 return JSON.parse(fs.readFileSync(path.join(root, '.hello-dev', 'memory.json'), 'utf8'));
}

console.log(' 1. Write gate (reject semantics)');
{
 const r = fresh();
 chk('Missing --source rejected', r, ['add', '--layer', 'L2', '--content', 'a plain fact'], 'reject');
 chk('Speculative tone maybe', r, ['add', '--layer', 'L2', '--content', 'this might fail', '--source', 't'], 'reject');
 chk('Speculative tone I think', r, ['add', '--layer', 'L2', '--content', 'I think this works', '--source', 't'], 'reject');
 chk('Flow fixed', r, ['add', '--layer', 'L2', '--content', 'Fixed login bug', '--source', 't'], 'reject');
 chk('Flow added', r, ['add', '--layer', 'L2', '--content', 'Added config item', '--source', 't'], 'reject');
 chk('Flow refactor', r, ['add', '--layer', 'L2', '--content', 'refactor the module', '--source', 't'], 'reject');
 chk('Invalid layer L9', r, ['add', '--layer', 'L9', '--content', 'x', '--source', 't'], 'reject');
 chk('Missing layer', r, ['add', '--content', 'x', '--source', 't'], 'reject');
 chk('Empty content', r, ['add', '--layer', 'L2', '--content', ' ', '--source', 't'], 'reject');
 chk('Unknown option', r, ['add', '--layer', 'L2', '--content', 'x', '--source', 't', '--bogus', '1'], 'reject');
 chk('Duplicate option', r, ['add', '--layer', 'L2', '--content', 'x', '--source', 't', '--layer', 'L3'], 'reject');

 // Positive and negative cases use separate directories: positive cases write for real, mixing would pollute 'no side effects on reject' assertions below.
 const gateR = fresh(); // Only negative cases (reject)
 const gateA = fresh(); // Only positive cases (accept)
 // Write gate positive/negative cases: independent review found 4 bypass types + 2 false positives here, all solidified as regression tests.
 const REJECT = [
 'Added config item', 'Refactor the module', 'refactor the module', 'update the config',
 '**Added** config item', '- Added config item', '1. Added config item', '>> Update notes', '* Fixed the path',
 '- Rollback to previous version', 'So fixed the bug', 'Added the module',
 'Temporary: hardcode URL first', 'Use this for now, change later', 'TODO: hardcode it',
 'Estimated 20% performance improvement', 'To confirm: cache expiry time', 'Merge if no issues',
 'fix: fix the login', 'feat(auth): add login', 'chore: update dependencies',
 // --- round-3 review H2: clause punctuation set (period / enumeration comma / newline) ---
 'API normal. Added config item',
 'All good. Refactor the module',
 'Docs are fine. fix: the login bug',
 'Config normal, added config item',
 'Lock is exclusive\nRollback to previous version',
 'State normal\nDelete the item',
 // --- round-3 review H3: prefix table (Markdown heading / numbering / checkbox / backtick) ---
 '#### Added config item',
 '### refactor the module',
 '1) Added config item',
 '(1) Update notes',
 '+ Added config item',
 '- [x] Added config item',
 '- [ ] Delete the item',
 '[x] Added config item',
 // --- round-3 review H2/H4: verbs outside the word list and single-character predicate substring exemptions ---
 'Script generated index',
 'Generated index',
 'Added metric config item',
 'Added fingerprint field',
 'Updated to latest version',
 'Deleted pointer reference',
 'API has rate limiting, state is normal',
 // --- after the sentence-final copula exemption was deleted (mutants proved it had zero positive value), these must be rejected ---
 'Updated to latest version',
 'Added metric config item',
 'Deleted pointer reference',
 // --- H2 gap: the clause punctuation set used to cover only the CJK comma / period ---
 'All good. Refactor the module',
 'API normal. Added config item',
 'State normal\nDelete the item',
 'Lock is exclusive\nRollback to previous version',
 // --- H3 gap: the prefix table used to contain no Markdown heading / numbering / checkbox ---
 '#### Added config item',
 '1) Added config item',
 '- [x] Delete the item',
 '(1) Update notes',
 ];
 // P3 relaxation: L2 episodic memory allows past-tense experience sentences (carrying experience words such as cause / found / root cause)
 const ACCEPT_L2 = [
 'Fixed login race condition',
 'Found the memory leak root cause is an uncleaned cache',
 'Regression introduced during refactor, lesson is boundary tests cannot be skipped',
 'API rate limited, reason is downstream timeout',
 'Pitfall: concurrent writes lose data, key is to lock',
 'Retrospective: deploy failed because config was not synced',
 ];
 const ACCEPT = [
 'See docs/progress_coding/', 'merge strategy is squash',
 'the fix stage of the state machine handles repairs', 'rollback strategy is keeping snapshots',
 'contracts must carry evidence', 'this module uses layered memory',
 'the gitdec command of state.js records approval', 'failed fixes are normal',
 'new capabilities need registration', 'commit history is auditable', 'the point of refactoring is boundaries',
 // --- round-3 review H4: starts with an English word but is still a statement ---
 'the fix stage handles regressions',
 'the rename flag needs no caller change',
 // --- clause punctuation must not false-kill version numbers or plain English statements ---
 'v1.5 is the minimum version',
 'The gate rejects speculation.',
 'the minimum required version is v1.5',
 // --- structural marker prefixes must not false-kill normal records ---
 '- retrieval points are optional and non-blocking',
 '#### notes on this section',
 '1. this is a fact',
 // --- after the copula exemption was deleted, statements with a multi-character predicate must still pass ---
 'this parameter means a string',
 'this switch must be enabled',
 'this value belongs to a temporary variable', // "belongs to" is a multi-character predicate
 ];
 let gateBad = 0;
 // L3/L4 strict: everything in REJECT must be rejected
 for (const c of REJECT) {
 if (run(gateR, ['add', '--layer', 'L3', '--content', c, '--source', 't']).code === 0) {
 no('gate rejects (L3): ' + c, 'but exit=0'); gateBad++;
 }
 }
 // L3/L4 strict: everything in ACCEPT must pass
 for (const c of ACCEPT) {
 if (run(gateA, ['add', '--layer', 'L3', '--content', c, '--source', 't']).code !== 0) {
 no('gate accepts (L3): ' + c, 'but wrongly rejected'); gateBad++;
 }
 }
 // P3 relaxation: L2 allows past-tense experience sentences
 for (const c of ACCEPT_L2) {
 if (run(gateA, ['add', '--layer', 'L2', '--content', c, '--source', 't']).code !== 0) {
 no('gate accepts (L2 relaxed): ' + c, 'but wrongly rejected'); gateBad++;
 }
 }
 // P3 relaxation: L2 still rejects pure changelog (past tense without any experience word)
 const REJECT_L2 = ['Fixed login bug', 'Added config item', 'Generated index'];
 for (const c of REJECT_L2) {
 if (run(gateR, ['add', '--layer', 'L2', '--content', c, '--source', 't']).code === 0) {
 no('gate rejects (L2 pure changelog): ' + c, 'but exit=0'); gateBad++;
 }
 }
 if (!gateBad) ok(`write gate ${REJECT.length + ACCEPT.length + ACCEPT_L2.length + REJECT_L2.length} positive/negative cases all pass (including the L2 relaxation)`);
 // working must go through the same gate, otherwise L1 bypasses it entirely
 let workBad = 0;
 for (const c of ['might need to change this', 'Added config item', 'temporary fix: hardcode it first',
 '#### Added config item', 'API normal. Added config item', '- [x] Delete the item']) {
 if (run(gateR, ['working', 'add', '--content', c, '--source', 't']).code === 0) {
 no('working shares the same gate: ' + c, 'but exit=0'); workBad++;
 }
 }
 if (!workBad) ok('working is bound by the same write gate as add');
 if (fs.existsSync(path.join(r, '.hello-dev', 'memory.json'))) no('nothing persisted on reject', 'file was created');
 else ok('nothing persisted on reject');
 // Checking only memory.json stays green forever: a rejected add still mkdir's .hello-dev/,
 // and findRoot locates the root by .hello-dev/, so a leftover directory changes every later root decision.
 const entries = fs.readdirSync(path.join(r, '.hello-dev'));
 if (entries.length === 0) ok('no directory side effects on reject');
 else no('no directory side effects on reject', `leftover ${entries.join(', ')}`);
}

console.log(' 2. Accept and merge (merge takes priority over create)');
{
 const r = fresh();
 chk('Legal fact L3', r, ['add', '--layer', 'L3', '--content', 'state.js uses exclusive mkdir to implement the write lock', '--source', 'scripts/state.js', '--tags', 'state'], 'accept');
 chk('English fact not false-killed', r, ['add', '--layer', 'L4', '--content', 'Run self-check before shipping', '--source', 'AGENTS.md'], 'accept');
 chk('Duplicate content', r, ['add', '--layer', 'L3', '--content', 'state.js uses exclusive mkdir to implement the write lock', '--source', 'scripts/state.js', '--tags', 'lock'], 'accept');
 const m = readMem(r);
 if (m.entries.length === 2) ok('total after merge = 2 (no duplicate created)');
 else no('merge count', `total=${m.entries.length}`);
 const merged = m.entries.find(e => e.layer === 'L3');
 if (merged && merged.tags.includes('lock') && merged.tags.includes('state')) ok('new tag folded in on merge');
 else no('merge tag', JSON.stringify(merged && merged.tags));
}

console.log(' 3. Read and strengthening ');
{
 const r = fresh();
 run(r, ['add', '--layer', 'L2', '--content', 'alpha fact', '--source', 't', '--tags', 'x']);
 run(r, ['add', '--layer', 'L3', '--content', 'beta fact', '--source', 't', '--tags', 'y']);
 chk('recall by layer', r, ['recall', '--layer', 'L2'], 'accept');
 match('recall returns only that layer', r, ['recall', '--layer', 'L2'], /alpha/);
 match('recall does not cross layers', r, ['recall', '--layer', 'L2'], /"count": 1/);
 match('recall by tag', r, ['recall', '--tag', 'y'], /beta/);
 chk('recall empty result is not an error', r, ['recall', '--layer', 'L0'], 'accept');
 chk('limit out of range 0', r, ['recall', '--limit', '0'], 'reject');
 chk('limit out of range 99', r, ['recall', '--limit', '99'], 'reject');
 chk('limit not an integer', r, ['recall', '--limit', 'abc'], 'reject');
 run(r, ['recall', '--layer', 'L2']);
 const m = readMem(r);
 const hit = m.entries.find(e => e.layer === 'L2');
 if (hit && hit.hits >= 1) ok('recall accumulates hit count (access strengthening)');
 else no('hit strengthening', `hits=${hit && hit.hits}`);
}

console.log(' 4. L1 working memory (capacity 7)');
{
 const r = fresh();
 chk('working without source rejected', r, ['working', 'add', '--content', 'x'], 'reject');
 chk('working without content rejected', r, ['working', 'add', '--source', 't'], 'reject');
 chk('working illegal action', r, ['working', 'bogus'], 'reject');
 for (let i = 1; i <= 9; i++) run(r, ['working', 'add', '--content', `item ${i}`, '--source', 't']);
 const m = readMem(r);
 if (m.working.length === 7) ok('capped at 7 entries');
 else no('L1 capacity', `actual ${m.working.length}`);
 if (m.working[0].content === 'item 9') ok('newest first (oldest dropped first)');
 else no('L1 ordering', `first=${m.working[0].content}`);
 chk('working clear', r, ['working', 'clear'], 'accept');
 if (readMem(r).working.length === 0) ok('empty after clear');
 else no('clear', 'leftovers remain');
}

console.log(' 5. Corrupt file (must not auto-overwrite)');
{
 const r = fresh();
 const p = path.join(r, '.hello-dev', 'memory.json');
 fs.writeFileSync(p, '{ this is not json');
 chk('bad JSON fails clearly', r, ['show'], 'reject');
 match('error mentions the recovery path', r, ['show'], /Does not auto-overwrite/, 'fail');
 if (fs.readFileSync(p, 'utf8') === '{ this is not json') ok('original file untouched');
 else no('original file rewritten', 'this is a serious defect');
 fs.writeFileSync(p, JSON.stringify({ schema: 1, entries: [{ id: 'x', layer: 'L9', content: 'c', source: 's', tags: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', hits: 0 }], working: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }));
 match('illegal entry reported', r, ['show'], /illegal entry exists/, 'fail');
 fs.writeFileSync(p, JSON.stringify({ schema: 1, entries: [], working: [{ bad: 1 }], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }));
 match('working memory reported', r, ['show'], /working memory illegal/, 'fail');
 fs.writeFileSync(p, JSON.stringify({ schema: 1, entries: [], working: [] }));
 match('top-level structure reported', r, ['show'], /top-level structure illegal/, 'fail');
}

console.log(' 6. Boundary values ');
{
 const r = fresh();
 chk('content 4097 rejected', r, ['add', '--layer', 'L0', '--content', 'a'.repeat(4097), '--source', 't'], 'reject');
 chk('content 4096 accepted', r, ['add', '--layer', 'L0', '--content', 'a'.repeat(4096), '--source', 't'], 'accept');
 chk('source 1025 rejected', r, ['add', '--layer', 'L0', '--content', 'z', '--source', 's'.repeat(1025)], 'reject');
 chk('11 tags rejected', r, ['add', '--layer', 'L0', '--content', 'z', '--source', 't', '--tags', 'a,b,c,d,e,f,g,h,i,j,k'], 'reject');
 chk('10 tags accepted', r, ['add', '--layer', 'L0', '--content', 'z', '--source', 't', '--tags', 'a,b,c,d,e,f,g,h,i,j'], 'accept');
 chk('unknown subcommand', r, ['bogus'], 'reject');
 chk('no subcommand is not an error', r, [], 'accept');
}

console.log(' 6b. Per-command flag whitelist (SPEC)');
{
 // Round-2 review MAJOR-5: the SPEC whitelist had zero coverage before, that is exactly how `--force` slipped through.
 const r = fresh();
 // --force is only in add's whitelist
 for (const cmd of ['show', 'recall', 'validate']) {
 chk(`${cmd} rejects --force`, r, [cmd, '--force'], 'reject');
 }
 chk('working clear rejects --force', r, ['working', 'clear', '--force'], 'reject');
 chk('add rejects duplicate --force', r, ['add', '--layer', 'L3', '--content', 'x', '--source', 't', '--force', '--force'], 'reject');
 // value flags that belong to other commands
 chk('show rejects --content', r, ['show', '--content', 'x'], 'reject');
 chk('recall rejects --content', r, ['recall', '--content', 'x'], 'reject');
 chk('recall rejects --tags', r, ['recall', '--tags', 'a'], 'reject');
 chk('validate rejects --layer', r, ['validate', '--layer', 'L4'], 'reject');
 chk('add rejects --limit', r, ['add', '--layer', 'L3', '--content', 'x', '--source', 't', '--limit', '5'], 'reject');
 // positional argument count
 chk('show rejects extra positional', r, ['show', 'junk'], 'reject');
 chk('validate rejects extra positional', r, ['validate', 'junk'], 'reject');
 chk('working rejects extra positional', r, ['working', 'add', 'extra', '--content', 'x', '--source', 't'], 'reject');
 chk('working rejects missing positional', r, ['working', '--content', 'x', '--source', 't'], 'reject');
 // duplicated value flags (not merged, not silently discarded)
 chk('rejects duplicate --tags', r, ['add', '--layer', 'L3', '--content', 'x', '--source', 't', '--tags', 'a,b', '--tags', 'c'], 'reject');
 chk('rejects duplicate --layer', r, ['add', '--layer', 'L3', '--content', 'x', '--source', 't', '--layer', 'L4'], 'reject');
 // positive: add's --force still works
 chk('add accepts a single --force', r, ['add', '--layer', 'L3', '--content', 'a legitimate fact', '--source', 't', '--force'], 'accept');
}

console.log(' 6b2. Error at the limit must point to a way out that really exists ');
{
 // Measured by mutants: reverting the message to "archive or merge old entries first"
 // (there is no archive command) still left 125/125 green - the error text had zero coverage.
 // This closes that gap: the command an error points to must **actually solve it**,
 // otherwise the operator is sent down a dead end.
 const r = fresh();
 fs.writeFileSync(path.join(r, '.hello-dev', 'memory.json'), JSON.stringify({
 schema: 1,
 entries: Array.from({ length: 500 }, (_, i) => ({
 id: 'f' + i, layer: 'L3', content: 'c' + i, source: 's', tags: [], hits: 0,
 createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
 })),
 working: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
 }));
 match('add rejected at the limit', r, ['add', '--layer', 'L3', '--content', 'x', '--source', 't'], /reached limit/, 'fail');
 match('error points at prune (which really exists)', r, ['add', '--layer', 'L3', '--content', 'x', '--source', 't'], /prune/, 'fail');
 // The error must not point at a command that does not exist (it once said "archive first"; no archive subcommand was ever implemented)
 const out = run(r, ['add', '--layer', 'L3', '--content', 'x', '--source', 't']);
 const m = /\barchive\b/i.exec(out.out);
 if (m) {
 no('error points to a nonexistent command', `matched ${JSON.stringify(m[0])}`);
 } else ok('error does not point to a nonexistent command');
}

console.log(' 6c. prune: precise deletion (goes through lock and validation)');
{
 const r = fresh();
 run(r, ['add', '--layer', 'L3', '--content', 'kept entry A', '--source', 'A']);
 run(r, ['add', '--layer', 'L3', '--content', 'entry B to delete', '--source', 'B']);
 const before = readMem(r);
 const victim = before.entries.find(e => e.content.includes('B'));
 if (victim) ok('test data ready');
 else { no('test data', 'entry to delete not found'); return; }

 chk('prune deletes by id', r, ['prune', '--id', victim.id], 'accept');
 const after = readMem(r);
 if (after.entries.length === 1) ok('1 entry left after deletion');
 else no('deletion count', `expected 1 actual ${after.entries.length}`);
 if (after.entries.some(e => e.content.includes('kept entry A'))) ok('kept entry not deleted by mistake');
 else no('kept entry', 'was deleted by mistake');
 if (after.entries.some(e => e.content.includes('B'))) no('entry that should be gone', 'still there');
 else ok('entry that should be gone is removed');

 // Rejection paths: prune must not become a back door around validation
 chk('missing --id', r, ['prune'], 'reject');
 chk('id does not exist', r, ['prune', '--id', 'no-such-id'], 'reject');
 chk('extra positional', r, ['prune', 'extra'], 'reject');
 chk('--id across commands', r, ['show', '--id', 'x'], 'reject');
 chk('duplicate --id', r, ['prune', '--id', 'a', '--id', 'b'], 'reject');
 chk('empty --id', r, ['prune', '--id', ''], 'reject');
 chk('validate still ok after deletion', r, ['validate'], 'accept');

 // Deletion goes through writeMem, which keeps the previous version as .bak first
 if (fs.existsSync(path.join(r, '.hello-dev', 'memory.json.bak'))) ok('.bak left before deletion');
 else no('.bak', 'prune did not go through writeMem backup');

 // Must fail strictly under a stale lock (prune is a write command, it does not degrade like recall)
 fs.mkdirSync(path.join(r, '.hello-dev', 'memory.lock'), { recursive: true });
 fs.writeFileSync(path.join(r, '.hello-dev', 'memory.lock', 'owner.json'),
 JSON.stringify({ pid: 99999, at: '2026-01-01T00:00:00.000Z', cmd: 'stale' }));
 chk('prune fails strictly under a stale lock', r, ['prune', '--id', victim.id], 'reject');
 fs.renameSync(path.join(r, '.hello-dev', 'memory.lock'),
 path.join(r, '.hello-dev', 'memory.lock.parked'));
}

console.log(' 7. validate self-check ');
{
 const r = fresh();
 chk('validate on empty store', r, ['validate'], 'accept');
 // On an empty store duplicates must be an **empty array** - the old assertion /"duplicates": \[/
 // also matched [ ], a tautology (round-2 review MAJOR-3). This reverse assertion is what catches it.
 match('duplicates empty on empty store', r, ['validate'], /"duplicates": \[\]/);

 // The add merge path cannot produce same-layer same-fingerprint duplicates, so the file is built by hand - same reason as overLimit.
 const mk = (entries, working = []) => JSON.stringify({
 schema: 1, entries, working,
 createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
 });
 const ent = (i, layer = 'L3', content = 'c' + i) => ({
 id: 'm' + i, layer, content, source: 's', tags: [], hits: 0,
 createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
 });

 // Two entries, same layer and same content (the punctuation difference must be normalized away by fingerprint) -> duplicate must be reported
 fs.writeFileSync(path.join(r, '.hello-dev', 'memory.json'),
 mk([ent(0, 'L3', 'the same fact'), ent(1, 'L3', 'the same fact!')]));
 // Output is indented JSON, the duplicates elements sit on their own line, cannot be matched as a single-line array
 match('validate reports the duplicate', r, ['validate'], /"m0 \/ m1"/, 'ok');
 match('duplicate makes ok=false', r, ['validate'], /"ok": false/, 'ok');

 fs.writeFileSync(path.join(r, '.hello-dev', 'memory.json'),
 mk(Array.from({ length: 501 }, (_, i) => ent(i))));
 match('validate reports over limit', r, ['validate'], /"overLimit": true/, 'ok');
 match('over limit makes ok=false', r, ['validate'], /"ok": false/, 'ok');

 // overWorking had zero tests before (round-2 review MAJOR-3)
 fs.writeFileSync(path.join(r, '.hello-dev', 'memory.json'),
 mk([], Array.from({ length: 8 }, (_, i) => ({ content: 'w' + i, source: 's', at: '2026-01-01T00:00:00.000Z' }))));
 match('validate reports working over capacity', r, ['validate'], /"overWorking": true/, 'ok');
 // Reverse assertion: overWorking must participate in the ok decision. Without this line, deleting
 // `!overWorking` from the ok expression still leaves 108/0 green (round-3 review H5 measured with mutants) -
 // asserting only that the field is true cannot catch "field computed correctly but not fed into ok".
 match('working over capacity makes ok=false', r, ['validate'], /"ok": false/, 'ok');
}

console.log(' 8. --force and source strengthening ');
{
 const r = fresh();
 run(r, ['add', '--layer', 'L3', '--content', 'the same fact', '--source', 'original source']);
 chk('--force legal', r, ['add', '--layer', 'L3', '--content', 'the same fact', '--source', 'new source', '--force'], 'accept');
 let m = readMem(r);
 if (m.entries.length === 1) ok('--force does not create a duplicate entry');
 else no('--force duplicate', `total=${m.entries.length}`);
 if (m.entries[0].source === 'new source') ok('--force overwrites source');
 else no('--force source', m.entries[0].source);
 run(r, ['add', '--layer', 'L4', '--content', 'another fact', '--source', 'A']);
 run(r, ['add', '--layer', 'L4', '--content', 'another fact', '--source', 'B']);
 m = readMem(r);
 const other = m.entries.find(e => e.layer === 'L4');
 if (other && other.source.includes('A') && other.source.includes('B')) ok('plain merge strengthens source (evidence not lost)');
 else no('merge source', other && other.source);
}

console.log(' 9. Stale lock: recall degrades, add is strict ');
{
 const r = fresh();
 run(r, ['add', '--layer', 'L3', '--content', 'must be readable even under lock', '--source', 'A']);
 fs.mkdirSync(path.join(r, '.hello-dev', 'memory.lock'), { recursive: true });
 fs.writeFileSync(path.join(r, '.hello-dev', 'memory.lock', 'owner.json'),
 JSON.stringify({ pid: 99999, at: '2026-01-01T00:00:00.000Z', cmd: 'stale' }));
 const t0 = Date.now();
 chk('recall still succeeds under a stale lock', r, ['recall', '--layer', 'L3'], 'accept');
 const elapsed = Date.now() - t0;
 if (elapsed < 1500) ok(`recall did not wait the full 3000ms (${elapsed}ms)`);
 else no('recall degradation delay', `${elapsed}ms, bootstrap promises sub-second`);
 chk('add fails strictly under a stale lock', r, ['add', '--layer', 'L3', '--content', 'x', '--source', 't'], 'reject');
 match('add error forbids auto-deleting the lock', r, ['add', '--layer', 'L3', '--content', 'x', '--source', 't'], /Agent must not auto-delete/, 'fail');
}

console.log(' 9b. findRoot must have character-for-character identical semantics to state.js ');
{
 // Round-2 review found: after the C2 fix it could still regress silently (deleting the `return null`
 // on the .git branch also stayed green). Here the two CLIs are asserted to land on **the same root**
 // for one directory structure.
 const R = fs.mkdtempSync(path.join(os.tmpdir(), 'hello-dev-root-'));
 CREATED.push(R);
 cp.execFileSync('git', ['init', '-q'], { cwd: R });
 const sub = path.join(R, 'sub');
 fs.mkdirSync(sub, { recursive: true });
 fs.mkdirSync(path.join(R, '.hello-dev'), { recursive: true }); // root has .hello-dev/, but no state.json

 // Write from the subdirectory: both must land in sub/ (and not be absorbed by the empty .hello-dev/ at the root)
 const memOut = run(sub, ['add', '--layer', 'L3', '--content', 'subdirectory fact', '--source', 't']);
 if (memOut.code === 0 && fs.existsSync(path.join(sub, '.hello-dev', 'memory.json'))) {
 ok('memory.js writes into the subdirectory when run from there');
 } else {
 no('memory.js landing spot', `exit=${memOut.code} ${memOut.out.slice(0, 100)}`);
 }
 if (!fs.existsSync(path.join(R, '.hello-dev', 'memory.json'))) ok('did not land in the repo root .hello-dev/');
 else no('landing spot split', 'memory.json was built at the root, inconsistent with state.js semantics');

 // Cross-check: state.js init must land in the same sub/
 const stateCli = path.resolve(__dirname, 'state.js');
 cp.execFileSync(process.execPath, [stateCli, 'init', '--name', 't', '--type', 'implementation'],
 { cwd: sub, stdio: 'ignore' });
 if (fs.existsSync(path.join(sub, '.hello-dev', 'state.json'))) ok('state.js lands in the subdirectory too (both roots agree)');
 else no('state.js landing spot', 'did not land in sub/');
}

console.log(' 9b2. With state already at the root, a cold-start memory write from a subdirectory must land in the same place ');
{
 // Round-3 review H1: 9b's fixture is "root has an empty .hello-dev/ and no state.json", where both happen to
 // land in sub, so a findRoot that only recognized its own file still kept 9b green (measured miss).
 // The common real scenario is the reverse: the root already has state.json (Bootstrap init'ed first),
 // and memory writes for the very first time.
 const R = fs.mkdtempSync(path.join(os.tmpdir(), 'hello-dev-h1-'));
 CREATED.push(R);
 cp.execFileSync('git', ['init', '-q'], { cwd: R });
 cp.execFileSync(process.execPath, [path.resolve(__dirname, 'state.js'),
 'init', '--name', 'root task', '--type', 'implementation'], { cwd: R, stdio: 'ignore' });
 const sub = path.join(R, 'src');
 fs.mkdirSync(sub, { recursive: true });

 run(sub, ['add', '--layer', 'L3', '--content', 'cold-start write from subdirectory', '--source', 't']);

 const atSub = fs.existsSync(path.join(sub, '.hello-dev', 'memory.json'));
 const atRoot = fs.existsSync(path.join(R, '.hello-dev', 'memory.json'));
 if (atRoot && !atSub) ok('memory lands at the root (same place as state.json)');
 else no('H1 landing spot split', `root=${atRoot} subdir=${atSub}, one repo would end up with two memory stores`);

 if (atRoot && !atSub) {
 // The observable consequence of a split: each directory reads its own store
 const atSubRead = run(sub, ['recall', '--layer', 'L3']);
 const atRootRead = run(R, ['recall', '--layer', 'L3']);
 const cnt = o => { try { return JSON.parse(o.out).count; } catch (e) { return -1; } };
 if (cnt(atSubRead) === 1 && cnt(atRootRead) === 1) ok('subdirectory and root read the same entry (no data fork)');
 else no('H1 data fork', `subdir=${cnt(atSubRead)} root=${cnt(atRootRead)}`);
 }
}

console.log(' 9c. The backup really exists and its content is restorable ');
{
 const r = fresh();
 const p = path.join(r, '.hello-dev', 'memory.json');
 const bak = p + '.bak';

 // (1) Corrupted before any successful write: no backup exists, the error must not point at a file that is not there (review MAJOR-2a)
 fs.writeFileSync(p, '{ bad');
 match('corrupt on first write says truthfully that there is no backup', r, ['show'], /no backup yet/, 'fail');
 fs.unlinkSync(p); // Remove corrupted file, re-take 'never written' path

 // (2) The genuine first successful write: nothing to back up, no .bak should be left
 run(r, ['add', '--layer', 'L3', '--content', 'first entry', '--source', 'A']);
 if (!fs.existsSync(bak)) ok('first write leaves no .bak (nothing to back up)');
 else no('first write .bak', 'should not exist');

 // (3) Second successful write: only now does .bak appear, holding the previous version
 run(r, ['add', '--layer', 'L3', '--content', 'second entry', '--source', 'B']);
 if (fs.existsSync(bak)) {
 ok('.bak exists after the second write');
 const b = JSON.parse(fs.readFileSync(bak, 'utf8'));
 const cur = JSON.parse(fs.readFileSync(p, 'utf8'));
 if (b.entries.length === 1 && cur.entries.length === 2) ok('.bak is the previous version (1 entry), current has 2');
 else no('.bak content', `bak=${b.entries.length} cur=${cur.entries.length}`);
 } else no('.bak existence', 'still no backup after the second write');
 fs.writeFileSync(p, '{ bad');
 match('points at .bak when a backup exists', r, ['show'], /previous backup at memory\.json\.bak/, 'fail');
}

console.log(' 9d. findRoot source compared character-for-character (the real cross-file gate)');
{
 // Running both CLIs in 9b and looking at where they land is only **behavioral sampling**: under the current
 // fixture the two results happen to agree, so rewriting state.js's findRoot to "any .hello-dev/ directory is root"
 // still left 9b green (measured M7 miss). The comment claims "character-for-character identical semantics",
 // so it must be compared character-for-character - behavior alone cannot hold the source together.
 //
 // Guard against self-deception: it must assert that **two different files were read**.
 // Measured pitfall: both findRoot bodies are identical character-for-character (the comments sit outside the
 // function), so `state.js.includes(memoryFindRoot)` is always true - a "check which file was read" written
 // that way cannot stop someone changing grab('state.js') into grab('memory.js'): then a===b, the comparison is
 // a tautology, and the guard still passes (mutant counter-evidence N9, measured). The only reliable approach
 // is to have grab carry the file name and assert that the two sources differ.
 const grab = (file) => {
 const src = fs.readFileSync(path.join(__dirname, file), 'utf8');
 const m = /function findRoot\(start\) \{[\s\S]*?\n\}/.exec(src);
 if (!m) { no(`${file} findRoot`, 'function body not found'); return { file, body: null }; }
 return { file, body: m[0].replace(/\r/g, '') };
 };
 const A = grab('memory.js'), B = grab('state.js');
 if (A.body === null || B.body === null) { /* grab already reported error internally */ }
 else if (A.file === B.file) no('comparison sources identical', `read ${A.file} twice, comparison is a tautology`);
 else {
 // Comment-only differences are allowed (the two files' inline notes naturally differ), compare the executable part with comments stripped
 const code = s => s.split('\n').map(l => l.replace(/\/\/.*$/, '').trimEnd()).join('\n').replace(/\n+/g, '\n').trim();
 if (code(A.body) === code(B.body)) ok('the two findRoot implementations are identical character-for-character (distinct sources + comments stripped)');
 else no('findRoot drift', `the two implementations have diverged:\n--- ${A.file} ---\n${A.body}\n--- ${B.file} ---\n${B.body}`);
 }
}

console.log(' 9e. Adoption feedback: retrieved / applied / outcome kept separate ');
{
 // Risk: dressing up retrieval count as effectiveness. hits only proves "it was retrieved", adopt proves
 // "it was applied", and outcome must be traceable to one particular adopt - otherwise the result cannot be attributed.
 const r = fresh();
 const add = run(r, ['add', '--layer', 'L2', '--content', 'mutation counter-evidence must precede assertions', '--source', 'log#52']);
 if (add.code !== 0) { no('seed entry', add.out); }
 else {
 let id;
 try { id = JSON.parse(add.out).id; } catch (e) { id = null; }
 if (!id) no('get id', add.out);

 // (1) Causal chain: outcome without adopt must be rejected
 match('outcome without adopt rejected', r,
 ['outcome', '--id', id, '--result', 'improved', '--evidence', 'x'],
 /No adoption record/, 'fail');
 // (2) Missing evidence must be rejected.
 // **Must be tested after an adopt**: placed before the adopt, the "no adopt" gate blocks first,
 // and deleting the evidence check still leaves the assertion rejecting - mutant counter-evidence N7 missed it exactly this way.
 // Both gates need a counterexample that can **fire on its own**, otherwise one of them is untested.
 // (3) adopt needs a source (adoption must leave evidence behind).
 // **Must assert the distinctive error text**: `text()` also fails on undefined, so looking only at the exit code
 // still stays green after deleting this gate (mutant counter-evidence N10, measured miss).
 match('adopt without --source errors from the write gate', r, ['adopt', '--id', id],
 /Missing --source: adoption must have real evidence/, 'fail');
 // (4) Illegal result enum
 match('illegal result rejected', r,
 ['outcome', '--id', id, '--result', 'very good', '--evidence', 'x'],
 /must be improved/, 'fail');
 // (5) Nonexistent id
 chk('adopt with nonexistent id rejected', r,
 ['adopt', '--id', 'mem-00000000', '--source', 'x'], 'reject');

 // Happy path
 match('adopt succeeds', r, ['adopt', '--id', id, '--source', 'task #53', '--scope', 'test-state'], /"adopted": 1/);
 // An adopt now exists, so missing --evidence can only be rejected by the evidence gate.
 // **Also assert the distinctive text**: with this gate deleted, the downstream `text(flags.evidence)` still rejects,
 // so checking only the exit code tests nothing (mutant counter-evidence N7 measured it as weak - it caught the downstream, not this gate).
 match('missing evidence after adopt says something intelligible', r,
 ['outcome', '--id', id, '--result', 'improved'], /Missing --evidence/, 'fail');
 match('outcome improved succeeds', r,
 ['outcome', '--id', id, '--result', 'improved', '--evidence', '143→166', '--note', 'observation'],
 /"improved"/);

 // (6) Old evidence is not overwritten by a new result (array, not a single value)
 match('second outcome appended', r,
 ['outcome', '--id', id, '--result', 'unknown', '--evidence', 'later attribution impossible'],
 /"outcomes": 2/);
 const m = readMem(r);
 const e = m.entries.find(x => x.id === id);
 if (!e) no('entry lost', '');
 else {
 if (e.outcomes.length === 2 && e.outcomes[0].result === 'improved' && e.outcomes[1].result === 'unknown')
 ok('both results kept, the new record did not overwrite the old evidence');
 else no('result overwritten', JSON.stringify(e.outcomes));
 // (7) The result must be attributed to the most recent adopt
 if (e.outcomes[0].adoptAt && e.adopted[e.adopted.length - 1].at === e.outcomes[0].adoptAt)
 ok('outcome.adoptAt points at the most recent adoption');
 else no('attribution broken', `adoptAt=${e.outcomes[0] && e.outcomes[0].adoptAt}`);
 // (8) hits (retrieved) and adopted (applied) must be two independent fields
 if (e.hits === 0 && e.adopted.length === 1)
 ok('hits and adopted are independent (can be adopted without being retrieved; retrieval is not adoption)');
 else no('fields coupled', `hits=${e.hits} adopted=${e.adopted.length}`);
 }

 // (9) Backward compatibility: old entries without adopted/outcomes must still be readable
 const p = path.join(r, '.hello-dev', 'memory.json');
 const legacy = readMem(r);
 delete legacy.entries[0].adopted; delete legacy.entries[0].outcomes;
 fs.writeFileSync(p, JSON.stringify(legacy, null, 2));
 match('legacy entry (without the new fields) still readable', r, ['validate'], /"ok": true/);
 // (10) A field that exists but is illegal must be rejected (no validation = claiming evidence that does not exist)
 const bad = readMem(r);
 bad.entries[0].adopted = [{ at: 'not-a-date', source: 'x' }];
 fs.writeFileSync(p, JSON.stringify(bad, null, 2));
 match('illegal adopted rejects the read', r, ['validate'], /illegal entry/, 'fail');
 const bad2 = readMem(r);
 bad2.entries[0].adopted = [{ at: new Date().toISOString(), source: 'x' }];
 bad2.entries[0].outcomes = [{ at: new Date().toISOString(), result: 'superb', source: 'x' }];
 fs.writeFileSync(p, JSON.stringify(bad2, null, 2));
 match('illegal outcome enum rejects the read', r, ['validate'], /illegal entry/, 'fail');
 }
}

console.log(' 9e2. headPrefix catastrophic backtracking is fixed (review M-3)');
{
 // **Original defect (reproduced independently; the "not reproduced" note in log #61 was wrong)**:
 // the "misc symbols +" in headPrefix branch A and the outer "(...)*" could both swallow symbols, and \s* could be
 // empty, so one run of symbols had exponentially many splits. Measured: `'-'.repeat(30)+'a Chinese word'` -> 43.5s,
 // `'-'.repeat(504)+'a Chinese word'` -> 254s. **A word after the symbols is required** - a pure symbol run has
 // nothing to match, exits in 0.26ms, which is exactly why I first misjudged it as "not reproduced".
 const r = fresh();
 const mk = (n) => '-'.repeat(n) + 'boundary fact';

 // (1) Dangerous inputs must complete within a bounded time (5s each, over that is a fail)
 for (const n of [24, 30, 60, 200]) {
 const t0 = Date.now();
 const rr = run(r, ['add', '--layer', 'L3', '--content', mk(n), '--source', 't']);
 const ms = Date.now() - t0;
 ok('dangerous input ' + n + ' symbols + word returns within 5s (was ' +
 (n === 30 ? '43.5s' : n >= 200 ? '254s' : 'slow') + ')',
 ms < 5000, `took ${ms}ms, exit=${rr.code}`);
 }

 // (2) Changelog interception semantics unchanged: changelog behind a symbol prefix is still rejected
 match('`- Added config item` still recognized as changelog', r,
 ['add', '--layer', 'L3', '--content', '- Added config item', '--source', 't'],
 /dev changelog/, 'fail');
 match('`#### Modified config` still recognized as changelog', r,
 ['add', '--layer', 'L3', '--content', '#### Modified config', '--source', 't'],
 /dev changelog/, 'fail');
 match('`- [x] Delete the cache` still recognized as changelog', r,
 ['add', '--layer', 'L3', '--content', '- [x] Delete the cache', '--source', 't'],
 /dev changelog/, 'fail');
 match('`1) Added config item` still recognized as changelog', r,
 ['add', '--layer', 'L3', '--content', '1) Added config item', '--source', 't'],
 /dev changelog/, 'fail');

 // (3) Statements still pass (counterexample: writing interception too wide false-kills them)
 chk('statement `- the lock is exclusive` passes', r,
 ['add', '--layer', 'L3', '--content', '- the lock is exclusive', '--source', 't'], 'accept');
 chk('`the merge strategy: see AGENTS.md` passes', r,
 ['add', '--layer', 'L3', '--content', 'the merge strategy: see AGENTS.md', '--source', 't'], 'accept');
 chk('normal Markdown list passes', r,
 ['add', '--layer', 'L3', '--content',
 Array.from({ length: 5 }, (_, i) => '- conclusion ' + i).join('\n'),
 '--source', 't'], 'accept');

 // (4) Very long bodies still go through CONTENT_MAX (a 512 guard I once added blocked them wrongly; it was deleted)
 chk('4096-character body still accepted (CONTENT_MAX contract)', r,
 ['add', '--layer', 'L3', '--content', 'x'.repeat(4096), '--source', 't'], 'accept');
 chk('4097-character body still rejected', r,
 ['add', '--layer', 'L3', '--content', 'x'.repeat(4097), '--source', 't'], 'reject');

 // (5) Mixed shape `+\`Added config item`: the old headZh layer hit it and the new one does not, **but the gate()
 // layer lets it through either way** (clause splitting plus exemptions run after headZh). Assert the real gate
 // behavior: this content is accepted and written. headZh is an intermediate variable, it cannot be used as a
 // behavioral verdict - I tested headZh offline and concluded "behavior difference", that was a layer error, now corrected.
 // `+\`Added config item`: **after** the C-1 fix (headLinear linear criterion) it is caught by the gate.
 // I previously asserted it "is accepted at the gate layer" - that was the state before the C-1 fix.
 // It is changelog with a misc-symbol prefix and **should be caught**; the assertion was updated with the fix.
 match('`+`Added config item` caught after headLinear filled the gap (C-1 knock-on)', r,
 ['add', '--layer', 'L3', '--content', '+`Added config item', '--source', 't'],
 /dev changelog/, 'fail');
}

console.log(' 9f2. --force with tags and hits (review C-2 / m-3)');
{
 const r = fresh();
 // (1) C-2: when force overwrites source, tags must follow this call's arguments
 run(r, ['add', '--layer', 'L3', '--content', 'stable fact A', '--source', 's1', '--tags', 'a,b']);
 let e = readMem(r).entries[0];
 ok('seed tags = a,b', JSON.stringify(e.tags) === '["a","b"]', JSON.stringify(e.tags));

 run(r, ['add', '--layer', 'L3', '--content', 'stable fact A', '--source', 's2', '--tags', 'c,d', '--force']);
 e = readMem(r).entries[0];
 ok('after force, source overwritten to s2', e.source === 's2', JSON.stringify(e.source));
 ok('**after force, tags overwritten to c,d** (new tags used to be silently dropped)',
 JSON.stringify(e.tags) === '["c","d"]', JSON.stringify(e.tags));

 // (2) Counterexample: not passing --tags must not clear them by mistake
 run(r, ['add', '--layer', 'L3', '--content', 'stable fact A', '--source', 's3', '--force']);
 e = readMem(r).entries[0];
 ok('original tags kept when --tags is absent (not cleared by mistake)',
 JSON.stringify(e.tags) === '["c","d"]', JSON.stringify(e.tags));

 // (3) m-3: hits reset to zero when content changes - **use a separate clean entry for this**
 run(r, ['add', '--layer', 'L3', '--content', 'retrieval count fact B', '--source', 't']);
 const idB = readMem(r).entries.find(x => x.content === 'retrieval count fact B').id;
 // Accumulate hits with recall --q (q matches on fingerprint, punctuation differences do not matter)
 for (let i = 0; i < 3; i++) run(r, ['recall', '--q', 'retrieval count fact B']);
 e = readMem(r).entries.find(x => x.id === idB);
 ok('hits > 0 after retrieval (control for the reset below)', e.hits > 0, String(e.hits));
 const hitsBefore = e.hits;

 // Punctuation only -> same fingerprint -> dup branch -> contentChanged -> hits must be reset to zero
 run(r, ['add', '--layer', 'L3', '--content', 'retrieval count fact B!', '--source', 't', '--force']);
 e = readMem(r).entries.find(x => x.id === idB);
 ok(' -> content really changed (force took effect)', e.content === 'retrieval count fact B!', JSON.stringify(e.content));
 ok('**hits reset to zero after force changed the content** (old retrieved count must not hang on the new content)',
 e.hits === 0, `before=${hitsBefore} after=${e.hits}`);

 // (4) m-4: force with no existing entry must say explicitly that it "missed", not look like a normal add
 const r2 = fresh();
 const freshForce = run(r2, ['add', '--layer', 'L3', '--content', 'brand-new fact', '--source', 't', '--force']);
 let parsed = {};
 try { parsed = JSON.parse(freshForce.out); } catch (e) { /* assertions below will report */ }
 ok('**first add --force states forced=false explicitly** (not silently identical to a normal add)',
 parsed.forced === false && /no existing entry/.test(String(parsed.note || '')),
 freshForce.out.slice(0, 200));
 const plainNew = run(r2, ['add', '--layer', 'L3', '--content', 'another brand-new fact', '--source', 't']);
 let p2 = {};
 try { p2 = JSON.parse(plainNew.out); } catch (e) { /* same as above */ }
 ok('a normal first add carries no forced field (counterexample: always carrying forced would confuse)',
 p2.forced === undefined, JSON.stringify(p2));
 const withDup = run(r2, ['add', '--layer', 'L3', '--content', 'another brand-new fact', '--source', 't2', '--force']);
 let p3 = {};
 try { p3 = JSON.parse(withDup.out); } catch (e) { /* same as above */ }
 ok('force states forced=true when a dup exists', p3.forced === true && p3.merged === true,
 withDup.out.slice(0, 200));

 // (5) Counterexample: force with identical content does not clear hits (contentChanged=false)
 for (let i = 0; i < 2; i++) run(r, ['recall', '--q', 'retrieval count fact B']);
 e = readMem(r).entries.find(x => x.id === idB);
 const h2 = e.hits;
 ok('(setup) hits > 0 after reading again', h2 > 0, String(h2));
 run(r, ['add', '--layer', 'L3', '--content', 'retrieval count fact B!', '--source', 't', '--force']);
 e = readMem(r).entries.find(x => x.id === idB);
 ok('force with identical content **keeps** hits (not an unconditional reset)',
 e.hits === h2, `before=${h2} after=${e.hits}`);
}

console.log(' 9f. --force clears evidence when it changes content (review M-4)');
{
 // The fingerprint strips punctuation, so "changing punctuation only" also takes the dup branch -
 // the judgment must be made on **content**.
 const r = fresh();
 const A = 'findRoot must match state.js verbatim, or the stores diverge';
 const B = 'findRoot must match state.js verbatim; or the stores diverge';
 const add1 = run(r, ['add', '--layer', 'L3', '--content', A, '--source', 's1']);
 let id;
 try { id = JSON.parse(add1.out).id; } catch (e) { id = null; }
 if (!id) no('seed', add1.out);
 else {
 run(r, ['adopt', '--id', id, '--source', 'task A']);
 run(r, ['outcome', '--id', id, '--result', 'improved', '--evidence', '1→2']);
 let e = readMem(r).entries[0];
 ok('evidence exists before force', (e.adopted || []).length === 1 && (e.outcomes || []).length === 1,
 JSON.stringify({ a: e.adopted, o: e.outcomes }));

 // (1) Content changed (punctuation only) + force -> evidence must be cleared
 const f1 = run(r, ['add', '--layer', 'L3', '--content', B, '--source', 's2', '--force']);
 e = readMem(r).entries[0];
 ok('force changed the content', e.content === B, JSON.stringify(e.content));
 ok('**evidence cleared** (old evidence must not hang on the new fact)',
 (e.adopted || []).length === 0 && (e.outcomes || []).length === 0,
 JSON.stringify({ a: e.adopted, o: e.outcomes }));

 // (2) Same content + force -> must not clear by mistake (counterexample: writing the clear unconditionally false-kills)
 run(r, ['adopt', '--id', e.id, '--source', 'task B']);
 run(r, ['outcome', '--id', e.id, '--result', 'improved', '--evidence', 'x']);
 const f2 = run(r, ['add', '--layer', 'L3', '--content', B, '--source', 's4', '--force']);
 e = readMem(r).entries[0];
 ok('force with identical content **keeps** evidence (not an unconditional clear)',
 (e.adopted || []).length === 1 && (e.outcomes || []).length === 1,
 JSON.stringify({ a: e.adopted && e.adopted.length, o: e.outcomes && e.outcomes.length }));

 // (3) Plain add (merge path, no force) -> evidence untouched
 run(r, ['add', '--layer', 'L3', '--content', B, '--source', 's5', '--tags', 'extra']);
 e = readMem(r).entries[0];
 ok('plain add leaves evidence alone', (e.adopted || []).length === 1 && (e.outcomes || []).length === 1,
 JSON.stringify({ a: e.adopted && e.adopted.length }));
 ok('plain add merged the new tag', e.tags.includes('extra'), JSON.stringify(e.tags));
 }
}

console.log(' 9g. memory.js can be required and reused (review MINOR-6 + M-2)');
{
 // **Must require it in a child process** (review M-c): with the guard deleted, `require('./memory.js')`
 // runs main() -> no cmd -> `process.exit(0)` **kills this test process directly**,
 // the summary never runs and no failure is printed -> CI/eyes read it as a pass (measured: exit 0, false green).
 // Isolated in a child process, that exit only affects the child; the parent still sees the exit code and stdout.
 const path2 = require('node:path');
 const probe = path2.join(__dirname, '__probe-require.js');
 fs.writeFileSync(probe, [
 'const m = require(' + JSON.stringify(path2.join(__dirname, 'memory.js')) + ');',
 'const out = { read: typeof m.read, memPath: typeof m.memPath,',
 ' add: typeof m.add, working: typeof m.working, prune: typeof m.prune };',
 'try { m.read(process.argv[2]); out.rejectsBad = false; }',
 // Assertion is on **behavior** (read throws and refuses to auto-repair), not on one exact wording:
 // the message has been reworded over versions; pinning a literal string made this case red for the wrong reason.
 'catch (e) { out.rejectsBad = /Memory file error/.test(String(e.message)) && /illegal|unreadable|Does not auto-overwrite/.test(String(e.message)); }',
 'console.log(JSON.stringify(out));',
 ].join('\n'));
 try {
 const bad = fresh();
 fs.writeFileSync(path.join(bad, '.hello-dev', 'memory.json'), JSON.stringify({
 schema: 1, entries: [{ id: 'x', layer: 'L9', content: 'y', source: 's',
 tags: [], hits: 3, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
 working: 'not-an-array', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 }));
 const pr = cp.spawnSync(process.execPath, [probe, bad], { encoding: 'utf8', timeout: 10000 });
 ok('**require completed inside the child process** (parent is not exited when the guard is missing)',
 pr.status === 0 && /"read"/.test(pr.stdout || ''),
 'status=' + pr.status + ' signal=' + pr.signal +
 ' out=' + String(pr.stdout || pr.stderr || '').slice(0, 200));
 let info = {};
 try { info = JSON.parse(String(pr.stdout).trim().split('\n').pop()); } catch (e) { /* assertions below will report */ }
 ok('exports read', info.read === 'function', JSON.stringify(info));
 ok('exports memPath', info.memPath === 'function', JSON.stringify(info));
 ok('**write commands are not exported** (consumers must not get add capability)',
 info.add === 'undefined' && info.working === 'undefined' && info.prune === 'undefined',
 'add=' + info.add + ' working=' + info.working + ' prune=' + info.prune);
 ok('read() rejects illegal memory (the core of M-2)', info.rejectsBad === true, JSON.stringify(info.rejectsBad));
 // Source-level assertion for the guard itself (as in 9d: when behavior cannot see it, compare the implementation)
 const memSrc = fs.readFileSync(path.join(__dirname, 'memory.js'), 'utf8');
 ok('memory.js has the require.main guard (source level)',
 /if\s*\(require\.main\s*===\s*module\)\s+main\(\)/.test(memSrc),
 'if (require.main === module) main(); not found');
 } finally {
 try { fs.unlinkSync(probe); } catch (e) { /* cleanup probe file */ }
 }
}

console.log(' 10a. add||recall contention (the lock must wrap the whole read-modify-write)');
{
 // Only add||add was tested before, recall was missed: it used to read outside the lock and write a stale
 // snapshot inside it, losing 4 of 6 rounds (55%). This line is the only regression protection for that defect.
 let lost = 0;
 for (let round = 0; round < 6; round++) {
 const r = fresh();
 run(r, ['add', '--layer', 'L2', '--content', 'seed entry', '--source', 't']);
 // Race N rounds of add against N rounds of recall, the conflict window is wider -
 // a single round may happen not to overlap (the old lock-outside implementation also passed occasionally),
 // several rounds are needed to detect it reliably.
 const spawns = [];
 const marks = [];
 const q = (s) => JSON.stringify(s);
 for (let i = 0; i < 4; i++) {
 const mAdd = path.join(r, `.done-add-${i}`), mRec = path.join(r, `.done-recall-${i}`);
 // Each writer runs behind a shell that drops a marker **after** the memory.js process exits.
 // Marker files are the only reliable "finished" signal here, see the wait note below.
 spawns.push(cp.spawn('sh', ['-c',
 `${q(process.execPath)} ${q(CLI)} add --layer L2 --content ${q('contention item ' + i)} --source t >/dev/null 2>&1; echo done > ${q(mAdd)}`],
 { cwd: r, stdio: 'ignore' }));
 marks.push(mAdd);
 spawns.push(cp.spawn('sh', ['-c',
 `${q(process.execPath)} ${q(CLI)} recall --layer L2 >/dev/null 2>&1; echo done > ${q(mRec)}`],
 { cwd: r, stdio: 'ignore' }));
 marks.push(mRec);
 }
 // **Wait on marker files, never on exit codes.** Two traps made the previous harness report phantom data loss:
 //   1. `new Int32(...)` is not a global -> ReferenceError -> swallowed by catch -> `p.kill()` shot writers
 //      that were still running (symptom: "1/6 rounds lost data").
 //   2. This parent blocks its event loop with Atomics.wait, so Node never reaps children. They stay zombies:
 //      `p.exitCode` is permanently null and `kill -0` still succeeds, so the wait can never end early.
 // A marker written by the wrapper after exit sidesteps both, and is also a durability guarantee:
 // the write is finished before we read memory.json.
 const deadline = Date.now() + 30000;
 while (marks.some(m => !fs.existsSync(m)) && Date.now() < deadline) {
 Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
 }
 for (const p of spawns) { try { if (p.exitCode === null) p.kill(); } catch (e) {} }
 if (marks.some(m => !fs.existsSync(m))) {
 no('contention harness: writers did not finish in 30s', marks.filter(m => !fs.existsSync(m)).join(','));
 }
 const m = readMem(r);
 if (m.entries.length !== 5) lost++; // 1 seed + 4 concurrent
 }
 if (lost === 0) ok('add||recall concurrency: 6 rounds, no data lost');
 else no('add||recall concurrency loses data', `${lost}/6 rounds with entry count != 5`);
}

console.log(' 10c. snapshot command ');
{
 const r = fresh();
 // Seed entries
 run(r, ['add', '--layer', 'L3', '--content', 'pattern A', '--source', 'test']);
 run(r, ['add', '--layer', 'L4', '--content', 'flow B', '--source', 'test']);
 // Snapshot
 const snap1 = run(r, ['snapshot', '--tag', 'task-start']);
 ok('snapshot succeeds', snap1.code === 0, snap1.out.slice(0, 120));
 const snapRaw = JSON.parse(snap1.out);
 const snapData = snapRaw.value || snapRaw; // withLockRMW returns { degraded, value }
 ok(' -> tag correct', snapData.tag === 'task-start', `tag=${snapData.tag}`);
 ok(' -> entries = 2', snapData.entries === 2, `entries=${snapData.entries}`);
 ok(' -> total = 1', snapData.total === 1, `total=${snapData.total}`);
 // Retrieval increases hits
 run(r, ['recall', '--layer', 'L3']);
 run(r, ['recall', '--layer', 'L4']);
 // Second snapshot
 const snap2 = run(r, ['snapshot', '--tag', 'after-recall']);
 ok('second snapshot succeeds', snap2.code === 0, '');
 const snap2Raw = JSON.parse(snap2.out);
 const snap2Data = snap2Raw.value || snap2Raw;
 ok(' -> total = 2 (cumulative)', snap2Data.total === 2, `total=${snap2Data.total}`);
 // Default tag
 const snap3 = run(r, ['snapshot']);
 const snap3Data = (JSON.parse(snap3.out).value) || JSON.parse(snap3.out);
 ok('default tag = task-start', snap3.code === 0 && snap3Data.tag === 'task-start', `tag=${snap3Data.tag}`);
 // Snapshot cap (SNAPSHOTS_MAX = 20)
 for (let i = 0; i < 25; i++) {
 run(r, ['snapshot', '--tag', `snap-${i}`]);
 }
 const m = readMem(r);
 ok(' -> snapshots never exceed 20', m.snapshots.length <= 20, `snapshots.length=${m.snapshots.length}`);
 // `show` must expose snapshots: check-memory-integration.sh reads d.get('snapshots', []) from show output,
 // before this the field was missing so the check always reported "No snapshots found" (structural false negative).
 const showOut = run(r, ['show']);
 let showData = {};
 try { showData = JSON.parse(showOut.out); } catch (e) { /* assertion below reports */ }
 ok(' -> show output carries the snapshots field',
 Array.isArray(showData.snapshots) && showData.snapshots.length === m.snapshots.length,
 `show.snapshots=${Array.isArray(showData.snapshots) ? showData.snapshots.length : typeof showData.snapshots}`);
 // An illegal snapshots field must be rejected by read()
 const memPath = path.join(r, '.hello-dev', 'memory.json');
 const memObj = JSON.parse(fs.readFileSync(memPath, 'utf8'));
 memObj.snapshots = 'not-an-array';
 fs.writeFileSync(memPath, JSON.stringify(memObj));
 const badSnap = run(r, ['validate']);
 ok('illegal snapshots rejected', badSnap.code !== 0 && /snapshots/.test(badSnap.out),
 badSnap.out.slice(0, 120));
}

console.log(' 10b. Concurrent writes (real double-write contention)');
{
 const r = fresh();
 const N = 8;
 const procs = [];
 for (let i = 0; i < N; i++) {
 procs.push(cp.spawn(process.execPath, [CLI, 'add', '--layer', 'L2',
 '--content', `concurrent item ${i}`, '--source', 't'], { cwd: r, stdio: 'ignore' }));
 }
 // Wait for all of them to exit
 const done = procs.map(p => new Promise(res => p.on('exit', c => res(c))));
 Promise.all(done).then(cs => {
 const m = fs.existsSync(path.join(r, '.hello-dev', 'memory.json'))
 ? JSON.parse(fs.readFileSync(path.join(r, '.hello-dev', 'memory.json'), 'utf8')) : { entries: [] };
 const good = cs.every(c => c === 0);
 if (good) ok(`all 8 concurrent writers exited 0`);
 else no('concurrent exit codes', JSON.stringify(cs));
 if (m.entries.length === N) ok(`nothing lost: all ${N} entries persisted`);
 else no('concurrent data loss', `expected ${N} actual ${m.entries.length}`);
 const ids = new Set(m.entries.map(e => e.id));
 if (ids.size === m.entries.length) ok('no id collisions');
 else no('id collision', `${ids.size}/${m.entries.length}`);
 console.log(`\n memory.js: ${pass} passed / ${fail} failed `);
 cleanup(); // Must call before exit, otherwise temp directories left behind each test run
 safeExit(fail ? 1 : 0);
 }).catch(e => {
 console.error(' concurrency section error:', e);
 cleanup();
 safeExit(1);
 });
}

// Any early exit (including a throw in the synchronous section) must still clean up the temp directories
let EXITED = false;
function safeExit(code) {
 if (EXITED) return;
 EXITED = true;
 try { cleanup(); } catch (e) { /* best effort cleanup */ }
 process.exit(code);
}
process.on('exit', () => { try { cleanup(); } catch (e) { /* best effort */ } });
