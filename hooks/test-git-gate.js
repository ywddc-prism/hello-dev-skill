#!/usr/bin/env node
'use strict';

/**
 * git-gate.js unit tests
 * Invoke the hook with real stdin JSON, assert its permission decisions.
 * Run: node hooks/test-git-gate.js
 */

const { spawnSync } = require('child_process');
const path = require('path');

const HOOK = path.join(__dirname, 'git-gate.js');

// [command, expected decision: 'pass' = no output (use default permission) | 'HIGH' | 'MED']
const CASES = [
 // -- Read-only: must pass, otherwise gate becomes a friction source --
 ['git status', 'pass'],
 ['git log --oneline -5', 'pass'],
 ['git diff HEAD', 'pass'],
 ['git branch -a', 'pass'],
 ['git show HEAD', 'pass'],
 ['git fetch --all', 'pass'],
 ['git tag -l "v1.*"', 'pass'],
 ['git config --get user.name', 'pass'],
 ['git remote -v', 'pass'],
 ['git worktree list', 'pass'],
 ['git stash list', 'pass'],
 ['git reflog show', 'pass'],
 ['git gc', 'pass'],
 ['git --version', 'pass'],
 ['git init', 'pass'],
 ['git clean -n', 'pass'],
 ['git clean --dry-run', 'pass'],
 ['git log --all --grep="git add"', 'pass'],

 // -- Should not false-positive: non-git commands / text inside quotes --
 ['echo "git reset --hard"', 'pass'],
 ['grep -rn "git push" .', 'pass'],
 ['cat git-gate.js', 'pass'],
 ['npm test && git status', 'pass'],
 ['cd /tmp && git log', 'pass'],
 ['env GIT_PAGER=cat git status', 'pass'],

 // -- Medium risk: routine write operations, require approval --
 ['git add .', 'MED'],
 ['git commit -m "feat: x"', 'MED'],
 ['git commit --amend --no-edit', 'MED'],
 ['git merge feature', 'MED'],
 ['git checkout main', 'MED'],
 ['git checkout -b feature', 'MED'],
 ['git switch main', 'MED'],
 ['git push', 'MED'],
 ['git push origin main', 'MED'],
 ['git pull origin main', 'MED'],
 ['git tag v1.0.0', 'MED'],
 ['git tag -d v1.0.0', 'MED'],
 ['git config user.email "a@b.c"', 'MED'],
 ['git remote add origin git@github.com:x/y.git', 'MED'],
 ['git reset HEAD~1', 'MED'],
 ['git reset --soft HEAD~1', 'MED'],
 ['git restore --staged src/a.ts', 'MED'],
 ['git stash', 'MED'],
 ['git stash pop', 'MED'],
 ['git cherry-pick abc123', 'MED'],
 ['git revert abc123', 'MED'],
 ['git rm old.ts', 'MED'],
 ['git gc --prune=now --aggressive', 'MED'],
 ['git update-ref refs/heads/x HEAD', 'MED'],
 ['git -c user.email=a@b.c commit -m x', 'MED'],
 ['git unknown-new-subcommand --flag', 'MED'],

 // -- High risk: destructive, must require explicit approval --
 ['git reset --hard HEAD~1', 'HIGH'],
 ['git reset --hard origin/main', 'HIGH'],
 ['git clean -fd', 'HIGH'],
 ['git clean -fdx', 'HIGH'],
 ['git clean -fdX', 'HIGH'],
 ['git push --force origin main', 'HIGH'],
 ['git push -f', 'HIGH'],
 ['git push --force-with-lease', 'HIGH'],
 ['git push origin +main', 'HIGH'],
 ['git push --delete origin old', 'HIGH'],
 ['git push --mirror origin', 'HIGH'],
 ['git branch -D feature', 'HIGH'],
 ['git stash drop', 'HIGH'],
 ['git stash clear', 'HIGH'],
 ['git checkout .', 'HIGH'],
 ['git checkout -- src/a.ts', 'HIGH'],
 ['git checkout -f main', 'HIGH'],
 ['git switch -f main', 'HIGH'],
 ['git switch --discard-changes main', 'HIGH'],
 ['git restore src/a.ts', 'HIGH'],
 ['git rebase -i HEAD~3', 'HIGH'],
 ['git rebase main', 'HIGH'],
 ['git filter-branch --all', 'HIGH'],
 ['git reflog expire --all', 'HIGH'],
 ['git symbolic-ref -d HEAD', 'HIGH'],
 ['git update-ref -d refs/heads/x', 'HIGH'],

 // -- heredoc body must be skipped (same lexer as opsgate, same regression) --
 // Note: the first segment itself is `git commit` (write op), so the whole thing is MED —
 // this is **correct** behavior; "body text with no real risk" in the body
 // won't be parsed as commands (that's the regression point).
 ['git commit -F - <<EOF\nrefactor: split module\n\nbody text with no real risk\nEOF', 'MED'],
 // When first segment is read-only, body must not turn the whole thing red
 ['cat <<EOF\nbody mentions the term git reset --hard\nEOF', 'pass'],
 ['cat <<EOF\ngit reset --hard\nEOF', 'pass'],
 // Real high-risk command after heredoc must still be caught
 ['cat <<EOF\nbody\nEOF\ngit reset --hard', 'HIGH'],
 ['cat <<EOF\nbody\nEOF\ngit status', 'pass'],
 // -- Wrappers and nesting --
 ['sudo git clean -fdx', 'HIGH'],
 ['git -C /repo reset --hard', 'HIGH'],
 ['bash -c "git push --force origin main"', 'HIGH'],
 ['sh -c "git status"', 'pass'],
 ['git add -A; git commit -m x', 'MED'],
 ['git status && git clean -fd', 'HIGH'],
];

