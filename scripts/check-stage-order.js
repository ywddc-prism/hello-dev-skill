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
 * source. It is deliberately **stronger than a union check**: it requires the chain to match
 * **verbatim**, including order. A union check would accept a document whose stages are all
 * present but reordered, which is exactly the "which comes first" question this framework
 * exists to answer.
 *
 * There is exactly ONE chain now: the full 15-stage chain. The former non-full (fast-path)
 * chain is retired -- every task starts on the full chain and any reduction is a recorded,
 * user-approved stage skip (state.js `skip`), never a second declared chain. So this guard
 * does not just require the full chain to be *present* (substring): it requires every
 * `bootstrap -> ...` claim to be *equal* to the full chain. A substring check would still
 * accept the retired short chain, because the short chain is a contiguous substring of the
 * full one -- measuring that direction was the design check for this guard's rewrite.
 *
 * Usage: node scripts/check-stage-order.js
 * Non-zero exit means at least one document disagrees with the state machine.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const { STAGES } = require('./lib/stages');

const title = s => s.split('-').map(w => (w === 'ux' ? 'UX' : w === 'ui' ? 'UI' : w[0].toUpperCase() + w.slice(1))).join(' ');
const FULL_CHAIN = STAGES.join(' -> ');
const FULL_TITLE_CHAIN = STAGES.map(title).join(' -> ');

/**
 * Documents that must state the chain verbatim (the full chain is the only chain).
 * Every site must contain the full chain; Check 2b then enforces that EVERY
 * `bootstrap -> ...` claim in the file is *equal* to it.
 *
 * Chains are accepted in either separator form (`a -> b -> c` or `a, b, c`): the framework
 * uses arrows in prose and comma lists in code blocks, and forcing one form would be a
 * cosmetic edit with no drift-catching value. Order and membership are what matter.
 */
const CHAIN_SITES = [
  'README.md',
  'README.zh-CN.md',
  'SKILL.md',
  'SKILL.zh-CN.md',
  'modules/core/state-protocol.md',
  'modules/paths/full-flow.md',
  'modules/hosts/workbuddy.md',
  'modules/hosts/codex.md',
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
 * single ` -> ` separator, collapse whitespace, and strip trailing sentence punctuation.
 * Display-name form and slug form are both accepted because the framework uses titles in
 * prose and slugs in code; requiring one form would force cosmetic rewrites of prose with
 * no drift-catching value. Trailing punctuation matters because this is an EQUALITY
 * comparison (Check 2b): a sentence like `... -> Archive.` ends with a period that must
 * not make a correct chain fail.
 */
function normalizeChain(s) {
  return strip(s)
    .replace(/\s*(?:->|→|-->)\s*/g, ' -> ')
    .replace(/\s*,\s*/g, ' -> ')
    .replace(/\s+/g, ' ')
    .replace(/[.。;；:：、]+$/, '')
    .trim();
}

/** The normalised full chain, in both separator forms. */
const FULL_NORM = normalizeChain(FULL_CHAIN);
const FULL_TITLE_NORM = normalizeChain(FULL_TITLE_CHAIN);

function containsChain(haystackNorm, chainNorm) {
  return haystackNorm.includes(chainNorm);
}

/* ---------- Check 1: declared chains match verbatim ---------- */
for (const file of CHAIN_SITES) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) { problems.push(`${file}: declared in CHAIN_SITES but the file does not exist`); continue; }
  const text = fs.readFileSync(p, 'utf8');
  const normLines = text.split(/\r?\n/).map(normalizeChain).join('\n');
  const full = containsChain(normLines, FULL_NORM) || containsChain(normLines, FULL_TITLE_NORM);
  if (!full) {
    problems.push(`${file}: does not state the full chain verbatim (order and membership must match scripts/lib/stages.js)`);
  }
  checkedChains.push(file);
}

/* ---------- Check 2: stage counts match ---------- */
for (const site of COUNT_SITES) {
  const p = path.join(ROOT, site.file);
  if (!fs.existsSync(p)) { problems.push(`${site.file}: declared in COUNT_SITES but the file does not exist`); continue; }
  const text = fs.readFileSync(p, 'utf8');
  if (!site.pattern.test(text)) {
    problems.push(`${site.file}: expected the stage count marker "${site.label}" (the state machine has ${STAGES.length} stages)`);
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
 * markdown prefix such as `# full: `, `| \`full\` | `, or `4. **Execute stages**: `) with
 * `bootstrap` is treated as a chain claim and must be EQUAL to the full chain. Equality,
 * not substring: the retired short chain is a contiguous substring of the full one, so a
 * substring check would keep accepting it — the exact hole this guard now closes.
 * Lines that carry a placeholder (`[design stages]`) are illustrative summaries,
 * not claims, and are skipped.
 */
const CHAIN_CLAIM = /(?:^|[\s|*>:`])(bootstrap)\s*(?:->|→)\s*[a-z]/i;
for (const file of CHAIN_SITES) {
  const p = path.join(ROOT, file);
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
    // Truncate to the chain itself: the line may carry trailing table cells or a
    // continuing sentence after the last stage (README table, SKILL prose). Equality
    // must compare the chain segment, not the whole remainder of the line.
    // Find the last stage token (slug OR display-title form) in the normalised line,
    // then cut right after it — a single slug-based scan misses title-form chains.
    let end = -1;
    for (const stage of STAGES) {
      const forms = [stage, title(stage)];
      for (const form of forms) {
        const at = norm.lastIndexOf(form);
        if (at + form.length > end) end = at + form.length;
      }
    }
    const segment = end >= 0 ? norm.slice(0, end) : norm;
    const matchesFull = segment === FULL_NORM || segment === FULL_TITLE_NORM;
    if (!matchesFull) {
      problems.push(
        `${file}:${idx + 1}: this stage chain does not match the full list ` +
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
    if (!matchesFull) {
      // Report the first divergence so the fix is obvious without diffing by hand.
      let at = 0;
      while (at < dedup.length && at < STAGES.length && dedup[at] === STAGES[at]) at++;
      const detail = at < dedup.length || at < STAGES.length
        ? `first divergence at index ${at}: document has "${dedup[at] ?? '(end)'}", source has "${STAGES[at] ?? '(end)'}"`
        : 'membership differs from the full list';
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
 * Two explicit non-claims are excluded: the zh-CN editions state the count in Chinese
 * ("15 个阶段") and are verified by the chain check above, not by this English "<n> stages"
 * scan; and `_quick-reference.md` restates historical counts as measurements, which carry a
 * date or a quoted guard output and are not present-tense claims about the framework.
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
      if (n === STAGES.length) continue;
      if (HISTORY_MARKERS.test(line)) continue;
      problems.push(
        `${rel}:${idx + 1}: asserts "${m[0]}" but the state machine has ${STAGES.length} stages. ` +
        `Fix the number, not this guard.`
      );
    }
  });
}

/* ---------- Report ---------- */
if (problems.length) {
  console.log('X Stage order drift detected:');
  for (const p of problems) console.log('  - ' + p);
  console.log(`\n  Single source: scripts/lib/stages.js (${STAGES.length} stages)`);
  console.log('  Fix the document, not this guard.');
  process.exit(1);
}

console.log(`[OK] Stage order consistent (${STAGES.length} stages)`);
console.log(`     chains verified: ${checkedChains.length} document(s); counts verified: ${checkedCounts.length} document(s)`);
