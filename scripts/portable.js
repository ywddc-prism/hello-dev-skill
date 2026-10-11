#!/usr/bin/env node
'use strict';

/**
 * Hello Dev portable package: bundle skill and host config into a self-contained archive, restore on new machine.
 *
 * Reason: scripts/setup.sh assumes 'has source code' (new machine gets it via git clone).
 * But three types of content clone can't get — uncommitted changes, .hello-dev/ excluded by .gitignore,
 * and ~/.claude/CLAUDE.md outside the repo. This script fills exactly this gap:
 *   old machine pack -> copy tarball -> new machine restore -> setup.sh integration.
 *
 * What it does NOT do:
 *  - Does not pack mcpServers / enabledPlugins / env (contains credentials and host-private items).
 *  - Does not pack local permissions.allow (`Bash(git *)` type allow-list cross-machine injection equals
 *    silently widening new machine permissions); restore writes fixed DEFAULT_ALLOW, deduplicated merge with target machine entries.
 *  - Does not execute commit / push / sync install copies; authorization boundary same as SKILL.md.
 *  - Does not overwrite non-empty target directory, does not overwrite existing .hello-dev/memory.json.
 *
 * Usage:
 *   node scripts/portable.js pack   [--apply] [--out <dir>] [--no-memories]
 *   node scripts/portable.js install [--apply] [--target <dir>] [--force] [--no-perms]
 *   node scripts/portable.js restore <tarball> [--apply] [--target <dir>] [--force] [--no-perms]
 *   node scripts/portable.js inspect <tarball>
 *
 * install source is this script's directory (i.e. unpacked package directory), so restore.sh can call it directly,
 * no need to pass tarball path — avoids 'unpack directory references back to archive' cycle.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
// Shared home resolution: os.homedir() ignores HOME (and HELLODEV_HOME) on win32,
// so every ~/.claude path here goes through the one resolver instead.
const { resolveClaudeConfigDir } = require('./lib/home.js');

/** Skill root where this script lives: during pack it's the source repo, during install it's the unpacked package directory. */
const SKILL_ROOT = path.resolve(__dirname, '..');
const SKILL_NAME = 'hello-dev';
const MANIFEST = 'hello-dev-portable.json';

/**
 * Whitelist keys restored to target settings.json.
 * Only keys listed here are allowed to be written from snapshot; the rest (mcpServers, env, enabledPlugins...)
 * keep target machine's original values — contains credentials and host-private config, cross-machine overwrite is overreach.
 */
const SETTINGS_WHITELIST = ['permissions'];
/** permissions only migrates these keys; allow uses DEFAULT_ALLOW, doesn't take pack machine's actual values. */
const PERMISSION_KEYS = ['defaultMode'];

/**
 * Fixed default set for new machine permissions.allow.
 * Deliberately doesn't use pack machine's 12 actual values: allow-list belongs to host policy, spreading with package = silent privilege escalation.
 */
const DEFAULT_ALLOW = [
  'Bash(npm run test *)',
  'Bash(node --check *)',
  'Bash(git status *)',
  'Bash(git diff *)',
  'Bash(git log *)',
];

/** Pack exclusion: exact names. .hello-dev handled separately (memory.json via snapshot, state not packed). */
const EXCLUDE_EXACT = new Set(['.git', '.DS_Store', 'archive', 'tmp', 'node_modules', '.hello-dev']);
/** Pack exclusion: suffixes. tarball itself and temp artifacts must not enter package, otherwise repackaging self-inflates. */
const EXCLUDE_SUFFIX = ['.DS_Store', '.tar.gz', '.zip', '.bak', '.tmp', '.log'];
/** Pack exclusion: entire directories.
 * - `docs/progress_coding/`: dev logs, author's change stream in this repo, not portable config,
 *   and backend log has accumulated 2600+ lines, packing would bloat archive unnecessarily.
 * - `feedback/`: user feedback records in this repo, not portable skill config.
 * - `.workbuddy/`: WorkBuddy host project-level workspace data (session state, daily log).
 * - `generated-images/`, `template_images/`: images generated during local debugging, not skill config.
 */
const EXCLUDE_DIR = new Set([
  'docs/progress_coding',
  'feedback',
  '.workbuddy',
  'generated-images',
  'template_images',
]);
/**
 * Pack exclusion: content filter.
 * - md files marked as 'historical design draft': SKILL.md explicitly states 'agents/, modules/automation/,
 *   modules/core/memory/ and content marked as historical design drafts are not current execution basis',
 *   they won't be read on new machine either, but take up archive space and pollute module index.
 *   Detection: 'historical design draft' text appears within first 5 lines.
 */
const HISTORICAL_MARKER = /\u5386\u53f2\u8bbe\u8ba1\u7a3f/;

const argv = process.argv.slice(2);
const cmd = argv[0];

function flag(name) { return argv.includes(name); }
function opt(name, dflt) {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt;
}
function die(msg, code) {
  process.stderr.write('[FAIL] ' + msg + '\n');
  process.exit(code === undefined ? 1 : code);
}
function shaFile(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }
function humanSize(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}
function mkdtemp(prefix) { return fs.mkdtempSync(path.join(os.tmpdir(), prefix)); }

function excluded(name) {
  if (EXCLUDE_EXACT.has(name)) return true;
  return EXCLUDE_SUFFIX.some(s => name.endsWith(s));
}

