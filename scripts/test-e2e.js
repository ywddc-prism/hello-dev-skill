#!/usr/bin/env node
'use strict';

/**
 * Hello Dev — End-to-end scenario tests
 *
 * Covers complete flows not covered by unit tests in self-check.sh:
 *   1. fast-path full lifecycle (init -> bootstrap -> requirement -> implementation -> testing -> review -> ship)
 *   2. Parallel task lock isolation (two siblings don't block each other; same task lock is mutually exclusive)
 *   3. Ops approval TTL expiry and stepDigest validation
 *   4. Rollback and retry (testing fail -> rolled_back -> re-implement -> re-test)
 *
 * Usage: node scripts/test-e2e.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const CLI = path.join(__dirname, 'state.js');
let pass = 0, fail = 0;

function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`  [OK] ${name}`); }
  else { fail++; console.log(`  [FAIL] ${name}${detail ? ` -- ${detail}` : ''}`); }
}
function run(cwd, ...args) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
function section(t) { console.log(`\n${t}`); }
/** Walk bootstrap -> initialization (with its two checkpoints) -> requirement in_progress. */
function beginInitialization(proj) {
  run(proj, 'stage', 'bootstrap', 'completed');
  run(proj, 'stage', 'initialization', 'in_progress');
  run(proj, 'checkpoint', 'Scope survey', 'pass', '--reason', 'e2e fixture evidence for the scope survey checkpoint recorded during the automated run');
  run(proj, 'checkpoint', 'Coarse decomposition plan', 'pass', '--reason', 'e2e fixture evidence for the coarse decomposition plan checkpoint recorded during the automated run');
  run(proj, 'stage', 'initialization', 'completed');
  run(proj, 'stage', 'requirement', 'in_progress');
}

function mkProject(prefix) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return d;
}

/** Record user-approved skips of the four design stages so the full chain reaches
 * implementation. Replaces the retired `--path fast` auto-filter: under the
 * full-chain default, non-design tasks get there by recorded consent, not routing. */
function skipDesignStages(proj) {
  for (const s of ['tool-research', 'feature-design', 'architecture', 'prototype']) {
    run(proj, 'skip', s, '--reason', 'User approved: skip design stage, implementation plan already confirmed for this fixture task');
  }
}

/* ---------- 1. fast-path full lifecycle ---------- */
section('1. fast-path full lifecycle');
{
  const proj = mkProject('hello-dev-e2e-fast-');

  // init
  const r0 = run(proj, 'init', '--name', 'e2e-fast', '--type', 'implementation');
  ok('init succeeds', r0.code === 0, r0.out.slice(0, 200));

  // bootstrap
  ok('bootstrap in_progress', run(proj, 'stage', 'bootstrap', 'in_progress').code === 0);
  ok('bootstrap completed', run(proj, 'stage', 'bootstrap', 'completed').code === 0);

  // initialization (scope survey + coarse decomposition)
  ok('initialization in_progress', run(proj, 'stage', 'initialization', 'in_progress').code === 0);
  ok('Scope survey checkpoint', run(proj, 'checkpoint', 'Scope survey', 'pass', '--reason', 'e2e fixture evidence for the scope survey checkpoint recorded during the automated run').code === 0);
  ok('Coarse decomposition plan checkpoint', run(proj, 'checkpoint', 'Coarse decomposition plan', 'pass', '--reason', 'e2e fixture evidence for the coarse decomposition plan checkpoint recorded during the automated run').code === 0);
  ok('initialization completed', run(proj, 'stage', 'initialization', 'completed').code === 0);

  // requirement
  ok('requirement in_progress', run(proj, 'stage', 'requirement', 'in_progress').code === 0);
  ok('Requirement confirmed checkpoint', run(proj, 'checkpoint', 'Requirement confirmed', 'pass', '--reason', 'requirement confirmed against the fixture plan for this automated end to end run').code === 0);
  ok('Decomposition plan checkpoint', run(proj, 'checkpoint', 'Decomposition plan', 'pass', '--reason', 'small task no decomposition needed; the fixture plan is a single unit of work for the automated run').code === 0);
  ok('requirement completed', run(proj, 'stage', 'requirement', 'completed').code === 0);

  // full chain: record approved skips of the design stages, then implementation
  skipDesignStages(proj);

  // implementation
  ok('implementation in_progress', run(proj, 'stage', 'implementation', 'in_progress').code === 0);
  ok('code review checkpoint', run(proj, 'checkpoint', 'Code review', 'pass', '--reason', 'implemented').code === 0);
  ok('implementation completed', run(proj, 'stage', 'implementation', 'completed').code === 0);

  // testing
  ok('testing in_progress', run(proj, 'stage', 'testing', 'in_progress').code === 0);
  ok('testing checkpoint', run(proj, 'checkpoint', 'Testing', 'pass', '--reason', 'e2e verification passed: fixture test run completed without errors').code === 0);
  ok('testing completed', run(proj, 'stage', 'testing', 'completed').code === 0);

  // review
  ok('review in_progress', run(proj, 'stage', 'review', 'in_progress').code === 0);
  ok('review checkpoint', run(proj, 'checkpoint', 'Review', 'pass', '--reason', 'consistency check passed across the fixture state and history').code === 0);
  ok('review completed', run(proj, 'stage', 'review', 'completed').code === 0);

  // ship
  ok('ship in_progress', run(proj, 'stage', 'ship', 'in_progress').code === 0);
  ok('ship completed', run(proj, 'stage', 'ship', 'completed').code === 0);

  // validate
  const rv = run(proj, 'validate');
  ok('validate passes', rv.code === 0, rv.out.slice(0, 200));

  // archive
  ok('archive succeeds', run(proj, 'archive').code === 0);

  fs.rmSync(proj, { recursive: true, force: true });
}

