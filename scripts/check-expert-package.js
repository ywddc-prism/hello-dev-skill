#!/usr/bin/env node
'use strict';

/*
 * Source-side integrity check for expert packages under `expert-packages/`.
 *
 * Why this exists: `validate_expert.py` (shipped with WorkBuddy's expert-manager skill)
 * validates a package **in the host expert directory**. Run against the in-repo source copy
 * it always reports "expert not in expert directory", and the host rewrites its marketplace directory on
 * its own, so the host-side result is not a reliable statement about the source tree.
 * This check reads the source tree only, so the host cannot invalidate it.
 *
 * Scope: structural completeness of each `<pkg>/.codebuddy-plugin/plugin.json` and the
 * files it references. It does not (and cannot) prove the host will load the package.
 *
 * It also cross-checks the host marketplace copy when one is present (see checkMirror):
 * the host deletes files from that directory on its own (settings.json was observed to
 * disappear), so a source-only check would stay green while the *loaded* package is broken.
 * Mirror findings are warnings, never errors -- the host owns that directory, and a
 * source-side failure must not be reported for host state the repository does not control.
 */

const fs = require('fs');
const path = require('path');
const { resolveHome } = require('./lib/home.js');

const REPO_ROOT = path.resolve(__dirname, '..');
const PACKAGES_ROOT = path.join(REPO_ROOT, 'expert-packages');

let errors = 0;
let warns = 0;

function fail(msg) { errors++; console.log(`  [FAIL] ${msg}`); }
function warn(msg) { warns++; console.log(`  [WARN] ${msg}`); }
function ok(msg) { console.log(`  [ OK ] ${msg}`); }

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    fail(`invalid JSON: ${path.relative(REPO_ROOT, file)} (${e.message})`);
    return null;
  }
}

/** Every directory that holds `.codebuddy-plugin/plugin.json` is one expert package. */
function findPackages() {
  const found = [];
  if (!fs.existsSync(PACKAGES_ROOT)) return found;
  for (const host of fs.readdirSync(PACKAGES_ROOT)) {
    const hostDir = path.join(PACKAGES_ROOT, host);
    if (!fs.statSync(hostDir).isDirectory()) continue;
    for (const pkg of fs.readdirSync(hostDir)) {
      const pkgDir = path.join(hostDir, pkg);
      if (pkgDir.startsWith('.') || !fs.statSync(pkgDir).isDirectory()) continue;
      const manifest = path.join(pkgDir, '.codebuddy-plugin', 'plugin.json');
      if (fs.existsSync(manifest)) found.push({ dir: pkgDir, manifest });
    }
  }
  return found;
}

