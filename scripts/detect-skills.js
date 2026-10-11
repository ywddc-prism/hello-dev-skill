#!/usr/bin/env node
'use strict';

/**
 * Hello Dev — Installed skill detector
 *
 * Rationale: collaboration matrix S4 originally hardcoded three skill rows,
 * yet the header claimed "consistent with implementation"; detection itself
 * had a pitfall — `~/.claude/skills/*` are mostly symlinks, filtering by
 * `isDirectory()` yields 0 skills (tested on this repo: 33 of 34 entries
 * are symlinks). This script is the **sole detection entry point**: dereference
 * symlinks, deduplicate by real path, parse frontmatter.
 *
 * Detection scope is **host load points on disk**: user-level skills/,
 * project-level .claude/skills/, plugin marketplace and cache skills/.
 * Host-built-in or remotely-delivered skills (not on disk) are not in scope;
 * this is a capability boundary, not a defect — don't claim in docs that
 * they're detected.
 *
 * Usage:
 *   node scripts/detect-skills.js                 # JSON (machine-readable, default)
 *   node scripts/detect-skills.js --md            # output generated block (markdown)
 *   node scripts/detect-skills.js --write         # write back to references/collaboration-matrix.md
 *   node scripts/detect-skills.js --roots a,b     # override scan roots (each item can be kind=path; for testing)
 *   node scripts/detect-skills.js --doc <path>    # override --write target document
 */

const fs = require('fs');
const path = require('path');
const { resolveHome, resolveClaudeConfigDir, resolveWorkbuddyHome } = require('./lib/home.js');

const BLOCK_BEGIN = '<!-- BEGIN GENERATED: skills -->';
const BLOCK_END = '<!-- END GENERATED: skills -->';
const DOC_DEFAULT = path.join(__dirname, '..', 'references', 'collaboration-matrix.md');

// Applicable rules: labels must match the first column of collaboration matrix
// S4.1 verbatim. Rule table maintained here, S4.1 presents it,
// check-collaboration-matrix.js cross-validates bidirectionally — either side
// adding a rule without the other following causes build failure; the script
// never invents rules not in the document.
const UNCLASSIFIED = 'unclassified';
const RULES = [
  { label: 'hello-dev', test: (n) => n === 'hello-dev' },
  { label: 'hermes-agent-self-evolution', test: (n) => n === 'hermes-agent-self-evolution' },
  // Adopted questioning-flow collaborator. Matched by **exact name**, not a
  // `grill-*` prefix: `grill-me-pro` is a third-party fork that declares
  // `disable-model-invocation: true` (the model cannot invoke it) and its core
  // mechanism (batch the whole frontier per round) contradicts the
  // one-question-at-a-time rate this repo adopted. It therefore stays
  // `unclassified` — present on disk, deliberately not routed.
  { label: 'grill-me', test: (n) => n === 'grill-me' },
  // Frontend-design guidance. Matched by exact name. Provides design tokens,
  // component specs, layout blueprint, and implementation notes as a
  // **pre-prototype** design-spec supplier (a posteriori validation and
  // token extraction still belong to the prototype stage).
  { label: 'ui-ux-pro-max', test: (n) => n === 'ui-ux-pro-max-skill' },
  { label: 'lark-*', test: (n) => n.startsWith('lark-') },
  { label: 'va-*', test: (n) => n.startsWith('va-') },
  { label: 'vibearound', test: (n) => n === 'vibearound' },
  { label: 'plugin:*', test: (n, source) => source.startsWith('plugin:') },
  // Fallback label also registered in table, with **test always false**: it
  // doesn't participate in actual matching (when nothing matches, it's the result);
  // registration is for bidirectional symmetry in S4.1 label comparison. Previously
  // excluded from comparison, the result was that deleting S4.1's "unclassified"
  // row still passed all checks green (observed) — the one fallback rule that
  // most needed guarding became the only one nobody watched.
  { label: UNCLASSIFIED, test: () => false },
];

function ruleOf(skill) {
  const hit = RULES.find(r => r.test(skill.name, skill.source));
  return hit ? hit.label : UNCLASSIFIED;
}