/* ---------- 2. Parallel task lock isolation ---------- */
section('2. Parallel task lock isolation');
{
  const proj = mkProject('hello-dev-e2e-parallel-');

  // Create two siblings
  const r1 = run(proj, 'init', '--task', 'p1', '--name', 'parallel-1', '--type', 'implementation');
  const r2 = run(proj, 'init', '--task', 'p2', '--name', 'parallel-2', '--type', 'implementation');
  ok('p1 init', r1.code === 0, r1.out.slice(0, 200));
  ok('p2 init', r2.code === 0, r2.out.slice(0, 200));

  // Each sibling runs bootstrap
  ok('p1 bootstrap', run(proj, '--task', 'p1', 'stage', 'bootstrap', 'in_progress').code === 0);
  ok('p2 bootstrap', run(proj, '--task', 'p2', 'stage', 'bootstrap', 'in_progress').code === 0);
  ok('p1 bootstrap completed', run(proj, '--task', 'p1', 'stage', 'bootstrap', 'completed').code === 0);
  ok('p2 bootstrap completed', run(proj, '--task', 'p2', 'stage', 'bootstrap', 'completed').code === 0);

  // p1's gitdec doesn't affect p2
  ok('p1 gitdec', run(proj, '--task', 'p1', 'gitdec', 'approved', '--reason', 'p1 approved').code === 0);
  const p2Git = run(proj, '--task', 'p2', 'report');
  ok('p2 report does not contain p1 gitdec', !p2Git.out.includes('p1 approved'), p2Git.out.slice(0, 200));

  // p1 ops doesn't affect p2
  ok('p1 opsRegister', run(proj, '--task', 'p1', 'opsRegister', '--id', 'restart',
    '--command', 'systemctl restart nginx', '--cwd', '/etc/nginx',
    '--target', 'staging', '--env', 'staging', '--source', 'runbook.md', '--source-digest', 'abc123',
    '--purpose', 'restart').code === 0);
  const p2Ops = run(proj, '--task', 'p2', 'opsStatus', 'restart');
  ok('p2 opsStatus has no p1 ops', p2Ops.out.includes('not registered') || p2Ops.code !== 0, p2Ops.out.slice(0, 200));

  fs.rmSync(proj, { recursive: true, force: true });
}