let pass = 0;
const failures = [];

for (const [command, expected] of CASES) {
 const res = spawnSync(process.execPath, [HOOK], {
 input: JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd: '/tmp' }),
 encoding: 'utf8',
 });
 let actual = 'pass';
 if (res.stdout && res.stdout.trim()) {
 let parsed;
 try { parsed = JSON.parse(res.stdout); }
 catch (e) { actual = 'INVALID_JSON'; }
 if (parsed) {
 const d = parsed.hookSpecificOutput;
 if (!d || d.hookEventName !== 'PreToolUse' || d.permissionDecision !== 'ask' || !d.permissionDecisionReason) {
 actual = 'BAD_SHAPE';
 } else {
 actual = /HIGH/.test(d.permissionDecisionReason) ? 'HIGH' : 'MED';
 }
 }
 }
 if (actual === expected) { pass++; }
 else { failures.push(` [FAIL] ${command}\n expected ${expected} / actual ${actual}${res.stderr ? ' / stderr: ' + res.stderr.trim() : ''}`); }
}

// Additional contract check: never return allow (gate only tightens, never relaxes)
const allowRes = spawnSync(process.execPath, [HOOK], {
 input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git reset --hard' } }),
 encoding: 'utf8',
});
if (/"permissionDecision"\s*:\s*"allow"/.test(allowRes.stdout || '')) {
 failures.push(' [FAIL] Contract violation: hook returned allow (gate only allows ask or silent pass-through)');
}

// Empty / invalid input must silently pass, must not block
for (const input of ['', 'not-json', '{}', '{"tool_name":"Edit","tool_input":{}}']) {
 const r = spawnSync(process.execPath, [HOOK], { input, encoding: 'utf8' });
 if (r.status !== 0 || (r.stdout && r.stdout.trim())) {
 failures.push(` [FAIL] Abnormal input not silently passed: ${JSON.stringify(input)} -> exit=${r.status} out=${(r.stdout || '').slice(0, 80)}`);
 }
}

/* ---------- HELLODEV_GIT_GATE_MODE (exception policy) ---------- */

const os = require('os'), fs = require('fs');

function runGate(command, env, cwd) {
 const payload = { tool_name: 'Bash', tool_input: { command } };
 if (cwd) payload.cwd = cwd;
 const r = spawnSync(process.execPath, [HOOK], {
 input: JSON.stringify(payload),
 encoding: 'utf8',
 env: { ...process.env, ...env },
 });
 return { status: r.status, out: (r.stdout || '').trim() };
}
function decision(r) {
 if (!r.out) return 'pass';
 const d = JSON.parse(r.out).hookSpecificOutput.permissionDecision;
 return d === 'deny' ? 'DENY' : 'ask';
}
function expectMode(label, command, env, want, cwd) {
 const got = decision(runGate(command, env, cwd));
 if (got !== want) failures.push(` [FAIL] ${label}: expected ${want} / actual ${got}`);
}

let modePass = 0, modeTotal = 0;
function check(label, command, env, want, cwd) {
 modeTotal++;
 const before = failures.length;
 expectMode(label, command, env, want, cwd);
 if (failures.length === before) modePass++;
}