function subdirs(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory() || e.isSymbolicLink())
      .map(e => e.name)
      .filter(n => !n.startsWith('.'));
  } catch { return []; }
}

/**
 * Detect current host type. By priority:
 *   1. HELLODEV_HOST env var explicit override (for testing)
 *   2. WorkBuddy signature: WORKBUDDY_SESSION env var, or ~/.workbuddy/ dir exists
 *      and ~/.claude/ does not
 *   3. Claude Code: default (~/.claude/ exists or no other host signature)
 *   4. dual: return 'dual' when both exist
 */
function detectHost() {
  if (process.env.HELLODEV_HOST) return process.env.HELLODEV_HOST;
  const home = resolveHome();
  const hasWorkbuddy = !!process.env.WORKBUDDY_SESSION ||
    fs.existsSync(path.join(home, '.workbuddy'));
  const hasClaude = fs.existsSync(path.join(home, '.claude'));
  if (hasWorkbuddy && hasClaude) return 'dual';
  if (hasWorkbuddy) return 'workbuddy';
  return 'claude';
}

function defaultRoots(cwd) {
  const host = detectHost();
  // Both roots resolve from the same home via the shared library: one root
  // honoring an env override while the other still reads os.homedir() is a
  // half-isolation (fixtures look isolated while one side leaks) — keep them
  // sourced together to prevent that regression.
  const claude = resolveClaudeConfigDir();
  const workbuddy = resolveWorkbuddyHome();
  const roots = [];

  // Claude Code roots
  if (host === 'claude' || host === 'dual') {
    roots.push(
      { kind: 'user', path: path.join(claude, 'skills') },
      { kind: 'project', path: path.join(cwd, '.claude', 'skills') },
    );
  }

  // WorkBuddy roots
  if (host === 'workbuddy' || host === 'dual') {
    roots.push(
      { kind: 'user:workbuddy', path: path.join(workbuddy, 'skills') },
      { kind: 'project:workbuddy', path: path.join(cwd, '.workbuddy', 'skills') },
    );
    // WorkBuddy also scans plugin cache (same parent directory structure as Claude Code)
    const wbCache = path.join(workbuddy, 'plugins', 'cache');
    for (const m of subdirs(wbCache)) {
      for (const p of subdirs(path.join(wbCache, m))) {
        for (const v of subdirs(path.join(wbCache, m, p))) {
          roots.push({ kind: `plugin:${p}`, path: path.join(wbCache, m, p, v, 'skills') });
        }
      }
    }
  }

  // Claude Code plugin roots (only if not workbuddy-only)
  if (host === 'claude' || host === 'dual') {
    const markets = path.join(claude, 'plugins', 'marketplaces');
    for (const m of subdirs(markets)) {
      if (m.endsWith('.bak')) continue;   // .bak is a backup directory, not a load point
      for (const group of ['plugins', 'external_plugins']) {
        const base = path.join(markets, m, group);
        for (const p of subdirs(base)) roots.push({ kind: `plugin:${p}`, path: path.join(base, p, 'skills') });
      }
    }
    const cache = path.join(claude, 'plugins', 'cache');
    for (const m of subdirs(cache)) {
      for (const p of subdirs(path.join(cache, m))) {
        for (const v of subdirs(path.join(cache, m, p))) {
          roots.push({ kind: `plugin:${p}`, path: path.join(cache, m, p, v, 'skills') });
        }
      }
    }
  }

  // Bundled skills: Hello Dev repo's own skills/ directory
  // These are shipped with the repo, so users get them immediately on clone/download.
  const bundledSkills = path.join(cwd, 'skills');
  if (fs.existsSync(bundledSkills) && fs.statSync(bundledSkills).isDirectory()) {
    roots.push({ kind: 'bundled', path: bundledSkills });
  }

  return roots;
}

/**
 * Parse SKILL.md frontmatter. Only extracts the two keys this file needs.
 * Supports `key: value`, `key: "value"`, `key: >` / `key: |` folded blocks
 * (indented continuation). Only reads within the frontmatter block — same-named
 * keys in body text don't participate.
 */
function parseFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const lines = m[1].split(/\r?\n/);
  const out = {};
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    let value = kv[2].trim();
    if (value === '' || ['>', '|', '>-', '|-', '>+', '|+'].includes(value)) {
      const buf = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) buf.push(lines[++i].trim());
      if (buf.length) value = buf.join(' ');
    }
    out[kv[1]] = value.replace(/^["']|["']$/g, '').trim();
  }
  return out;
}

/**
 * Table cell escaping. Order matters: **escape backslashes first, then pipes**.
 * If only pipes are escaped without existing backslashes, descriptions ending
 * with `\` or containing `\|` sequences would produce a row that even the
 * parser itself can't read back — `parseBlock` treats `\\|` as "escaped pipe",
 * causing column misalignment (observed: `description: "a\\|b|c"` generates a
 * rule column reading `b` instead of `unclassified`).
 * This is the inverse of `\\(.)` unescaping in `parseBlock`; both sides must
 * change together.
 */
function cell(value, max = 64) {
  if (!value) return '';
  let t = String(value).replace(/\s+/g, ' ').replace(/\\/g, '\\\\').replace(/\|/g, '\\|').trim();
  const chars = [...t];
  if (chars.length > max) t = chars.slice(0, max).join('') + '...';
  return t;
}

/** Inverse of `cell()`: `\\` -> `\`, `\|` -> `|`. Other `\x` preserved as-is. */
function unescapeCell(text) {
  return String(text).replace(/\\(.)/g, (m, c) => (c === '\\' || c === '|' ? c : m));
}

/**
 * Scan skill directories under each root. Requires SKILL.md in directory;
 * broken links and directories without SKILL.md go into skipped rather than
 * crashing the entire detection — one bad link shouldn't prevent the
 * collaboration matrix from being generated.
 */
function detectSkills(opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const roots = opts.roots || defaultRoots(cwd);
  const byReal = new Map();
  const byNameSource = new Map();  // Deduplicate by name+source (prevent marketplaces+cache duplicates)
  const rootReport = [];
  const skipped = [];
  let missingRoots = 0;

  for (const root of roots) {
    let entries;
    try { entries = fs.readdirSync(root.path, { withFileTypes: true }); }
    catch { missingRoots++; continue; }

    let count = 0;
    for (const e of entries) {
      if (e.name.startsWith('.')) continue;
      let isDir = e.isDirectory();
      if (!isDir && e.isSymbolicLink()) {
        try { isDir = fs.statSync(path.join(root.path, e.name)).isDirectory(); }
        catch { skipped.push(`${path.join(root.path, e.name)} (broken link)`); continue; }
      }
      if (!isDir) continue;

      const dir = path.join(root.path, e.name);
      const skillFile = path.join(dir, 'SKILL.md');
      // Use statSync().isFile() instead of existsSync(): when SKILL.md is a
      // **directory** or unreadable, existsSync returns true, and the subsequent
      // readFileSync throws EISDIR/EACCES, crashing the entire detection
      // together with this Bootstrap (observed). Same-class issues (broken links,
      // missing SKILL.md) only go into skipped; no reason to be stricter here.
      let isFile = false;
      try { isFile = fs.statSync(skillFile).isFile(); } catch { /* broken link or insufficient permissions, logged below uniformly */ }
      if (!isFile) { skipped.push(`${dir} (no SKILL.md or unreadable)`); continue; }

      let real;
      try { real = fs.realpathSync(dir); } catch { real = dir; }
      const existing = byReal.get(real);
      if (existing) {
        // Same real path appears in multiple roots (typical: repo dir symlinked into skills/) -> merge sources, don't double-count
        if (!existing.sources.includes(root.kind)) existing.sources.push(root.kind);
        continue;
      }
      let fm;
      try { fm = parseFrontmatter(fs.readFileSync(skillFile, 'utf8')); }
      catch (err) { skipped.push(`${dir} (read failed: ${err.code || err.message})`); continue; }
      const name = (fm.name || e.name).trim() || e.name;
      // Deduplicate by name+source: marketplaces and cache may contain copies
      // of the same skill (different realpath but same name+source); keep the first found
      const nameKey = `${name}@${root.kind}`;
      if (byNameSource.has(nameKey)) continue;
      byNameSource.set(nameKey, true);
      byReal.set(real, {
        name,
        dir: e.name,
        source: root.kind,
        sources: [root.kind],
        symlink: e.isSymbolicLink(),
        trigger: fm.description || '',
      });
      count++;
    }
    rootReport.push({ kind: root.kind, path: root.path, exists: true, entries: entries.filter(e => !e.name.startsWith('.')).length, skills: count });
  }

  // Group by source (user -> project -> plugin:*), sort by name within group:
  // table is for humans to look up "what's on this machine"; mixed ordering makes
  // same-name-different-source entries hard to identify.
  const order = (s) => s.source === 'user' ? 0 : s.source === 'project' ? 1 : 2;
  const skills = [...byReal.values()].sort((a, b) =>
    order(a) - order(b) || a.source.localeCompare(b.source) || a.name.localeCompare(b.name));
  return { cwd, roots: rootReport, missingRoots, count: skills.length, skills, skipped };
}

