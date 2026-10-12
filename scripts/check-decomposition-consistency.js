#!/usr/bin/env node
'use strict';

/*
 * Consistency guard for the decomposition criterion (single-source enforcement).
 *
 * Why this exists: the decomposition criterion -- when decomposition is mandatory and when
 * it may be skipped -- was carried in TWO full tables (`stages/requirement.md` and
 * `core/task/decomposition.md`), each with its own escalation restatement, and the two
 * restatements had already drifted in wording. This is the same defect shape the escalation
 * guard was written for: a rule stated in several places, fixed in some copies but not all,
 * leaving documents that state *different* rules. `check-escalation-consistency.js` polices
 * the escalation side; this guard polices the decomposition side, because the two criteria
 * are separate questions with separate thresholds and each needs its own single source.
 *
 * Design follows the escalation guard's lessons (each cost a review round there):
 *  1. A hardcoded site list is the bug -- sites are DISCOVERED, not enumerated.
 *  2. Discovery keys on the rule's distinguishing terms (which any restatement must reuse),
 *     not on a heading a rename could hide.
 *  3. Exemption markers that match nothing are rejected as ghosts (Check A).
 *
 * Scope note: `archive/` is a frozen historical snapshot and is exempted explicitly by that
 * claim, not silently skipped. Records (logs, runtime state, host workspace) are excluded on
 * the same principle as the escalation guard: they may quote the criterion's vocabulary in
 * order to describe it, and a guard that reads its own audit trail is self-poisoning.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const SELF = path.basename(__filename);

let errors = 0;
function fail(msg) { errors++; console.log(`  [FAIL] ${msg}`); }
function ok(msg) { console.log(`  [ OK ] ${msg}`); }

// Excluded surfaces. Mirrors check-escalation-consistency.js: normative documents are
// scanned; records (which quote defect vocabulary to describe it) are not.
const EXCLUDED_DIRS = {
  '.git': 'version control internals',
  node_modules: 'third-party dependencies',
  '.hello-dev': 'runtime state (checkpoint/skip reasons may quote the criterion while reporting)',
  '.workbuddy': 'host project-level workspace data, gitignored -- history and logs, not normative',
  archive: 'frozen historical snapshot',
  outputs: 'dated review records of past rounds (ships, but is history by construction)',
};
const EXCLUDED_PATHS = {
  'docs/progress_coding': 'append-only change log -- quotes defect vocabulary in order to describe it',
};

const AUTHORITATIVE = 'modules/core/task/decomposition.md';

// Distinguishing terms any full restatement of the decomposition criterion must reuse.
// These are the table's own decision vocabulary (the row conditions), so a copy that
// restates the thresholds is discovered no matter which heading it sits under.
const CRITERION_TERMS = [
  'Must decompose',
  '必须分解',
];

// The marker that declares a document is NOT carrying its own copy of the criterion
// (it cites the single source instead). Kept distinct from the escalation guard's marker
// ("This table is the decomposition criterion...") because after this change no table
// remains outside the authoritative file -- the non-carrying form is a citation sentence.
//
// These markers must EXCLUDE the escalation guard's reserved vocabulary ("single
// authoritative source" and friends): claiming to be the single source of the ESCALATION
// criterion (escalation.md) is legal, and a marker that trips on it makes the two guards
// accuse each other -- a cross-poisoning pair that goes red for a correct document.
const CITATION_MARKERS = [
  'does not restate that table or its thresholds',
  'does not restate its thresholds',
  'defined **once** in [decomposition',
  '定义**一次**于 [decomposition',
  '不复述该表或其阈值',
  '不复述其阈值',
];

// Boundary-recognition layer. The three expert-package agent files (scope-gatekeeper,
// task-decomposer, team-lead) are *operational SOPs* that legitimately restate the
// criterion so the agent can judge without reading module paths -- they are not protocol
// documents and cannot link back to `decomposition.md` (the package ships standalone to a
// host). Their defect shape is different from a drifting protocol copy: two agents could
// disagree with each other, not with the protocol. They are therefore EXEMPT from the
// single-source citation requirement, but only when they carry this marker declaring the
// layer. A carrier that restates without either a citation or this marker fails Check D.
const BOUNDARY_SOP_MARKERS = [
  'boundary-recognition SOP',
  '边界识别 SOP',
];

// Rival single-source claims about the DECOMPOSITION criterion. Only AUTHORITATIVE may
// make one. Deliberately narrower than the escalation guard's list: it does NOT include
// the phrases escalation.md legitimately claims for the escalation criterion.
//
// All markers are built by concatenation on purpose: this file is scanned by BOTH guards
// (it is excluded only as SELF from this guard's carrier discovery, but the rival sweeps
// run over allText). A literal marker here would match this file and make the OTHER guard
// (and this one) accuse ITSELF of a rival claim -- a self-poisoning detector, the same
// failure the escalation guard documents for state.json. Concatenation keeps the runtime
// value identical while leaving no literal substring for a scanner to match.
//
// The two `sole/only source of truth` markers below are ALSO escalation-reserved phrases
// (escalation.md legitimately claims them). They are kept in this list because this guard
// wants to catch them said ABOUT the decomposition criterion -- but the check below
// excludes SELF from the rival sweep, so this file's own markers never count as a claim.
const ESCALATION_RESERVED = ['single', ' authoritative', ' source'].join('');
const ESCALATION_RESERVED_ZH = ['唯一', '权威表述'].join('');
const RIVAL_MARKERS = [
  'decomposition criterion ' + '... ' + ESCALATION_RESERVED,
  'decomposition-criterion ' + 'single',
  '分解判据' + '单一权威',
  '分解判据的' + '唯一',
  '分解判据' + '唯一',
  'sole source of truth for the decomposition',
  'only source of truth for the decomposition',
];
const RIVAL_FALSE_POSITIVES = [
  '语义唯一',
  '唯一定义的副本',
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
      if (entry === SELF) continue;             // this guard names the defect vocabulary
      if (/^test-.*\.js$/.test(entry)) continue; // fixtures quote the vocabulary to inject it
      out.push(abs);
    }
  })(REPO_ROOT);
  return out;
}

console.log('decomposition-criterion consistency guard');

const files = listTextFiles();
const allText = files.map((f) => ({
  rel: path.relative(REPO_ROOT, f).split(path.sep).join('/'),
  text: readText(f) || '',
}));

// ---- Check A: exemption markers must be real (no ghosts) ---------------------------
console.log('\nexemption markers (a marker matching nothing is a ghost -- rejected)');
let anyMarkerHit = false;
for (const marker of CITATION_MARKERS) {
  const hits = allText.filter(({ text }) => text.includes(marker));
  if (hits.length > 0) anyMarkerHit = true;
  ok(`citation marker "${marker}" matches ${hits.length} file(s)`);
}
if (!anyMarkerHit) {
  fail('no citation marker matches any file -- every marker is a ghost; the citation form has drifted');
}

// ---- Check B: excluded surfaces must be justified ----------------------------------
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

// ---- Check C: discover every carrier of the criterion ------------------------------
console.log('\ncriterion carrier discovery (term-based, not heading-based)');
const carriers = allText.filter(({ text }) => CRITERION_TERMS.some((t) => text.includes(t)));
if (carriers.length === 0) {
  fail('no document restates the criterion at all -- it appears to have been dropped everywhere');
} else {
  ok(`discovered ${carriers.length} carrier(s): ${carriers.map((c) => c.rel).join(', ')}`);
}

// ---- Check D: the single source carries the table; no rival claims it ---------------
console.log('\nsingle-source attribution');
const auth = carriers.find((c) => c.rel === AUTHORITATIVE);
if (!auth) {
  fail(`${AUTHORITATIVE} does not carry the criterion -- the authoritative definition is missing`);
} else {
  ok(`${AUTHORITATIVE} carries the criterion table`);
}

// A file-level "it cites the source" is NOT enough: a document can carry a citation
// sentence AND still restate the criterion in a later section -- the exact partial-fix
// defect this guard exists to catch (a copy edited in one place, left intact in another).
//
// Detection is therefore scoped to the criterion's DISTINCTIVE action phrase, not to the
// numeric thresholds: the thresholds ("2 change units", "> 50 lines") are SHARED with the
// escalation criterion, whose legal restatements (in expert-package SOPs, escalation.md)
// reuse them. Keying on "Must decompose" + a nearby threshold on the same line finds the
// decomposition-specific copy without flagging a correct escalation restatement.
const CRITERION_ACTION = 'Must decompose';
const SHARED_THRESHOLD_TERMS = [
  '>= 2 logical change units',
  'Clear sequential dependencies',
  'de-duplicated estimated > 50',
  '逻辑改动单元数 ≥ 2',
  '明确顺序依赖',
  '去重后预估 > 50',
];
function lineOf(text, idx) {
  const start = text.lastIndexOf('\n', idx) + 1;
  const end = text.indexOf('\n', idx);
  return text.slice(start, end === -1 ? text.length : end);
}

for (const { rel, text } of carriers) {
  const cites = CITATION_MARKERS.some((m) => text.includes(m));
  const isBoundarySop = BOUNDARY_SOP_MARKERS.some((m) => text.includes(m));
  const isAuthoritative = rel === AUTHORITATIVE;

  // Occurrence-level sweep keyed on the distinctive action phrase: a line that carries
  // BOTH the action phrase AND a threshold term (the shape of an actual definition row)
  // must contain a citation/SOP marker on that same line -- EXCEPT the authoritative
  // file's own table rows, where that exact shape IS the single source rather than a
  // restatement. A line that mentions only the action phrase (the authoritative file's
  // "This table is the decomposition criterion, not the escalation criterion" discussion,
  // which quotes the term to distinguish the two criteria) is a reference, not a
  // definition, and carries no threshold that could drift -- it is not a violation.
  const violations = [];
  let idx = text.indexOf(CRITERION_ACTION);
  while (idx !== -1) {
    const line = lineOf(text, idx);
    const hasThreshold = SHARED_THRESHOLD_TERMS.some((t) => line.includes(t));
    const lineHasMarker = CITATION_MARKERS.some((m) => line.includes(m))
      || BOUNDARY_SOP_MARKERS.some((m) => line.includes(m));
    const isTableDefinitionRow = isAuthoritative && /^\s*\|.*Must decompose.*\|\s*$/.test(line);
    if (hasThreshold && !lineHasMarker && !isTableDefinitionRow) {
      const thr = SHARED_THRESHOLD_TERMS.find((t) => line.includes(t));
      violations.push({ line: line.trim().slice(0, 110), thr });
    }
    idx = text.indexOf(CRITERION_ACTION, idx + CRITERION_ACTION.length);
  }

  if (violations.length > 0) {
    fail(`${rel} restates the criterion (${violations.length} occurrence(s)) with no citation marker on the line -- a second definition that can drift: ${violations.map((v) => v.thr ? `"${v.thr}" on: ${v.line}` : `"${v.line}"`).join(' | ')}`);
  } else if (isAuthoritative) {
    ok(`${rel}: carries the criterion table (definition rows exempt; any other occurrence would need a citation)`);
  } else if (cites || isBoundarySop) {
    ok(`${rel}: ${cites ? 'cites the single source' : 'declares itself a boundary-recognition SOP'} (no criterion restatement found outside markers)`);
  } else {
    fail(`${rel} restates the criterion ("Must decompose") but neither is the authoritative file, cites it, nor declares itself a boundary-recognition SOP -- this is a second definition that can drift`);
  }
}

// Rival single-source claims: only AUTHORITATIVE may claim to be the one source of the
// decomposition criterion.
//
// SELF is excluded from this sweep: this file's own RIVAL_MARKERS are (by construction,
// see above) escalation-reserved phrases that would otherwise match this file and make the
// guard report itself as a rival. Excluding SELF is not a coverage hole -- a real rival
// claim in another file still trips, and Check A separately asserts the markers exist.
let rivals = 0;
for (const { rel, text } of allText) {
  if (rel === AUTHORITATIVE) continue;
  if (path.basename(rel) === SELF) continue;
  for (const marker of RIVAL_MARKERS) {
    let idx = text.indexOf(marker);
    while (idx !== -1) {
      const window = text.slice(Math.max(0, idx - 40), idx + marker.length + 40);
      const excused = RIVAL_FALSE_POSITIVES.some((p) => window.includes(p));
      if (!excused) {
        fail(`${rel} claims to be the single definition ("${marker}") while ${AUTHORITATIVE} also claims it -- two documents cannot both be the one source`);
        rivals++;
        break;
      }
      idx = text.indexOf(marker, idx + 1);
    }
    if (rivals > 0 && text.indexOf(marker) !== -1) break;
  }
}
if (rivals === 0) ok('no document claims to be the single decomposition-criterion definition besides the authoritative file');

console.log(`\n${errors} error(s)`);
if (errors === 0) {
  console.log(`decomposition criterion: ${carriers.length} carrier(s) consistent, attribution unique to ${AUTHORITATIVE}`);
}
process.exit(errors > 0 ? 1 : 0);