// Git input where risk cannot be determined: 'git' (no subcommand)
check('fail-open defaults to pass for "git"', 'git', {}, 'pass');
check('fail-open explicitly passes "git"', 'git', { HELLODEV_GIT_GATE_MODE: 'fail-open' }, 'pass');
check('fail-closed denies "git"', 'git', { HELLODEV_GIT_GATE_MODE: 'fail-closed' }, 'DENY');
check('fail-closed case normalization', 'git', { HELLODEV_GIT_GATE_MODE: 'FAIL-CLOSED' }, 'DENY');

// Both modes don't change normal classification: high risk still ask, read-only still passes
for (const [cmd, want] of [['git reset --hard', 'ask'], ['git status', 'pass'], ['git push --force', 'ask']]) {
 check(`fail-closed does not change normal classification ${cmd}`, cmd, { HELLODEV_GIT_GATE_MODE: 'fail-closed' }, want);
 check(`fail-open does not change normal classification ${cmd}`, cmd, { HELLODEV_GIT_GATE_MODE: 'fail-open' }, want);
}

// Input that can't be identified as git: both modes must pass (otherwise fail-closed locks all Bash)
for (const input of ['', 'not-json', '{}', '{"tool_name":"Edit","tool_input":{}}']) {
 const r = spawnSync(process.execPath, [HOOK], {
 input, encoding: 'utf8',
 env: { ...process.env, HELLODEV_GIT_GATE_MODE: 'fail-closed' },
 });
 modeTotal++;
 if (r.status !== 0 || (r.stdout && r.stdout.trim())) {
 failures.push(` [FAIL] fail-closed did not pass unidentifiable input: ${JSON.stringify(input)}`);
 } else modePass++;
}

// Invalid mode value treated as fail-open, must not lock
check('invalid mode value still passes', 'git', { HELLODEV_GIT_GATE_MODE: 'banana' }, 'pass');
check('invalid mode value does not block normal commands', 'git status', { HELLODEV_GIT_GATE_MODE: 'banana' }, 'pass');
check('off switch takes priority over mode', 'git', { HELLODEV_GIT_GATE: 'off', HELLODEV_GIT_GATE_MODE: 'fail-closed' }, 'pass');

// No output (doesn't change default permission flow) is pass; deny must also give a reason
{
 const r = runGate('git', { HELLODEV_GIT_GATE_MODE: 'fail-closed' });
 modeTotal++;
 if (decision(r) === 'DENY') {
 const reason = JSON.parse(r.out).hookSpecificOutput.permissionDecisionReason || '';
 if (!/risk cannot be determined/i.test(reason)) failures.push(' [FAIL] fail-closed deny missing explanation reason');
 else modePass++;
 } else { failures.push(' [FAIL] fail-closed did not deny'); }
}

/* ---------- HELLODEV_GIT_GATE_SKIP_DIRS (project-level switch) ---------- */
{
 // cwd in skip list -> silently pass (even for high-risk commands)
 const skipCwd = '/home/user/projects/my-app';
 check('SKIP_DIRS matches cwd segment -> pass', 'git reset --hard', { HELLODEV_GIT_GATE_SKIP_DIRS: 'my-app' }, 'pass', skipCwd);
 check('SKIP_DIRS multi-value match', 'git push --force', { HELLODEV_GIT_GATE_SKIP_DIRS: 'node_modules,vendor,my-app' }, 'pass', skipCwd);
 // cwd not in list -> normal interception
 check('SKIP_DIRS no match -> intercept', 'git reset --hard', { HELLODEV_GIT_GATE_SKIP_DIRS: 'other-project' }, 'ask', skipCwd);
 // empty SKIP_DIRS -> normal interception
 check('SKIP_DIRS empty -> intercept', 'git reset --hard', { HELLODEV_GIT_GATE_SKIP_DIRS: '' }, 'ask', skipCwd);
 // no cwd -> normal interception
 check('no cwd -> intercept', 'git reset --hard', { HELLODEV_GIT_GATE_SKIP_DIRS: 'my-app' }, 'ask');
 // Matching rule: exact segment match, no partial match
 check('SKIP_DIRS partial match does not trigger', 'git reset --hard', { HELLODEV_GIT_GATE_SKIP_DIRS: 'my' }, 'ask', skipCwd);
}

