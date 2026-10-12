#!/usr/bin/env node
'use strict';

/*
 * Consistency guard for the escalation criterion + module-root definition.
 *
 * Why this exists: the same rule is carried in several documents, and in four consecutive
 * review rounds the defect was the same shape -- a fix applied to some copies but not all,
 * leaving two documents that state *different* rules. Every existing guard stayed green,
 * because they check existence, link targets and stage order; none compared what two
 * documents actually *say* about one rule.
 *
 * Lessons from writing it (each cost a review round):
 *  1. A hardcoded site list is the bug. Round 1 version named four sites while the repo
 *     had five carriers, so the fifth could be flattened undetected. Sites are discovered.
 *  2. Discovery that depends on the same wording as the defect is not discovery. A caller
 *     that renames a heading keeps the carrier invisible. Discovery here keys on the rule's
 *     *distinguishing terms*, which any restatement must reuse.
 *  3. An exemption marker that matches nothing is worse than no exemption: it looks like
 *     coverage and hides a real defect. Every configured marker is asserted to match at
 *     least one file, so a ghost marker fails the guard instead of silently passing.
 *
 * Scope note: `archive/` is a frozen historical snapshot and is exempted explicitly by that
 * claim, not silently skipped. `outputs/` is NOT exempt -- it is not gitignored and ships.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const SELF = path.basename(__filename);

let errors = 0;
function fail(msg) { errors++; console.log(`  [FAIL] ${msg}`); }
function ok(msg) { console.log(`  [ OK ] ${msg}`); }

// Directories excluded from discovery. Each needs a stated reason, and each exclusion of a
// *content* directory must be justified as a frozen historical snapshot rather than a
// hiding place. `outputs/` is NOT gitignored (it ships), so excluding it is only sound
// because its contents are dated review records of past rounds -- and the guard reports
// that reasoning rather than hiding it.
//
// `.hello-dev/` holds runtime state, not documentation. It must be excluded, and this is not
// cosmetic: a checkpoint `--reason` that *describes* a defect (e.g. naming the banned phrase
// while reporting that it was found) is written into state.json, which turned this guard red
// on its own evidence. A guard that reads its own audit trail as a document is a
// self-poisoning detector -- it produces a permanently failing check that no document
// change can fix.
//
// `.workbuddy/` is the same class of noise: host project-level workspace data (gitignored),
// including daily logs that narrate which wording was retired. It is history, not a
// normative document, so a phrase quoted there is a record and not a claim.
//
// `docs/progress_coding/` is the append-only change log. The same reasoning applies and it is
// not hypothetical: writing up this very defect -- quoting the banned phrase in order to say it
// had been removed -- turned the guard red a third time. A record that describes a defect must
// be able to name it. The guard's input surface is therefore *normative documents*, while
// records (logs, runtime state, host workspace, frozen snapshots) are excluded on that
// principle rather than for convenience.
const EXCLUDED_DIRS = {
  '.git': 'version control internals',
  node_modules: 'third-party dependencies',
  '.hello-dev': 'runtime state (including checkpoint reasons that may quote a banned phrase while reporting a defect)',
  '.workbuddy': 'host project-level workspace data, gitignored -- history and logs, not normative documents',
  archive: 'frozen historical snapshot',
  outputs: 'dated review records of past rounds (ships, but is history by construction)',
};

// Record surfaces, matched by path rather than basename so a directory named `docs` elsewhere
// is unaffected.
const EXCLUDED_PATHS = {
  'docs/progress_coding': 'append-only change log -- quotes defect vocabulary in order to describe it',
};

const AUTHORITATIVE = 'modules/core/task/escalation.md';

// Terms that any restatement of the carve-out must reuse. Keyed on the rule's own
// vocabulary rather than on any heading, so rewording a title does not hide a carrier.
const CARVE_OUT_TERMS = [
  'N locations',
  'N 处同步',
  'N-location',
];

// A document is treated as carrying the rule if it mentions the carve-out vocabulary AND
// the cross-module judgment vocabulary (or the same-root qualifier).
const CROSS_MODULE_TERMS = [
  'Cross-module judgment is by module root',
  '跨模块判定以模块根为准',
];

const ANCHOR_EN = 'Cross-module judgment is by module root';
const ANCHOR_ZH = '跨模块判定以模块根为准';
const SAME_ROOT_EN = 'fall within the same module root';
const SAME_ROOT_ZH = '落在同一模块根内';
const CROSS_ROOT_EN = 'span different module roots';
const CROSS_ROOT_ZH = '分属不同模块根';

// Exemption: documents that restate only the "counts as one change unit" half for the
// DECOMPOSITION criterion. They carry no cross-module claim, so they cannot contradict it.
// Each marker is verified to match something (Check A); a ghost marker is an error, because
// a marker that matches nothing looks like coverage while exempting nothing.
const DECOMPOSITION_ONLY_MARKERS = [
  'This table is the decomposition criterion, not the escalation criterion',
];

// Rival single-source claims. Only AUTHORITATIVE may make one.
//
// The marker list must cover the natural phrasings, not one literal string: a guard whose
// vocabulary is narrower than the language it polices reports green on a rival claim written
// in different words. A reviewer demonstrated exactly that by rewording the package README
// to "唯一权威表述" and getting a pass. The bare `唯一` forms are included deliberately;
// explanatory uses like "语义唯一" are excluded because they clarify rather than claim.
//
// Known boundary: this is a vocabulary heuristic, so an unlisted phrasing still slips
// through (a reviewer found four). That is why the check also reports the false-positive
// window and why test-guards asserts both directions. Widening the list is cheap; treating
// the list as complete is the mistake.
const RIVAL_MARKERS = [
  '全仓唯一表述',
  '唯一的表述',
  '唯一权威表述',
  '唯一权威源',
  '唯一定义',
  '唯一表述',
  '唯一来源',
  '唯一出处',
  '权威出处',
  '仅此一处定义',
  'single authoritative source',
  'the only authoritative',
  'sole authoritative',
  'only source of truth',
];
// Phrases that legitimately contain a rival-looking substring but make no claim, e.g.
// "唯一表述指语义唯一" -- an explanation of what the rule means, not a claim to be the source.
const RIVAL_FALSE_POSITIVES = [
  '语义唯一',
  '唯一定义的副本',
  'canon 副本',
];

function readText(abs) {
  try { return fs.readFileSync(abs, 'utf8'); } catch { return null; }
}

function listTextFiles() {
  const out = [];
  const excludedAbs = Object.keys(EXCLUDED_PATHS).map((p) => path.join(REPO_ROOT, p));
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir)) {
      if (Object.prototype.hasOwnProperty.call(EXCLUDED_DIRS, entry)) continue;
      const abs = path.join(dir, entry);
      if (excludedAbs.some((e) => abs === e)) continue;
      let st;
      try { st = fs.statSync(abs); } catch { continue; }
      if (st.isDirectory()) { walk(abs); continue; }
      if (!/\.(md|js|sh|yml|json)$/.test(entry)) continue;
      if (entry === SELF) continue; // this guard necessarily names the defect vocabulary
      // Every guard's source necessarily embeds its own marker vocabulary (and may
      // reference a sibling guard's markers when the two are designed to interlock),
      // so a guard's source is metadata ABOUT markers -- not a document that claims to
      // be the single source of any rule. Excluding by basename keeps this extensible:
      // a future guard is covered without editing this list. Self-exclusion here is
      // sound because Check A independently asserts each marker still matches at least
      // one real file, so a ghost marker cannot hide behind this exclusion.
      if (/^check-.*\.(js|sh)$/.test(entry)) continue;
      // Test fixtures necessarily quote the defect vocabulary in order to inject it.
      // Scanning them makes the guard fail on its own test suite -- the same
      // self-poisoning failure as reading .hello-dev/state.json. Fixtures are not documents.
      if (/^test-.*\.js$/.test(entry)) continue;
      out.push(abs);
    }
  })(REPO_ROOT);
  return out;
}

/** The clause text following an anchor, to the end of its sentence/paragraph. */
function clauseAfter(text, anchor) {
  const i = text.indexOf(anchor);
  if (i === -1) return null;
  const rest = text.slice(i, i + 700);
  const stop = rest.search(/\n\s*\n|(?<!\d)\.\s/);
  return stop > 0 ? rest.slice(0, stop) : rest;
}