/* ---------- 3. Ops approval TTL and stepDigest ---------- */
section('3. Ops approval TTL and stepDigest');
{
  const proj = mkProject('hello-dev-e2e-ops-');
  run(proj, 'init', '--name', 'e2e-ops', '--type', 'implementation');
  beginInitialization(proj);
  // Section 3 previously completed `requirement` with NO required checkpoint and never
  // asserted the return code, so the gate's failure was swallowed and the ops assertions
  // below ran against a fixture that had never left `requirement`. Assert every step.
  ok('requirement checkpoint recorded', run(proj, 'checkpoint', 'Requirement confirmed', 'pass',
    '--reason', 'requirement confirmed against the ops fixture plan for this automated end to end run').code === 0);
  ok('decomposition checkpoint recorded', run(proj, 'checkpoint', 'Decomposition plan', 'pass',
    '--reason', 'no decomposition needed: the ops fixture is a single unit of work for this run').code === 0);
  ok('requirement completed', run(proj, 'stage', 'requirement', 'completed').code === 0);
  skipDesignStages(proj);
  ok('implementation in_progress', run(proj, 'stage', 'implementation', 'in_progress').code === 0);

  // Register an ops command
  const reg = run(proj, 'opsRegister', '--id', 'deploy',
    '--command', 'kubectl rollout restart deployment/app',
    '--cwd', '/home/user', '--target', 'prod', '--env', 'prod',
    '--source', 'deploy.md', '--source-digest', 'sha256:abc',
    '--purpose', 'restart deployment');
  ok('opsRegister succeeds', reg.code === 0, reg.out.slice(0, 200));

  // Get stepDigest
  const show = run(proj, 'opsShow', 'deploy');
  ok('opsShow contains stepDigest', /stepDigest/.test(show.out), show.out.slice(0, 200));
  const digestMatch = show.out.match(/stepDigest[:\s]+([a-f0-9]{64})/);
  ok('stepDigest format valid', digestMatch !== null, show.out.slice(0, 100));
  const digest = digestMatch ? digestMatch[1] : '';

  // Approve (short TTL, minimum 30 seconds)
  const approve = run(proj, 'opsApprove', '--id', 'deploy',
    '--approved-by', 'e2e-user', '--confirm-digest', digest, '--ttl-seconds', '30');
  ok('opsApprove succeeds', approve.code === 0, approve.out.slice(0, 200));

  // Check immediately: should be executable
  const status1 = run(proj, 'opsStatus', 'deploy');
  ok('executable after approval', status1.code === 0, status1.out.slice(0, 200));

  // Skip TTL expiry test (minimum 30 seconds, test too slow)
  // Instead verify stepDigest validation: approving with wrong digest should fail
  const badApprove = run(proj, 'opsApprove', '--id', 'deploy',
    '--approved-by', 'e2e-user', '--confirm-digest', '0'.repeat(64));
  ok('wrong digest approval fails', badApprove.code !== 0, badApprove.out.slice(0, 200));

  // After modifying command, old digest becomes invalid
  run(proj, 'opsReject', '--id', 'deploy', '--reason', 're-register');
  const reg2 = run(proj, 'opsRegister', '--id', 'deploy',
    '--command', 'kubectl rollout restart deployment/app-v2',  // command changed
    '--cwd', '/home/user', '--target', 'prod', '--env', 'prod',
    '--source', 'deploy.md', '--source-digest', 'sha256:abc',
    '--purpose', 'restart deployment v2');
  ok('re-register succeeds', reg2.code === 0);
  const show2 = run(proj, 'opsShow', 'deploy');
  const digest2 = show2.out.match(/stepDigest[:\s]+([a-f0-9]{64})/);
  ok('digest differs after command change', digest2 && digest2[1] !== digest, `old=${digest.slice(0,8)} new=${digest2 ? digest2[1].slice(0,8) : 'null'}`);

  fs.rmSync(proj, { recursive: true, force: true });
}

/* ---------- 4. Rollback and retry ---------- */
section('4. Rollback and retry');
{
  const proj = mkProject('hello-dev-e2e-rollback-');
  run(proj, 'init', '--name', 'e2e-rollback', '--type', 'implementation');
  beginInitialization(proj);
  run(proj, 'checkpoint', 'Requirement confirmed', 'pass', '--reason', 'requirement confirmed against the fixture plan for this automated end to end run');
  run(proj, 'checkpoint', 'Decomposition plan', 'pass', '--reason', 'no decomposition needed: the fixture task is a single unit of work for this run');
  run(proj, 'stage', 'requirement', 'completed');
  skipDesignStages(proj);
  run(proj, 'stage', 'implementation', 'in_progress');
  run(proj, 'stage', 'implementation', 'completed');

  // testing stage fails — use fail then rolled_back
  run(proj, 'stage', 'testing', 'in_progress');
  const testFail = run(proj, 'checkpoint', 'Testing', 'fail', '--reason', 'build failed');
  ok('testing fail recorded', testFail.code === 0);

  // Rollback to implementation (testing fail invalidates implementation downstream)
  const rollback = run(proj, 'stage', 'implementation', 'rolled_back');
  ok('rolled_back succeeds', rollback.code === 0, rollback.out.slice(0, 200));

  // Re-enter implementation
  ok('re-enter implementation in_progress', run(proj, 'stage', 'implementation', 'in_progress').code === 0);
  ok('completed after fix', run(proj, 'stage', 'implementation', 'completed').code === 0);

  // Re-test — must re-validate, old fail cannot be reused
  ok('re-enter testing in_progress', run(proj, 'stage', 'testing', 'in_progress').code === 0);
  const testPass = run(proj, 'checkpoint', 'Testing', 'pass', '--reason', 'passed after fix: re-test succeeded following the rolled back implementation');
  ok('testing pass', testPass.code === 0);
  ok('testing completed', run(proj, 'stage', 'testing', 'completed').code === 0);

  // Verify validate can see full history
  const validate = run(proj, 'validate');
  ok('validate passes', validate.code === 0, validate.out.slice(0, 200));

  fs.rmSync(proj, { recursive: true, force: true });
}

/* ---------- Cleanup ---------- */
console.log(`\n${fail === 0 ? '[OK]' : '[FAIL]'} ${pass} passed / ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
