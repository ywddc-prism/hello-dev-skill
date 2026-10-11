#!/usr/bin/env node
'use strict';

/*
 * Regression tests for the two consistency guards:
 *   - scripts/check-expert-package.js
 *   - scripts/check-escalation-consistency.js
 *
 * Why this file exists: both guards are wired into self-check.sh as executable items --
 * but "invoked" is not "asserted". Nothing verified that either guard still FAILS when the
 * defect it hunts is reintroduced. Every historical defect these guards were written for was
 * found by review, and the guards themselves were hardened across several rounds; without
 * tests, a future edit can silently defang one of them and the suite stays green.
 *
 * Each case below is a real defect that actually shipped at some point in this change's
 * history, or a bypass a reviewer constructed. Every injection is reverted and the revert
 * is asserted -- a test that leaves the tree dirty is worse than no test.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: REPO_ROOT, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

function check(name, cond, detail) {
  if (cond) { passed++; console.log(`  [ OK ] ${name}`); }
  else { failed++; console.log(`  [FAIL] ${name}${detail ? ` -- ${detail}` : ''}`); }
}

function read(rel) { return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'); }
function write(rel, text) { fs.writeFileSync(path.join(REPO_ROOT, rel), text); }

/** Run fn with an injected change, then restore and assert the restore took. */
function withInjection(rel, transform, fn) {
  const abs = path.join(REPO_ROOT, rel);
  const original = fs.readFileSync(abs, 'utf8');
  try {
    const mutated = transform(original);
    if (mutated === original) throw new Error(`injection into ${rel} was a no-op -- the fixture text has drifted`);
    fs.writeFileSync(abs, mutated);
    fn();
  } finally {
    fs.writeFileSync(abs, original);
  }
  const restored = fs.readFileSync(abs, 'utf8');
  check(`restore ${rel}`, restored === original, 'file content differs after restore');
}

const GUARD_PKG = 'scripts/check-expert-package.js';
const GUARD_ESC = 'scripts/check-escalation-consistency.js';
const PLUGIN = 'expert-packages/workbuddy/hello-dev/.codebuddy-plugin/plugin.json';
const SETTINGS = 'expert-packages/workbuddy/hello-dev/settings.json';
const ESC_AUTH = 'modules/core/task/escalation.md';
const SKILL = 'SKILL.md';
const TEAM_LEAD = 'expert-packages/workbuddy/hello-dev/agents/hello-dev-team-lead.md';

/** A throwaway carrier file for discovery tests. */
const PROBE = 'modules/.tmp-guard-probe.md';
function withProbe(content, fn) {
  const abs = path.join(REPO_ROOT, PROBE);
  fs.writeFileSync(abs, content);
  try { fn(); } finally { fs.unlinkSync(abs); }
  check(`remove probe ${PROBE}`, !fs.existsSync(abs), 'probe file left behind');
}

console.log('guard regression tests');

// ---------------------------------------------------------------------------------------
console.log('\ncheck-expert-package.js');

// Baseline: the guards must be green on the committed tree. If this fails, every negative
// case below is meaningless -- a guard that always fails would "catch" everything.
{
  const r = run('node', [GUARD_PKG]);
  check('baseline passes', r.code === 0, `exit ${r.code}`);
}

// Historical defect: an agent file on disk that is registered nowhere. This is the exact
// gap that shipped in plugin.json 1.1.0 (ui/ux designers present but never dispatchable).
withInjection(PLUGIN, (t) => {
  const j = JSON.parse(t);
  j.agents = j.agents.filter((a) => !a.includes('ux-designer'));
  return JSON.stringify(j, null, 2);
}, () => {
  const r = run('node', [GUARD_PKG]);
  check('unregistered agent file is caught', r.code === 1, `exit ${r.code}`);
  check('  ...and names the orphan', r.out.includes('NOT registered'), 'orphan not named');
});

// Historical defect: Team type without settings.json -- the official validator errors on it.
withInjection(SETTINGS, () => '', () => {
  const abs = path.join(REPO_ROOT, SETTINGS);
  const original = fs.readFileSync(abs, 'utf8');
  fs.unlinkSync(abs);
  try {
    const r = run('node', [GUARD_PKG]);
    check('missing settings.json is caught', r.code === 1, `exit ${r.code}`);
  } finally {
    fs.writeFileSync(abs, original);
  }
  check('restore settings.json', fs.readFileSync(abs, 'utf8') === original);
});

