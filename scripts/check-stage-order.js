#!/usr/bin/env node
'use strict';

/**
 * Hello Dev — Stage-order drift guard.
 *
 * Why this exists: the stage list was restated in five places and drifted in five
 * different directions — `check-collaboration-matrix.js` held a local 8-stage copy while
 * `state.js` had 13; `hosts/workbuddy.md` claimed "8 stages"; `README.md`'s full chain
 * omitted `tool-research`; `loop-concept.md` dropped the last four stages entirely. Every
 * one of those was invisible to a green test suite, because nothing compared the
 * restatements to the state machine.
 *
 * `check-collaboration-matrix.js` could not catch them: its local copy was consumed only
 * as a **regex vocabulary**, so it validated the document against itself — a row naming a
 * stage the state machine does not have passed, and deleting rows for stages it does have
 * also passed. Measured both directions during the design pass.
 *
 * This guard compares each declared document against `scripts/lib/stages.js`, the single
 * source. It is deliberately **stronger than a union check**: for documents that must show
 * a specific projection (full chain vs non-full chain), it requires the chain to match
 * **verbatim**, including order. A union check would accept a document whose stages are all
 * present but reordered, which is exactly the "which comes first" question this framework
 * exists to answer.
 *
 * Usage: node scripts/check-stage-order.js
 * Non-zero exit means at least one document disagrees with the state machine.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const { STAGES, DESIGN_ONLY_STAGES } = require('./lib/stages');

const SHORT = STAGES.filter(s => !DESIGN_ONLY_STAGES.includes(s));
const title = s => s.split('-').map(w => (w === 'ux' ? 'UX' : w === 'ui' ? 'UI' : w[0].toUpperCase() + w.slice(1))).join(' ');
const FULL_CHAIN = STAGES.join(' -> ');
const SHORT_CHAIN = SHORT.join(' -> ');
const FULL_TITLE_CHAIN = STAGES.map(title).join(' -> ');
const SHORT_TITLE_CHAIN = SHORT.map(title).join(' -> ');

/**
 * Documents that must state a full or non-full chain verbatim.
 * `mode`:
 *   'full'  — must contain the full chain (all stages, in order)
 *   'short' — must contain the non-full chain
 *   'any'   — must contain at least one of the two chains, verbatim
 *
 * Chains are accepted in either separator form (`a -> b -> c` or `a, b, c`): the framework
 * uses arrows in prose and comma lists in code blocks, and forcing one form would be a
 * cosmetic edit with no drift-catching value. Order and membership are what matter.
 */
const CHAIN_SITES = [
  { file: 'README.md', mode: 'any' },
  { file: 'README.zh-CN.md', mode: 'any' },
  { file: 'SKILL.md', mode: 'any' },
  { file: 'SKILL.zh-CN.md', mode: 'any' },
  { file: 'modules/core/state-protocol.md', mode: 'any' },
  { file: 'modules/paths/full-flow.md', mode: 'full' },
  { file: 'modules/paths/fast-path.md', mode: 'short' },
  { file: 'modules/hosts/workbuddy.md', mode: 'any' },
  { file: 'modules/hosts/codex.md', mode: 'any' },
];

/** Documents that state a stage COUNT; the number must match the live counts. */
const COUNT_SITES = [
  { file: 'modules/paths/tiny-path.md', pattern: /15\/15 \(full path\)/, label: '15/15 (full path)' },
  { file: 'modules/hosts/workbuddy.md', pattern: /All 15 stages/, label: 'All 15 stages' },
  { file: 'modules/hosts/_template.md', pattern: /all 15/, label: 'all 15' },
  { file: 'modules/core/loop-concept.md', pattern: /Full Flow has 15 stages/, label: 'Full Flow has 15 stages' },
];

/** Directories that hold history or vendored material, not current claims. */
const SKIP_DIRS = new Set(['.git', 'archive', 'node_modules', '.workbuddy', 'outputs', 'probe.lock', 'docs']);

const problems = [];
const checkedChains = [];
const checkedCounts = [];
const checkedLiterals = [];