function renderBlock(detection) {
  const day = new Date().toISOString().slice(0, 10);
  const byKind = {};
  for (const s of detection.skills) byKind[s.source] = (byKind[s.source] || 0) + 1;
  const summary = Object.entries(byKind).sort().map(([k, n]) => `${k} ${n}`).join(' / ') || 'none';
  const lines = [
    BLOCK_BEGIN,
    '> Generated by `node scripts/detect-skills.js --write`; do not edit manually; consistency validated by `scripts/check-collaboration-matrix.js`.',
    `> Detected on ${day} | ${detection.count} after dedup (${summary})`,
    '',
    '| skill | source | trigger (frontmatter summary) | applicable rule |',
    '|-------|--------|-------------------------------|-----------------|',
  ];
  for (const s of detection.skills) {
    // Name and source must also go through cell(): skill names come from
    // arbitrary SKILL.md frontmatter; pipes would split this row's columns —
    // even tables generated by this file itself couldn't be read back (observed).
    lines.push(`| \`${cell(s.name, 80)}\` | ${cell(s.source, 40)} | ${cell(s.trigger, 48) || '(no description)'} | ${cell(ruleOf(s), 40)} |`);
  }
  if (!detection.skills.length) lines.push('| (no skills detected) | - | - | - |');
  lines.push(BLOCK_END);
  return lines.join('\n');
}

/**
 * Read back generated block. Returns null if markers are missing — caller
 * decides whether to error or degrade.
 *
 * Column splitting must use **unescaped pipes**, and unescaping must be
 * strictly inverse to `cell()`: naive split('|') cuts a row into 5 segments
 * (rule column reads to end of description); only restoring `\|` without `\\`
 * misaligns descriptions ending in backslash — both observed in practice.
 */
function parseBlock(text) {
  const i = text.indexOf(BLOCK_BEGIN);
  const j = text.indexOf(BLOCK_END);
  if (i < 0 || j < 0 || j < i) return null;
  // Character-by-character scan: only pipes preceded by an **odd number of
  // consecutive backslashes** are escaped pipes. Regex lookbehind can only
  // handle a single adjacent backslash; encounters `\\|` (escaped backslash +
  // column separator) are misjudged.
  const splitRow = (line) => {
    const out = [];
    let cur = '';
    let backslashes = 0;
    for (const ch of line) {
      if (ch === '|' && backslashes % 2 === 0) { out.push(cur); cur = ''; backslashes = 0; continue; }
      if (ch === '\\') backslashes++; else backslashes = 0;
      cur += ch;
    }
    out.push(cur);
    return out;
  };
  const rows = text.slice(i + BLOCK_BEGIN.length, j).split('\n')
    .map(l => l.trim()).filter(l => l.startsWith('|'))
    .map(l => splitRow(l.replace(/^\|/, '').replace(/\|$/, '')).map(c => unescapeCell(c.trim())))
    .filter(c => c.length >= 4 && c[0] !== 'skill' && !/^-+$/.test(c[0]))
    .filter(c => !c[0].startsWith('('));
  return rows.map(c => ({
    name: c[0].replace(/^`/, '').replace(/`$/, ''),
    source: c[1],
    trigger: c[2],
    rule: c[3],
  }));
}