// The lead must not appear in memberAgents.
withInjection(PLUGIN, (t) => {
  const j = JSON.parse(t);
  j.teamInfo.memberAgents.push(j.teamInfo.leadAgent);
  return JSON.stringify(j, null, 2);
}, () => {
  const r = run('node', [GUARD_PKG]);
  check('lead inside memberAgents is caught', r.code === 1, `exit ${r.code}`);
});

// Whole-package disappearance: the failure mode that looks most like success.
{
  const abs = path.join(REPO_ROOT, PLUGIN);
  const original = fs.readFileSync(abs, 'utf8');
  fs.unlinkSync(abs);
  try {
    const r = run('node', [GUARD_PKG]);
    check('whole-package disappearance is an error', r.code === 1, `exit ${r.code}`);
  } finally {
    fs.writeFileSync(abs, original);
  }
  check('restore plugin.json', fs.readFileSync(abs, 'utf8') === original);
}

// ---------------------------------------------------------------------------------------
console.log('\ncheck-escalation-consistency.js');

{
  const r = run('node', [GUARD_ESC]);
  check('baseline passes', r.code === 0, `exit ${r.code}`);
}

// Real defect from review round 1: the zh-CN mirror simply lacked the clause.
withInjection(SKILL, (t) => t.replace('Cross-module judgment is by module root', 'Judgment is by module root'), () => {
  const r = run('node', [GUARD_ESC]);
  check('missing anchor is caught', r.code === 1, `exit ${r.code}`);
});

// Real defect from review round 2 (R5'): the carve-out flattened, dropping the same-root
// qualifier. This is the semantic case -- a guard keyed on "anchor present" would pass.
withInjection(SKILL, (t) => t.replace(
  'if all N locations fall within the same module root -> not cross-module; if the N locations span different module roots -> cross-module, and in that case both',
  'one unit synchronized across N locations does not count as cross-module, and',
), () => {
  const r = run('node', [GUARD_ESC]);
  check('flattened carve-out with anchor kept is caught', r.code === 1, `exit ${r.code}`);
  check('  ...and reported as not narrowed', r.out.includes('NOT narrowed'), 'not reported as narrowed');
});

// Real defect from review round 3 (F1): a rival single-source claim.
withInjection(TEAM_LEAD, (t) => t.replace('authoritative definition in `modules/core/task/escalation.md`', 'sole authoritative statement: defined here'), () => {
  const r = run('node', [GUARD_ESC]);
  check('rival single-source claim is caught', r.code === 1, `exit ${r.code}`);
});

// Real defect from review round 4: a carrier that holds the full restatement was absent
// from a hardcoded site list, so flattening it went green. Discovery must catch it.
withInjection('expert-packages/workbuddy/hello-dev/README.md', (t) => t.replace(
  '**Cross-module judgment is by module root**: if all N locations fall within the same module root -> not cross-module; if N locations span different module roots -> cross-module per the >= 2 distinct module roots rule; in that case both "N-location sync" and "cross-module" hold simultaneously without overriding each other.',
  'One logical change unit synchronized across N locations counts as one unit, not cross-module, does not accumulate lines.',
), () => {
  const r = run('node', [GUARD_ESC]);
  check('flattening a discovered carrier is caught', r.code === 1, `exit ${r.code}`);
});

// A rival claim reworded into a natural Chinese phrasing. A guard whose marker list is
// narrower than the language it polices reports green on the same defect written differently
// -- a reviewer demonstrated this with "sole authoritative statement".
withInjection('expert-packages/workbuddy/hello-dev/README.md', (t) => t.replace(
  '**This is the authoritative statement (and',
  '**This file is the sole authoritative statement of escalation criteria (and',
), () => {
  const r = run('node', [GUARD_ESC]);
  check('reworded rival claim (sole authoritative statement) is caught', r.code === 1, `exit ${r.code}`);
});

// Explanatory uses of the same substrings must NOT be flagged.
withInjection('expert-packages/workbuddy/hello-dev/README.md', (t) => t.replace(
  '**This is the authoritative statement (and',
  '**Semantic uniqueness note: This is the authoritative statement (and',
), () => {
  const r = run('node', [GUARD_ESC]);
  check('explanatory semantic uniqueness is not flagged', r.code === 0, `exit ${r.code}`);
});

// Review round 5: never before tested, so untested -- a ghost exemption marker.
withInjection(GUARD_ESC, (t) => t.replace(
  "  'This table is the decomposition criterion, not the escalation criterion',",
  "  'This table is the decomposition criterion, not the escalation criterion',\n  'a marker that matches nothing at all',",
), () => {
  const r = run('node', [GUARD_ESC]);
  check('ghost exemption marker is rejected', r.code === 1, `exit ${r.code}`);
});