function checkPackage({ dir, manifest }) {
  const rel = path.relative(REPO_ROOT, dir);
  console.log(`\n${rel}`);

  const pj = readJson(manifest);
  if (!pj) return;

  for (const field of ['name', 'version', 'description']) {
    if (!pj[field]) fail(`plugin.json: missing required field '${field}'`);
  }

  // --- declared agents must exist as files -------------------------------------------
  const declaredAgents = new Set();
  for (const entry of pj.agents || []) {
    const r = entry.startsWith('./') ? entry.slice(2) : entry;
    declaredAgents.add(path.basename(r, '.md'));
    if (!fs.existsSync(path.join(dir, r))) {
      fail(`plugin.json: agents path not found: ${entry}`);
    }
  }
  if (declaredAgents.size === 0) fail("plugin.json: 'agents' array is empty or missing");

  // --- agent files on disk must all be registered (catches "orphan" agent files) -------
  // An agent .md that exists but is absent from plugin.json can never be dispatched, yet
  // the package still validates. That silent gap is exactly what this check hunts.
  const agentsDir = path.join(dir, 'agents');
  if (fs.existsSync(agentsDir)) {
    for (const f of fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md'))) {
      if (!declaredAgents.has(path.basename(f, '.md'))) {
        fail(`agents/${f} exists but is NOT registered in plugin.json 'agents'`);
      }
    }
  }

  if (pj.expertType !== 'team') {
    ok(`expertType=${pj.expertType} (team-specific checks skipped)`);
    return;
  }

  // --- team-specific ------------------------------------------------------------------
  const lead = (pj.teamInfo || {}).leadAgent || '';
  const memberAgents = (pj.teamInfo || {}).memberAgents || [];
  if (!lead) fail("plugin.json: teamInfo.leadAgent is missing");
  if (lead && memberAgents.includes(lead)) {
    fail('plugin.json: teamInfo.memberAgents must NOT contain the lead agent');
  }
  if (pj.agentName && lead && pj.agentName !== lead) {
    fail(`plugin.json: agentName (${pj.agentName}) != teamInfo.leadAgent (${lead})`);
  }

  const members = pj.members || [];
  if (members.length === 0) fail("plugin.json: Team type must have a non-empty 'members' array");
  const memberIds = members.map((m) => m.id);
  if (!members.some((m) => m.role === 'lead')) {
    fail("plugin.json: 'members' must contain at least one entry with role='lead'");
  }

  // lead + memberAgents must exactly account for every registered agent.
  const expected = new Set([lead, ...memberAgents]);
  for (const id of declaredAgents) {
    if (!expected.has(id)) {
      fail(`agent '${id}' is registered but appears in neither leadAgent nor memberAgents`);
    }
  }
  for (const id of expected) {
    if (id && !declaredAgents.has(id)) {
      fail(`agent '${id}' is declared in teamInfo but missing from plugin.json 'agents'`);
    }
  }
  for (const id of memberIds) {
    if (id && !declaredAgents.has(id)) {
      fail(`members[] entry '${id}' has no matching entry in plugin.json 'agents'`);
    }
  }
  ok(`roster: lead + ${memberAgents.length} members = ${declaredAgents.size} registered agents`);

  // --- settings.json: required for Team type, and must agree on the lead ---------------
  const settingsPath = path.join(dir, 'settings.json');
  if (!fs.existsSync(settingsPath)) {
    fail('Team type must have settings.json');
  } else {
    const st = readJson(settingsPath);
    if (st && st.agent && pj.agentName && st.agent !== pj.agentName) {
      fail(`settings.json 'agent' (${st.agent}) != plugin.json 'agentName' (${pj.agentName})`);
    } else if (st && !st.agent) {
      fail("settings.json: missing 'agent' field");
    }
  }

  // --- avatar references: a warn, never an error (host agrees) -------------------------
  if (pj.avatar && !fs.existsSync(path.join(dir, pj.avatar))) {
    warn(`plugin.json: avatar file not found: ${pj.avatar}`);
  }
  for (const m of members) {
    if (m.avatar && !fs.existsSync(path.join(dir, m.avatar))) {
      warn(`members[] '${m.id}': avatar file not found: ${m.avatar}`);
    }
  }
}

console.log('expert package completeness (source tree only)');
console.log(`packages root: ${path.relative(REPO_ROOT, PACKAGES_ROOT) || '.'}`);

const packages = findPackages();
if (packages.length === 0) {
  // A silently-empty packages root is the failure mode that looks most like success:
  // everything reported green because nothing was examined. If host directories exist
  // under expert-packages/ but none carries a plugin.json, that is a real error.
  const hosts = fs.existsSync(PACKAGES_ROOT)
    ? fs.readdirSync(PACKAGES_ROOT).filter((d) => fs.statSync(path.join(PACKAGES_ROOT, d)).isDirectory())
    : [];
  if (hosts.length > 0) {
    console.log(`\n  [FAIL] expert-packages/ exists with host dir(s) [${hosts.join(', ')}] but NO package found`);
    console.log('         (a package is a directory holding .codebuddy-plugin/plugin.json)');
    errors++;
  } else {
    console.log('\n  [WARN] no expert package found under expert-packages/');
    warns++;
  }
} else {
  for (const p of packages) checkPackage(p);
}