/**
 * Structural audit layer above `parseBlock`: **drift outside the table**.
 *
 * Row-by-row comparison has several silent pass-throughs — prose lines between
 * table rows, duplicate rows (Map dedup keeps only one of two identical rows;
 * modifying the second is invisible), summary count line changed. None of these
 * cause comparison failure, yet they all indicate the document was manually
 * edited — shapes the generator never produces. Returns anomalies (lines in the
 * block that are neither blank, blockquote, nor table rows), duplicates (same
 * name+source appearing multiple times), declaredCount (count declared in summary
 * line, null if missing).
 */
function analyzeBlock(text) {
  const rows = parseBlock(text);
  if (rows === null) return { rows: null, anomalies: [], duplicates: [], declaredCount: null };
  const i = text.indexOf(BLOCK_BEGIN);
  const j = text.indexOf(BLOCK_END);
  const body = text.slice(i + BLOCK_BEGIN.length, j);
  const anomalies = [];
  for (const raw of body.split('\n')) {
    const l = raw.trim();
    if (!l || l.startsWith('>') || l.startsWith('|')) continue;
    anomalies.push(l);
  }
  const seen = new Set();
  const duplicates = [];
  for (const r of rows) {
    const k = `${r.name}\u0000${r.source}`;
    if (seen.has(k)) duplicates.push(`${r.name} @ ${r.source}`); else seen.add(k);
  }
  const m = body.match(/after dedup\s*(\d+)/);
  return { rows, anomalies, duplicates, declaredCount: m ? Number(m[1]) : null };
}

function writeBlock(docPath, block) {
  const cur = fs.readFileSync(docPath, 'utf8');
  const i = cur.indexOf(BLOCK_BEGIN);
  const j = cur.indexOf(BLOCK_END);
  if (i < 0 || j < 0 || j < i) {
    throw new Error(`Target document missing generation markers ${BLOCK_BEGIN} / ${BLOCK_END}: ${docPath}`);
  }
  fs.writeFileSync(docPath, cur.slice(0, i) + block + cur.slice(j + BLOCK_END.length), 'utf8');
}

module.exports = { detectSkills, renderBlock, parseBlock, analyzeBlock, writeBlock, defaultRoots, parseFrontmatter, ruleOf, RULES, UNCLASSIFIED, BLOCK_BEGIN, BLOCK_END, DOC_DEFAULT };

/* ---------- CLI ---------- */

if (require.main === module) {
  const argv = process.argv.slice(2);
  const flag = (name) => {
    const i = argv.indexOf(`--${name}`);
    if (i < 0) return undefined;
    const v = argv[i + 1];
    if (!v || v.startsWith('--')) { console.error(`X Argument missing value: --${name}`); process.exit(1); }
    return v;
  };
  try {
    const rootsArg = flag('roots');
    const roots = rootsArg
      ? rootsArg.split(',').filter(Boolean).map(item => {
          const eq = item.indexOf('=');
          return eq < 0 ? { kind: 'custom', path: path.resolve(item) }
                        : { kind: item.slice(0, eq), path: path.resolve(item.slice(eq + 1)) };
        })
      : undefined;
    const detection = detectSkills({ cwd: process.cwd(), roots });

    if (argv.includes('--write')) {
      const doc = path.resolve(flag('doc') || DOC_DEFAULT);
      writeBlock(doc, renderBlock(detection));
      console.log(`[OK] Written back to ${doc} (${detection.count} skills)`);
    } else if (argv.includes('--md')) {
      console.log(renderBlock(detection));
    } else {
      console.log(JSON.stringify(detection, null, 2));
    }
    // Root exists, entries exist, but zero skills parsed — this is exactly the
    // symptom of symlinks being filtered as regular files. Don't silently pass:
    // give an actionable hint, exit code left for caller to judge.
    const suspicious = detection.roots.filter(r => r.entries > 0 && r.skills === 0);
    if (suspicious.length) {
      console.error(`Warning: ${suspicious.map(r => r.path).join(', ')} has directory entries but parsed 0 skills; check symlink resolution and SKILL.md existence`);
    }
  } catch (e) {
    console.error(`X ${e.message}`);
    process.exit(1);
  }
}
