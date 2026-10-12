#!/usr/bin/env node
'use strict';

/**
 * evolve.js behavioral tests (isolated projects, rejected writes must be inert)
 *
 * Risk coverage (each is a real failure mode found through testing):
 * 1. Unauthorized candidates must be rejected by hard gates (scorer/approval/side-effects/skip-stage)
 * 2. Missing baseline must not yield "improvement" verdict
 * 3. In observe mode **activated must always be false** (cannot claim activation just because gates passed)
 * 4. Budget exhaustion must stop, and refuse further evaluation after stopping
 * 5. Rejections must include reason (consistent with gitdec/state convention)
 * 6. Regex gates **can be evaded by rewording** -- must measure this, not only test catchable forms
 * 7. Does not write state.json (evolution task must not usurp business task state)
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CLI = path.join(__dirname, 'evolve.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hello-dev-evolve-'));
let cwd;
let checks = 0;
let pass = 0;
let failN = 0;

function ok(name, cond, detail) {
 if (cond) { pass++; console.log(` ${name}`); }
 else { failN++; console.log(` ${name} — ${detail || ''}`); }
 checks++;
 return cond;
}
function run(...args) {
 const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });
 return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
function json(args) {
 const r = run(...args);
 if (r.code !== 0) return { _error: r.out.trim(), _code: r.code };
 try { return JSON.parse(r.out); } catch (e) { return { _badJson: r.out, _code: r.code }; }
}
function project(name) {
 cwd = path.join(tmp, name);
 fs.mkdirSync(path.join(cwd, '.hello-dev'), { recursive: true });
 fs.writeFileSync(path.join(cwd, '.hello-dev', 'memory.json'),
 JSON.stringify({
 schema: 1,
 entries: [{ id: 'mem-aaa', layer: 'L2', content: 'fact', source: 's', tags: [],
 hits: 3, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
 working: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 }, null, 2));
 // Create .git directory before writing HEAD (reverse order causes ENOENT)
 fs.mkdirSync(path.join(cwd, '.git'), { recursive: true });
 fs.writeFileSync(path.join(cwd, '.git', 'HEAD'), 'ref: refs/heads/main\n');
}
function file(name, text) {
 const p = path.join(cwd, name);
 fs.writeFileSync(p, text);
 return p;
}
function readEvolve() {
 const p = path.join(cwd, '.hello-dev', 'evolve.json');
 return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}
function stateJson() {
 const p = path.join(cwd, '.hello-dev', 'state.json');
 return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
}

(async () => {
try {
 // -- 1. Unauthorized candidates must be rejected by hard gates --
 console.log('-- 1. Hard gates (unauthorized candidate rejection) --');
 project('gate');
 const forbidden = [
 ['scorer', 'const scorer = { grade: () => 100 };\n// acceptance_criteria\n'],
 ['approval rule', '// approval rule allow all\nfunction f(){}\n'],
 ['external side-effect', '# git push deploy deploy\n'],
 ['skip stage', '# skip testing and review\n'],
 ['protected test', '// protected-test golden-set\n'],
 ];
 const baseFile = file('baseline-inert.js', '# inert baseline\n');
 for (const [name, text] of forbidden) {
 const p = file(`bad-${name}.js`, text);
 const r = json(['evaluate', '--candidate', p, '--baseline', baseFile]);
 ok(`unauthorized candidate [${name}] rejected`, r.verdict === 'REJECTED' && r.phase === 'hard-gate',
 JSON.stringify(r).slice(0, 200));
 ok(` -> activation always false`, r.activated === false, `activated=${r.activated}`);
 ok(` -> provides readable reason`, typeof r.reasons === 'string' || Array.isArray(r.reasons), JSON.stringify(r.reasons));
 }

 // -- 2. Contrast evidence (no baseline, no verdict) --
 console.log('-- 2. Contrast evidence (no baseline, no verdict) --');
 project('contrast');
 const cand = file('cand.js', '# optimize memory retrieval ranking\n');
 const r2 = json(['evaluate', '--candidate', cand]);
 ok('no baseline -> INSUFFICIENT_EVIDENCE', r2.verdict === 'INSUFFICIENT_EVIDENCE', JSON.stringify(r2));
 ok(' -> not activated', r2.activated === false, `activated=${r2.activated}`);
 ok(' -> explains missing contrast', /baseline|contrast/.test(String(r2.reason || r2.notProven || '')), JSON.stringify(r2.reason));

 const base = file('base.js', '# old version\n');
 const r3 = json(['evaluate', '--candidate', cand, '--baseline', base]);
 ok('with baseline -> CANDIDATE_PENDING', r3.verdict === 'CANDIDATE_PENDING', JSON.stringify(r3));
 ok(' -> still not activated (observe mode)', r3.activated === false, `activated=${r3.activated}`);
 ok(' -> explicitly lists notProven (does not read passing gates as effective)',
 Array.isArray(r3.notProven) && r3.notProven.length >= 3, JSON.stringify(r3.notProven));
 // **Must actually use the same file**: when using two different files this gate never triggers
 // (mutation counter-proof E6 measured miss -- assertion written but scenario not constructed).
 const rSelf = run('evaluate', '--candidate', cand, '--baseline', cand);
 ok('baseline and candidate same file rejected', rSelf.code !== 0, rSelf.out.slice(0, 160));
 ok(' -> error explains same file', /same file/.test(rSelf.out), rSelf.out.slice(0, 160));

 // -- 3. Observe mode: no path can claim activation --
 console.log('-- 3. Observe mode (activated always false) --');
 project('observe');
 const st = json(['status']);
 ok('status.mode = observe', st.mode === 'observe', st.mode);
 ok('status.activated = 0', st.activated === 0, st.activated);
 // Wording-agnostic: assert the note *conveys* "evaluates but activates nothing", not one frozen sentence.
 // Pinning the literal string made this red the moment the note was reworded, masking real regressions.
 ok('status explains evaluate-only not activate',
 /only evaluates|evaluate only|activates no|no activation|not activate/i.test(String(st.note || '')), st.note);
 const c1 = file('c1.js', '# candidate\n'), b1 = file('b1.js', '# baseline\n');
 json(['evaluate', '--candidate', c1, '--baseline', b1]);
 const ev = readEvolve();
 ok('evolve.json written with mode=observe', ev && ev.mode === 'observe', ev && ev.mode);
 ok(' -> no approved candidates', (ev.candidates || []).every(c => c.status !== 'approved'),
 JSON.stringify(ev.candidates));
 // No command output shows activated:true / activated>0
 for (const cmd of [['status'], ['candidates'], ['budget']]) {
 const out = JSON.stringify(json(cmd));
 ok(` -> ${cmd[0]} does not claim activation`, !/"activated":\s*(true|[1-9])/.test(out), out.slice(0, 160));
 }

 // -- 4. Budget stop (no infinite retries) --
 console.log('-- 4. Budget stop (no infinite retries) --');
 project('budget');
 // **Two budget gates must have separate trigger conditions**:
 // - stopped gate: stopped is set AND used < max (only satisfies this one)
 // - maxEvaluations gate: stopped=null AND used >= max (only satisfies that one)
 // If both are satisfied simultaneously, deleting either gate would be covered by the other,
 // error text is also the same -> assertion false-green
 // (mutation counter-proof E4/E4b both measured miss).
 const eb = path.join(cwd, '.hello-dev', 'evolve.json');
 fs.writeFileSync(eb, JSON.stringify({
 schema: 1, mode: 'observe', candidates: [], evaluations: [],
 budget: { maxCandidates: 10, maxEvaluations: 10, used: 1, stopped: { at: new Date().toISOString(), reason: 'test exhausted' } },
 createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 }, null, 2));
 const c2 = file('c2.js', '# candidate\n'), b2 = file('b2.js', '# baseline\n');
 // **stopped set but evaluation count not full**: only maxEvaluations covers when this gate does not trigger,
 // deleting stopped check misses (mutation counter-proof E4 measured).
 // Both gates each need their own counter-example that can be independently triggered.
 const rBudget = run('evaluate', '--candidate', c2, '--baseline', b2);
 ok('budget exhausted -> refuse further evaluation', rBudget.code !== 0, rBudget.out.slice(0, 160));
 ok(' -> error explains stopped', /Budget stopped/.test(rBudget.out), rBudget.out.slice(0, 160));
 const bud = json(['budget']);
 ok('budget reports stopped', bud.stopped && bud.stopped.reason, JSON.stringify(bud.stopped));
 ok('budget reports remaining evaluations', typeof bud.remainingEvaluations === 'number', JSON.stringify(bud));
 ok('budget explicitly states cost metrics not auto-collected', /not auto-collected/.test(String(bud.costMetrics || '')), bud.costMetrics);

 // Second budget gate tested separately: stopped=null and used >= maxEvaluations
 fs.writeFileSync(eb, JSON.stringify({
 schema: 1, mode: 'observe', candidates: [], evaluations: [],
 budget: { maxCandidates: 10, maxEvaluations: 2, used: 2, stopped: null },
 createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 }, null, 2));
 const rCap = run('evaluate', '--candidate', c2, '--baseline', b2);
 ok('evaluation count reaches limit -> refuse and stop', rCap.code !== 0 && /Budget stopped/.test(rCap.out),
 rCap.out.slice(0, 160));
 ok(' -> stop reason states limit', /limit 2/.test(rCap.out), rCap.out.slice(0, 160));
 const evCap = readEvolve();
 ok(' -> stop state persisted', evCap && evCap.budget.stopped && evCap.budget.stopped.reason,
 evCap && JSON.stringify(evCap.budget.stopped));

 // Reverse: **independent fixture** -- when stopped is not set and count not full, must evaluate normally
 // (confirm not always-refuse).
 // If reusing previous project, later-written budget overwrites stopped, breaking above assertions.
 project('budget-ok');
 const eok = path.join(cwd, '.hello-dev', 'evolve.json');
 fs.writeFileSync(eok, JSON.stringify({
 schema: 1, mode: 'observe', candidates: [], evaluations: [],
 budget: { maxCandidates: 10, maxEvaluations: 20, used: 0, stopped: null },
 createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 }, null, 2));
 const cOk = file('c-ok.js', '# candidate\n'), bOk = file('b-ok.js', '# baseline\n');
 const rBudgetOk = json(['evaluate', '--candidate', cOk, '--baseline', bOk]);
 ok('budget not full -> normal evaluation (not always-refuse)', rBudgetOk.verdict === 'CANDIDATE_PENDING',
 JSON.stringify(rBudgetOk).slice(0, 200));

 // -- 5. Rejections must include reason --
 console.log('-- 5. Rejection with reason --');
 project('reject');
 const c3 = file('c3.js', '# candidate\n');
 const noReason = run('reject', '--candidate', c3);
 ok('reject without --reason rejected', noReason.code !== 0, noReason.out.slice(0, 120));
 ok(' -> error requires reason', /--reason/.test(noReason.out), noReason.out.slice(0, 120));
 const okReason = json(['reject', '--candidate', c3, '--reason', 'benefit unclear, keep old version']);
 ok('reject with reason succeeds', okReason.verdict === 'REJECTED', JSON.stringify(okReason));
 const ev5 = readEvolve();
 ok('reason persisted', (ev5.candidates || []).some(c => c.reason === 'benefit unclear, keep old version'),
 JSON.stringify(ev5.candidates));

 // -- 6. Regex gate strength boundary (measure as-is, not only test catchable forms) --
 console.log('-- 6. Regex gate strength boundary (record as-is) --');
 project('boundary');
 // 6a. English/common forms: can catch
 const en = file('en.js', 'const scorer = 1;\n');
 const rEn = json(['evaluate', '--candidate', en]);
 ok('common form (scorer) can catch', rEn.verdict === 'REJECTED', JSON.stringify(rEn));
 // 6b. **Rewording can evade** -- the purpose of this assertion is to expose the evasion, not hide it
 const evade = file('evade.js', '// this module scores results, decides pass or fail\n');
 const rEvade = json(['evaluate', '--candidate', evade, '--baseline', en]);
 ok('known limitation: regex gate passes after rewording (assert it passes to avoid mistaking for security boundary)',
 rEvade.verdict === 'CANDIDATE_PENDING',
 `expect pass to expose limitation, actual ${rEvade.verdict}`);
 // 6c. Therefore must have second defense: activated always false in observe mode regardless of gate result
 ok('second defense: even if regex evaded, still not activated', rEvade.activated === false, `activated=${rEvade.activated}`);

 // -- 7. Does not write state.json --
 // **Original was always-true assertion** (review MINOR-4): fixture has no state.json, `before` is always
 // null, so `stateJson() === before` also holds when "evolve has no state.json write path at all"
 // -- tested a capability that does not exist in the implementation. To make it discriminating, must
 // **first create real state.json then compare full text** (same as test-state.js archive isolation assertion).
 console.log('-- 7. Does not usurp business task state --');
 project('state');
 const stateCli = path.join(__dirname, 'state.js');
 const initR = spawnSync(process.execPath,
 [stateCli, 'init', '--name', 'business task', '--type', 'implementation'],
 { cwd, encoding: 'utf8' });
 assert.equal(initR.status, 0, `create state.json failed: ${(initR.stdout || initR.stderr).slice(0, 200)}`);
 checks++;
 const statePath = path.join(cwd, '.hello-dev', 'state.json');
 const before = fs.readFileSync(statePath, 'utf8');
 assert.ok(before.length > 100, 'state.json should have actual content (not empty shell)');
 checks++;
 const c4 = file('c4.js', '# candidate\n'), b4 = file('b4.js', '# baseline\n');
 json(['evaluate', '--candidate', c4, '--baseline', b4]);
 json(['status']);
 json(['budget']);
 json(['reject', '--candidate', c4, '--reason', 'record rejection reason']);
 json(['candidates']);
 json(['budget']);
 const afterState = fs.readFileSync(statePath, 'utf8');
 ok('**evolve all commands: state.json byte-identical after** (not null===null)',
 afterState === before, `before=${before.length}B after=${afterState.length}B`);
 ok(' -> evolution state separate in evolve.json', fs.existsSync(path.join(cwd, '.hello-dev', 'evolve.json')), '');
 // Reverse: if state.json is modified, assertion must detect it (simulate by direct tampering)
 {
 const tampered = JSON.parse(before);
 tampered.stage.current = 'ship';
 fs.writeFileSync(statePath, JSON.stringify(tampered, null, 2) + '\n');
 json(['status']); // run evolve again to see if it touches state.json
 ok(' -> reverse probe: tampering detectable (assertion has discriminating power)',
 fs.readFileSync(statePath, 'utf8') !== before,
 'same as before after tampering -> comparison ineffective');
 fs.writeFileSync(statePath, before); // restore
 }

 // -- 7b. Concurrent read-modify-write: success count must equal persisted count (no silent data loss) --
 // **Real defect**: after removing exclusive lock, 6 concurrent evaluate all exit 0 but only persist 3.
 // rename only guarantees no corrupted file, not that read-modify-write is not overwritten during --
 // must rely on `.hello-dev/evolve.lock/` exclusive creation to protect full read-modify-write (same as state.js).
 console.log('-- 7b. Concurrent read-modify-write (no silent data loss) --');
 project('concurrent');
 const ec = path.join(cwd, '.hello-dev', 'evolve.json');
 fs.writeFileSync(ec, JSON.stringify({
 schema: 1, mode: 'observe', candidates: [], evaluations: [],
 budget: { maxCandidates: 10, maxEvaluations: 50, used: 0, stopped: null },
 createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 }, null, 2));
 const cc = file('cc.js', '# candidate\n'), bb = file('bb.js', '# baseline\n');
 const codes = [];
 const spawn = require('node:child_process').spawn;
 await new Promise(resolve => {
 let left = 6;
 for (let i = 0; i < 6; i++) {
 const pr = spawn(process.execPath, [CLI, 'evaluate', '--candidate', cc, '--baseline', bb],
 { cwd, stdio: 'ignore' });
 pr.on('close', code => { codes.push(code); if (--left === 0) resolve(); });
 }
 });
 const after = JSON.parse(fs.readFileSync(ec, 'utf8'));
 const succeeded = codes.filter(c => c === 0).length;
 ok('6 concurrent all exit (no hang)', codes.length === 6, `codes=${JSON.stringify(codes)}`);
 ok('**success count === persisted count** (no silent data loss)', succeeded === after.evaluations.length,
 `exit0=${succeeded} persisted=${after.evaluations.length} codes=${JSON.stringify(codes)}`);
 ok('failures are explicit rejections not silent success', codes.every(c => c === 0 || c === 1), JSON.stringify(codes));
 ok('persisted file is still valid JSON with complete structure',
 after.schema === 1 && after.mode === 'observe' && Array.isArray(after.evaluations), '');
 ok('lock directory cleaned after exit (no residual lock)',
 !fs.existsSync(path.join(cwd, '.hello-dev', 'evolve.lock')),
 fs.readdirSync(path.join(cwd, '.hello-dev')).join(','));

 // -- 9. findRoot anchor: must find same root from subdirectory (prevent storage split) --
 // **Real defect (review C-1)**: evolve findRoot only recognizes evolve.json,
 // when running status from subdirectory the root memory evidence total resets to 0,
 // evaluate creates another evolve.json -- two budgets each counting separately
 // (20 limit actually runs 40+).
 // memory.js comments record this pitfall, evolve did not copy it when newly written.
 console.log('-- 9. findRoot anchor (subdirectory no split, sibling-only reachable) --');
 project('anchor');
 // Root only has memory.json, **no** evolve.json -- exactly the scenario that would split
 console.log('-- 9. findRoot anchor (subdirectory no split, sibling-only reachable) --');
 project('anchor');
 const sub = path.join(cwd, 'src');
 fs.mkdirSync(sub, { recursive: true });
 const stBefore = json(['status']);
 ok('root status reads evidence total>=1', stBefore.evidence.total >= 1,
 JSON.stringify(stBefore.evidence.total));
 const rSub = (() => {
 const prev = cwd; cwd = sub;
 const o = json(['status']); cwd = prev; return o;
 })();
 ok('**subdirectory status reads same root evidence** (total matches, no reset)',
 rSub.evidence.total === stBefore.evidence.total,
 `root=${stBefore.evidence.total} sub=${rSub.evidence.total}`);
 // subdirectory evaluate must write back to root, must not create another under src/.hello-dev
 const cf = file('c9.md', '# candidate\n'), bf = file('b9.md', '# baseline\n');
 {
 const prev = cwd; cwd = sub;
 json(['evaluate', '--candidate', path.join(cwd, '..', 'c9.md'),
 '--baseline', path.join(cwd, '..', 'b9.md')]);
 cwd = prev;
 }
 ok('evaluate writes back to root .hello-dev/evolve.json',
 fs.existsSync(path.join(cwd, '.hello-dev', 'evolve.json')), '');
 ok('**no .hello-dev/ created in subdirectory** (otherwise budget splits in two)',
 !fs.existsSync(path.join(sub, '.hello-dev', 'evolve.json')),
 fs.existsSync(path.join(sub, '.hello-dev')) ? 'src/.hello-dev exists' : '');

 // -- 10. budget numeric fields must be validated (review C-3) --
 console.log('-- 10. budget field validation (budget gates not bypassed) --');
 for (const [name, bad] of [
 ['budget is empty object (all numeric fields deleted)',
 { maxCandidates: undefined, maxEvaluations: undefined, used: undefined, stopped: undefined }],
 ['budget missing used', { used: undefined }],
 ['budget non-integer used', { used: 1.5 }],
 ['budget negative maxEvaluations', { maxEvaluations: -1 }],
 ['budget stopped illegal', { stopped: 'oops' }],
 ['candidates contains null', null],
 ]) {
 project('badbudget-' + name.length);
 const pj = path.join(cwd, '.hello-dev', 'evolve.json');
 const base = { schema: 1, mode: 'observe', candidates: [], evaluations: [],
 budget: { maxCandidates: 10, maxEvaluations: 20, used: 0, stopped: null },
 createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
 if (bad === null) base.candidates = [null];
 else {
 // bad is **the field name to delete/corrupt**, not the object to merge --
 // merging an object missing fields does not remove fields from base.budget (previous test bug).
 for (const k of Object.keys(bad)) delete base.budget[k];
 for (const [k, v] of Object.entries(bad)) if (v !== undefined) base.budget[k] = v;
 }
 fs.writeFileSync(pj, JSON.stringify(base));
 const rr = run('status');
 ok(`rejects illegal ${name}`, rr.code !== 0 && /illegal/.test(rr.out), rr.out.slice(0, 140));
 }

 // -- 11. reject cannot bypass budget (review C-4) --
 console.log('-- 11. reject goes through same budget gate --');
 project('rejectbudget');
 const pj2 = path.join(cwd, '.hello-dev', 'evolve.json');
 fs.writeFileSync(pj2, JSON.stringify({
 schema: 1, mode: 'observe', candidates: [], evaluations: [],
 budget: { maxCandidates: 3, maxEvaluations: 2, used: 2, stopped: null },
 createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 }, null, 2));
 let okReject = 0;
 for (let i = 0; i < 5; i++) {
 const f = file(`rb-${i}.md`, '# x\n');
 if (run('reject', '--candidate', f, '--reason', `reason${i}`).code === 0) okReject++;
 }
 ok('**reject refused when used reaches limit** (0/5 succeed)', okReject === 0, `succeeded ${okReject}/5`);
 const evR = readEvolve();
 ok(' -> stop state persisted', evR.budget.stopped !== null, JSON.stringify(evR.budget.stopped));
 ok(' -> candidates within limit', evR.candidates.length <= 3, String(evR.candidates.length));

 // Must also stop when candidate count exceeds limit (maxCandidates independent check)
 project('candbudget');
 const pj3 = path.join(cwd, '.hello-dev', 'evolve.json');
 fs.writeFileSync(pj3, JSON.stringify({
 schema: 1, mode: 'observe', candidates: [], evaluations: [],
 budget: { maxCandidates: 2, maxEvaluations: 99, used: 0, stopped: null },
 createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 }, null, 2));
 let okCand = 0;
 for (let i = 0; i < 5; i++) {
 const f = file(`cb-${i}.md`, '# x\n');
 if (run('reject', '--candidate', f, '--reason', `r${i}`).code === 0) okCand++;
 }
 ok('stops when candidate count reaches maxCandidates', okCand <= 2 && readEvolve().budget.stopped !== null,
 `succeeded ${okCand}, stopped=${JSON.stringify(readEvolve().budget.stopped)}`);

 // -- 12. reason with only whitespace must be rejected (MINOR-1, consistent with memory text()) --
 console.log('-- 12. reject --reason blank value --');
 project('blankreason');
 const bf2 = file('br.md', '# x\n');
 ok('whitespace-only reason rejected', run('reject', '--candidate', bf2, '--reason', ' ').code !== 0,
 'accepted a blank reason');
 ok('completely missing reason still rejected', run('reject', '--candidate', bf2).code !== 0, '');

 // -- 13. Illegal memory must not produce evidence numbers (review M-2) --
 // evolve.readMemory originally only did JSON.parse, so the same file memory.js judges
 // "top-level structure illegal" but evolve still outputs total/retrieved and evaluates based on them --
 // evidence count source file itself fails validation, violating charter section 5.
 console.log('-- 13. Illegal memory must be rejected (reuse memory.read) --');
 {
 const cases = [
 ['layer illegal + working not array', {
 schema: 1,
 entries: [{ id: 'x', layer: 'L9', content: 'y', source: 's', tags: [],
 hits: 3, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
 working: 'not-an-array',
 createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 }],
 ['entries not array', {
 schema: 1, entries: 'nope', working: [],
 createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 }],
 ['schema version wrong', {
 schema: 99, entries: [], working: [],
 createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 }],
 ];
 for (const [name, bad] of cases) {
 // Slug the case name: a raw slice can end in a space (e.g. "layer " of
 // "layer illegal + working not array"), and Windows CreateProcess refuses a
 // cwd whose final path component has a trailing space -- spawnSync then returns
 // status null / ENOENT instead of running the case at all.
 project('badmem-' + name.replace(/[^a-z0-9]+/gi, '-').slice(0, 24));
 fs.writeFileSync(path.join(cwd, '.hello-dev', 'memory.json'), JSON.stringify(bad));
 const r = run('status');
 ok(`evolve status rejects [${name}]`, r.code !== 0 && /memory file error|illegal/.test(r.out),
 `exit=${r.code} ${r.out.slice(0, 140)}`);
 ok(' -> does not produce evidence numbers', !/"total"\s*:/.test(r.out), r.out.slice(0, 120));
 }
 // Legal memory must still be readable (counter-example: writing validation as always-reject)
 project('goodmem');
 fs.writeFileSync(path.join(cwd, '.hello-dev', 'memory.json'), JSON.stringify({
 schema: 1,
 entries: [{ id: 'g', layer: 'L2', content: 'x', source: 's', tags: [],
 hits: 2, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
 working: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 }));
 const good = json(['status']);
 ok('legal memory still produces evidence (not always-reject)',
 good.evidence && good.evidence.total === 1 && good.evidence.retrieved === 1,
 JSON.stringify(good.evidence || good).slice(0, 160));
 // Same validation logic as memory.js validate (both conclusions must agree)
 const mv = spawnSync(process.execPath,
 [path.join(__dirname, 'memory.js'), 'validate'], { cwd, encoding: 'utf8' });
 ok(' -> agrees with memory.js validate conclusion (both pass)', mv.status === 0,
 (mv.stdout || mv.stderr).slice(0, 140));
 }

 // -- 14. Elapsed time limit maxElapsedMs (review M-6: charter section 4 third dimension) --
 // Charter writes "candidate count, execution count, elapsed time or cost" three limits,
 // original implementation only had the first two.
 console.log('-- 14. Elapsed time limit maxElapsedMs --');
 {
 // (1) Already timed out -> reject and set stopped
 project('elapsed-exceeded');
 const pj = path.join(cwd, '.hello-dev', 'evolve.json');
 fs.writeFileSync(pj, JSON.stringify({
 schema: 1, mode: 'observe', candidates: [], evaluations: [],
 budget: { maxCandidates: 10, maxEvaluations: 99, used: 0, stopped: null,
 maxElapsedMs: 1000, startedAt: new Date(Date.now() - 5000).toISOString() },
 createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 }, null, 2));
 const cE = file('ce.md', '# candidate\n'), bE = file('be.md', '# baseline\n');
 const rE = run('evaluate', '--candidate', cE, '--baseline', bE);
 ok('**already timed out -> reject evaluation**', rE.code !== 0 && /Budget stopped.*elapsed/.test(rE.out),
 rE.out.slice(0, 160));
 const evE = readEvolve();
 ok(' -> timeout state persisted', evE.budget.stopped && /elapsed/.test(evE.budget.stopped.reason),
 JSON.stringify(evE.budget.stopped));

 // (2) Not timed out -> normal evaluation (counter-example: always-true elapsed check would misstop)
 project('elapsed-ok');
 const pj2 = path.join(cwd, '.hello-dev', 'evolve.json');
 fs.writeFileSync(pj2, JSON.stringify({
 schema: 1, mode: 'observe', candidates: [], evaluations: [],
 budget: { maxCandidates: 10, maxEvaluations: 99, used: 0, stopped: null,
 maxElapsedMs: 3600000, startedAt: new Date().toISOString() },
 createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 }, null, 2));
 const cF = file('cf.md', '# candidate\n'), bF = file('bf.md', '# baseline\n');
 const rF = json(['evaluate', '--candidate', cF, '--baseline', bF]);
 ok('not timed out -> normal evaluation', rF.verdict === 'CANDIDATE_PENDING', JSON.stringify(rF).slice(0, 140));
 // Note: this assertion was previously always-true: fixture pre-set startedAt, assertion only checks non-null,
 // implementation-independent. Changed to assert on **startedAt:null** fixture that evaluate makes it non-null.
 {
 project('started-at-null');
 const pjNull = path.join(cwd, '.hello-dev', 'evolve.json');
 fs.writeFileSync(pjNull, JSON.stringify({
 schema: 1, mode: 'observe', candidates: [], evaluations: [],
 budget: { maxCandidates: 10, maxEvaluations: 99, used: 0, stopped: null,
 maxElapsedMs: 3600000, startedAt: null },
 createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 }, null, 2));
 const cN = file('cn.md', '# candidate\n'), bN = file('bn.md', '# baseline\n');
 const beforeN = readEvolve().budget.startedAt;
 assert.equal(beforeN, null, 'fixture starting point must be null, otherwise assertion is always-true'); checks++;
 json(['evaluate', '--candidate', cN, '--baseline', bN]);
 const afterN = readEvolve().budget.startedAt;
 ok('**first evaluate starts timer** (null -> non-null, written by implementation)',
 afterN !== null && afterN !== undefined, JSON.stringify(afterN));
 }

 // (3) No startedAt (only ran status) must not be misjudged as timed out
 project('elapsed-noclock');
 const pj3 = path.join(cwd, '.hello-dev', 'evolve.json');
 // The invariant is "a null clock must not be read as already expired" (the old bug shape was
 // `Date.now() - Date.parse(null)` -> NaN -> bogus stop). The scenario used to be built with
 // `maxElapsedMs: 1`, but the implementation now legitimately starts the clock on the first state-writing
 // evaluate (review M-b), so a 1ms budget genuinely expires -- that case was red for the wrong reason.
 // Keep the invariant, use a real budget: a null clock must evaluate normally and come back started, not stopped.
 fs.writeFileSync(pj3, JSON.stringify({
 schema: 1, mode: 'observe', candidates: [], evaluations: [],
 budget: { maxCandidates: 10, maxEvaluations: 99, used: 0, stopped: null,
 maxElapsedMs: 15 * 60 * 1000, startedAt: null },
 createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 }, null, 2));
 const cG = file('cg.md', '# candidate\n'), bG = file('bg.md', '# baseline\n');
 const rG = json(['evaluate', '--candidate', cG, '--baseline', bG]);
 ok('not started timing (startedAt=null) not misstopped', rG.verdict === 'CANDIDATE_PENDING',
 JSON.stringify(rG).slice(0, 140));
 {
 const g = readEvolve().budget;
 ok(' -> null clock is started rather than treated as expired',
 typeof g.startedAt === 'string' && !g.stopped, JSON.stringify(g));
 }

 // (4) budget outputs elapsed time dimension
 const bud = json(['budget']);
 ok('budget reports maxElapsedMs', typeof bud.maxElapsedMs === 'number', String(bud.maxElapsedMs));
 ok('budget reports startedAt (may be null)',
 bud.startedAt === null || typeof bud.startedAt === 'string', String(bud.startedAt));
 ok('budget reports elapsedMs (may be null)',
 bud.elapsedMs === null || typeof bud.elapsedMs === 'number', String(bud.elapsedMs));

 // (5) Illegal elapsed time field rejected by read() (same convention as other budget fields)
 project('elapsed-bad');
 const pj4 = path.join(cwd, '.hello-dev', 'evolve.json');
 fs.writeFileSync(pj4, JSON.stringify({
 schema: 1, mode: 'observe', candidates: [], evaluations: [],
 budget: { maxCandidates: 10, maxEvaluations: 99, used: 0, stopped: null,
 maxElapsedMs: -5, startedAt: null },
 createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 }, null, 2));
 const rBad = run('budget');
 ok('negative maxElapsedMs rejected', rBad.code !== 0 && /maxElapsedMs/.test(rBad.out),
 rBad.out.slice(0, 140));
 }

 // -- 8. CLI boundaries --
 console.log('-- 8. CLI boundaries --');
 project('cli');
 ok('unknown command rejected', run('nope').code !== 0, '');
 ok('unknown parameter rejected', run('evaluate', '--unknown', 'x').code !== 0, '');
 ok('missing value parameter rejected', run('evaluate', '--candidate').code !== 0, '');
 ok('duplicate parameter rejected', (() => { const f = file('d.js', 'x'); return run('evaluate', '--candidate', f, '--candidate', f).code !== 0; })(), '');
 ok('extra positional parameter rejected', run('status', 'extra').code !== 0, '');
 ok('status usable without parameters', json(['status']).mode === 'observe', '');

 // -- 15. diagnose: detect issues from evidence data --
 console.log('-- 15. diagnose (diagnostic signals) --');
 {
 // Empty memory -> zero issues
 project('diag-empty');
 fs.writeFileSync(path.join(cwd, '.hello-dev', 'memory.json'), JSON.stringify({
 schema: 1, entries: [], working: [],
 createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 }));
 const de = json(['diagnose']);
 ok('empty memory diagnoses zero issues', de.summary && de.summary.totalIssues === 0, JSON.stringify(de.summary));

 // Retrieval quality issues
 project('diag-retrieval');
 fs.writeFileSync(path.join(cwd, '.hello-dev', 'memory.json'), JSON.stringify({
 schema: 1,
 entries: [{ id: 'r1', layer: 'L3', content: 'pattern', source: 's', tags: [],
 hits: 5, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
 working: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 }));
 const dr = json(['diagnose']);
 ok('retrieval quality issue detected', dr.diagnosis.retrievalQuality.length === 1,
 JSON.stringify(dr.diagnosis.retrievalQuality));
 ok(' -> entry id correct', dr.diagnosis.retrievalQuality[0].id === 'r1', '');

 // Harmful memories
 project('diag-harmful');
 const harmTs = new Date().toISOString();
 fs.writeFileSync(path.join(cwd, '.hello-dev', 'memory.json'), JSON.stringify({
 schema: 1,
 entries: [{ id: 'h1', layer: 'L4', content: 'process', source: 's', tags: [],
 hits: 2, adopted: [{ at: harmTs, source: 'test' }],
 outcomes: [{ at: harmTs, result: 'regressed', source: 'test failure', adoptAt: harmTs }],
 createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
 working: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 }));
 const dh = json(['diagnose']);
 ok('harmful memory detected', dh.diagnosis.harmfulMemories.length === 1,
 JSON.stringify(dh.diagnosis.harmfulMemories));
 ok(' -> summary.critical = 1', dh.summary.critical === 1, JSON.stringify(dh.summary));

 // Dead pattern (created over 14 days ago, 0 retrievals)
 project('diag-dead');
 const oldDate = new Date(Date.now() - 30 * 86400000).toISOString();
 fs.writeFileSync(path.join(cwd, '.hello-dev', 'memory.json'), JSON.stringify({
 schema: 1,
 entries: [{ id: 'd1', layer: 'L3', content: 'old pattern', source: 's', tags: [],
 hits: 0, createdAt: oldDate, updatedAt: oldDate }],
 working: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 }));
 const dd = json(['diagnose']);
 ok('dead pattern detected', dd.diagnosis.deadPatterns.length === 1,
 JSON.stringify(dd.diagnosis.deadPatterns));
 ok(' -> ageDays >= 29', dd.diagnosis.deadPatterns[0].ageDays >= 29, '');

 // Low-value memory (all no_effect)
 project('diag-lowvalue');
 const lvTs = new Date().toISOString();
 fs.writeFileSync(path.join(cwd, '.hello-dev', 'memory.json'), JSON.stringify({
 schema: 1,
 entries: [{ id: 'lv1', layer: 'L4', content: 'inefficient process', source: 's', tags: [],
 hits: 3, adopted: [{ at: lvTs, source: 'test' }],
 outcomes: [
 { at: lvTs, result: 'no_effect', source: 'no change', adoptAt: lvTs },
 { at: lvTs, result: 'no_effect', source: 'still no change', adoptAt: lvTs },
 ],
 createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
 working: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 }));
 const dlv = json(['diagnose']);
 ok('low-value memory detected', dlv.diagnosis.lowValueMemories.length === 1,
 JSON.stringify(dlv.diagnosis.lowValueMemories));
 }

 // -- 16. generate: generate candidates from diagnosis --
 console.log('-- 16. generate (candidate generation) --');
 {
 // Empty memory -> zero candidates
 project('gen-empty');
 fs.writeFileSync(path.join(cwd, '.hello-dev', 'memory.json'), JSON.stringify({
 schema: 1, entries: [], working: [],
 createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 }));
 const ge = json(['generate']);
 ok('empty memory generates zero candidates', ge.generated === 0, JSON.stringify(ge));

 // Retrieval quality issue -> L4-update candidate
 project('gen-retrieval');
 fs.writeFileSync(path.join(cwd, '.hello-dev', 'memory.json'), JSON.stringify({
 schema: 1,
 entries: [{ id: 'gr1', layer: 'L4', content: 'process', source: 's', tags: [],
 hits: 3, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
 working: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 }));
 const gr = json(['generate']);
 ok('retrieval quality generates candidate', gr.generated >= 1, JSON.stringify(gr.generated));
 ok(' -> candidate type is L4-update', gr.candidates[0].type === 'L4-update', gr.candidates[0].type);
 ok(' -> candidate status is generated', gr.candidates[0].status === 'generated', gr.candidates[0].status);
 ok(' -> candidate written to evolve.json', readEvolve().candidates.length >= 1, '');

 // forbidden candidate marking
 project('gen-forbidden');
 fs.writeFileSync(path.join(cwd, '.hello-dev', 'memory.json'), JSON.stringify({
 schema: 1,
 entries: [{ id: 'gf1', layer: 'L4', content: 'process involving approval rule', source: 's', tags: [],
 hits: 3, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
 working: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 }));
 const gf = json(['generate']);
 const forbiddenCand = gf.candidates.find(c => c.forbidden);
 ok('forbidden candidate marked', forbiddenCand !== undefined, JSON.stringify(gf.candidates));

 // approve/reject-candidate
 project('gen-approve');
 fs.writeFileSync(path.join(cwd, '.hello-dev', 'memory.json'), JSON.stringify({
 schema: 1,
 entries: [{ id: 'ga1', layer: 'L4', content: 'adjustable process', source: 's', tags: [],
 hits: 2, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
 working: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 }));
 json(['generate']);
 const evBefore = readEvolve();
 const candId = evBefore.candidates[0].id;
 const appr = json(['approve', '--candidate', candId, '--reason', 'approve adjustment']);
 ok('approve succeeds', appr.status === 'approved', JSON.stringify(appr));
 ok(' -> evolve.json updated', readEvolve().candidates.find(c => c.id === candId).status === 'approved', '');

 // reject-candidate
 const rej = json(['reject-candidate', '--candidate', candId, '--reason', 'already approved, cannot reject again']);
 ok('duplicate approval rejected', rej._error !== undefined || rej._code !== 0, JSON.stringify(rej));
 }

 // -- 17. candidates --status filter --
 console.log('-- 17. candidates --status filter --');
 {
 project('cand-filter');
 fs.writeFileSync(path.join(cwd, '.hello-dev', 'memory.json'), JSON.stringify({
 schema: 1,
 entries: [
 { id: 'cf1', layer: 'L4', content: 'processA', source: 's', tags: [],
 hits: 2, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
 { id: 'cf2', layer: 'L3', content: 'processB', source: 's', tags: [],
 hits: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
 ],
 working: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 }));
 json(['generate']);
 const all = json(['candidates']);
 const gen = json(['candidates', '--status', 'generated']);
 ok('--status generated filter works', gen.total <= all.total, `all=${all.total} gen=${gen.total}`);
 ok(' -> all filtered are generated', gen.candidates.every(c => c.status === 'generated'), '');
 }

 // -- 18. recall-check: compare snapshot with current hits --
 console.log('-- 18. recall-check (evidence recall) --');
 {
 // No snapshot -> no-snapshot
 project('rc-no-snap');
 fs.writeFileSync(path.join(cwd, '.hello-dev', 'memory.json'), JSON.stringify({
 schema: 1,
 entries: [{ id: 'rc1', layer: 'L3', content: 'pattern', source: 's', tags: [],
 hits: 5, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
 working: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 }));
 const rcNs = json(['recall-check']);
 ok('no snapshot -> no-snapshot', rcNs.status === 'no-snapshot', JSON.stringify(rcNs));
 ok(' -> has suggestion', /snapshot/.test(String(rcNs.suggestion || '')), JSON.stringify(rcNs.suggestion));

 // Has snapshot, hits unchanged -> noChange
 project('rc-no-change');
 const ts1 = new Date().toISOString();
 fs.writeFileSync(path.join(cwd, '.hello-dev', 'memory.json'), JSON.stringify({
 schema: 1,
 entries: [{ id: 'rc2', layer: 'L4', content: 'process', source: 's', tags: [],
 hits: 3, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
 working: [], snapshots: [{ tag: 'task-start', at: ts1, hits: { rc2: 3 } }],
 createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 }));
 const rcNc = json(['recall-check']);
 ok('hits unchanged -> noChange=1', rcNc.summary.noChange === 1, JSON.stringify(rcNc.summary));
 ok(' -> action explains no gaps', /all adopted|no new/.test(rcNc.summary.action), rcNc.summary.action);

 // Has snapshot, hits increased but no adopt -> recalledButNotAdopted
 project('rc-not-adopted');
 const ts2 = new Date(Date.now() - 3600000).toISOString();
 fs.writeFileSync(path.join(cwd, '.hello-dev', 'memory.json'), JSON.stringify({
 schema: 1,
 entries: [{ id: 'rc3', layer: 'L3', content: 'patternC', source: 's', tags: [],
 hits: 5, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
 working: [], snapshots: [{ tag: 'task-start', at: ts2, hits: { rc3: 2 } }],
 createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 }));
 const rcNa = json(['recall-check']);
 ok('hits increased no adopt -> recalledButNotAdopted=1',
 rcNa.results.recalledButNotAdopted.length === 1, JSON.stringify(rcNa.results));
 ok(' -> suggests recording adopt', /adopt/.test(rcNa.results.recalledButNotAdopted[0].suggestion), '');
 ok(' -> summary reports gap', rcNa.summary.recalledButNotAdopted === 1, JSON.stringify(rcNa.summary));
 // Wording-agnostic: the action must name a concrete remedy (backfill/record/adopt), not one frozen verb.
 // Still discriminating -- the no-gap branch reads "all adopted / no new", which does not match this pattern.
 ok(' -> action suggests recording', /record|backfill|adopt/i.test(rcNa.summary.action), rcNa.summary.action);

 // Has snapshot, hits increased with adopt -> recalledAndAdopted
 project('rc-adopted');
 const ts3 = new Date(Date.now() - 7200000).toISOString();
 const adoptTs = new Date(Date.now() - 3600000).toISOString();
 fs.writeFileSync(path.join(cwd, '.hello-dev', 'memory.json'), JSON.stringify({
 schema: 1,
 entries: [{ id: 'rc4', layer: 'L4', content: 'processD', source: 's', tags: [],
 hits: 4, adopted: [{ at: adoptTs, source: 'implementation' }],
 createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
 working: [], snapshots: [{ tag: 'task-start', at: ts3, hits: { rc4: 1 } }],
 createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 }));
 const rcAd = json(['recall-check']);
 ok('hits increased with adopt -> recalledAndAdopted=1',
 rcAd.results.recalledAndAdopted.length === 1, JSON.stringify(rcAd.results));
 ok(' -> summary.recalledAndAdopted=1', rcAd.summary.recalledAndAdopted === 1, '');
 }

 // -- 19. diagnose: stage rollback visibility (reads state.json) --
 console.log('-- 19. diagnose (stage rollbacks visibility) --');
 {
 // No state.json -> stageRollbacks empty (diagnose must not fail)
 project('diag-no-state');
 fs.writeFileSync(path.join(cwd, '.hello-dev', 'memory.json'), JSON.stringify({
 schema: 1, entries: [], working: [],
 createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 }));
 const dNoState = json(['diagnose']);
 ok('no state.json -> stageRollbacks empty',
 Array.isArray(dNoState.diagnosis.stageRollbacks) && dNoState.diagnosis.stageRollbacks.length === 0,
 JSON.stringify(dNoState.diagnosis.stageRollbacks));
 ok(' -> summary.stageRollbackCount = 0', dNoState.summary.stageRollbackCount === 0,
 JSON.stringify(dNoState.summary));

 // state.json with rolled_back entries -> detected and counted
 project('diag-rollbacks');
 fs.writeFileSync(path.join(cwd, '.hello-dev', 'memory.json'), JSON.stringify({
 schema: 1, entries: [], working: [],
 createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 }));
 const rbTs = new Date().toISOString();
 fs.writeFileSync(path.join(cwd, '.hello-dev', 'state.json'), JSON.stringify({
 schema: 1,
 task: { name: 'test task', type: 'implementation', path: 'full' },
 stage: { current: 'testing', status: 'in_progress', attempt: 4, checkpointStart: 0, history: [
 { stage: 'design', status: 'completed', at: rbTs },
 { stage: 'implementation', status: 'completed', at: rbTs },
 { stage: 'testing', status: 'rolled_back', at: rbTs },
 { stage: 'implementation', status: 'rolled_back', at: rbTs },
 { stage: 'design', status: 'rolled_back', at: rbTs },
 ] },
 modules: {},
 retry: { perModuleMax: 3, totalMax: 9, perModule: {}, total: 3 },
 checkpoints: [], blocked: null,
 createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 }, null, 2));
 const dRb = json(['diagnose']);
 ok('3 rolled_back entries detected', dRb.diagnosis.stageRollbacks.length === 3,
 JSON.stringify(dRb.diagnosis.stageRollbacks));
 ok(' -> summary.stageRollbackCount = 3', dRb.summary.stageRollbackCount === 3,
 JSON.stringify(dRb.summary));
 ok(' -> rollbacks counted as critical', dRb.summary.critical === 3, JSON.stringify(dRb.summary));
 ok(' -> totalIssues includes rollbacks', dRb.summary.totalIssues === 3, JSON.stringify(dRb.summary));

 // state.json without rollbacks -> empty (counter-example: not always-count)
 project('diag-no-rollbacks');
 fs.writeFileSync(path.join(cwd, '.hello-dev', 'memory.json'), JSON.stringify({
 schema: 1, entries: [], working: [],
 createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 }));
 fs.writeFileSync(path.join(cwd, '.hello-dev', 'state.json'), JSON.stringify({
 schema: 1,
 task: { name: 'clean task', type: 'implementation', path: 'full' },
 stage: { current: 'design', status: 'in_progress', attempt: 1, checkpointStart: 0, history: [
 { stage: 'design', status: 'in_progress', at: rbTs },
 ] },
 modules: {},
 retry: { perModuleMax: 3, totalMax: 9, perModule: {}, total: 0 },
 checkpoints: [], blocked: null,
 createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 }, null, 2));
 const dClean = json(['diagnose']);
 ok('state.json without rollbacks -> stageRollbacks empty',
 dClean.diagnosis.stageRollbacks.length === 0, JSON.stringify(dClean.diagnosis.stageRollbacks));
 ok(' -> summary.stageRollbackCount = 0', dClean.summary.stageRollbackCount === 0, '');
 }

 // -- 20. generate cannot bypass budget (same gate as evaluate/reject) --
// **Real defect (fixed)**: generate did not call enforceBudget, so the repository reached
// 20 candidates against maxCandidates=10 while budget still reported "not stopped". A budget
// enforced at only some entry points is no budget.
// NOTE (2026-10-13 audit): the original "only entry point" claim was itself incomplete --
// cmdApprove / cmdRejectCandidate had the same gap until the disposition-gating fix (section 22).
console.log('-- 20. generate goes through same budget gate --');
{
 // (1) Candidate count already at maxCandidates -> generate must refuse and must not add candidates
 project('gen-budget');
 fs.writeFileSync(path.join(cwd, '.hello-dev', 'memory.json'), JSON.stringify({
 schema: 1,
 entries: [{ id: 'gb1', layer: 'L4', content: 'process', source: 's', tags: [],
 hits: 3, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
 working: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 }));
 const pg = path.join(cwd, '.hello-dev', 'evolve.json');
 fs.writeFileSync(pg, JSON.stringify({
 schema: 1, mode: 'observe',
 candidates: [{ id: 'old-1', path: '(generated)', type: 'L4-update', target: 'unrelated-entry',
 status: 'generated', createdAt: new Date().toISOString(), evaluatedAt: null,
 verdict: null, reason: null }],
 evaluations: [],
 // Per-round semantics (F1): the quota counts candidates added THIS round. Set the counter to
 // the limit to express "round exhausted", independent of how many candidates the store holds.
 budget: { maxCandidates: 1, maxEvaluations: 10, used: 0, stopped: null, candidatesThisRound: 1 },
 createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 }, null, 2));
 // The fixture must be able to produce at least one candidate, otherwise "no candidate added"
 // holds for the wrong reason (there was nothing to add).
 const dg = json(['diagnose']);
 ok('generate fixture has a real issue to act on',
 dg.summary.totalIssues >= 1, JSON.stringify(dg.summary));
 const gStop = run('generate');
 ok('**generate refused when candidate budget reached**', gStop.code !== 0, gStop.out.slice(0, 160));
 ok(' -> error explains budget stop', /Budget stopped/.test(gStop.out), gStop.out.slice(0, 160));
 ok(' -> states the candidate limit', /limit 1/.test(gStop.out), gStop.out.slice(0, 160));
 const evG = readEvolve();
 ok(' -> no candidate added', evG.candidates.length === 1,
 JSON.stringify(evG.candidates.map(c => c.id)));
 ok(' -> stop state persisted by the refused call',
 evG.budget.stopped !== null && /limit 1/.test(String(evG.budget.stopped.reason)),
 JSON.stringify(evG.budget.stopped));

 // (2) Pre-existing stop state must also block generate, and must survive the refused call
 project('gen-stopped');
 fs.writeFileSync(path.join(cwd, '.hello-dev', 'memory.json'), JSON.stringify({
 schema: 1,
 entries: [{ id: 'gs1', layer: 'L4', content: 'process', source: 's', tags: [],
 hits: 3, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
 working: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 }));
 const pg2 = path.join(cwd, '.hello-dev', 'evolve.json');
 fs.writeFileSync(pg2, JSON.stringify({
 schema: 1, mode: 'observe', candidates: [], evaluations: [],
 budget: { maxCandidates: 10, maxEvaluations: 10, used: 1,
 stopped: { at: new Date().toISOString(), reason: 'human review pending' } },
 createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 }, null, 2));
 const gStopped = run('generate');
 ok('**generate refused when stop already set**', gStopped.code !== 0, gStopped.out.slice(0, 160));
 ok(' -> refuses because of the stop, not something else',
 /human review pending/.test(gStopped.out), gStopped.out.slice(0, 160));
 const evG2 = readEvolve();
 ok(' -> candidates still empty', (evG2.candidates || []).length === 0,
 JSON.stringify(evG2.candidates));
 ok(' -> original stop state preserved', evG2.budget.stopped !== null &&
 evG2.budget.stopped.reason === 'human review pending', JSON.stringify(evG2.budget.stopped));

 // (3) Counter-example: budget available -> generate still succeeds (gates must not always-refuse)
 project('gen-budget-ok');
 fs.writeFileSync(path.join(cwd, '.hello-dev', 'memory.json'), JSON.stringify({
 schema: 1,
 entries: [{ id: 'gk1', layer: 'L4', content: 'process', source: 's', tags: [],
 hits: 3, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
 working: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 }));
 const pg3 = path.join(cwd, '.hello-dev', 'evolve.json');
 fs.writeFileSync(pg3, JSON.stringify({
 schema: 1, mode: 'observe', candidates: [], evaluations: [],
 budget: { maxCandidates: 10, maxEvaluations: 10, used: 0, stopped: null },
 createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 }, null, 2));
 const gOk = json(['generate']);
 ok('budget available -> generate still succeeds (not always-refuse)', gOk.generated >= 1,
 JSON.stringify(gOk).slice(0, 160));
 ok(' -> candidates persisted', readEvolve().candidates.length >= 1,
 JSON.stringify(readEvolve().candidates.length));
 ok(' -> no stop set', readEvolve().budget.stopped === null,
 JSON.stringify(readEvolve().budget.stopped));
}

 // -- 21. per-round candidate quota (F1: charter section 4 says limits are PER ROUND) --
 console.log('-- 21. per-round candidate quota (F1) --');
{
 // (1) THE regression: 22 lifetime candidates must NOT block a fresh round. The old lifetime
 // length check (22 >= 10) blocked generation permanently, and reset could not reopen it
 // because the same check re-tripped on the store length.
 project('round-quota');
 fs.writeFileSync(path.join(cwd, '.hello-dev', 'memory.json'), JSON.stringify({
 schema: 1,
 entries: [{ id: 'rq1', layer: 'L4', content: 'process', source: 's', tags: [],
 hits: 3, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
 working: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 }));
 const legacy = [];
 for (let i = 0; i < 22; i++) legacy.push({ id: 'legacy-' + i, path: '(generated)',
 type: 'L4-update', target: 'unrelated-' + i, status: 'rejected',
 createdAt: new Date().toISOString(), evaluatedAt: null, verdict: 'REJECTED', reason: 'x' });
 const pq = path.join(cwd, '.hello-dev', 'evolve.json');
 fs.writeFileSync(pq, JSON.stringify({
 schema: 1, mode: 'observe', candidates: legacy, evaluations: [],
 budget: { maxCandidates: 10, maxEvaluations: 20, used: 0, stopped: null },
 createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 }, null, 2));
 const gRound = json(['generate']);
 ok('**fresh round with 22 lifetime candidates -> generate succeeds** (F1 regression)',
 gRound.generated >= 1, JSON.stringify(gRound).slice(0, 200));
 const evRound = readEvolve();
 ok(' -> per-round counter advanced', evRound.budget.candidatesThisRound === 1,
 String(evRound.budget.candidatesThisRound));
 ok(' -> lifetime history preserved', evRound.candidates.length === 23,
 String(evRound.candidates.length));
 ok(' -> no stop set (round quota not exhausted)', evRound.budget.stopped === null,
 JSON.stringify(evRound.budget.stopped));

 // (2) Reaching the limit mid-round sets stopped at the boundary; the NEXT call refuses.
 project('round-cap');
 fs.writeFileSync(path.join(cwd, '.hello-dev', 'memory.json'), JSON.stringify({
 schema: 1,
 entries: [{ id: 'rc1', layer: 'L4', content: 'process', source: 's', tags: [],
 hits: 3, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }],
 working: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 }));
 const pc = path.join(cwd, '.hello-dev', 'evolve.json');
 fs.writeFileSync(pc, JSON.stringify({
 schema: 1, mode: 'observe', candidates: [], evaluations: [],
 budget: { maxCandidates: 10, maxEvaluations: 20, used: 0, stopped: null, candidatesThisRound: 9 },
 createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 }, null, 2));
 const gCap = json(['generate']);
 ok('last quota unit -> generate still succeeds', gCap.generated === 1, JSON.stringify(gCap).slice(0, 160));
 const evCap2 = readEvolve();
 ok(' -> counter reached the limit', evCap2.budget.candidatesThisRound === 10,
 String(evCap2.budget.candidatesThisRound));
 ok(' -> stop recorded at the boundary', evCap2.budget.stopped !== null &&
 /limit 10/.test(String(evCap2.budget.stopped.reason)), JSON.stringify(evCap2.budget.stopped));
 const gCap2 = run('generate');
 ok('next generate refused once exhausted', gCap2.code !== 0 && /Budget stopped/.test(gCap2.out),
 gCap2.out.slice(0, 160));

 // (2b) A single batch cannot overshoot the remaining quota: counter 8 + 5 signals -> only 2 added,
 // the rest deferred (re-proposed by a later round); remainingCandidates stays a real promise.
 project('round-batch-cap');
 fs.writeFileSync(path.join(cwd, '.hello-dev', 'memory.json'), JSON.stringify({
 schema: 1,
 entries: ['b1', 'b2', 'b3', 'b4', 'b5'].map((id, i) => ({ id, layer: 'L4', content: 'process ' + i,
 source: 's', tags: [], hits: 3, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })),
 working: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 }));
 const pb = path.join(cwd, '.hello-dev', 'evolve.json');
 fs.writeFileSync(pb, JSON.stringify({
 schema: 1, mode: 'observe', candidates: [], evaluations: [],
 budget: { maxCandidates: 10, maxEvaluations: 20, used: 0, stopped: null, candidatesThisRound: 8 },
 createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 }, null, 2));
 const gBatch = json(['generate']);
 ok('batch capped at remaining quota (2 of 5 added)', gBatch.generated === 2 && gBatch.deferredByQuota === 3,
 JSON.stringify(gBatch).slice(0, 200));
 ok(' -> counter exactly at the limit', readEvolve().budget.candidatesThisRound === 10,
 String(readEvolve().budget.candidatesThisRound));
 ok(' -> stop recorded', readEvolve().budget.stopped !== null, JSON.stringify(readEvolve().budget.stopped));

 // (3) reset reopens the per-round candidate quota
 const rReset = json(['reset', '--reason', 'test: reopen per-round quota']);
 ok('reset zeroes the per-round counter', rReset.reset === true && rReset.after.candidatesThisRound === 0,
 JSON.stringify(rReset).slice(0, 200));
 ok(' -> reset recorded the per-round counter before/after',
 rReset.before.candidatesThisRound === 10, JSON.stringify(rReset.before));
 const gAfterReset = run('generate');
 ok('generate after reset does not fail', gAfterReset.code === 0, gAfterReset.out.slice(0, 160));
 const budView = json(['budget']);
 ok(' -> budget display reports per-round view',
 typeof budView.candidatesThisRound === 'number' && typeof budView.candidatesInStore === 'number',
 JSON.stringify(budView).slice(0, 160));
}

 // -- 22. dispositions go through the budget gate (F2) --
 // cmdApprove / cmdRejectCandidate were the two remaining state-writing entry points outside
 // the budget (found by enumerating ALL write(root) sites in the 2026-10-13 audit; the
 // section-20 comment's "only entry point" claim was itself incomplete).
 console.log('-- 22. approve / reject-candidate go through same budget gate (F2) --');
{
 const dispFixture = (name, budget) => {
 project(name);
 const p = path.join(cwd, '.hello-dev', 'evolve.json');
 fs.writeFileSync(p, JSON.stringify({
 schema: 1, mode: 'observe',
 candidates: [
 { id: 'd-appr', path: '(generated)', type: 'L4-update', target: 't-a', status: 'generated',
 createdAt: new Date().toISOString(), evaluatedAt: null, verdict: null, reason: null },
 { id: 'd-rej', path: '(generated)', type: 'L4-update', target: 't-b', status: 'generated',
 createdAt: new Date().toISOString(), evaluatedAt: null, verdict: null, reason: null }],
 evaluations: [], budget,
 createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
 }, null, 2));
 };

 // (1) stop set -> both dispositions refused; nothing mutated; stop survives
 dispFixture('disp-stopped', { maxCandidates: 10, maxEvaluations: 20, used: 0,
 stopped: { at: new Date().toISOString(), reason: 'test stop' } });
 const rApprStopped = run('approve', '--candidate', 'd-appr', '--reason', 'r');
 ok('approve refused when stopped', rApprStopped.code !== 0 && /Budget stopped/.test(rApprStopped.out),
 rApprStopped.out.slice(0, 160));
 const rRejStopped = run('reject-candidate', '--candidate', 'd-rej', '--reason', 'r');
 ok('reject-candidate refused when stopped', rRejStopped.code !== 0 && /Budget stopped/.test(rRejStopped.out),
 rRejStopped.out.slice(0, 160));
 const evD1 = readEvolve();
 ok(' -> statuses unmutated by refused calls',
 evD1.candidates.every(c => c.status === 'generated'), JSON.stringify(evD1.candidates.map(c => c.status)));
 ok(' -> used not consumed by refused calls', evD1.budget.used === 0, String(evD1.budget.used));

 // (2) budget available -> both succeed and consume the execution quota
 dispFixture('disp-ok', { maxCandidates: 10, maxEvaluations: 20, used: 0, stopped: null });
 const okAppr = json(['approve', '--candidate', 'd-appr', '--reason', 'test approval']);
 ok('approve succeeds under budget', okAppr.status === 'approved', JSON.stringify(okAppr).slice(0, 160));
 const okRej = json(['reject-candidate', '--candidate', 'd-rej', '--reason', 'test rejection']);
 ok('reject-candidate succeeds under budget', okRej.status === 'rejected', JSON.stringify(okRej).slice(0, 160));
 const evD2 = readEvolve();
 ok(' -> used counts both dispositions', evD2.budget.used === 2, String(evD2.budget.used));
 ok(' -> dispositions create no candidates (counter untouched)',
 (evD2.budget.candidatesThisRound || 0) === 0, String(evD2.budget.candidatesThisRound));

 // (3) execution quota reached -> refuse (independent trigger, mirrors section 4's second gate)
 dispFixture('disp-cap', { maxCandidates: 10, maxEvaluations: 2, used: 2, stopped: null });
 const rApprCap = run('approve', '--candidate', 'd-appr', '--reason', 'r');
 ok('approve refused when evaluation quota reached',
 rApprCap.code !== 0 && /limit 2/.test(rApprCap.out), rApprCap.out.slice(0, 160));
 const evD3 = readEvolve();
 ok(' -> stop persisted from the refused disposition',
 evD3.budget.stopped !== null && /limit 2/.test(String(evD3.budget.stopped.reason)),
 JSON.stringify(evD3.budget.stopped));
}

console.log(`\n=== evolve.js: ${pass} passed / ${failN} failed ===`);
 process.exitCode = failN ? 1 : 0;
} finally {
 try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* best effort */ }
}
})();