console.log('escalation-criterion consistency guard');

const files = listTextFiles();

// ---- Check A: configured exemption markers must be real -----------------------------
console.log('\nexemption markers (a marker matching nothing is a ghost -- rejected)');
const allText = files.map((f) => ({ rel: path.relative(REPO_ROOT, f).split(path.sep).join('/'), text: readText(f) || '' }));
for (const marker of DECOMPOSITION_ONLY_MARKERS) {
  const hits = allText.filter(({ text }) => text.includes(marker));
  if (hits.length === 0) {
    fail(`exemption marker "${marker}" matches no file -- it is a ghost marker and would silently exempt nothing while appearing to be coverage`);
  } else {
    ok(`exemption marker "${marker}" matches ${hits.length} file(s)`);
  }
}

// ---- Check B: excluded directories must be justified, not just skipped ---------------
console.log('\nexcluded surfaces (normative documents are scanned; records are not)');
for (const [dir, reason] of Object.entries(EXCLUDED_DIRS)) {
  const abs = path.join(REPO_ROOT, dir);
  if (!fs.existsSync(abs)) ok(`${dir}/ absent -- exclusion is vacuous (${reason})`);
  else ok(`${dir}/ excluded: ${reason}`);
}
for (const [rel, reason] of Object.entries(EXCLUDED_PATHS)) {
  const abs = path.join(REPO_ROOT, rel);
  if (!fs.existsSync(abs)) ok(`${rel}/ absent -- exclusion is vacuous (${reason})`);
  else ok(`${rel}/ excluded: ${reason}`);
}