/* ---------- HELLODEV_GIT_GATE_TRACE (host smoke test probe) ---------- */
let tracePass = 0, traceTotal = 0;
function readTrace(file) {
 try {
 return fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean)
 .map(l => { try { return JSON.parse(l); } catch (e) { return null; } })
 .filter(Boolean);
 } catch (e) { return []; }
}
function checkTrace(label, command, env, wantEvent) {
 traceTotal++;
 const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gate-trace-')), 'trace.log');
 const r = runGate(command, { ...env, HELLODEV_GIT_GATE_TRACE: file, HELLODEV_GIT_GATE_CALLER: 'host' });
 const rows = readTrace(file);
 const last = rows[rows.length - 1];
 if (!last || last.event !== wantEvent) failures.push(` [FAIL] trace ${label}: expected ${wantEvent} / actual ${last && last.event}`);
 else if (last.caller !== 'host') failures.push(` [FAIL] trace ${label}: caller should be host / actual ${last.caller}`);
 else if (r.status !== 0) failures.push(` [FAIL] trace ${label}: non-zero exit ${r.status}`);
 else tracePass++;
}

checkTrace('read-only command', 'git status', {}, 'inspect');
checkTrace('ask command', 'git reset --hard', {}, 'ask');
checkTrace('fail-closed deny', 'git', { HELLODEV_GIT_GATE_MODE: 'fail-closed' }, 'deny-unclassifiable');
checkTrace('release-check self-check marker', 'git status', { HELLODEV_GIT_GATE_CALLER: 'release-check' }, 'inspect');

// Forensic standards: never write trace when call source is undeclared.
// Direct invocation from shell is indistinguishable from host-injected invocation;
// recording them would cause the report to treat its own forensic action as
// "host already registered" evidence — exactly the self-contamination to prevent.
{
 traceTotal++;
 const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gate-nocaller-')), 't.log');
 const e = { ...process.env, HELLODEV_GIT_GATE_TRACE: file };
 delete e.HELLODEV_GIT_GATE_CALLER;
 const r = spawnSync(process.execPath, [HOOK], {
 input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git reset --hard' } }),
 encoding: 'utf8', env: e,
 });
 const rows = readTrace(file);
 if (rows.length !== 0) failures.push(` [FAIL] caller not set but wrote ${rows.length} trace entries (false evidence)`);
 else if (!r.stdout || !r.stdout.trim()) failures.push(' [FAIL] high-risk command did not return ask when caller not set (classification behavior changed)');
 else if (JSON.parse(r.stdout).hookSpecificOutput.permissionDecision !== 'ask') failures.push(' [FAIL] did not return ask when caller not set');
 else tracePass++;
}

// Probe off by default: must not write file when TRACE is not set
{
 traceTotal++;
 const file = path.join(os.tmpdir(), 'gate-notrace-' + Date.now() + '.log');
 const e = { ...process.env, HELLODEV_GIT_GATE_CALLER: 'host' };
 delete e.HELLODEV_GIT_GATE_TRACE;
 const r = spawnSync(process.execPath, [HOOK], {
 input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git status' } }),
 encoding: 'utf8', env: e,
 });
 if (fs.existsSync(file)) failures.push(' [FAIL] probe wrote file when not enabled');
 else if (r.status !== 0) failures.push(' [FAIL] non-zero exit without probe');
 else tracePass++;
}

const total = CASES.length;
/* ---------- Runtime version tracing (sourceVersion) ---------- */
// Trace must report the version of "the hook's own copy". If $HOME path is
// hardcoded, copies would always report the source version, making source vs
// runtime comparison meaningless.
{
 traceTotal++;
 const os = require('os'), fs = require('fs');
 const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-ver-'));
 fs.copyFileSync(HOOK, path.join(tmp, 'git-gate.js'));
 fs.writeFileSync(path.join(tmp, 'SKILL.md'), '---\nname: hello-dev\nmetadata:\n version: "99.9"\n---\n');
 const file = path.join(tmp, 'trace.log');
 spawnSync(process.execPath, [path.join(tmp, 'git-gate.js')], {
 input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git status' } }),
 encoding: 'utf8',
 env: { ...process.env, HELLODEV_GIT_GATE_TRACE: file, HELLODEV_GIT_GATE_CALLER: 'host' },
 });
 const rows = readTrace(file);
 const v = rows.length ? rows[rows.length - 1].sourceVersion : null;
 if (v !== '99.9') failures.push(` [FAIL] version tracing: expected copy itself 99.9 / actual ${v}`);
 else tracePass++;
 fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\ngit-gate unit tests: ${pass}/${total} passed`);
console.log(`Mode and probe tests: ${modePass + tracePass}/${modeTotal + traceTotal} passed`);
if (failures.length) {
 console.log('\nFailed cases:');
 console.log(failures.join('\n'));
 process.exit(1);
}
console.log('Contract checks: no allow output [OK] abnormal input silently passes [OK] modes don\'t lock [OK]\n');