// Review round 5/6: a brand-new carrier must be discovered without editing the guard.
withProbe('One logical change unit synchronized across N locations counts as one unit, not cross-module, does not accumulate lines.\n', () => {
  const r = run('node', [GUARD_ESC]);
  check('a newly added carrier is discovered', r.code === 1, `exit ${r.code}`);
});

// Bypass found by the lead in the final round: the decomposition-only declaration used to
// launder a flat conclusion into a pass.
withProbe('One logical change unit synchronized across N locations counts as one unit, not cross-module, does not accumulate lines.\nThis table is the decomposition criterion, not the escalation criterion\n', () => {
  const r = run('node', [GUARD_ESC]);
  check('decomposition-only declaration does not launder a flat conclusion', r.code === 1, `exit ${r.code}`);
  check('  ...and says so', r.out.includes('does NOT launder'), 'laundering not reported');
});

// Self-poisoning: checkpoint reasons quote the banned phrase while reporting a defect, and
// test fixtures quote it to inject it, so the guard must not read runtime state or its own
// fixtures as documentation.
{
  const r = run('node', [GUARD_ESC]);
  check('.hello-dev/state.json is not treated as documentation', !r.out.includes('.hello-dev/state.json'), 'state.json was scanned');
  check('test fixtures are not treated as documentation', !r.out.includes('test-guards.js'), 'the test file was scanned as a carrier');
}