/** Strip emphasis and inline-code markers so `**Bootstrap**` and `Bootstrap` compare equal. */
const strip = s => s.replace(/\*\*/g, '').replace(/`/g, '');

/**
 * Normalise a chain for comparison: unify arrows (including `→`) and comma lists to a
 * single ` -> ` separator, collapse whitespace. Display-name form and slug form are both
 * accepted because the framework uses titles in prose and slugs in code; requiring one
 * form would force cosmetic rewrites of prose with no drift-catching value.
 */
function normalizeChain(s) {
  return strip(s)
    .replace(/\s*(?:->|→|-->)\s*/g, ' -> ')
    .replace(/\s*,\s*/g, ' -> ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The normalised full/short chains, in both separator forms. */
const FULL_NORM = normalizeChain(FULL_CHAIN);
const SHORT_NORM = normalizeChain(SHORT_CHAIN);
const FULL_TITLE_NORM = normalizeChain(FULL_TITLE_CHAIN);
const SHORT_TITLE_NORM = normalizeChain(SHORT_TITLE_CHAIN);

function containsChain(haystackNorm, chainNorm) {
  return haystackNorm.includes(chainNorm);
}

/* ---------- Check 1: declared chains match verbatim ---------- */
for (const site of CHAIN_SITES) {
  const p = path.join(ROOT, site.file);
  if (!fs.existsSync(p)) { problems.push(`${site.file}: declared in CHAIN_SITES but the file does not exist`); continue; }
  const text = fs.readFileSync(p, 'utf8');
  const normLines = text.split(/\r?\n/).map(normalizeChain).join('\n');
  const full = containsChain(normLines, FULL_NORM) || containsChain(normLines, FULL_TITLE_NORM);
  const short = containsChain(normLines, SHORT_NORM) || containsChain(normLines, SHORT_TITLE_NORM);
  const ok = site.mode === 'full' ? full : site.mode === 'short' ? short : (full || short);
  if (!ok) {
    const expected = site.mode === 'full' ? 'the FULL chain'
      : site.mode === 'short' ? 'the NON-FULL chain' : 'either the full or the non-full chain';
    problems.push(`${site.file}: does not state ${expected} verbatim (order and membership must match scripts/lib/stages.js)`);
  }
  checkedChains.push(site.file);
}

/* ---------- Check 2: stage counts match ---------- */
for (const site of COUNT_SITES) {
  const p = path.join(ROOT, site.file);
  if (!fs.existsSync(p)) { problems.push(`${site.file}: declared in COUNT_SITES but the file does not exist`); continue; }
  const text = fs.readFileSync(p, 'utf8');
  if (!site.pattern.test(text)) {
    problems.push(`${site.file}: expected the stage count marker "${site.label}" (full=${STAGES.length}, non-full=${SHORT.length})`);
  }
  checkedCounts.push(site.file);
}

/* ---------- Check 2b: EVERY stage chain must match (not just one per file) ----------
 * Requiring one matching chain per file is too weak: a file that states the chain twice
 * (once in a code block, once in a table — README does exactly this) passes as long as one
 * copy is right, so drift in the other copy escapes. Measured: deleting `tool-research` from
 * README's `# full:` line still passed while the table copy remained correct.
 *
 * So every line that contains a run of stage names linked by `->` and begins (after any
 * markdown prefix such as `# fast: `, `| \`fast\` | `, or `4. **Execute stages**: `) with
 * `bootstrap` is treated as a chain claim and must equal the full or the non-full chain
 * exactly. Lines that carry a placeholder (`[design stages]`) are illustrative summaries,
 * not claims, and are skipped.
 */
const CHAIN_CLAIM = /(?:^|[\s|*>:`])(bootstrap)\s*(?:->|→)\s*[a-z]/i;
for (const site of CHAIN_SITES) {
  const p = path.join(ROOT, site.file);
  if (!fs.existsSync(p)) continue;
  const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
  lines.forEach((line, idx) => {
    if (!CHAIN_CLAIM.test(line)) return;
    if (/\[[^\]]*\]/.test(line)) return; // illustrative placeholder, e.g. `[design stages]`
    // Trim anything before the chain start so a prose prefix cannot mask a mismatch.
    const start = line.search(/bootstrap/i);
    const norm = normalizeChain(line.slice(start));
    const parts = norm.split(' -> ').filter(Boolean);
    if (parts.length < 4) return;
    const full = containsChain(norm, FULL_NORM) || containsChain(norm, FULL_TITLE_NORM);
    const short = containsChain(norm, SHORT_NORM) || containsChain(norm, SHORT_TITLE_NORM);
    if (!full && !short) {
      problems.push(
        `${site.file}:${idx + 1}: this stage chain matches neither the full nor the non-full list ` +
        `(order and membership must match scripts/lib/stages.js)`
      );
    }
  });
}

/* ---------- Check 3: inline stage-list literals must EQUAL the source ----------
 * A blanket ban on restating the list would be wrong: `templates/state.json` is a structure
 * reference, and a host adapter must show its reader the literal it is expected to consume.
 * The drift that actually happened was not "a literal exists" — it was "the literal is a
 * different list". So this check compares every literal against the source and fails on a
 * mismatch, which catches the real defect (workbuddy.md said 8 stages while state.js had 13)
 * without forbidding legitimate exposition.
 */
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.md') || e.name.endsWith('.js') || e.name.endsWith('.json')) out.push(p);
  }
  return out;
}

const SOURCE = path.join(ROOT, 'scripts', 'lib', 'stages.js');
// Matches `STAGES = [...]`, `stages = [a, b, c]`, and `"current": "a|b|c"` restatements.
const LITERAL = /(?:STAGES\s*=\s*\[[^\]]{40,}\])|(?:\bstages\s*=\s*\[[^\]]{40,}\])|(?:"current"\s*:\s*"[a-z|-]{60,}")/g;
const SELF = path.resolve(__filename);
for (const file of walk(ROOT)) {
  if (file === SOURCE || file === SELF) continue;
  const text = fs.readFileSync(file, 'utf8');
  let m;
  LITERAL.lastIndex = 0;
  while ((m = LITERAL.exec(text)) !== null) {
    const literal = m[0];
    // How many live stage slugs does this literal name? A genuine restatement names most of
    // them; a coincidental array (e.g. a list of unrelated statuses) names few or none.
    const named = STAGES.filter(s => new RegExp(`['"|\\[,]\\s*${s}\\b`).test(literal)).length;
    if (named < Math.ceil(STAGES.length * 0.5)) continue;
    // Extract the slugs in the order they appear. Matching bare identifiers (not
    // `delimiter + name + delimiter`) matters: with a consuming pattern the `|` shared by
    // two adjacent names is consumed by the first match, so `bootstrap|initialization`
    // silently yields only `bootstrap` and the next name is skipped. Non-stage words that
    // this also picks up (`stages`, `current`) are filtered out below.
    const inOrder = [...literal.matchAll(/[a-z][a-z-]*/g)]
      .map(x => x[0]).filter(x => STAGES.includes(x));
    const dedup = inOrder.filter((x, i) => inOrder.indexOf(x) === i);
    const matchesFull = dedup.join(',') === STAGES.join(',');
    const matchesShort = dedup.join(',') === SHORT.join(',');
    if (!matchesFull && !matchesShort) {
      // Report the first divergence so the fix is obvious without diffing by hand.
      const liveList = matchesFull ? STAGES : (dedup.length <= SHORT.length ? SHORT : STAGES);
      let at = 0;
      while (at < dedup.length && at < liveList.length && dedup[at] === liveList[at]) at++;
      const detail = at < dedup.length || at < liveList.length
        ? `first divergence at index ${at}: document has "${dedup[at] ?? '(end)'}", source has "${liveList[at] ?? '(end)'}"`
        : 'membership differs from both the full and the non-full list';
      problems.push(
        `${path.relative(ROOT, file)}: restates the stage list inline but it does not match the source (${detail}). ` +
        `Full list: scripts/lib/stages.js.`
      );
      checkedLiterals.push(path.relative(ROOT, file));
    } else {
      checkedLiterals.push(path.relative(ROOT, file));
    }
  }
}

/* ---------- Check 2c: no document may assert a WRONG stage count ----------
 * COUNT_SITES is a positive list: it verifies four documents still say "15". It cannot catch a
 * document that asserts a number nobody listed. Measured defect: `modules/hosts/codex.md` and a
 * historical log entry said "16 stages" while the state machine had 15 -- the count drifted
 * silently because `codex.md` was only in CHAIN_SITES, and a chain check says nothing about a
 * number written in prose. So this check is negative: it scans every live document for a
 * "<n> stages" claim and fails any n that is neither the full nor the non-full count.
 *
 * Two explicit non-claims are excluded: `_quick-reference.md` restates historical counts as measurements, which carry a date or a
 * quoted guard output and are not present-tense claims about the framework.
 */
const COUNT_CLAIM = /(\d{1,2})\s*(?:\/\s*\d{1,2}\s*)?stages\b/gi;
const HISTORY_MARKERS = /\b(measured|observed|was|baseline|log entry|->|reported)\b/i;
for (const file of walk(ROOT)) {
  if (!file.endsWith('.md')) continue;
  const rel = path.relative(ROOT, file);
  // Skip documents that are themselves historical records.
  if (rel.startsWith('docs' + path.sep)) continue;
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, idx) => {
    let m;
    COUNT_CLAIM.lastIndex = 0;
    while ((m = COUNT_CLAIM.exec(line)) !== null) {
      const n = Number(m[1]);
      if (n === STAGES.length || n === SHORT.length) continue;
      if (HISTORY_MARKERS.test(line)) continue;
      problems.push(
        `${rel}:${idx + 1}: asserts "${m[0]}" but the state machine has ${STAGES.length} stages ` +
        `(${SHORT.length} on non-full paths). Fix the number, not this guard.`
      );
    }
  });
}

/* ---------- Report ---------- */
if (problems.length) {
  console.log('X Stage order drift detected:');
  for (const p of problems) console.log('  - ' + p);
  console.log(`\n  Single source: scripts/lib/stages.js (${STAGES.length} stages: full ${STAGES.length}, non-full ${SHORT.length})`);
  console.log('  Fix the document, not this guard.');
  process.exit(1);
}

console.log(`[OK] Stage order consistent (${STAGES.length} stages: full ${STAGES.length}, non-full ${SHORT.length})`);
console.log(`     chains verified: ${checkedChains.length} document(s); counts verified: ${checkedCounts.length} document(s)`);