/** Recursively list relative paths; skip excluded items, historical design drafts, dev logs, and symlinks. */
function walk(root) {
  const out = [];
  const excludedDirs = new Set();   // excluded dir relative paths, avoid redundant checks
  (function rec(base, relBase) {
    for (const name of fs.readdirSync(base)) {
      if (excluded(name)) continue;
      const abs = path.join(base, name);
      const rel = relBase ? path.join(relBase, name) : name;
      let st;
      try { st = fs.lstatSync(abs); } catch (e) { continue; }
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) {
        // Whole-directory exclusion (docs/progress_coding/)
        if (EXCLUDE_DIR.has(rel)) { excludedDirs.add(rel); continue; }
        rec(abs, rel);
      } else if (st.isFile()) {
        // Content filter: skip md files marked as 'historical design draft'
        if (name.endsWith('.md') && isHistoricalDesign(abs)) continue;
        out.push(path.relative(root, abs));
      }
    }
  })(root, '');
  return out;
}

/**
 * Check if first 3 lines contain the full 'WARNING **historical design draft**' marker.
 * Only matches explicit marker lines with warning symbol - descriptive mentions (e.g. modules/index.md
 * line 4 'files marked as historical design draft at the top are non-authoritative') don't count,
 * that's the index file's own description. Read failure treated as non-historical (doesn't interrupt packing).
 */
function isHistoricalDesign(abs) {
  try {
    const fd = fs.openSync(abs, 'r');
    try {
      const buf = Buffer.alloc(1024);
      const n = fs.readSync(fd, buf, 0, buf.length, 0);
      const head = buf.slice(0, n).toString('utf8').split('\n').slice(0, 3).join('\n');
      return /\u26a0\ufe0f\s*\*{0,2}\u5386\u53f2\u8bbe\u8ba1\u7a3f/.test(head);
    } finally { fs.closeSync(fd); }
  } catch (e) { return false; }
}

/**
 * Extract version from SKILL.md frontmatter.
 * Frontmatter is between two `---` blocks, version is indented under `metadata:`.
 * Returns 'unknown' on extraction failure - doesn't block packing, but inspect shows unknown version.
 */
function extractSkillVersion() {
  const skillMd = path.join(SKILL_ROOT, 'SKILL.md');
  if (!fs.existsSync(skillMd)) return 'unknown';
  try {
    const content = fs.readFileSync(skillMd, 'utf8');
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) return 'unknown';
    const fm = fmMatch[1];
    // Match version: "x.y" or version: x.y after metadata:
    const verMatch = fm.match(/metadata:\s*\n\s*version:\s*"?([^"\n]+)"?/);
    return verMatch ? verMatch[1].trim() : 'unknown';
  } catch (e) { return 'unknown'; }
}

/**
 * Read memory.json entry count. Reads file directly, not via read() -
 * read() requires cwd to be project root; during packing cwd may not be the .hello-dev/ directory.
 */
function countMemoryEntries(memPath) {
  if (!fs.existsSync(memPath)) return 0;
  try {
    const m = JSON.parse(fs.readFileSync(memPath, 'utf8'));
    return Array.isArray(m.entries) ? m.entries.length : 0;
  } catch (e) { return 0; }
}

/**
 * Verify hook files exist. Called during pack; if hook paths change after installing on new machine it breaks.
 * Returns { exists: boolean, paths: { gitGate: string, opsGate: string } }
 */
function verifyHookPaths() {
  const gitGate = path.join(SKILL_ROOT, 'hooks/git-gate.js');
  const opsGate = path.join(SKILL_ROOT, 'hooks/opsgate.js');
  return {
    exists: fs.existsSync(gitGate) && fs.existsSync(opsGate),
    paths: { gitGate, opsGate }
  };
}

function tar(args) {
  const r = spawnSync('tar', args, { encoding: 'utf8' });
  if (r.error) die('Failed to execute tar: ' + r.error.message);
  return r;
}

// ---------------------------------------------------------------- pack