/**
 * Cross-check the host marketplace mirror.
 *
 * The host rewrites `~/.workbuddy/plugins/marketplaces/` by itself; `settings.json` was
 * observed to vanish from that directory while the source copy stayed intact. A source-only
 * check would report green while the package the host actually loads is invalid.
 *
 * Reported as warnings because the host owns that directory: a diff here is a statement
 * about host state, not about the delivered source. Fixing it means re-running the
 * documented rsync from the source side.
 */
function checkMirror() {
  // Not os.homedir(): on Windows it ignores HOME, which silently defeats HOME-based
  // test isolation. `home` feeds both the .workbuddy join below and the
  // path.relative(home, ...) baseline at the end, so it must stay the plain home.
  const home = resolveHome();
  const mirrorBase = path.join(home, '.workbuddy', 'plugins', 'marketplaces');
  if (!fs.existsSync(mirrorBase)) return;

  const mirrors = [];
  for (const market of fs.readdirSync(mirrorBase)) {
    const pluginsDir = path.join(mirrorBase, market, 'plugins');
    if (!fs.existsSync(pluginsDir)) continue;
    for (const pkg of fs.readdirSync(pluginsDir)) {
      const mirrorDir = path.join(pluginsDir, pkg);
      const srcDir = path.join(PACKAGES_ROOT, 'workbuddy', pkg);
      if (fs.existsSync(path.join(mirrorDir, '.codebuddy-plugin')) && fs.existsSync(srcDir)) {
        mirrors.push({ mirrorDir, srcDir });
      }
    }
  }
  if (mirrors.length === 0) return;

  console.log('\nhost marketplace mirror (warnings only -- the host owns this directory)');
  for (const { mirrorDir, srcDir } of mirrors) {
    const missing = [];
    const differing = [];
    const extra = [];
    const sourceFiles = new Set(listRelativeFiles(srcDir));
    for (const rel of sourceFiles) {
      const m = path.join(mirrorDir, rel);
      if (!fs.existsSync(m)) { missing.push(rel); continue; }
      if (rel.endsWith('.png')) continue; // binary assets: presence is enough
      if (fs.readFileSync(m, 'utf8') !== fs.readFileSync(path.join(srcDir, rel), 'utf8')) {
        differing.push(rel);
      }
    }
    // Reverse direction too: files the mirror carries that the source does not.
    // A stale extra agent file in the mirror is loaded by the host but absent from the
    // delivered source, so a source->mirror-only comparison would never surface it.
    for (const rel of listRelativeFiles(mirrorDir)) {
      if (!sourceFiles.has(rel)) extra.push(rel);
    }
    if (missing.length === 0 && differing.length === 0 && extra.length === 0) {
      ok(`mirror in sync: ${path.relative(home, mirrorDir)}`);
      continue;
    }
    for (const rel of missing) {
      warn(`mirror is MISSING ${rel} -- re-run: rsync -a --delete "$SRC/" "$DST/"`);
    }
    for (const rel of differing) {
      warn(`mirror DIFFERS from source: ${rel}`);
    }
    for (const rel of extra) {
      warn(`mirror has EXTRA file not in source: ${rel} -- the host loads it, the source does not own it`);
    }
  }
}

/** Every file path under `dir`, relative to it, excluding dotfiles at the top level. */
function listRelativeFiles(dir) {
  const out = [];
  (function walk(d, rel) {
    for (const entry of fs.readdirSync(d)) {
      const abs = path.join(d, entry);
      const r = rel ? `${rel}/${entry}` : entry;
      if (fs.statSync(abs).isDirectory()) walk(abs, r);
      else out.push(r);
    }
  })(dir, '');
  return out;
}

checkMirror();

console.log(`\n${packages.length} package(s): ${errors} error(s), ${warns} warning(s)`);
process.exit(errors > 0 ? 1 : 0);