// ---- Check C: discover every carrier -------------------------------------------------
console.log('\ncarrier discovery (term-based, not heading-based)');
const carriers = [];
for (const { rel, text } of allText) {
  const mentionsCarveOut = CARVE_OUT_TERMS.some((t) => text.includes(t));
  if (!mentionsCarveOut) continue;
  const statesJudgment = CROSS_MODULE_TERMS.some((t) => text.includes(t));
  carriers.push({ rel, text, statesJudgment });
}
if (carriers.length === 0) {
  fail('no document restates the rule at all -- it appears to have been dropped everywhere');
} else {
  ok(`discovered ${carriers.length} carrier(s): ${carriers.map((c) => c.rel).join(', ')}`);
}

// ---- Check D: carve-out direction on every carrier that states the judgment ----------
console.log('\ncarve-out direction');
const clauses = new Map();
for (const { rel, text, statesJudgment } of carriers) {
  if (!statesJudgment) continue;
  const clause = clauseAfter(text, ANCHOR_EN) || clauseAfter(text, ANCHOR_ZH);
  if (!clause) {
    fail(`${rel} states the judgment term but its carve-out clause could not be located`);
    continue;
  }
  clauses.set(rel, clause);
}

if (!clauses.has(AUTHORITATIVE)) {
  fail(`${AUTHORITATIVE} does not carry the cross-module judgment anchor -- the authoritative definition is missing`);
}

for (const [rel, clause] of clauses) {
  const sameRoot = clause.includes(SAME_ROOT_EN) || clause.includes(SAME_ROOT_ZH);
  const crossRoot = clause.includes(CROSS_ROOT_EN) || clause.includes(CROSS_ROOT_ZH);
  if (sameRoot && crossRoot) {
    ok(`${rel}: narrowed (same-root qualifier + cross-root branch)`);
  } else {
    const missing = [];
    if (!sameRoot) missing.push('same-root qualifier');
    if (!crossRoot) missing.push('cross-root branch');
    fail(`${rel}: NOT narrowed -- missing ${missing.join(' + ')}; this yields the opposite escalation verdict for a set of landing points that spans module roots`);
  }
}

// ---- Check E: carriers that do NOT state the judgment --------------------------------
// A carrier with no cross-module anchor is only legitimate if it is a *decomposition*
// document: it must declare itself one, AND it must not contain a bare (unqualified)
// cross-module conclusion. Without the second half, pasting the declaration sentence into
// any document would launder a flat carve-out past this guard -- which was reproducible:
// a file containing the flat phrasing plus the declaration ran clean.
const FLAT_CONCLUSION_EN = /(N locations|N-location)[^.]{0,80}(does not count as cross-module|not cross-module)/i;
const FLAT_CONCLUSION_ZH = /(N 处同步)[^。]{0,60}不计为跨模块/;

console.log('\ncarriers without a cross-module anchor');
for (const { rel, text } of carriers) {
  if (clauses.has(rel)) continue;
  const declares = DECOMPOSITION_ONLY_MARKERS.some((m) => text.includes(m));
  const hasFlat = FLAT_CONCLUSION_EN.test(text) || FLAT_CONCLUSION_ZH.test(text);
  // Does it qualify the conclusion with the same-root restriction anywhere?
  const qualified = (text.includes(SAME_ROOT_EN) || text.includes(SAME_ROOT_ZH))
    && (text.includes(CROSS_ROOT_EN) || text.includes(CROSS_ROOT_ZH));

  if (hasFlat && !qualified) {
    fail(`${rel} states a flat cross-module conclusion ("one unit across N locations does not count as cross-module") with no same-root qualifier${declares ? ' -- and its decomposition-only declaration does NOT launder it' : ''}; this yields the opposite escalation verdict for landing points that span module roots`);
  } else if (declares) {
    ok(`${rel}: declares itself the decomposition criterion and states no unqualified cross-module conclusion`);
  } else {
    fail(`${rel} restates the carve-out but neither states the cross-module judgment nor declares itself decomposition-only -- a flat reading can be taken from it in isolation`);
  }
}

// ---- Check F: rival single-source claims ---------------------------------------------
console.log('\nsingle-source attribution');
let rivals = 0;
for (const { rel, text } of allText) {
  if (rel === AUTHORITATIVE) continue;
  for (const marker of RIVAL_MARKERS) {
    let idx = text.indexOf(marker);
    while (idx !== -1) {
      // Skip occurrences that are part of an explanatory (non-claiming) phrase.
      const window = text.slice(Math.max(0, idx - 40), idx + marker.length + 40);
      const excused = RIVAL_FALSE_POSITIVES.some((p) => window.includes(p));
      if (!excused) {
        fail(`${rel} claims to be the single/only definition ("${marker}") while ${AUTHORITATIVE} also claims it -- two documents cannot both be the one source`);
        rivals++;
        break;
      }
      idx = text.indexOf(marker, idx + 1);
    }
    if (rivals > 0 && text.indexOf(marker) !== -1) break;
  }
}
if (rivals === 0) ok('no document claims to be the single definition besides the authoritative file');

console.log(`\n${errors} error(s)`);
if (errors === 0) {
  console.log(`escalation criterion: ${carriers.length} carrier(s) consistent, ${clauses.size} narrowed, attribution unique`);
}
process.exit(errors > 0 ? 1 : 0);