function pack() {
  const apply = flag('--apply');
  // Default to system temp dir, not cwd: running pack in another project would write
  // tar.gz into that repo, and its .gitignore may not exclude *.tar.gz - accidental commit risk.
  // Use explicit --out to place elsewhere.
  const outDir = path.resolve(opt('--out', os.tmpdir()));
  const withMemories = !flag('--no-memories');

  if (!fs.existsSync(path.join(SKILL_ROOT, 'SKILL.md'))) {
    die('Not a valid HelloDev skill directory: ' + SKILL_ROOT);
  }

  console.log('== pack ==' + (apply ? '' : ' (dry-run, add --apply to write)'));
  console.log('Source: ' + SKILL_ROOT);

  const tmp = mkdtemp('hello-dev-pack-');
  const stage = path.join(tmp, SKILL_NAME);
  fs.mkdirSync(stage, { recursive: true });

  // 1) skill files
  const files = walk(SKILL_ROOT);
  for (const rel of files) {
    const dst = path.join(stage, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(path.join(SKILL_ROOT, rel), dst);
  }
  console.log('  [OK] skill files: ' + files.length);

  // 2) Host config snapshot (whitelist keys, no credentials)
  const skillVersion = extractSkillVersion();
  const config = {
    schema: 2,  // Upgraded to schema 2: added skillVersion, memoryEntryCount, hookPaths
    capturedAt: new Date().toISOString(),
    host: os.hostname(),
    skillVersion,
    settings: {},
    claudeMd: null,
  };

  // Pack reads the same config dir the host resolves at runtime; os.homedir() would skip
  // CLAUDE_CONFIG_DIR/HELLODEV_HOME/HOME and snapshot the wrong machine's settings.
  const settingsPath = path.join(resolveClaudeConfigDir(), 'settings.json');
  if (fs.existsSync(settingsPath)) {
    try {
      const s = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      const picked = {};
      for (const k of SETTINGS_WHITELIST) {
        if (s[k] !== undefined) picked[k] = JSON.parse(JSON.stringify(s[k]));
      }
      if (picked.permissions && typeof picked.permissions === 'object') {
        delete picked.permissions.allow;   // allow list doesn't cross-machine migrate
        for (const k of Object.keys(picked.permissions)) {
          if (!PERMISSION_KEYS.includes(k)) delete picked.permissions[k];
        }
      }
      config.settings = picked;
      const skipped = ['mcpServers', 'env', 'enabledPlugins'].filter(k => s[k] !== undefined);
      console.log('  [OK] settings snapshot: ' + (Object.keys(picked).join(', ') || '(no whitelist keys)') +
        (skipped.length ? '; excluded ' + skipped.join('/') : '') +
        '; permissions.allow excluded');
    } catch (e) {
      console.log('  [WARN] settings.json read failed, skipping: ' + e.message);
    }
  } else {
    console.log('  - no settings.json, skipping');
  }

  const claudeMd = path.join(resolveClaudeConfigDir(), 'CLAUDE.md');   // same config-dir source as settingsPath above
  if (fs.existsSync(claudeMd)) {
    config.claudeMd = fs.readFileSync(claudeMd, 'utf8');
    console.log('  [OK] CLAUDE.md snapshot: ' + config.claudeMd.split('\n').length + ' lines');
  } else {
    console.log('  - no global CLAUDE.md, skipping');
  }

  fs.writeFileSync(path.join(stage, MANIFEST), JSON.stringify(config, null, 2) + '\n');

  // 3) Project memory: .hello-dev/ is excluded by .gitignore, can't get via clone, so snapshot separately
  let memCount = 0;
  let memoryEntryCount = 0;
  const memSrc = path.join(SKILL_ROOT, '.hello-dev', 'memory.json');
  if (!withMemories) {
    console.log('  - --no-memories: not packing memory');
  } else if (fs.existsSync(memSrc)) {
    fs.copyFileSync(memSrc, path.join(stage, 'memory.json'));
    memCount = 1;
    memoryEntryCount = countMemoryEntries(memSrc);
    console.log('  [OK] project memory: .hello-dev/memory.json (' + memoryEntryCount + ' entries, state/archive excluded)');
  } else {
    console.log('  - no .hello-dev/memory.json, skipping');
  }

  // 4) Verify hook paths exist (hooks must exist during pack, otherwise they break after install on new machine)
  const hookCheck = verifyHookPaths();
  if (!hookCheck.exists) {
    console.log('  [WARN] hook files missing: git-gate.js or opsgate.js not found');
    console.log('    Hook paths will break after install on new machine, need manual fix or re-run setup.sh');
  } else {
    console.log('  [OK] hook files present (git-gate.js, opsgate.js)');
  }

  // 5) Write memoryEntryCount and hookPaths to config (must be before writing manifest)
  config.hookPaths = hookCheck.paths;
  config.memoryEntryCount = memoryEntryCount;

  // 6) Write manifest (config now contains all fields)
  fs.writeFileSync(path.join(stage, MANIFEST), JSON.stringify(config, null, 2) + '\n');

  // 7) Restore entry point: runnable after unpack (bash + PowerShell versions)
  const restoreSh = path.join(stage, 'restore.sh');
  fs.writeFileSync(restoreSh, RESTORE_SH);
  fs.chmodSync(restoreSh, 0o755);

  const restorePs = path.join(stage, 'restore.ps1');
  fs.writeFileSync(restorePs, RESTORE_PS);
  // PowerShell scripts don't need +x, but Windows execution policy requires Unrestricted or RemoteSigned

  const manifestOut = {
    schema: 2,
    skill: SKILL_NAME,
    skillVersion,
    createdAt: config.capturedAt,
    host: config.host,
    fileCount: files.length,
    includesMemories: memCount > 0,
    memoryEntryCount,
    includesClaudeMd: config.claudeMd !== null,
    settingsKeys: Object.keys(config.settings),
    hookPathsVerified: hookCheck.exists,
  };

  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const name = SKILL_NAME + '-portable-' + stamp + '.tar.gz';
  const outPath = path.join(outDir, name);

  if (!apply) {
    console.log('  [dry-run] would write: ' + outPath);
    console.log('  [dry-run] contents: skill ' + files.length + ' files / config snapshot / ' +
      (memCount ? 'memory ' + memoryEntryCount + ' entries / ' : '') + 'restore.sh + restore.ps1');
    console.log('  skill version: ' + skillVersion);
    console.log('  Add --apply to actually pack.');
    fs.rmSync(tmp, { recursive: true, force: true });
    return 0;
  }

  fs.mkdirSync(outDir, { recursive: true });
  if (fs.existsSync(outPath)) die('Target already exists, refusing to overwrite: ' + outPath);

  const r = tar(['-czf', outPath, '-C', tmp, SKILL_NAME]);
  if (r.status !== 0) {
    fs.rmSync(tmp, { recursive: true, force: true });
    die('tar packing failed: ' + (r.stderr || '').trim());
  }

  const size = fs.statSync(outPath).size;
  const digest = shaFile(outPath);
  fs.writeFileSync(outPath + '.sha256', JSON.stringify({
    archive: name, sha256: digest, sizeBytes: size, manifest: manifestOut,
  }, null, 2) + '\n');
  fs.rmSync(tmp, { recursive: true, force: true });

  console.log('  [OK] written: ' + outPath + ' (' + humanSize(size) + ')');
  console.log('  [OK] checksum: ' + outPath + '.sha256');
  console.log('  sha256:   ' + digest);
  console.log('\nAfter copying to new machine:');
  console.log('  Unix/macOS:   tar -xzf ' + name + ' && cd ' + SKILL_NAME + ' && bash restore.sh --apply');
  console.log('  Windows:      tar -xzf ' + name + '; cd ' + SKILL_NAME + '; .\\restore.ps1 -Apply');
  return 0;
}

// ---------------------------------------------------------------- install

/**
 * Install from package directory (this script's directory) to target location and apply config snapshot.
 * Both restore.sh and restore <tarball> go through here, single copy of logic.
 */
function install() {
  const apply = flag('--apply');
  const force = flag('--force');
  const withPerms = !flag('--no-perms');
  // Default install location follows the resolved config dir: os.homedir() ignores
  // CLAUDE_CONFIG_DIR/HELLODEV_HOME/HOME on win32, so --target defaults would point elsewhere.
  const target = path.resolve(opt('--target', path.join(resolveClaudeConfigDir(), 'skills', SKILL_NAME)));

  const src = SKILL_ROOT;
  if (!fs.existsSync(path.join(src, 'SKILL.md'))) die('Source directory missing SKILL.md: ' + src);

  let config = null;
  // manifest lookup order: .hello-dev/ first (new package), then root (old package compatibility)
  const cfgPathNew = path.join(src, '.hello-dev', MANIFEST);
  const cfgPathOld = path.join(src, MANIFEST);
  const cfgPath = fs.existsSync(cfgPathNew) ? cfgPathNew : (fs.existsSync(cfgPathOld) ? cfgPathOld : null);
  if (cfgPath) {
    try { config = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); }
    catch (e) { console.log('  [WARN] config snapshot not parseable: ' + e.message); }
  }

  console.log('== install ==' + (apply ? '' : ' (dry-run, add --apply to write to disk)'));
  console.log('Source:   ' + src);
  console.log('Target: ' + target);
  if (config) console.log('From: ' + config.host + ' @ ' + config.capturedAt);

  // Safety valve: four cases when target exists. Order must not be rearranged -
  // symlink check must come **before** realpath comparison: after dereferencing,
  // symlink and package directory may be same inode (symlink points directly to package),
  // in which case realTarget === realSrc would be misidentified as 'source is target',
  // bypassing all checks and writing files into package directory (defect #7, found this round).
  let srcIsTarget = false;
  if (fs.existsSync(target) || isSymlink(target)) {
    if (isSymlink(target)) {
      const realTarget = safeRealpath(target);
      const realSrc = safeRealpath(src);
      if (realTarget && realSrc && realTarget === realSrc) {
        srcIsTarget = true;    // symlink resolves to package itself (same-directory unpack)
        console.log('  - target symlink resolves to this package, skipping file copy, only applying config snapshot');
      } else {
        console.log('  [FAIL] target is a symlink: ' + target + ' -> ' + readlinkSafe(target));
        console.log('    Overwriting symlink would write through to its target directory (may not be this skill). Manually verify then remove the symlink first.');
        return 1;
      }
    } else if (safeRealpath(target) === safeRealpath(src)) {
      srcIsTarget = true;      // regular directory, path is the package directory
      console.log('  - source is target, skipping file copy, only applying config snapshot');
    } else {
      const existingIsHelloDev = isHelloDevInstall(target);
      const nonEmpty = fs.readdirSync(target).filter(n => n !== '.DS_Store').length > 0;
      // Target is itself a HelloDev install -> this is an update, not overwriting third-party directory.
      // Unconditional refusal would force users who 'already have it installed' to add --force every time,
      // but --force semantics are 'can overwrite anything', the two must not be mixed (defect #5).
      if (nonEmpty && !existingIsHelloDev && !force) {
        console.log('  [FAIL] target exists and is not a HelloDev install: ' + target);
        console.log('    Refusing to overwrite third-party directory. Add --force after confirming (backs up to <target>.bak-<ts> first).');
        return 1;
      }
      if (existingIsHelloDev) {
        console.log('  - detected existing HelloDev install, treating as update (original directory backed up first)');
      }
    }
  }

  const files = walk(src);
  if (!apply) {
    console.log('  [dry-run] would write ' + files.length + ' files to ' + target);
    if (config && config.claudeMd) console.log('  [dry-run] would write ~/.claude/CLAUDE.md (backup first)');
    if (config && config.settings && Object.keys(config.settings).length) {
      console.log('  [dry-run] would merge settings.json whitelist keys: ' + Object.keys(config.settings).join(', '));
      if (withPerms) console.log('  [dry-run] permissions.allow -> default set ' + DEFAULT_ALLOW.length + ' entries + target machine existing (deduplicated)');
    }
    if (fs.existsSync(path.join(src, 'memory.json'))) {
      console.log('  [dry-run] memory: ' + (fs.existsSync(memoryDst())
        ? 'target exists, not overwriting' : 'write to ' + memoryDst()));
    }
    console.log('  Add --apply to actually restore.');
    return 0;
  }

  // ---- Write ----
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  let backup = null;

  // Local memory must be rescued **before deleting target directory**.
  // Defect #4: --force rmSync's entire target first, .hello-dev/memory.json gets wiped,
  // subsequent 'already exists, not overwriting' is always false -> log says not overwritten, actually lost.
  const localMemDst = memoryDst();
  let rescuedMem = null;
  if (fs.existsSync(localMemDst)) {
    try { rescuedMem = fs.readFileSync(localMemDst); } catch (e) { rescuedMem = null; }
  }

  if (!srcIsTarget) {
    if (fs.existsSync(target)) {
      backup = target + '.bak-' + ts;
      fs.cpSync(target, backup, { recursive: true });
      fs.rmSync(target, { recursive: true, force: true });
      console.log('  [OK] backed up original directory: ' + backup);
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(src, target, { recursive: true });

    // Assert immediately after copy, then clean auxiliary files - order must not be reversed:
    // deleting MANIFEST first would cause subsequent reads to miss, disguising 'incomplete copy' as success (hidden dependency found this round).
    if (!fs.existsSync(path.join(target, 'SKILL.md'))) {
      console.log('  [FAIL] missing SKILL.md after copy, rolled back');
      if (backup) { fs.rmSync(target, { recursive: true, force: true }); fs.cpSync(backup, target, { recursive: true }); }
      return 1;
    }

    // Package auxiliary files don't belong to skill runtime, clean up after install, but keep manifest for re-install.
    // manifest moved to .hello-dev/ (same directory as memory.json), avoiding pollution of install directory root.
    fs.mkdirSync(path.join(target, '.hello-dev'), { recursive: true });
    if (fs.existsSync(path.join(target, MANIFEST))) {
      fs.renameSync(path.join(target, MANIFEST), path.join(target, '.hello-dev', MANIFEST));
    }
    for (const junk of ['restore.sh', 'restore.ps1', 'memory.json']) {
      fs.rmSync(path.join(target, junk), { force: true });
    }
    console.log('  [OK] skill installed: ' + walk(target).length + ' files -> ' + target);
  }

  // Memory: write to **install target**'s .hello-dev/, not package directory (defect #1).
  // Priority: local existing memory > package snapshot. Keep if exists - overwriting equals erasing local experience.
  const mem = path.join(src, 'memory.json');
  const memDst = memoryDst();
  if (rescuedMem) {
    fs.mkdirSync(path.dirname(memDst), { recursive: true });
    fs.writeFileSync(memDst, rescuedMem);
    console.log('  [OK] local memory preserved: ' + memDst);
  } else if (fs.existsSync(mem)) {
    fs.mkdirSync(path.dirname(memDst), { recursive: true });
    fs.copyFileSync(mem, memDst);
    console.log('  [OK] memory restored: ' + memDst);
  }

  let settingsWarn = '';
  if (config && config.claudeMd) {
    const mdPath = path.join(resolveClaudeConfigDir(), 'CLAUDE.md');   // written back to the same dir pack read from
    if (fs.existsSync(mdPath)) {
      const b = mdPath + '.bak-' + ts;
      fs.copyFileSync(mdPath, b);
      console.log('  [OK] CLAUDE.md backed up: ' + b);
    }
    fs.mkdirSync(path.dirname(mdPath), { recursive: true });
    fs.writeFileSync(mdPath, config.claudeMd);
    console.log('  [OK] CLAUDE.md restored (' + config.claudeMd.split('\n').length + ' lines)');
  }

  if (config && config.settings && Object.keys(config.settings).length) {
    if (!mergeSettings(config.settings, withPerms, ts)) {
      // Host state issue (settings missing/corrupted), not a restore action failure.
      // Reporting exit=1 would misread 'skill installed OK' as overall failure, tempting user to re-run or
      // misdiagnose archive corruption (defect #6). Downgrade to warning, let user handle and re-run.
      settingsWarn = 'settings.json not merged (host not yet generated or unreadable, needs manual handling)';
    }
  }

  console.log('\n[OK] Restore complete. Next steps for integration (hard order constraint: symlink before hook registration):');
  if (settingsWarn) {
    console.log('  [WARN] ' + settingsWarn);
    console.log('    After handling, re-run: node scripts/portable.js install --apply');
  }
  console.log('  bash ' + path.join(target, 'scripts/setup.sh') + ' --check');
  console.log('  bash ' + path.join(target, 'scripts/setup.sh') + ' --apply');
  return 0;
}

function isSymlink(p) { try { return fs.lstatSync(p).isSymbolicLink(); } catch (e) { return false; } }
function readlinkSafe(p) { try { return fs.readlinkSync(p); } catch (e) { return '?'; } }
function safeRealpath(p) { try { return fs.realpathSync(p); } catch (e) { return null; } }

/**
 * Whether target is already a HelloDev install.
 * Criteria must be strict (SKILL.md frontmatter name must be hello-dev) -
 * loose criteria would identify any directory with scripts/ as this skill, bypassing safety valve.
 */
function isHelloDevInstall(dir) {
  const skill = path.join(dir, 'SKILL.md');
  if (!fs.existsSync(skill)) return false;
  try {
    const head = fs.readFileSync(skill, 'utf8').split('---')[1] || '';
    return /^name:\s*hello-dev\s*$/m.test(head);
  } catch (e) { return false; }
}

/**
 * Memory destination: install target's .hello-dev/memory.json.
 * Cannot use SKILL_ROOT - during restore it's a temporary unpack directory, writes would disappear with cleanup.
 */
function memoryDst() { return path.join(restoreTarget(), '.hello-dev', 'memory.json'); }

function restoreTarget() {
  // Must stay identical to install()'s default target (same resolver, not os.homedir()):
  // divergent defaults would rescue memory to one dir while files land in another.
  return path.resolve(opt('--target', path.join(resolveClaudeConfigDir(), 'skills', SKILL_NAME)));
}

/**
 * Merge whitelist keys into ~/.claude/settings.json.
 * Backup -> merge -> assert non-whitelist keys unchanged -> atomic write -> post-write verify with rollback on failure.
 */
function mergeSettings(picked, withPerms, ts) {
  // Merge into the resolved config dir, not os.homedir()/.claude - otherwise pack could
  // snapshot one location and merge into another when CLAUDE_CONFIG_DIR is set.
  const target = path.join(resolveClaudeConfigDir(), 'settings.json');
  if (!fs.existsSync(target)) {
    console.log('  [FAIL] settings.json does not exist: ' + target + ' (not creating, host must generate first)');
    return false;
  }

  let before;
  try {
    before = JSON.parse(fs.readFileSync(target, 'utf8'));
    if (!before || typeof before !== 'object' || Array.isArray(before)) {
      throw new Error('Top level must be an object');
    }
  } catch (e) {
    console.log('  [FAIL] settings.json unreadable or invalid JSON: ' + e.message + ' (unmodified)');
    return false;
  }

  const backup = target + '.bak-' + ts;
  fs.copyFileSync(target, backup);

  const after = JSON.parse(JSON.stringify(before));
  for (const k of SETTINGS_WHITELIST) {
    if (picked[k] === undefined) continue;
    const hasObj = after[k] && typeof after[k] === 'object' && !Array.isArray(after[k]);
    after[k] = hasObj ? Object.assign({}, after[k], picked[k]) : JSON.parse(JSON.stringify(picked[k]));
  }
  if (withPerms && after.permissions && typeof after.permissions === 'object') {
    // allow = default set + target machine existing (deduplicated merge), not full replacement
    const existing = Array.isArray(after.permissions.allow) ? after.permissions.allow : [];
    const merged = DEFAULT_ALLOW.slice();
    for (const e of existing) if (!merged.includes(e)) merged.push(e);
    after.permissions.allow = merged;
  }

  // Assert: not a single change allowed to content **outside** the whitelist.
  //
  // Both issues found on real machines, don't revert:
  //  1. Must strip whitelist keys before comparing - permissions is a whitelist key supposed to be added,
  //     comparing full key sets would always trigger when 'host doesn't have permissions yet', aborting
  //     the entire first install write (found on Windows; test fixtures all pre-set permissions,
  //     so this branch was never actually executed).
  //  2. Must compare **content** not key sets - when key sets are same but values changed,
  //     key-name-only assertion is always true, directly letting it through. Only full serialized comparison of stripped objects catches it.
  const outside = (o) => {
    const c = {};
    for (const k of Object.keys(o).sort()) {
      if (!SETTINGS_WHITELIST.includes(k)) c[k] = o[k];
    }
    return JSON.stringify(c);
  };
  const kb = outside(before);
  const ka = outside(after);
  if (kb !== ka) {
    console.log('  [FAIL] Aborted: settings content outside whitelist changed (' + kb + ' -> ' + ka + '), write abandoned');
    return false;
  }

  const tmpWrite = target + '.tmp-' + ts;
  try {
    fs.writeFileSync(tmpWrite, JSON.stringify(after, null, 2) + '\n');
    JSON.parse(fs.readFileSync(tmpWrite, 'utf8'));
    fs.renameSync(tmpWrite, target);
  } catch (e) {
    console.log('  [FAIL] Write failed, rolling back: ' + e.message);
    try { fs.copyFileSync(backup, target); } catch (_) {}
    return false;
  }

  let verify = null;
  try { verify = JSON.parse(fs.readFileSync(target, 'utf8')); } catch (e) {}
  const missing = SETTINGS_WHITELIST.filter(k => picked[k] !== undefined && verify && verify[k] === undefined);
  if (!verify || missing.length) {
    console.log('  [FAIL] Post-write verification failed' + (missing.length ? ' (missing keys: ' + missing.join(',') + ')' : '') + ', rolling back');
    fs.copyFileSync(backup, target);
    return false;
  }

  const written = SETTINGS_WHITELIST.filter(k => picked[k] !== undefined);
  console.log('  [OK] settings.json merged whitelist keys: ' + (written.join(', ') || '(none)'));
  if (withPerms && verify.permissions) {
    console.log('    permissions.allow: ' +
      ((verify.permissions.allow) || []).length + ' entries (default set + existing, deduplicated)');
  }
  console.log('    backup: ' + backup);
  return true;
}

// ---------------------------------------------------------------- restore

function restore() {
  const archive = argv[1];
  if (!archive || archive.startsWith('--')) die('Usage: restore <tarball> [--apply] [--target <dir>] [--force]');
  const p = path.resolve(archive);
  if (!fs.existsSync(p)) die('Archive not found: ' + p);

  const sidecar = p + '.sha256';
  if (fs.existsSync(sidecar)) {
    try {
      const want = JSON.parse(fs.readFileSync(sidecar, 'utf8')).sha256;
      const got = shaFile(p);
      if (want !== got) die('Checksum mismatch, archive may be corrupted or tampered\n  expected ' + want + '\n  actual ' + got);
      console.log('  [OK] checksum matched');
    } catch (e) {
      console.log('  [WARN] sidecar parse failed, continuing (' + e.message + ')');
    }
  } else {
    console.log('  - no .sha256 sidecar, skipping verification');
  }

  const tmp = mkdtemp('hello-dev-restore-');
  const r = tar(['-xzf', p, '-C', tmp]);
  if (r.status !== 0) die('Unpack failed: ' + (r.stderr || '').trim());

  try {
    const stage = path.join(tmp, SKILL_NAME);
    if (!fs.existsSync(path.join(stage, 'SKILL.md'))) {
      die('Archive structure error: missing ' + SKILL_NAME + '/SKILL.md');
    }

    // Subprocess runs **this file**, source = parent of this file's directory = unpack directory.
    // Arguments passed through as-is, so --target / --force / --no-perms all take effect -
    // safety valve (non-empty target, symlink) and memory destination therefore based on same target.
    const args = [__filename, 'install'].concat(argv.slice(2));
    const rr = spawnSync(process.execPath, args, { stdio: 'inherit', env: process.env });
    return rr.status === null ? 1 : rr.status;
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
  }
}

// ---------------------------------------------------------------- inspect

function inspect() {
  const archive = argv[1];
  if (!archive || archive.startsWith('--')) die('Usage: inspect <tarball>');
  const p = path.resolve(archive);
  if (!fs.existsSync(p)) die('Archive not found: ' + p);

  const digest = shaFile(p);
  console.log('Archive: ' + p);
  console.log('Size:    ' + humanSize(fs.statSync(p).size));
  console.log('sha256:  ' + digest);

  const sidecar = p + '.sha256';
  if (fs.existsSync(sidecar)) {
    try {
      const want = JSON.parse(fs.readFileSync(sidecar, 'utf8')).sha256;
      console.log('Verify:  ' + (want === digest ? '[OK] matched' : '[FAIL] mismatch (expected ' + want + ')'));
    } catch (e) { console.log('Verify:  [WARN] sidecar not parseable'); }
  } else {
    console.log('Verify:  - no sidecar');
  }

  const r = tar(['-tzf', p]);
  if (r.status !== 0) die('Failed to list contents: ' + (r.stderr || '').trim());
  const entries = (r.stdout || '').split('\n').filter(Boolean);
  console.log('Entries: ' + entries.length);

  // manifest lookup order: .hello-dev/ first (new package), then root (old package compatibility)
  const mNew = entries.find(e => e.endsWith('/.hello-dev/' + MANIFEST));
  const mOld = entries.find(e => e.endsWith('/' + MANIFEST));
  const m = mNew || mOld;
  if (m) {
    const x = tar(['-xzOf', p, m]);
    if (x.status === 0) {
      try {
        const cfg = JSON.parse(x.stdout);
        console.log('\nFrom:          ' + (cfg.host || '?') + ' @ ' + (cfg.capturedAt || '?'));
        console.log('schema:        ' + (cfg.schema || 1) + (cfg.schema === 2 ? ' (current)' : ' (old, recommend repacking)'));
        if (cfg.skillVersion) console.log('skill version: ' + cfg.skillVersion);
        console.log('settings keys: ' + (Object.keys(cfg.settings || {}).join(', ') || '(none)'));
        console.log('CLAUDE.md:     ' + (cfg.claudeMd ? cfg.claudeMd.split('\n').length + ' lines' : '(none)'));
        if (cfg.memoryEntryCount !== undefined) console.log('memory entries:  ' + cfg.memoryEntryCount);
        if (cfg.hookPaths) console.log('hook paths:    ' + (cfg.hookPaths.gitGate ? '[OK] verified' : '[WARN] unverified'));
      } catch (e) { console.log('\n[WARN] config snapshot not parseable: ' + e.message); }
    }
  } else {
    console.log('\n[WARN] no ' + MANIFEST + ' (old package or not produced by this tool)');
  }
  console.log('Memory:    ' + (entries.some(e => e.endsWith('/memory.json')) ? 'includes memory.json snapshot' : 'not included'));
  console.log('Restore:   ' + (entries.some(e => e.endsWith('/restore.sh')) ? '[OK] restore.sh' : '[WARN] missing restore.sh') +
    ' / ' + (entries.some(e => e.endsWith('/restore.ps1')) ? '[OK] restore.ps1 (Windows)' : '[WARN] missing restore.ps1'));
  return 0;
}

// ---------------------------------------------------------------- restore.sh template

const RESTORE_SH = `#!/usr/bin/env bash
# Hello Dev portable package restore entry point (this file is inside the unpacked package directory).
#
# Usage:
#   bash restore.sh           # dry-run, only reports what would be done
#   bash restore.sh --apply   # actually restore and prompt for integration steps
#
# Installs from current directory, no tarball path needed - the package is right here.
# Hook registration and CLAUDE.md memory section handled by scripts/setup.sh (symlink must come before hook registration).
set -uo pipefail
HERE="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
[ -f "$HERE/scripts/portable.js" ] || { echo "[FAIL] structure error: missing $HERE/scripts/portable.js" >&2; exit 1; }
[ -f "$HERE/SKILL.md" ] || { echo "[FAIL] structure error: missing $HERE/SKILL.md" >&2; exit 1; }

# sha256 verification: if sidecar exists, verify package integrity
# restore.sh is called from the unpacked package directory, sidecar is outside the package (same dir as tar.gz),
# but user may have deleted tar.gz or moved it, so verification is best-effort.
SIDECAR="$HERE/../hello-dev-portable-*.sha256"
if ls $SIDECAR 1>/dev/null 2>&1; then
  SIDECAR_FILE="$(ls -t $SIDECAR | head -1)"
  # Calculate sha256 of current directory (excluding sidecar itself)
  EXPECTED="$(node -e 'const fs=require("fs");try{const s=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));console.log(s.sha256||"")}catch(e){}' "$SIDECAR_FILE")"
  if [ -n "$EXPECTED" ]; then
    # tar current directory (excluding . and ..)
    ACTUAL="$(tar -czf - --exclude='*.sha256' -C "$HERE/.." "$(basename "$HERE")" | shasum -a 256 | cut -d' ' -f1)"
    if [ "$EXPECTED" = "$ACTUAL" ]; then
      echo "[OK] sha256 verification passed"
    else
      echo "[WARN] sha256 mismatch (package may have been modified or sidecar doesn't match package)"
      echo "  Expected: $EXPECTED"
      echo "  Actual:   $ACTUAL"
      echo "  Continuing restore (if this is expected, e.g. package was manually updated)"
    fi
  fi
fi

node "$HERE/scripts/portable.js" install "$@"
`;

// ---------------------------------------------------------------- restore.ps1 template (PowerShell version)

const RESTORE_PS = `# Hello Dev portable package restore entry point (PowerShell version, Windows)
#
# Usage:
#   .\\restore.ps1           # dry-run, only reports what would be done
#   .\\restore.ps1 -Apply    # actually restore and prompt for integration steps
#
# Installs from current directory, no tarball path needed - the package is right here.
# Hook registration and CLAUDE.md memory section handled by scripts/setup.sh (symlink must come before hook registration).

param(
  [switch]$Apply,
  [string]$Target = "",
  [switch]$Force,
  [switch]$NoPerms
)

$ErrorActionPreference = "Stop"

$HERE = $PSScriptRoot
if (-not $HERE) { $HERE = Split-Path -Parent $MyInvocation.MyCommand.Path }
if (-not $HERE) { $HERE = Get-Location }

$portableJs = Join-Path $HERE "scripts\\portable.js"
$skillMd = Join-Path $HERE "SKILL.md"

if (-not (Test-Path $portableJs)) {
  Write-Error "[FAIL] structure error: missing $portableJs"
  exit 1
}
if (-not (Test-Path $skillMd)) {
  Write-Error "[FAIL] structure error: missing $skillMd"
  exit 1
}

# sha256 verification (best-effort)
$sidecarPattern = Join-Path (Split-Path -Parent $HERE) "hello-dev-portable-*.sha256"
$sidecarFiles = Get-ChildItem -Path $sidecarPattern -ErrorAction SilentlyContinue
if ($sidecarFiles) {
  $sidecarFile = $sidecarFiles | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  try {
    $sidecarContent = Get-Content $sidecarFile.FullName -Raw | ConvertFrom-Json
    $expected = $sidecarContent.sha256
    if ($expected) {
      # Calculate sha256 of current directory
      $parentDir = Split-Path -Parent $HERE
      $dirName = Split-Path -Leaf $HERE
      $tarCmd = 'tar -czf - --exclude=' + "'*.sha256'" + ' -C "' + $parentDir + '" "' + $dirName + '"'
      $actual = (Invoke-Expression "$tarCmd | Get-FileHash -Algorithm SHA256").Hash.ToLower()
      if ($expected -eq $actual) {
        Write-Host "[OK] sha256 verification passed"
      } else {
        Write-Warning "sha256 mismatch (package may have been modified or sidecar doesn't match package)"
        Write-Host "  Expected: $expected"
        Write-Host "  Actual:   $actual"
        Write-Host "  Continuing restore (if this is expected, e.g. package was manually updated)"
      }
    }
  } catch {
    Write-Warning "sidecar parse failed: $_"
  }
}

# Build arguments
$args = @("install")
if ($Apply) { $args += "--apply" }
if ($Target) { $args += "--target"; $args += $Target }
if ($Force) { $args += "--force" }
if ($NoPerms) { $args += "--no-perms" }

# Call node portable.js install
& node $portableJs @args
exit $LASTEXITCODE
`;

// ---------------------------------------------------------------- entry

if (cmd === 'pack') process.exit(pack());
if (cmd === 'install') process.exit(install());
if (cmd === 'restore') process.exit(restore());
if (cmd === 'inspect') process.exit(inspect());

console.log(`Hello Dev portable — packable packaging and restore

  node scripts/portable.js pack    [--apply] [--out <dir>] [--no-memories]
      Pack skill + config snapshot + memory into tar.gz (dry-run by default)

  node scripts/portable.js install [--apply] [--target <dir>] [--force] [--no-perms]
      Install from current package directory to target (restore.sh calls this)

  node scripts/portable.js restore <tarball> [--apply] [--target <dir>] [--force]
      Checksum + unpack + install, one command

  node scripts/portable.js inspect <tarball>
      Read-only view of archive contents, checksum, and config summary
`);
process.exit(cmd ? 2 : 0);