// The two exclusions above are load-bearing, so they must be asserted. A reviewer deleted the
// `.hello-dev` entry and this suite stayed green while the guard went red -- the fix was real
// but untested, so a future edit could revert it silently. Assert the exclusion list itself
// AND prove that removing an entry actually changes guard behaviour.
{
  const guardSrc = read('scripts/check-escalation-consistency.js');
  check('guard excludes .hello-dev', guardSrc.includes("'.hello-dev'"), '.hello-dev exclusion missing from EXCLUDED_DIRS');
  check('guard excludes test fixtures', /\/\^test-\.\*\\\.js\$\//.test(guardSrc), 'test-fixture exclusion missing');
  // Checked for the same reason as .hello-dev: every EXCLUDED_DIRS entry is load-bearing
  // policy. outputs/ ships (it is not gitignored), so its exclusion must be a stated
  // decision rather than a silent gap. A reviewer noted this entry lacked an explicit
  // assertion -- only `baseline` happened to catch its removal, without naming it.
  check('guard excludes outputs (documented decision, not a silent gap)', guardSrc.includes('outputs:'), 'outputs exclusion missing from EXCLUDED_DIRS');
  check('guard excludes .workbuddy workspace data', guardSrc.includes("'.workbuddy'"), '.workbuddy exclusion missing from EXCLUDED_DIRS');
  // The change log quotes the defect vocabulary in order to describe it, so scanning it makes
  // the guard fail on its own write-up -- observed a third time when this very change was logged.
  check('guard excludes the append-only change log', guardSrc.includes("'docs/progress_coding'"), 'change-log exclusion missing from EXCLUDED_PATHS');

  // Behavioural: the change log is a record, so a banned phrase written there must not be scanned.
  {
    const logPath = 'docs/progress_coding/backend-dev-log.md';
    const original = read(logPath);
    try {
      write(logPath, `${original}\n\nprobe: this document is the single authoritative source\n`);
      const r = run('node', [GUARD_ESC]);
      check('a banned phrase in the change log does not redden the guard', r.code === 0, `exit ${r.code}`);
    } finally {
      write(logPath, original);
    }
    check(`restore ${logPath}`, read(logPath) === original, 'log content differs after restore');
  }

  // Behavioural proof: with the .hello-dev entry removed the guard must fail, because
  // state.json genuinely still contains a banned phrase in a checkpoint reason. The
  // assertion below is the behavioural evidence; no self-referential "this suite would
  // catch it" claim is made, because such a claim is not evidence.
  withInjection('scripts/check-escalation-consistency.js', (t) =>
    t.replace(/^\s*'\.hello-dev':.*$\n/m, ''), () => {
    const r = run('node', [GUARD_ESC]);
    check('removing the .hello-dev exclusion reintroduces self-poisoning', r.code === 1, `exit ${r.code}`);
    check('  ...and reports state.json as the rival', r.out.includes('.hello-dev/state.json'), 'state.json not named');
  });
}

// ---------------------------------------------------------------------------------------
// Why these next three groups exist: the guards above were hardened across several rounds,
// but the three constraints added in this change had NO assertion protecting them. A review
// found the gap the hard way -- the only watchdog for the third one (mirror drift) emits a
// WARN, never an error, so it can be side-stepped silently: the source tree was edited, the
// host copy was never re-synced (P 694 lines vs M 666), and this suite stayed 44/44 green
// because not one assertion looked. These groups make all three constraints mechanically
// regressible. Every condition below is bound to real file reads or command output.
const AGENTS_SRC = 'expert-packages/workbuddy/hello-dev';

console.log('\nteam-lead wait clause (the four elements of the waiting obligation)');

// The waiting obligation is the executable semantics of "the lead must actually wait for its
// members". It is a procedural clause with four load-bearing elements; dropping any one
// degrades it silently -- e.g. removing the "not an error" enumeration turns every slow
// member into an excuse to abandon it, and removing the stall-inspection step turns "still
// running" into a presumed failure. Nothing used to read this section, so a future doc edit
// could delete it and the suite would stay green.
function waitClauseElements(content) {
  // NOTE: `'counts as error'.includes('is error')` is true, so a bare `includes('is error')` would stay
  // green even after the whole "counts as an error" enumeration is deleted -- the substring
  // survives inside its own negation. Bind the positive element to the (a)-(d) judgement
  // markers, which live ONLY inside that enumeration, so deleting it is actually detected.
  const errorsEnum = ['(a)', '(b)', '(c)', '(d)'].every((m) => content.includes(m));
  // NOTE: same trap as `is error` above, and it actually fired here. `content.includes('probe')`
  // is fed by the member-call-table sentence at the end of the clause ("probe confirms stopped then retry")
  // as well as by the stall section, so deleting the entire three-step stall handling section left this
  // element green -- the assertion that was supposed to be the stall clause's ONLY watchdog
  // passed on a document with no stall clause at all. Bind it to the section's own unique
  // anchor combination instead of one word: `three-step stall handling` is the section heading, and
  // Step 2 / Step 3 occur nowhere else in the file (Step 1 alone is not unique -- it is
  // also the heading of the stage-classification section). `TaskOutput` + `block: false` is
  // the step-1 mechanism and is likewise unique to this section.
  const stallSteps = content.includes('three-step stall handling')
    && ['Step 1', 'Step 2', 'Step 3'].every((m) => content.includes(m))
    && content.includes('TaskOutput') && content.includes('block: false');
  return {
    'positive obligation (must wait)': content.includes('must wait'),
    'is-error enumeration (with (a)-(d) criteria and explicit failure)': content.includes('is error') && errorsEnum && content.includes('explicit failure'),
    'counts-as-error enumeration (must continue waiting)': content.includes('counts as error') && content.includes('continue waiting'),
    'stall three steps (probe whether still running)': stallSteps,
    'member call table (four fields: dispatch target/dispatch time/wait or not/end method)':
      content.includes('member call table')
      && ['dispatch target', 'dispatch time', 'wait or not', 'end method'].every((f) => content.includes(f)),
  };
}
{
  const els = waitClauseElements(read(TEAM_LEAD));
  for (const [name, present] of Object.entries(els)) {
    check(`wait clause: ${name}`, present, 'element missing from the waiting obligation');
  }
}
// Inject-red: delete the positive obligation and prove the very same predicate flips. The
// assertion above reads this file, so a change to the file is exactly what reddens it.
withInjection(TEAM_LEAD, (t) => t.replace(/must wait/g, 'should wait instead'), () => {
  const els = waitClauseElements(read(TEAM_LEAD));
  check('  injected red: removing must wait flips "wait clause: positive obligation"',
    els['positive obligation (must wait)'] === false, 'predicate did not flip after injection');
});

// Inject-red: delete the entire stall clause and prove the stall three steps predicate flips. This is
// the element that previously had NO real detector: the bare `includes('probe')` it used was
// satisfied by the member-call-table sentence at the end of the section, so the section could
// be deleted wholesale and the assertion -- the clause's only watchdog -- still passed. The
// second check below documents that failure mode, but it deliberately asserts on the literal
// member-call-table wording the trap relied on rather than re-reading TEAM_LEAD: reading the
// document here made the check red on any legitimate future edit to that wording, i.e. it
// false-positived on prose the guard does not own (review round 3). The regression the check
// exists for is proven by the assertion on line 1 below, which flips on the injected text.
withInjection(TEAM_LEAD, (t) => t.replace(/\*\*three-step stall handling\*\*[\s\S]*?\n\n/, ''), () => {
  const els = waitClauseElements(read(TEAM_LEAD));
  check('  injected red: deleting the three-step stall handling section flips "wait clause: stall three steps"',
    els['stall three steps (probe whether still running)'] === false, 'predicate did not flip after injection');
  check('  ...and documents why the old bare `probe` predicate was fooled (substring trap)',
    'probe confirms stopped then retry'.includes('probe'), 'the substring trap this check documents no longer holds');
});

// ---------------------------------------------------------------------------------------
console.log('\nProhibited behaviors coverage across every registered agent');

// Requirement: each member does only its own part. The mechanic checkable landing point is
// that every agent file declares a `## Prohibited behaviors` section. Review found the lead was the sole
// file missing it (14/15) and NOTHING would have reported that -- the count was inspected by
// eye. The expected count is read from plugin.json rather than hardcoded, so a newly
// registered member automatically raises the bar instead of leaving a stale magic number.
{
  const pj = JSON.parse(read(PLUGIN));
  const registered = pj.agents || [];
  const onDisk = fs.readdirSync(path.join(REPO_ROOT, AGENTS_SRC, 'agents'))
    .filter((f) => f.endsWith('.md'));
  const missing = onDisk.filter((f) => !/^## Prohibited behaviors/m.test(read(`${AGENTS_SRC}/agents/${f}`)));
  check(`Prohibited behaviors present in every agent file (${onDisk.length} files)`,
    missing.length === 0, `missing: ${missing.join(', ') || '-'}`);
  // The orphan direction: an agent file on disk that plugin.json never names would never be
  // dispatched, so it must not be able to sit outside this coverage count.
  check('every agent file is registered in plugin.json (coverage cannot be bypassed by an orphan)',
    onDisk.length === registered.length, `on disk ${onDisk.length} vs registered ${registered.length}`);
}
// Inject-red: rename one agent's Prohibited behaviors heading and prove the coverage predicate flips.
// The predicate below is the same one the assertion above applies, so this proves the
// assertion's own detector -- not merely that some string is absent.
const missingProhibited = () => fs.readdirSync(path.join(REPO_ROOT, AGENTS_SRC, 'agents'))
  .filter((f) => f.endsWith('.md'))
  .filter((f) => !/^## Prohibited behaviors/m.test(read(`${AGENTS_SRC}/agents/${f}`)));
withInjection(`${AGENTS_SRC}/agents/hello-dev-implementer.md`,
  (t) => t.replace(/^## Prohibited behaviors$/m, '## Allowed behaviors'), () => {
    check('  injected red: renaming a Prohibited behaviors heading flips the coverage assertion',
      missingProhibited().includes('hello-dev-implementer.md'), 'heading survived injection');
  });

// ---------------------------------------------------------------------------------------
console.log('\nhost marketplace mirror integrity (conditional -- host state)');

// This is the defect class that actually slipped through this change: the source tree was
// edited but the host copy was never synced, and this suite stayed green. The guard
// check-expert-package.js only WARNS on drift -- by design, because the host owns that
// directory and a source-side failure must not be reported for host state the repository
// does not control. That design is intentional and is NOT overridden here. The test layer is
// where a drift becomes a hard failure. It is CONDITIONAL: a machine without the mirror
// (CI, another host) SKIPs instead of reporting a false red -- otherwise a real guard would
// be turned into noise and then be ignored.
const MIRROR = path.join(os.homedir(), '.workbuddy', 'plugins', 'marketplaces',
  'my-experts', 'plugins', 'hello-dev');

/** Every file under `dir`, relative to it. */
function listFiles(dir) {
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

{
  if (!fs.existsSync(MIRROR)) {
    console.log('  [SKIP] mirror not present -- host state, not checked');
  } else {
    const srcDir = path.join(REPO_ROOT, AGENTS_SRC);
    const srcRels = listFiles(srcDir);
    const mirrorRels = listFiles(MIRROR);
    const missing = srcRels.filter((r) => !fs.existsSync(path.join(MIRROR, r)));
    // .png assets are binary: presence is the assertion, not byte equality.
    const differing = srcRels.filter((r) => {
      if (r.endsWith('.png') || missing.includes(r)) return false;
      return fs.readFileSync(path.join(MIRROR, r), 'utf8')
        !== fs.readFileSync(path.join(srcDir, r), 'utf8');
    });
    const extra = mirrorRels.filter((r) => !srcRels.includes(r));
    check('mirror: no source file is missing from the host copy',
      missing.length === 0, `missing: ${missing.join(', ') || '-'}`);
    check('mirror: every shared text file is identical to source',
      differing.length === 0, `drifted: ${differing.join(', ') || '-'}`);
    check('mirror: no extra file the source does not own',
      extra.length === 0, `extra: ${extra.join(', ') || '-'}`);
  }
}

// ---------------------------------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('GUARD REGRESSION FAILED');
  process.exit(1);
}
console.log('guard regression: all cases hold');
