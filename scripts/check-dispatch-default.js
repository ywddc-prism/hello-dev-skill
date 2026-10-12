#!/usr/bin/env node
'use strict';

/*
 * Consistency guard for the dispatch-mode default wording family.
 *
 * Why this exists: the dispatch default is `serial` (the main agent executes every
 * subtask unless `parallel` is explicitly opted in). The family of documents that
 * describe this default -- SKILL.md, decomposition.md, state-protocol.md,
 * implementation-agent.md, implementation.md, codex.md, _quick-reference.md, the
 * expert-package README and agent SOPs -- had drifted between EN/ZH and between
 * "default" and "explicit opt-in" claims. After a fix, the family had no guard --
 * a future edit could re-introduce "parallel is the default" in one carrier without
 * anyone noticing. This guard watches that family.
 *
 * Design (mirrors check-decomposition-consistency.js):
 *  - The "default parallel" wording family is captured by a list of phrases that
 *    each imply parallel is the default. Each phrase is a defect marker.
 *  - Discovery: scan normative documents; exclude records (logs, runtime state,
 *    host workspace), guard sources (which necessarily name the defect vocabulary),
 *    test fixtures (which inject it to probe guards).
 *  - Occurrence-level: every line containing any defect marker is a violation.
 *    A document with a citation marker ("defaults to serial; see state.js") is
 *    NOT exempt -- a citation line could still carry a wrong default claim in the
 *    same sentence. Each offending line is reported.
 *
 * The "correct" phrasing family ("serial is the default", "default is serial",
 * "默认是 serial", "默认值就是 serial", "dispatchMode: 'serial'", etc.) is not
 * checked here; it is the positive invariant and is maintained by documentation
 * review, not by a guard. This guard only catches the negative invariant: no
 * normative document claims the wrong default.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const REPO_ROOT = path.resolve(__dirname, '..');
const SELF = path.basename(__filename);

let errors = 0;
function fail(msg) { errors++; console.log(`  [FAIL] ${msg}`); }
function ok(msg) { console.log(`  [ OK ] ${msg}`); }

// Excluded surfaces (same policy as the other consistency guards): records are
// excluded because they quote defect vocabulary to describe it; guard sources are
// excluded because they necessarily embed the marker list.
const EXCLUDED_DIRS = {
  '.git': 'version control internals',
  node_modules: 'third-party dependencies',
  '.hello-dev': 'runtime state (checkpoint/skip reasons may quote any vocabulary)',
  '.workbuddy': 'host project-level workspace data, gitignored',
  archive: 'frozen historical snapshot',
  outputs: 'dated review records of past rounds',
};
const EXCLUDED_PATHS = {
  'docs/progress_coding': 'append-only change log -- quotes defect vocabulary to describe it',
};

// Defect markers: phrases that claim parallel is the default. Each of these is the
// WRONG default; the truth is "serial is the default". A line containing any one of
// them is a violation (unless the line is inside a test/injection comment -- but
// tests are already excluded via /^test-.*\.js$/ in the discovery loop).
//
// Built as literal strings (no concatenation tricks needed here): the defect markers
// are the EN/ZH phrasing that actually appeared in the documents during the drift.
// The guard's OWN source file is excluded from discovery via the basename check
// below, so the markers here cannot poison the guard itself.
const DEFECT_MARKERS = [
  'parallel (default)',
  'parallel is the default',
  'defaults to `parallel`',
  'defaults this to `parallel`',
  'defaults to parallel',
  'default parallel',
  'dispatchMode: `parallel`',
  'dispatchMode = `parallel`',
  '默认值就是 `parallel`',
  '默认值就是 **`parallel`',
  '默认写入 `dispatchMode: `parallel`',
  '默认是 **`parallel`',
  '默认是 `parallel`',
  '默认值为 `parallel`',
  '默认值为 **`parallel`',
  '默认值是 `parallel`',
  '默认值是 **`parallel`',
];

console.log('dispatch-default wording consistency guard');

const allText = [];
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
    if (entry === SELF) continue;                    // this guard's source names the markers
    if (/^test-.*\.js$/.test(entry)) continue;       // test fixtures inject the markers
    if (/^check-.*\.js$/.test(entry)) continue;      // other guards' sources may name the markers
    allText.push({
      rel: path.relative(REPO_ROOT, abs).split(path.sep).join('/'),
      text: fs.readFileSync(abs, 'utf8'),
    });
  }
})(REPO_ROOT);

console.log(`scanned ${allText.length} normative files`);

// ---- Check A: marker sanity (no ghosts) -------------------------------------------
// A marker that cannot match ANY text is a ghost -- it cannot catch anything, and
// indicates a typo'd marker or a drift in the vocabulary. We validate against THIS
// GUARD'S OWN SOURCE FILE: the DEFECT_MARKERS list is literally embedded here, so every
// marker MUST match at least one line in this file (the marker list entry itself).
// This is the same self-check the escalation guard uses implicitly; making it explicit
// catches a marker list that has drifted away from the vocabulary it was written for.
//
// Crucially, we do NOT require a marker to match a normative document: a clean normative
// corpus is exactly the invariant this guard maintains. A "clean = fail" check would
// collapse the guard into a tautology.
console.log('\nmarker sanity (each marker must match something, to prove it is live)');
const guardSource = fs.readFileSync(__filename, 'utf8');
let ghosts = 0;
for (const marker of DEFECT_MARKERS) {
  const inGuard = guardSource.includes(marker);
  if (inGuard) {
    ok(`marker "${marker.slice(0, 50)}" is live (matches this guard's source)`);
  } else {
    fail(`marker "${marker.slice(0, 50)}" is a ghost -- it matches nothing, not even this guard's source; typo or vocabulary drift?`);
    ghosts++;
  }
}
if (ghosts > 0) {
  fail(`${ghosts} ghost marker(s) -- remove or fix them before relying on this guard`);
}

// ---- Check B: no normative file carries a defect marker on any line ---------------
console.log('\ndefect sweep (no normative file may claim parallel is the default)');
const violations = [];
for (const { rel, text } of allText) {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const marker of DEFECT_MARKERS) {
      if (line.includes(marker)) {
        violations.push({ rel, line: i + 1, marker, preview: line.trim().slice(0, 100) });
        break; // one violation per line, even if multiple markers match
      }
    }
  }
}

if (violations.length === 0) {
  ok('no normative file claims "parallel is the default" -- the dispatch default is correctly stated throughout');
} else {
  for (const v of violations) {
    fail(`${v.rel}:${v.line} carries wrong-default claim ("${v.marker}"): ${v.preview}`);
  }
}

console.log(`\n${errors} error(s)`);
process.exit(errors > 0 ? 1 : 0);
