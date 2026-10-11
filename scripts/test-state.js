#!/usr/bin/env node
'use strict';

// Exercise the public CLI in isolated projects; rejected writes must be inert.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const CLI = path.join(__dirname, 'state.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hello-dev-state-'));
let cwd;
let checks = 0;
function run(...args) {
 const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
 return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
function ok(...args) {
 const r = run(...args);
 assert.equal(r.code, 0, `${args.join(' ')}\n${r.out}`);
 checks++;
 return r.out;
}
function state() { return JSON.parse(fs.readFileSync(path.join(cwd, '.hello-dev/state.json'), 'utf8')); }
function no(...args) {
 const file = path.join(cwd, '.hello-dev/state.json');
 const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
 const r = run(...args);
 assert.notEqual(r.code, 0, `Expected rejection: ${args.join(' ')}`);
 if (before !== null) assert.equal(fs.readFileSync(file, 'utf8'), before, 'Rejected command changed state');
 checks++;
}
function project(name, type = 'implementation', route = 'full') {
 cwd = path.join(tmp, name); fs.mkdirSync(cwd);
 ok('init', '--name', name, '--type', type, '--path', route);
}
function cp(name, result = 'pass') { ok('checkpoint', name, result, '--reason', 'Isolated CLI test evidence for this checkpoint, recorded during the automated run'); }
function beginRequirement() {
 ok('stage', 'bootstrap', 'completed');
 ok('stage', 'initialization', 'in_progress');
 cp('Scope survey');
 cp('Coarse decomposition plan');
 ok('stage', 'initialization', 'completed');
 ok('stage', 'requirement', 'in_progress');
}
function confirm() {
 cp('Requirement confirmed');
 cp('Decomposition plan');
 ok('stage', 'requirement', 'completed');
}
function qualityStage(name, evidence) {
 ok('stage', name, 'in_progress');
 no('stage', name, 'completed');
 cp(evidence); ok('stage', name, 'completed');
}
try {
 project('implementation');
 no('init', '--name', 'overwrite');
 no('stage', 'nope', 'completed');
 no('stage', 'ship', 'completed');
 no('stage', 'requirement', 'in_progress');
 assert.equal(state().stage.status, 'in_progress');
 beginRequirement();
 no('stage', 'requirement', 'completed');
 cp('Requirement confirmed', 'warn'); no('stage', 'requirement', 'completed');
 cp('Requirement confirmed');
 no('stage', 'requirement', 'completed'); // missing decomposition plan
 cp('Decomposition plan');
 confirm();
 no('stage', 'architecture', 'in_progress');
 ok('stage', 'implementation', 'in_progress');
 ok('block', 'Waiting for scope'); no('stage', 'implementation', 'completed');
 ok('unblock', 'Scope confirmed');
 assert.equal(state().blockedHistory[0].reason, 'Waiting for scope');
 cp('regression', 'fail'); no('stage', 'implementation', 'completed');
 cp('regression');
 assert.doesNotMatch(ok('resume'), /regression.*fail/);
 ok('stage', 'implementation', 'completed');
 no('stage', 'review', 'in_progress');
 qualityStage('testing', 'Testing');
 qualityStage('review', 'Review');
 ok('stage', 'ship', 'in_progress'); ok('stage', 'ship', 'completed');
 qualityStage('learn', 'Learning summary');
 qualityStage('evolution', 'Evolution report');
 qualityStage('reflection', 'Agent reflection');
 qualityStage('archive', 'Archive complete');
 assert.match(ok('resume'), /finalize/);
 // Reopening implementation invalidates downstream completion and stale evidence.
 ok('stage', 'implementation', 'rolled_back');
 no('stage', 'ship', 'in_progress');
 ok('stage', 'implementation', 'in_progress'); ok('stage', 'implementation', 'completed');
 qualityStage('testing', 'Testing'); qualityStage('review', 'Review');
 ok('stage', 'ship', 'in_progress'); ok('stage', 'ship', 'completed');
 qualityStage('learn', 'Learning summary');
 qualityStage('evolution', 'Evolution report');
 qualityStage('reflection', 'Agent reflection');
 qualityStage('archive', 'Archive complete');
 ok('validate'); ok('finalize');
 assert.equal(fs.existsSync(path.join(cwd, '.hello-dev/state.json')), false);

 project('design', 'design'); beginRequirement(); confirm();
 ok('stage', 'tool-research', 'in_progress'); ok('stage', 'tool-research', 'completed');
 ok('stage', 'feature-design', 'in_progress');
 no('stage', 'feature-design', 'completed');
 no('module', 'api', 'approved', '--reason', 'Not submitted');
 no('module', '__proto__', 'submitted');
 ok('module', 'api', 'submitted');
 no('module', 'api', 'approved');
 ok('module', 'api', 'annotated'); no('stage', 'feature-design', 'completed');
 ok('module', 'api', 'submitted');
 ok('module', 'api', 'approved', '--reason', 'User approved API scope');
 ok('module', 'second-feature', 'submitted');
 ok('module', 'second-feature', 'approved', '--reason', 'User approved second feature');
 ok('stage', 'feature-design', 'completed');
 ok('stage', 'architecture', 'in_progress'); no('stage', 'architecture', 'completed');
 ok('module', 'storage', 'submitted');
 for (let i = 0; i < 3; i++) {
 ok('reject', 'storage', '--reason', `Needs revision ${i}`);
 if (i < 2) ok('module', 'storage', 'submitted');
 }
 assert.ok(state().retry.exceeded);
 no('module', 'storage', 'submitted'); no('stage', 'architecture', 'completed');
 no('retry-resume'); ok('retry-resume', '--reason', 'User approved one additional attempt');
 assert.equal(state().retry.total, 3);
 ok('module', 'storage', 'submitted');
 ok('module', 'storage', 'approved', '--reason', 'User approved revised storage design');
 ok('stage', 'architecture', 'completed');
 ok('stage', 'prototype', 'in_progress');
 cp('Prototype converged');
 cp('Specifications extracted');
 ok('stage', 'prototype', 'completed');
 ok('stage', 'implementation', 'in_progress');
 ok('gitdec', 'approved', '--reason', 'User approved the exact command');
 ok('report');
 ok('stage', 'tool-research', 'rolled_back');
 ok('stage', 'tool-research', 'in_progress');
 ok('stage', 'tool-research', 'completed');
 ok('stage', 'feature-design', 'in_progress');
 no('stage', 'feature-design', 'completed');

 project('legacy', 'design'); beginRequirement(); confirm();
 ok('stage', 'tool-research', 'in_progress'); ok('stage', 'tool-research', 'completed');
 ok('stage', 'feature-design', 'in_progress');
 const legacy = state();
 legacy.modules.legacy = { status: 'approved', versions: 1, rejections: 0, createdAt: new Date().toISOString() };
 fs.writeFileSync(path.join(cwd, '.hello-dev/state.json'), JSON.stringify(legacy));
 no('stage', 'feature-design', 'completed');
 ok('module', 'legacy', 'submitted');
 ok('module', 'legacy', 'approved', '--reason', 'User approved legacy migration');
 ok('stage', 'feature-design', 'completed');

 project('fast', 'design', 'fast'); beginRequirement(); confirm();
 ok('stage', 'implementation', 'in_progress');
 assert.doesNotMatch(ok('resume'), /tool-research|feature-design|architecture/);
 // Existing locks fail closed. Automatic stale-lock reclamation cannot be made safe with
 // mkdir + owner.json: a contender can observe a partial lock or race another reclaimer.
 const staleLock = path.join(cwd, '.hello-dev/state.lock');
 fs.rmSync(staleLock, { recursive: true, force: true }); // This test owns its isolated temp project.
 fs.mkdirSync(staleLock);
 const ownerlessResult = run('checkpoint', 'ownerless-lock', 'pass');
 assert.notEqual(ownerlessResult.code, 0, 'Owner-less lock must fail closed');
 assert.ok(fs.existsSync(staleLock), 'Owner-less lock must not be reclaimed');
 assert.ok(!state().checkpoints.some(c => c.name === 'ownerless-lock'), 'Owner-less lock rejection must not write state');
 checks++;
 fs.writeFileSync(path.join(staleLock, 'owner.json'), JSON.stringify({ pid: 999999, token: 'stale', at: new Date().toISOString(), command: 'test' }));
 const staleWorker = `const {spawn}=require('node:child_process');Promise.all(Array.from({length:8},(_,i)=>new Promise(resolve=>{const p=spawn(process.execPath,[${JSON.stringify(CLI)},'checkpoint','stale-race-'+i,'pass'],{stdio:'ignore'});p.on('close',code=>resolve(code));}))).then(x=>console.log(JSON.stringify(x)));`;
 const staleBatch = spawnSync(process.execPath, ['-e', staleWorker], { cwd, encoding: 'utf8' });
 assert.equal(staleBatch.status, 0, staleBatch.stderr);
 assert.ok(JSON.parse(staleBatch.stdout).every(code => code !== 0), 'Concurrent writers must not auto-reclaim an abandoned lock');
 assert.ok(fs.existsSync(staleLock), 'Dead-owner lock must remain for manual recovery');
 assert.ok(!state().checkpoints.some(c => c.name.startsWith('stale-race-')), 'Dead-owner lock contention must not write state');
 fs.rmSync(staleLock, { recursive: true, force: true });
 checks++;
 // Test 2: live lock (owner PID is this process, which is alive) -- command should fail after retries
 const liveLock = path.join(cwd, '.hello-dev/state.lock');
 fs.rmSync(liveLock, { recursive: true, force: true }); // Keep the fixture independent of prior failures.
 fs.mkdirSync(liveLock);
 fs.writeFileSync(path.join(liveLock, 'owner.json'), JSON.stringify({ pid: process.pid, at: new Date().toISOString(), command: 'test' }));
 const liveResult = run('checkpoint', 'live-lock', 'pass');
 assert.notEqual(liveResult.code, 0, 'Expected rejection with live lock holder');
 assert.match(liveResult.out, /state write lock conflict/, 'lock timeout must be reported as a conflict');
 assert.match(liveResult.out, /inspect owner\.json if present/, 'recovery message must direct operators to owner evidence when available');
 assert.match(liveResult.out, /owner-less locks require the same process check/, 'owner-less locks must not be treated as automatically safe to remove');
 assert.ok(fs.existsSync(liveLock), 'Live lock must not be removed');
 fs.rmSync(liveLock, { recursive: true, force: true });
 checks++;

 // Kill a writer after it publishes ownership but before its write command finishes. The
 // process death leaves a complete stale lock; future writers must reject without mutating
 // state until an operator explicitly verifies and removes it.
 //
 // The timeout is now a generous upper bound rather than the trigger. It was 100ms, while
 // `node -e` needs ~52-64ms just to reach the write, so under load SIGKILL arrived before
 // `owner.json` existed and this assertion failed intermittently (measured ~17% of runs).
 // spawnSync still reports ETIMEDOUT for this endlessly-running child, and it only returns
 // after the kill, so the evidence assertion below now sees the completed write.
 const killLock = path.join(cwd, '.hello-dev/state.lock');
 fs.rmSync(killLock, { recursive: true, force: true });
 const holder = spawnSync(process.execPath, ['-e', `const fs=require('node:fs');const path=require('node:path');const lock=path.join(process.cwd(),'.hello-dev/state.lock');fs.mkdirSync(lock);fs.writeFileSync(path.join(lock,'owner.json'),JSON.stringify({pid:process.pid,token:'killed-holder',task:'fast'}));process.stdout.write('ready\\n');setInterval(()=>{},1000);`], { cwd, encoding: 'utf8', timeout: 30000, killSignal: 'SIGKILL' });
 assert.equal(holder.error && holder.error.code, 'ETIMEDOUT', 'holder process must be killed while retaining the lock');
 assert.ok(fs.existsSync(path.join(killLock, 'owner.json')), 'killed holder must leave owner evidence');
 const afterKill = run('checkpoint', 'after-killed-holder', 'pass');
 assert.notEqual(afterKill.code, 0, 'write after killed holder must fail closed');
 assert.ok(fs.existsSync(killLock), 'dead holder lock must remain until manual cleanup');
 assert.ok(!state().checkpoints.some(c => c.name === 'after-killed-holder'), 'rejected post-crash write must not mutate state');
 fs.rmSync(killLock, { recursive: true, force: true });
 checks++;
 cp('after-lock');
 // 8-way writers must queue and persist every accepted write. A zero exit with a missing
 // record is the silent-loss regression; a non-zero exit is also a failed write in this test.
 for (let round = 0; round < 3; round++) {
 const worker = `const {spawn}=require('node:child_process');Promise.all(Array.from({length:8},(_,i)=>new Promise(resolve=>{const name='parallel-${round}-'+i;const p=spawn(process.execPath,[${JSON.stringify(CLI)},'checkpoint',name,'pass'],{stdio:'ignore'});p.on('close',code=>resolve({i,name,code}));}))).then(x=>console.log(JSON.stringify(x)));`;
 const batch = spawnSync(process.execPath, ['-e', worker], { cwd, encoding: 'utf8' });
 assert.equal(batch.status, 0, batch.stderr);
 for (const r of JSON.parse(batch.stdout)) {
 assert.equal(r.code, 0, `Concurrent write ${r.name} should complete: exit ${r.code}`);
 assert.ok(state().checkpoints.some(c => c.name === r.name), `Concurrent write ${r.name} must be durable`);
 checks++;
 }
 assert.ok(!fs.existsSync(path.join(cwd, '.hello-dev/state.lock')), 'Successful contention round must leave no lock behind');
 }
 for (const args of [ ['init', '--name'], ['init', '--name', 'x', '--path', 'unknown'], ['checkpoint', '', 'pass'], ['checkpoint', 'x', 'invalid'], ['reject', 'x', '--reason'], ['module', 'constructor', 'submitted'] ]) no(...args);
 no('toString'); no('constructor'); no('checkpoint', 'oversized', 'pass', '--reason', 'x'.repeat(4097));
 no('gitdec', 'approved', '--reason'); no('checkpoint', 'valid', 'pass', '--unknown', 'x');
 no('checkpoint', 'valid', 'pass', 'extra');
 no('unblock', '--reason');
 ok('validate');
 // A nested repository must not mutate its parent's state.
 const parent = cwd; cwd = path.join(cwd, 'nested'); fs.mkdirSync(cwd); fs.mkdirSync(path.join(cwd, '.git'));
 assert.notEqual(run('show').code, 0); checks++; cwd = parent;
 // --task parallel task selector 
 // Most dangerous failure mode this round: --task silently fails, writes stage
 // progression into state.json.
 // Each assertion checks both "target was changed" and "main task was not changed".
 {
 const mainBefore = fs.readFileSync(path.join(cwd, '.hello-dev/state.json'), 'utf8');
 ok('init', '--task', 'p1', '--name', 'Parallel task', '--type', 'design', '--path', 'full');
 assert.equal(fs.existsSync(path.join(cwd, '.hello-dev/state.sibling-p1.json')), true, 'should create sibling state file'); checks++;

 // --task before or after command must be equivalent (requireRoot error teaches leading syntax).
 for (const lead of [true, false]) {
 const tag = lead ? 'leading' : 'trailing';
 const p = (...a) => (lead ? ['--task', 'p1', ...a] : [...a, '--task', 'p1'].flat());
 assert.equal(run(...p('stage', 'bootstrap', 'completed')).code, 0, `${tag} --task stage bootstrap`); checks++;
 assert.equal(run(...p('stage', 'initialization', 'in_progress')).code, 0, `${tag} --task stage initialization`); checks++;
 assert.equal(run(...p('checkpoint', 'Scope survey', 'pass', '--reason', 'parallel task checkpoint evidence recorded for the isolation fixture run')).code, 0, `${tag} --task checkpoint scope-survey`); checks++;
 assert.equal(run(...p('checkpoint', 'Coarse decomposition plan', 'pass', '--reason', 'parallel task checkpoint evidence recorded for the isolation fixture run')).code, 0, `${tag} --task checkpoint coarse-plan`); checks++;
 assert.equal(run(...p('stage', 'initialization', 'completed')).code, 0, `${tag} --task complete initialization`); checks++;
 assert.equal(run(...p('stage', 'requirement', 'in_progress')).code, 0, `${tag} --task stage requirement`); checks++;
 assert.equal(run(...p('checkpoint', 'Requirement confirmed', 'pass', '--reason', 'parallel task checkpoint evidence recorded for the isolation fixture run')).code, 0, `${tag} --task checkpoint requirement-confirmed`); checks++;
 assert.equal(run(...p('checkpoint', 'Decomposition plan', 'pass', '--reason', 'parallel task checkpoint evidence recorded for the isolation fixture run')).code, 0, `${tag} --task checkpoint decomposition-plan`); checks++;
 assert.equal(run(...p('stage', 'requirement', 'completed')).code, 0, `${tag} --task complete requirement`); checks++;
 if (lead) break; // both loops re-running would re-complete stages; only verify second syntax is reachable
 }

 // Isolation proof: after parallel task progresses, main task content must be byte-identical.
 const mainAfter = fs.readFileSync(path.join(cwd, '.hello-dev/state.json'), 'utf8');
 assert.equal(mainAfter, mainBefore, 'parallel task progression polluted main task state.json'); checks++;

 // Default must still read main task, and main task routing constraints must not loosen due to parallel capability.
 const shown = ok('show');
 assert.match(shown, /state\.json/, 'default show must target main state file'); checks++;
 no('module', 'foreign', 'design');

 // Nonexistent --task must report error clearly; must never silently fall back to reading main task (otherwise writes wrong file).
 const missing = run('--task', 'nope', 'show');
 assert.notEqual(missing.code, 0, 'nonexistent --task must fail'); checks++;
 assert.match(missing.out, /not found/, 'must clearly say task not found'); checks++;

 // Illegal ID must be rejected before path resolution, to prevent ../ from crafting out-of-bounds filenames.
 for (const bad of ['../../evil', 'a/b', '', 'x'.repeat(65)]) {
 assert.notEqual(run('--task', bad, 'show').code, 0, `illegal --task should reject: ${bad.slice(0, 12)}`); checks++;
 }
 // Illegal command name must still error; must not be normalized away by global flag.
 assert.notEqual(run('--badcmd', 'show').code, 0); checks++;
 // --task value must not appear at two positions simultaneously.
 assert.notEqual(run('--task', 'p1', 'show', '--task', 'p1').code, 0); checks++;
 // **Two leading --task must be rejected** (review M-1): previously leadFlags overwrote directly,
 // `--task a1 --task a2` silently chose a2 while user thought it was a1 -- wrote to wrong sibling file.
 // Previous assertion tested trailing flag (goes through parseArgs dedup); this one tests the leading merge loop.
 const dupLead = run('--task', 'x1', '--task', 'x2', 'stage', 'bootstrap', 'completed');
 assert.notEqual(dupLead.code, 0, 'two leading --task must be rejected'); checks++;
 assert.match(dupLead.out, /duplicate parameter/, `leading dedup error should be readable: ${dupLead.out.slice(0, 80)}`); checks++;
 // Leading --task without value: must exit 1, must not fall through to "print help exit 0" (review MINOR-3)
 const leadNoValue = run('--task');
 assert.notEqual(leadNoValue.code, 0, 'leading --task without value must be non-zero'); checks++;
 assert.match(leadNoValue.out, /parameter missing value/, `missing value error: ${leadNoValue.out.slice(0, 80)}`); checks++;
 // Leading and trailing error formats must be consistent (both from clean fail, no stack trace)
 const trailNoValue = run('show', '--task');
 assert.equal(trailNoValue.code !== 0 && !/\n\s+at /.test(trailNoValue.out), true,
 `trailing missing value should not print stack: ${trailNoValue.out.slice(0, 120)}`); checks++;

 // archive must archive the selected file, not the main state file.
 const beforeArchive = fs.readFileSync(path.join(cwd, '.hello-dev/state.json'), 'utf8');
 const arc = run('--task', 'p1', 'archive');
 assert.equal(arc.code, 0, `archive --task should succeed: ${arc.out.slice(0, 160)}`); checks++;
 // **Recovery hint must point to the right file** (review M-e): when hardcoded to say "move back to state.json",
 // following the hint would overwrite main state with sibling content -- main task state gets displaced,
 // while --task p1 cannot be found. This is data misplacement, not a copywriting issue.
 assert.match(arc.out, /move back to state\.sibling-p1\.json position/,
 `sibling archive hint must point to state.sibling-p1.json: ${arc.out.slice(0, 300)}`); checks++;
 assert.doesNotMatch(arc.out, /move back to state\.json position/,
 `sibling archive must not hint to move back to state.json (would overwrite main task): ${arc.out.slice(0, 300)}`); checks++;
 assert.equal(fs.existsSync(path.join(cwd, '.hello-dev/state.sibling-p1.json')), false, 'sibling file should be archived'); checks++;
 assert.equal(fs.readFileSync(path.join(cwd, '.hello-dev/state.json'), 'utf8'), beforeArchive,
 'archive --task must not touch main state file'); checks++;

 // Main task must still be readable and writable (parallel capability must not degrade default path).
 assert.equal(run('validate').code, 0, 'main task validate should pass'); checks++;
 ok('checkpoint', 'after-sibling', 'pass');
 }

 // Backward compatibility: schema 1 legacy state has no ops section; must still be readable
 // and allow writing the first ops step.
 // Counter-example: once made ops section mandatory, causing all state files created before
 // the field was added to fail on read.
 // Reuse currently active state (no more init -- earlier test section already created state,
 // re-init would fail).
 {
 const f = path.join(cwd, '.hello-dev/state.json');
 const legacy = JSON.parse(fs.readFileSync(f, 'utf8'));
 delete legacy.ops; // simulate state created before ops field was added
 fs.writeFileSync(f, JSON.stringify(legacy, null, 2));
 assert.equal(run('validate').code, 0); checks++;
 assert.equal(run('show').code, 0); checks++;
 const reg = run('opsRegister', '--id', 'legacy-ops-step', '--command', 'kubectl get pods', '--env', 'staging');
 assert.equal(reg.code, 0, 'first opsRegister on legacy state must succeed'); checks++;
 const after = JSON.parse(fs.readFileSync(f, 'utf8'));
 assert.ok(after.ops && after.ops.steps['legacy-ops-step'], 'ops section should be populated'); checks++;
 }
 // Reverse: ops section exists but format is illegal; must error, not silently pass.
 {
 const f = path.join(cwd, '.hello-dev/state.json');
 const cur = JSON.parse(fs.readFileSync(f, 'utf8'));
 cur.ops.steps['legacy-ops-step'].digest = 'not-a-digest';
 fs.writeFileSync(f, JSON.stringify(cur, null, 2));
 const bad = run('validate');
 assert.notEqual(bad.code, 0, 'illegal digest must error');
 assert.match(bad.out, /ops step format illegal/); checks++;
 }

 // Lock granularity per task (review M-5) 
 // With shared state.lock, two **mutually unrelated** siblings contend for the same lock;
 // measured 8 concurrent only 2 succeeded -- directly violates --task design purpose.
 //
 // Two pitfalls to read before changing:
 // 1. This file's `ok(...)` means "run CLI and assert exit 0", **not** ok(name, cond).
 // Misuse would execute assertion description as command name -- this group uses assert.* instead.
 // 2. Previous block (line 215) already did `archive --task p1` which **deleted p1**,
 // so this group **creates its own two new siblings**, does not depend on existing fixtures.
 console.log('-- Lock granularity: different tasks must not block each other --');
 {
 const dir = path.join(cwd, '.hello-dev');
 for (const t of ['lockA', 'lockB']) {
 if (!fs.existsSync(path.join(dir, `state.sibling-${t}.json`))) {
 assert.equal(run('init', '--task', t, '--name', `parallel-${t}`,
 '--type', 'implementation', '--path', 'fast').code, 0, `create ${t} failed`);
 checks++;
 }
 }
 assert.ok(fs.existsSync(path.join(dir, 'state.json')), 'default state should exist (archive only moved p1)');
 checks++;

 const lockPath = (task) => path.join(dir, `state${task ? `.sibling-${task}` : ''}.lock`);
 const lockA = lockPath('lockA');
 const lockB = lockPath('lockB');
 const lockDef = lockPath(null);

 // (1) Lock name must include TASK_ID (source-level assertion).
 // **Why behavioral assertion alone is insufficient**: counter-proof "if lock reverts to shared state.lock",
 // test creates `state.sibling-lockA.lock`, implementation uses `state.lock` -- different names, no conflict,
 // "A locked B still writable" still passes -> this behavioral assertion is always true under **this** counter-proof
 // (measured miss). Lock name is an implementation convention; comparing source expressions is most reliable
 // (same approach as 9d).
 {
 const src = fs.readFileSync(path.join(__dirname, 'state.js'), 'utf8');
 assert.match(src, /TASK_ID \? `state\.sibling-\$\{TASK_ID\}\.lock` : 'state\.lock'/,
 'state.js write lock must be per TASK_ID granularity (M-5)');
 checks++;
 }

 // (1b) When A is locked, B can still write (behavioral layer: two locks are indeed different files)
 fs.mkdirSync(lockA, { recursive: true });
 fs.writeFileSync(path.join(lockA, 'owner.json'), '{"pid":1,"at":"x"}');
 const r1 = run('--task', 'lockB', 'checkpoint', 'while-a-locked', 'pass', '--reason', 'x');
 assert.equal(r1.code, 0,
 `A locked must not block B (locks separated by task)\n A lock: ${lockA}\n B write result: ${r1.out.slice(0, 220)}`);
 checks++;
 fs.rmSync(lockA, { recursive: true, force: true });

 // (2) Same task lock still works (must not remove locks for parallelism)
 fs.mkdirSync(lockB, { recursive: true });
 fs.writeFileSync(path.join(lockB, 'owner.json'), '{"pid":1,"at":"x"}');
 const r2 = run('--task', 'lockB', 'checkpoint', 'self-locked', 'pass', '--reason', 'x');
 assert.notEqual(r2.code, 0, 'same task lock must still block writes');
 checks++;
 assert.match(r2.out, /state write lock conflict/, `lock conflict should be readable: ${r2.out.slice(0, 160)}`);
 checks++;
 fs.rmSync(lockB, { recursive: true, force: true });

 // (3) Default task and sibling do not interfere
 fs.mkdirSync(lockDef, { recursive: true });
 fs.writeFileSync(path.join(lockDef, 'owner.json'), '{"pid":1,"at":"x"}');
 const rDef = run('checkpoint', 'default-locked', 'pass', '--reason', 'x');
 const rSib = run('--task', 'lockA', 'checkpoint', 'sib-while-default', 'pass', '--reason', 'x');
 assert.notEqual(rDef.code, 0, 'default task own lock must block it');
 checks++;
 assert.equal(rSib.code, 0, `default task locked must not block sibling\n ${rSib.out.slice(0, 220)}`);
 checks++;
 fs.rmSync(lockDef, { recursive: true, force: true });

 // (4) owner.json records which task holds lock (stale locks can be attributed manually)
 fs.mkdirSync(lockA, { recursive: true });
 fs.writeFileSync(path.join(lockA, 'owner.json'),
 JSON.stringify({ pid: process.pid, at: 'x', command: 'checkpoint', task: 'lockA' }));
 const owner = JSON.parse(fs.readFileSync(path.join(lockA, 'owner.json'), 'utf8'));
 assert.equal(owner.task, 'lockA', 'owner.json must record which task holds the lock');
 checks++;
 fs.rmSync(lockA, { recursive: true, force: true });
 }

 // collab: task collaboration snapshot. Detection results depend on which skills are installed
 // on the machine, so assert **structure not specific count** -- count assertions would false-fail
 // on machines without skills installed.
 project('collab');
 assert.match(ok('collab'), /skills not yet detected/, 'should not have collaboration table after init');
 const detectOut = ok('collab', 'detect');
 const collab = state().collaboration;
 assert.ok(collab && typeof collab.detectedAt === 'string' && Array.isArray(collab.skills),
 `collab detect should write snapshot, actual: ${detectOut}`);
 assert.ok(collab.skills.every(k => typeof k.name === 'string' && k.name.trim() &&
 typeof k.source === 'string' && k.source.trim()), 'each entry must have name and non-empty source');
 assert.match(ok('collab'), /total \d+ skills/, 'show should report count');
 assert.match(ok('collab'), /detectedAt|detection time/, 'show should report detection time');
 no('collab', 'detect', 'extra');
 no('collab', 'nonsense-action');
 // Field existence triggers strict validation: bad structure must be rejected, and must not be auto-overwritten
 const collabFile = path.join(cwd, '.hello-dev/state.json');
 const goodState = fs.readFileSync(collabFile, 'utf8');
 const broken = JSON.parse(goodState);
 broken.collaboration = { detectedAt: 'not-a-date', skills: [] };
 fs.writeFileSync(collabFile, JSON.stringify(broken));
 no('validate');
 fs.writeFileSync(collabFile, goodState);

 // decomposition: task decomposition and order table 
 project('decomp');
 beginRequirement(); confirm();
 // Without decomposition, order should indicate so
 assert.match(ok('order'), /not yet decomposed/, 'should not have decomposition after init');
 // Valid decomposition with affectedFiles: t1 -> t2, t3 (concurrent) -> t4
 const tasks = JSON.stringify([
 { id: 't1', name: 'Data model', depends: [], affectedFiles: ['src/models/user.js'] },
 { id: 't2', name: 'API interface', depends: ['t1'], affectedFiles: ['src/api/user.js'] },
 { id: 't3', name: 'Frontend component', depends: ['t1'], affectedFiles: ['src/components/User.vue'] },
 { id: 't4', name: 'Integration test', depends: ['t2', 't3'], affectedFiles: ['tests/integration.js'] },
 ]);
 const decompOut = ok('decompose', '--tasks', tasks);
 assert.match(decompOut, /4 subtask.*3 wave/, 'should report subtask and wave counts');
 assert.match(decompOut, /Wave 1.*t1/, 'Wave 1 should contain t1');
 assert.match(decompOut, /Wave 2.*parallel.*t2.*t3|Wave 2.*t2.*t3/, 'Wave 2 should contain t2, t3 and mark parallel');
 assert.match(decompOut, /Wave 3.*t4/, 'Wave 3 should contain t4');
 // State validation
 const decomp = state().decomposition;
 assert.ok(decomp && Array.isArray(decomp.tasks) && decomp.tasks.length === 4);
 assert.equal(decomp.waves.length, 3);
 assert.deepEqual(decomp.waves[0].tasks, ['t1']);
 assert.deepEqual(decomp.waves[1].tasks.sort(), ['t2', 't3']);
 assert.equal(decomp.waves[1].mode, 'parallel');
 assert.deepEqual(decomp.waves[2].tasks, ['t4']);
 // affectedFiles should be stored
 assert.deepEqual(decomp.tasks[0].affectedFiles, ['src/models/user.js']);
 assert.deepEqual(decomp.tasks[1].affectedFiles, ['src/api/user.js']);
 // dispatchMode defaults to parallel: every parallel group must be dispatched to a
 // sub-agent, so parallel is now the default and serial is the explicit escape hatch.
 assert.equal(decomp.dispatchMode, 'parallel');
 // dispatch-mode: view default
 assert.match(ok('dispatch-mode'), /parallel/);
 // dispatch-mode: serial remains available as an explicit opt-out
 ok('dispatch-mode', 'serial');
 assert.equal(state().decomposition.dispatchMode, 'serial');
 assert.match(ok('dispatch-mode'), /serial/);
 // dispatch-mode: set back to parallel (the default)
 ok('dispatch-mode', 'parallel');
 assert.equal(state().decomposition.dispatchMode, 'parallel');
 // dispatch-mode: invalid value must fail
 no('dispatch-mode', 'invalid');
 // dispatch-mode: without decomposition must fail
 {
 const f = path.join(cwd, '.hello-dev/state.json');
 const cur = JSON.parse(fs.readFileSync(f, 'utf8'));
 const savedDecomp = cur.decomposition;
 delete cur.decomposition;
 fs.writeFileSync(f, JSON.stringify(cur, null, 2));
 no('dispatch-mode', 'parallel');
 cur.decomposition = savedDecomp;
 fs.writeFileSync(f, JSON.stringify(cur, null, 2));
 }
 // Repeat decomposition does not overwrite
 no('decompose', '--tasks', tasks);
 // --replace overwrites (needs value because parseArgs requires each flag to have a value)
 ok('decompose', '--tasks', tasks, '--replace', 'true');
 // Subtask state transitions
 no('subtask', 't2', 'in_progress'); // t1 not completed, dependency not met
 no('subtask', 't1', 'completed'); // pending -> completed is illegal, must go through in_progress
 ok('subtask', 't1', 'in_progress');
 ok('subtask', 't1', 'completed');
 ok('subtask', 't2', 'in_progress'); // t1 completed, dependency met
 ok('subtask', 't2', 'completed');
 ok('subtask', 't3', 'in_progress');
 ok('subtask', 't3', 'completed');
 ok('subtask', 't4', 'in_progress'); // t2, t3 both completed
 ok('subtask', 't4', 'completed');
 // order should show all completed
 assert.match(ok('order'), /all subtasks completed/);
 // order is a read-only command
 const orderOut = ok('order');
 assert.match(orderOut, /Wave 1/);
 assert.match(orderOut, /progress: 4\/4/i);
 assert.match(orderOut, /dispatch/i, 'order should show dispatch mode');
 // File conflict detection: tasks sharing affectedFiles in same wave -> sequential
 {
 const conflictTasks = JSON.stringify([
 { id: 'a', name: 'Task A', depends: [], affectedFiles: ['src/config.js'] },
 { id: 'b', name: 'Task B', depends: [], affectedFiles: ['src/config.js'] },
 ]);
 ok('decompose', '--tasks', conflictTasks, '--replace', 'true');
 const conflictDecomp = state().decomposition;
 assert.equal(conflictDecomp.waves[0].mode, 'sequential', 'file conflict should force sequential');
 const conflictOut = JSON.stringify(conflictDecomp);
 assert.match(conflictOut, /sequential/, 'conflict wave must be sequential');
 }
 // Restore non-conflicting decomposition for further tests
 ok('decompose', '--tasks', tasks, '--replace', 'true');
 // Illegal subtask id
 no('subtask', 'nonexistent', 'in_progress');
 no('subtask', '__proto__', 'in_progress');
 // Illegal subtask status
 no('subtask', 't1', 'unknown_status');
 // Illegal JSON
 no('decompose', '--tasks', 'not-json');
 no('decompose', '--tasks', '[]'); // empty array
 // Circular dependency
 no('decompose', '--tasks', JSON.stringify([
 { id: 'a', name: 'A', depends: ['b'] },
 { id: 'b', name: 'B', depends: ['a'] },
 ]));
 // Dependency on nonexistent task
 no('decompose', '--tasks', JSON.stringify([
 { id: 'x', name: 'X', depends: ['ghost'] },
 ]));
 // Self-dependency
 no('decompose', '--tasks', JSON.stringify([
 { id: 's', name: 'S', depends: ['s'] },
 ]));
 // affectedFiles must be array if present
 no('decompose', '--tasks', JSON.stringify([
 { id: 'af1', name: 'Bad affectedFiles', depends: [], affectedFiles: 'not-array' },
 ]));

 // Implementation gate: a wave with unfinished subtasks cannot complete the stage.
 // Regression: completionAllowed() had no implementation entry and never read
 // decomposition.tasks, so t1/t2 could be 'failed' while `stage implementation completed`
 // still succeeded -- contradicting state-protocol.md "current wave all completed".
 // Fixture state at this point: requirement completed, tasks t1..t4 restored to pending.
 okayImplementationGate();
 function okayImplementationGate() {
 const f = path.join(cwd, '.hello-dev/state.json');
 const snapshot = fs.readFileSync(f, 'utf8');
 const restore = () => fs.writeFileSync(f, snapshot);

 // Re-enter implementation from a clean decomposed requirement state.
 ok('stage', 'implementation', 'in_progress');
 ok('subtask', 't1', 'in_progress');
 ok('subtask', 't1', 'completed');
 // t2 pending -> must be rejected, and the rejection must not corrupt state.
 no('stage', 'implementation', 'completed');
 assert.match(run('stage', 'implementation', 'completed').out,
 /unfinished: t2=pending/, 'gate should name the unfinished subtask'); checks++;

 // A failed subtask must also block completion (the original defect: all failed, still passed).
 ok('subtask', 't2', 'in_progress');
 ok('subtask', 't2', 'failed');
 no('stage', 'implementation', 'completed');
 assert.match(run('stage', 'implementation', 'completed').out,
 /unfinished: t2=failed/, 'gate should report failed subtask status'); checks++;

 // Finish every subtask -> gate opens.
 ok('subtask', 't2', 'pending');
 ok('subtask', 't2', 'in_progress');
 ok('subtask', 't2', 'completed');
 ok('subtask', 't3', 'in_progress');
 ok('subtask', 't3', 'completed');
 ok('subtask', 't4', 'in_progress');
 ok('subtask', 't4', 'completed');
 // Wave 2 (t2, t3) is parallel, so mandatory dispatch now applies: without a record the
 // stage gate refuses to open. This is the same fixture used to prove the old subtask gate,
 // so the dispatch is recorded here rather than weakening the gate.
 ok('dispatch', '--wave', '2', '--agent', 'test-agent');
 ok('stage', 'implementation', 'completed');
 // The dispatch is now recorded and visible, and the outstanding list is clear.
 assert.match(ok('dispatch-plan'), /Wave 2 -> test-agent/); checks++;
 assert.doesNotMatch(ok('dispatch-plan'), /Outstanding/); checks++;

 // A dispatch record must name a real delegated sub-agent. Naming the main agent would let a
 // policy that requires sub-agent dispatch be satisfied by the main agent dispatching to
 // itself, so the command is refused AND must leave no record (a recorded self-dispatch is the
 // failure the rule exists to prevent). The wave 2 record above must survive untouched.
 const beforeSelf = JSON.stringify(state().decomposition.dispatches);
 no('dispatch', '--wave', '2', '--agent', 'main-agent');
 assert.match(run('dispatch', '--wave', '2', '--agent', 'main-agent').out, /main agent/,
 'the rejection must say the name denotes the main agent'); checks++;
 assert.equal(JSON.stringify(state().decomposition.dispatches), beforeSelf,
 'a rejected self-dispatch must not add a dispatch record'); checks++;
 assert.ok(!state().decomposition.dispatches.some(d => d.agent === 'main-agent'),
 'no record may name the main agent'); checks++;
 // Other self spellings are refused too, including a prefixed one.
 no('dispatch', '--wave', '2', '--agent', 'self');
 no('dispatch', '--wave', '2', '--agent', 'sub-agent: main-agent');
 // A real sub-agent name is still accepted, and the earlier record is not displaced.
 ok('dispatch', '--wave', '2', '--agent', 'subagent-real');
 assert.match(ok('dispatch-plan'), /Wave 2 -> test-agent/, 'the earlier real record must remain'); checks++;

 // Roll back implementation and restore the fixture so later assertions see the original shape.
 ok('stage', 'implementation', 'rolled_back');
 restore();
 }

 // decompose-clear
 ok('decompose-clear');
 assert.equal(state().decomposition, undefined);
 assert.match(ok('order'), /not yet decomposed/);
 // dispatch-mode without decomposition should fail
 no('dispatch-mode');
 // Backward compatibility: state without decomposition section is still readable
 {
 const f = path.join(cwd, '.hello-dev/state.json');
 const cur = JSON.parse(fs.readFileSync(f, 'utf8'));
 delete cur.decomposition;
 fs.writeFileSync(f, JSON.stringify(cur, null, 2));
 assert.equal(run('validate').code, 0); checks++;
 assert.equal(run('show').code, 0); checks++;
 assert.equal(run('order').code, 0); checks++;
 }
 // When decomposition section exists but format is illegal, must reject
 {
 const f = path.join(cwd, '.hello-dev/state.json');
 const cur = JSON.parse(fs.readFileSync(f, 'utf8'));
 cur.decomposition = { tasks: 'not-array', waves: [] };
 fs.writeFileSync(f, JSON.stringify(cur, null, 2));
 no('validate');
 assert.match(run('validate').out, /decomposition section structure illegal/);
 checks++;
 }
 // Wave coverage: a well-formed wave set that references no subtask must be rejected.
 // Regression: validation inspected per-wave shape only, so the 0-wave output of the old
 // order-dependent derivation validated as "[OK] State file valid" and Implementation could
 // then be completed without any wave having executed.
 // Full coverage lives in test-decomposition.js; this keeps the invalidation reachable here.
 {
 const f = path.join(cwd, '.hello-dev/state.json');
 const cur = JSON.parse(fs.readFileSync(f, 'utf8'));
 const stamp = new Date().toISOString();
 cur.decomposition = {
   dispatchMode: 'serial',
   tasks: [{ id: 'c1', name: 'Uncovered', depends: [], status: 'pending', affectedFiles: [], updatedAt: stamp }],
   waves: [],
   createdAt: stamp, updatedAt: stamp,
 };
 fs.writeFileSync(f, JSON.stringify(cur, null, 2));
 no('validate');
 assert.match(run('validate').out, /do not cover subtasks/);
 checks++;
 }
 // Backward compatibility: decomposition without dispatchMode and affectedFiles should still validate
 {
 const f = path.join(cwd, '.hello-dev/state.json');
 const cur = JSON.parse(fs.readFileSync(f, 'utf8'));
 cur.decomposition = {
 tasks: [{ id: 'old1', name: 'Old task', depends: [], status: 'pending', affectedFiles: [], updatedAt: new Date().toISOString() }],
 waves: [{ wave: 1, tasks: ['old1'], mode: 'sequential' }],
 createdAt: new Date().toISOString(),
 updatedAt: new Date().toISOString(),
 };
 fs.writeFileSync(f, JSON.stringify(cur, null, 2));
 assert.equal(run('validate').code, 0, 'backward compat: no dispatchMode should validate'); checks++;
 // Show should report dispatch as serial (default)
 assert.match(run('show').out, /serial/, 'show should default dispatch to serial'); checks++;
 }
 // Illegal dispatchMode must be rejected by validate
 {
 const f = path.join(cwd, '.hello-dev/state.json');
 const cur = JSON.parse(fs.readFileSync(f, 'utf8'));
 cur.decomposition.dispatchMode = 'turbo';
 fs.writeFileSync(f, JSON.stringify(cur, null, 2));
 no('validate');
 assert.match(run('validate').out, /dispatchMode/, 'illegal dispatchMode should be caught'); checks++;
 }

 // Malformed state should report a validation error, not an uncaught stack trace.
 fs.writeFileSync(path.join(cwd, '.hello-dev/state.json'), '{}');
 const invalid = run('validate'); assert.notEqual(invalid.code, 0); assert.doesNotMatch(invalid.out, /TypeError|at cmd/); checks++;
 console.log(`state.js: ${checks} CLI assertions passed`);
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
