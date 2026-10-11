#!/usr/bin/env node
'use strict';

// One explicit host/path contract shared by setup and release inspection.
// Config presence is not proof of host loading or consumed approval decisions.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { isDeepStrictEqual } = require('util');
const { splitSegments, tokenize } = require('./lib/bash-lex');

const HOSTS = ['claude', 'codebuddy', 'workbuddy', 'codex'];
const NAMES = ['git-gate.js', 'opsgate.js'];
function absolute(value, label) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || /[\0\r\n]/.test(value)) throw new Error(`${label} must be an absolute path`);
  return path.normalize(value);
}
function resolveHost(options = {}, env = process.env, home = os.homedir()) {
  const host = options.host || env.HELLODEV_HOST || (env.WORKBUDDY_SESSION ? 'workbuddy' : null);
  if (host && !HOSTS.includes(host)) throw new Error(`Unsupported host: ${host}`);
  const skillDir = options.skillDir || env.HELLODEV_SKILL_DIR || (host ? path.join(home, `.${host}`, 'skills/hello-dev') : null);
  let settings = options.settings || env.HELLODEV_SETTINGS || null;
  if (!settings && ['claude', 'codebuddy', 'workbuddy'].includes(host)) settings = path.join(home, `.${host}`, 'settings.json');
  if (!settings && host === 'codex') settings = path.join(home, '.codex/hooks.json');
  if (settings) settings = absolute(settings, 'settings');
  return {
    host: host || 'unselected', settings,
    skillDir: skillDir ? absolute(skillDir, 'skill-dir') : null,
    nodeBin: absolute(options.nodeBin || process.execPath, 'node-bin'),
    status: settings && host ? 'SELECTED' : 'UNKNOWN',
    reason: !host ? 'Select --host; directory presence is not host detection' : !settings ? 'No default settings path for this host; provide --settings explicitly' : 'Explicit configuration selection only; host loading and ask consumption require separate evidence'
  };
}
function matchesBash(m) {
  if (m === undefined || m === null || m === '' || m === '*') return true;
  if (typeof m !== 'string') return false;
  if (/^[A-Za-z0-9_\- ,|]+$/.test(m)) return m.split(/[,|]/).map(s => s.trim()).includes('Bash');
  try { return new RegExp(m).test('Bash'); } catch { return false; }
}
function shellQuote(value) { return "'" + value.replace(/'/g, "'\\''") + "'"; }
function expectedCommands(contract) {
  return NAMES.map((name, i) => {
    const prefix = i ? 'HELLODEV_OPSGATE' : 'HELLODEV_GIT_GATE';
    return `${prefix}_CALLER=host ${prefix}_TRACE=${shellQuote(path.join(os.tmpdir(), i ? 'hello-dev-opsgate-trace.log' : 'hello-dev-git-gate-trace.log'))} ${shellQuote(contract.nodeBin)} ${shellQuote(path.join(contract.skillDir, 'hooks', name))}`;
  });
}
function inspectConfig(cfg, contract) {
  const found = { 'git-gate.js': false, 'opsgate.js': false };
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg) || cfg.disableAllHooks === true) return found;
  if (!contract.skillDir || !Array.isArray(cfg.hooks?.PreToolUse)) return found;
  for (const group of cfg.hooks.PreToolUse) {
    if (!group || !matchesBash(group.matcher) || !Array.isArray(group.hooks)) continue;
    for (const hook of group.hooks) {
      if (hook?.type !== 'command' || typeof hook.command !== 'string') continue;
      // Deliberately narrow: accept one direct Node invocation, not text mentions,
      // echo, wrappers, fallback chains or dynamically evaluated script paths.
      const segments = splitSegments(hook.command);
      if (segments.length !== 1 || /[`\n\r]|\$\(/.test(hook.command)) continue;
      const tokens = tokenize(segments[0]);
      const assignments = {};
      while (tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[0])) {
        const token = tokens.shift(), index = token.indexOf('=');
        assignments[token.slice(0, index)] = token.slice(index + 1);
      }
      if (tokens.length !== 2 || !/^(node|nodejs)(\.exe)?$/.test(path.basename(tokens[0]))) continue;
      for (const [i, name] of NAMES.entries()) {
        const prefix = i ? 'HELLODEV_OPSGATE' : 'HELLODEV_GIT_GATE';
        let script = tokens[1].replace(/^\$HOME(?=\/)/, os.homedir());
        if (!path.isAbsolute(script)) continue;
        script = path.normalize(script);
        if (script !== path.join(contract.skillDir, 'hooks', name)) continue;
        if (assignments[`${prefix}_CALLER`] !== 'host' || !assignments[`${prefix}_TRACE`]) continue;
        if (!fs.existsSync(script)) continue;
        found[name] = true;
      }
    }
  }
  return found;
}
function readConfig(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('settings must be a regular, non-symlink file');
  const text = fs.readFileSync(file, 'utf8'), cfg = JSON.parse(text);
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) throw new Error('settings top-level must be an object');
  if (cfg.hooks !== undefined && (!cfg.hooks || typeof cfg.hooks !== 'object' || Array.isArray(cfg.hooks))) throw new Error('hooks must be an object');
  if (cfg.hooks?.PreToolUse !== undefined && !Array.isArray(cfg.hooks.PreToolUse)) throw new Error('PreToolUse must be an array');
  return { text, cfg, mode: stat.mode & 0o777 };
}
function parseArgs(argv) {
  const options = {}, seen = new Set();
  const values = { '--host': 'host', '--settings': 'settings', '--skill-dir': 'skillDir', '--node-bin': 'nodeBin' };
  const switches = { '--apply': 'apply', '--check': 'check', '--dry-run': 'dryRun', '--describe': 'describe', '--json': 'json', '--help': 'help', '-h': 'help' };
  for (let i = 0; i < argv.length; i++) {
    const split = argv[i].indexOf('='), key = split < 0 ? argv[i] : argv[i].slice(0, split);
    const name = values[key] || switches[key];
    if (!name || seen.has(name)) throw new Error(`Unknown or duplicate option: ${key}`);
    seen.add(name);
    if (values[key]) {
      const value = split < 0 ? argv[++i] : argv[i].slice(split + 1);
      if (!value || value.startsWith('--')) throw new Error(`Missing value: ${key}`);
      options[name] = value;
    } else {
      if (split >= 0) throw new Error(`Flag takes no value: ${key}`);
      options[name] = true;
    }
  }
  if ([options.apply, options.check, options.dryRun, options.describe].filter(Boolean).length > 1) throw new Error('Choose only one mode: apply/check/dry-run/describe');
  return options;
}
function main(argv = process.argv.slice(2)) {
  let options, contract;
  try { options = parseArgs(argv); contract = resolveHost(options); } catch (error) { console.error(error.message); return 2; }
  if (options.help) {
    console.log('Usage: register-hooks.js --host=<claude|codebuddy|workbuddy|codex> [--settings=/absolute/file] [--skill-dir=/absolute/skill] [--node-bin=/absolute/node] [--describe|--check|--dry-run|--apply] [--json]');
    console.log('Default: read-only dry-run. Exit 0=config check/plan passed; 1=invalid config; 2=usage; 3=UNKNOWN/unregistered. Registration is not host acceptance.');
    return 0;
  }
  if (options.describe) { console.log(JSON.stringify(contract)); return 0; }
  if (contract.status === 'UNKNOWN') { console.log(options.json ? JSON.stringify(contract) : `UNKNOWN: ${contract.reason}`); return options.check || options.apply ? 3 : 0; }
  let original;
  try { original = readConfig(contract.settings); } catch (error) {
    if (error.code === 'ENOENT') { console.log(`UNKNOWN: settings not found: ${contract.settings}; let the selected host create it first`); return options.check || options.apply ? 3 : 0; }
    console.error(`Invalid settings: ${error.message}; no changes made`); return 1;
  }
  const found = inspectConfig(original.cfg, contract), registered = NAMES.every(name => found[name]);
  if (options.check) {
    const evidence = registered && contract.host === 'codex'
      ? 'selected settings registration only; Codex parses but does not yet support permissionDecision ask'
      : 'selected settings registration only';
    console.log(options.json ? JSON.stringify({ ...contract, found, status: registered ? 'PASS' : 'UNKNOWN', evidence }) : `${registered ? 'PASS' : 'UNKNOWN'}: ${evidence}`);
    return registered ? 0 : 3;
  }
  if (registered) { console.log('PASS: both selected direct commands already registered; host acceptance remains unverified'); return 0; }
  if (original.cfg.disableAllHooks === true) { console.error('All hooks disabled by host setting; script will not change this permission'); return 1; }
  const commands = expectedCommands(contract);
  if (!options.apply) { console.log(`[dry-run] ${contract.host}: would append one Bash entry to ${contract.settings}`); commands.forEach(c => console.log(`  ${c}`)); console.log('No writes. Host panel confirmation/loading and real ask/deny acceptance must be verified separately.'); return 0; }
  for (const name of NAMES) if (!fs.existsSync(path.join(contract.skillDir, 'hooks', name))) { console.error(`Hook missing: ${name}; no changes made`); return 1; }
  const after = JSON.parse(original.text);
  after.hooks ||= {};
  after.hooks.PreToolUse ||= [];
  after.hooks.PreToolUse.push({ matcher: 'Bash', hooks: commands.map(command => ({ type: 'command', command, timeout: 10 })) });
  const strip = cfg => { const copy = { ...cfg }; delete copy.hooks; return copy; };
  if (!isDeepStrictEqual(strip(after), strip(original.cfg)) || !isDeepStrictEqual(after.hooks.PreToolUse.slice(0, -1), original.cfg.hooks?.PreToolUse || [])) throw new Error('Preservation assertion failed');
  const digest = text => crypto.createHash('sha256').update(text).digest('hex');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = `${contract.settings}.bak-${stamp}-${process.pid}`;
  const temporary = `${contract.settings}.${process.pid}.tmp`;
  const lock = `${contract.settings}.hello-dev-lock`;
  let locked = false;
  try {
    fs.writeFileSync(lock, String(process.pid), { flag: 'wx', mode: 0o600 }); locked = true;
    if (fs.readFileSync(contract.settings, 'utf8') !== original.text) throw new Error('settings changed concurrently');
    fs.copyFileSync(contract.settings, backup, fs.constants.COPYFILE_EXCL);
    if (digest(fs.readFileSync(backup)) !== digest(original.text)) throw new Error('backup verification failed');
    fs.writeFileSync(temporary, JSON.stringify(after, null, 2) + '\n', { flag: 'wx', mode: original.mode });
    const checked = readConfig(temporary).cfg;
    if (!NAMES.every(name => inspectConfig(checked, contract)[name])) throw new Error('new command validation failed');
    if (fs.readFileSync(contract.settings, 'utf8') !== original.text) throw new Error('settings changed before replacement');
    fs.renameSync(temporary, contract.settings);
    console.log(`PASS: wrote selected settings ${contract.settings}; backup ${backup}; host loading/acceptance still unverified`);
    return 0;
  } catch (error) { console.error(`Registration refused: ${error.message}`); return 1; }
  finally { if (locked) { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); fs.unlinkSync(lock); } }
}
module.exports = { resolveHost, inspectConfig, readConfig, matchesBash, expectedCommands, parseArgs };
if (require.main === module) { try { process.exitCode = main(); } catch (error) { console.error(error.message); process.exitCode = 1; } }
