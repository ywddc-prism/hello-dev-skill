#!/usr/bin/env node
'use strict';

// Isolated release evidence regressions: never touch real settings or installations.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const source = path.resolve(__dirname, '..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hello-dev-release-test-'));
let passed = 0, failed = 0;
const check = (name, ok) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  ok ? passed++ : failed++;
};
try {
  for (const name of ['scripts/lib', 'hooks', 'home/.workbuddy/skills']) {
    fs.mkdirSync(path.join(root, name), { recursive: true });
  }
  for (const name of ['SKILL.md', 'scripts/release-check.sh', 'scripts/sync-to-codex.sh', 'scripts/register-hooks.js', 'scripts/lib/bash-lex.js', 'hooks/git-gate.js', 'hooks/opsgate.js']) {
    const input = name === 'scripts/release-check.sh' && process.env.HELLODEV_RELEASE_TEST_SCRIPT
      ? process.env.HELLODEV_RELEASE_TEST_SCRIPT : path.join(source, name);
    fs.copyFileSync(input, path.join(root, name));
  }
  fs.symlinkSync(root, path.join(root, 'home/.workbuddy/skills/hello-dev'), 'dir');
  const version = fs.readFileSync(path.join(root, 'SKILL.md'), 'utf8').match(/^\s*version:\s*"?([^"\n]+)"?/m)[1].trim();
  const gitTrace = path.join(root, 'git.jsonl');
  const opsTrace = path.join(root, 'ops.jsonl');
  const env = { ...process.env, HOME: path.join(root, 'home'),
    PATH: path.dirname(process.execPath) + path.delimiter + process.env.PATH,
    HELLODEV_HOST: 'claude', HELLODEV_SKILL_DIR: root,
    HELLODEV_CLAUDE_TARGET: path.join(root, 'missing-claude'),
    HELLODEV_CODEX_TARGET: path.join(root, 'missing-codex'),
    HELLODEV_WORKBUDDY_TARGET: path.join(root, 'missing-workbuddy'),
    HELLODEV_GIT_GATE_TRACE: gitTrace, HELLODEV_OPSGATE_TRACE: opsTrace };
  for (const key of ['HELLODEV_SETTINGS', 'HELLODEV_CODEBUDDY_TARGET', 'HELLODEV_GIT_GATE', 'HELLODEV_OPSGATE', 'HELLODEV_GIT_GATE_SKIP_DIRS', 'HELLODEV_OPSGATE_SKIP_DIRS', 'HELLODEV_GIT_GATE_MODE', 'HELLODEV_OPSGATE_MODE']) delete env[key];
  const run = (...args) => {
    const result = spawnSync('bash', [path.join(root, 'scripts/release-check.sh'), '--json', ...args], { env, encoding: 'utf8', timeout: 20000 });
    if (result.error) throw result.error;
    return { code: result.status, data: JSON.parse(result.stdout) };
  };
  const row = (d, item) => d.checks.find(c => c.item === item);
  const record = (gate, overrides = {}) => ({ at: new Date().toISOString(), caller: 'host', event: 'inspect', gate: `hello-dev/${gate}`, sourceVersion: version, ...overrides });
  const write = (file, rows) => fs.writeFileSync(file, rows.map(r => typeof r === 'string' ? r : JSON.stringify(r)).join('\n') + '\n');
  let r = run();
  check('missing evidence returns 0, not PASS', r.code === 0 && r.data.checks.some(c => c.status === 'UNKNOWN'));
  check('UNKNOWN is the exact number of rows', r.data.unknown === r.data.checks.filter(c => c.status === 'UNKNOWN').length);
  check('both runtime rows exist', !!row(r.data, 'runtime version') && !!row(r.data, 'runtime version(opsgate.js)'));
  check('both writable probes pass', row(r.data, 'Probe writable')?.status === 'PASS' && row(r.data, 'Probe writable(opsgate.js)')?.status === 'PASS');

  write(gitTrace, [record('git-gate'), record('git-gate', { caller: 'release-check', sourceVersion: '999.0' })]);
  write(opsTrace, [record('opsgate')]);
  r = run();
  check('non-host final line cannot contaminate Git version', row(r.data, 'runtime version')?.status === 'PASS');
  check('Ops runtime independently verifies its trace', row(r.data, 'runtime version(opsgate.js)')?.status === 'PASS');
  check('version trace does not prove approval consumption', r.data.checks.some(c => c.item === 'host approval acceptance' && c.status === 'UNKNOWN'));

  write(gitTrace, [record('git-gate'), '{broken json']);
  r = run();
  check('malformed final line cannot hide a valid record', row(r.data, 'runtime version')?.status === 'PASS');
  write(gitTrace, [record('git-gate'), record('git-gate', { at: new Date(Date.now() - 3600000).toISOString(), sourceVersion: 'old' })]);
  r = run();
  check('stale final line cannot contaminate version', row(r.data, 'runtime version')?.status === 'PASS');
  write(gitTrace, [record('git-gate', { at: new Date(Date.now() + 3600000).toISOString() })]);
  r = run();
  check('future records are excluded', row(r.data, 'runtime version')?.status === 'UNKNOWN');
  write(gitTrace, [record('opsgate')]);
  r = run();
  check('wrong gate records are excluded', row(r.data, 'runtime version')?.status === 'UNKNOWN');
  write(gitTrace, [record('git-gate', { caller: 'release-check' })]);
  r = run();
  check('probe-only records never become host records', row(r.data, 'runtime version')?.status === 'UNKNOWN');
  write(gitTrace, [record('git-gate', { sourceVersion: '999.0' })]);
  write(opsTrace, [record('opsgate', { sourceVersion: '999.0' })]);
  r = run();
  check('each hook version mismatch fails', row(r.data, 'runtime version')?.status === 'FAIL' && row(r.data, 'runtime version(opsgate.js)')?.status === 'FAIL');
  check('FAIL is the exact number of rows', r.data.fail === r.data.checks.filter(c => c.status === 'FAIL').length && r.data.fail >= 2);
  check('any FAIL returns 1', r.code === 1);
  for (const [gate, file, item] of [
    ['git-gate', gitTrace, 'runtime version'],
    ['opsgate', opsTrace, 'runtime version(opsgate.js)']
  ]) {
    for (const sourceVersion of [undefined, '', 'unknown', 15]) {
      write(file, [record(gate, { sourceVersion })]);
      r = run();
      check(`${gate} unknown version ${String(sourceVersion)} is not PASS`, row(r.data, item)?.status === 'UNKNOWN');
    }
    write(file, [record(gate, { sourceVersion: '999.0' }), record(gate)]);
    r = run();
    check(`${gate} matching final line cannot hide a prior mismatch`, row(r.data, item)?.status === 'FAIL');
    write(file, [record(gate, { event: 'fake-event' })]);
    r = run();
    check(`${gate} invalid event is excluded`, row(r.data, item)?.status === 'UNKNOWN');
    write(file, [record(gate), record(gate, { at: 'not-a-date', sourceVersion: '999.0' }), 'null', '[]']);
    r = run();
    check(`${gate} invalid dates and JSON shapes cannot contaminate evidence`, row(r.data, item)?.status === 'PASS');
    write(file, [record(gate, { sourceVersion: 'unknown' }), record(gate, { sourceVersion: '999.0' })]);
    r = run();
    check(`${gate} explicit mismatch takes precedence over unknown`, row(r.data, item)?.status === 'FAIL');
    write(file, []);
    r = run();
    check(`${gate} empty trace stays UNKNOWN`, row(r.data, item)?.status === 'UNKNOWN');
    write(file, [record(gate)]);
  }
  const settings = path.join(env.HOME, '.claude/settings.json');
  fs.mkdirSync(path.dirname(settings), { recursive: true });
  fs.writeFileSync(settings, JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Edit', hooks: [
    { type: 'command', command: 'node git-gate.js' }, { type: 'command', command: 'node opsgate.js' }
  ] }] } }));
  r = run();
  check('Edit matcher is not Bash registration for either hook', ['settings registration(git-gate.js)', 'settings registration(opsgate.js)'].every(item => row(r.data, item)?.status === 'UNKNOWN'));

  // Install form: symlink vs physical copy. A symlink resolving back to the source is
  // the same files by construction, so it must PASS without a content diff; a broken or
  // foreign symlink and a drifted physical copy must not be silently accepted.
  const foreign = path.join(root, 'foreign-skill');
  fs.mkdirSync(foreign, { recursive: true });
  const symTarget = path.join(root, 'install-symlink');
  fs.symlinkSync(root, symTarget, 'dir');
  env.HELLODEV_CLAUDE_TARGET = symTarget;
  r = run();
  check('symlink install resolving to source passes as symlink', row(r.data, 'claude symlink')?.status === 'PASS' && !row(r.data, 'claude content'));

  env.HELLODEV_CLAUDE_TARGET = path.join(root, 'broken-symlink');
  fs.symlinkSync(path.join(root, 'does-not-exist'), env.HELLODEV_CLAUDE_TARGET, 'dir');
  r = run();
  check('broken symlink install fails instead of reading as absent', row(r.data, 'claude symlink')?.status === 'FAIL');

  fs.copyFileSync(path.join(root, 'SKILL.md'), path.join(foreign, 'SKILL.md'));
  env.HELLODEV_CLAUDE_TARGET = path.join(root, 'foreign-symlink');
  fs.symlinkSync(foreign, env.HELLODEV_CLAUDE_TARGET, 'dir');
  r = run();
  check('symlink to a foreign directory is not a source install', row(r.data, 'claude symlink')?.status !== 'PASS' || /foreign/i.test(row(r.data, 'claude symlink')?.detail || ''));

  env.HELLODEV_CLAUDE_TARGET = path.join(root, 'drifted-copy');
  fs.mkdirSync(env.HELLODEV_CLAUDE_TARGET, { recursive: true });
  fs.writeFileSync(path.join(env.HELLODEV_CLAUDE_TARGET, 'SKILL.md'), fs.readFileSync(path.join(root, 'SKILL.md'), 'utf8') + '\n<!-- drift -->\n');
  r = run();
  check('drifted physical copy still fails', row(r.data, 'claude content')?.status === 'FAIL');
  delete env.HELLODEV_CLAUDE_TARGET;

  const usage = spawnSync('bash', [path.join(root, 'scripts/release-check.sh'), '--not-an-option'], { env, encoding: 'utf8' });
  check('usage error returns 2', usage.status === 2);
} catch (error) {
  console.error(error.stack);
  failed++;
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
console.log(`${passed} passed / ${failed} failed`);
process.exitCode = failed ? 1 : 0;
