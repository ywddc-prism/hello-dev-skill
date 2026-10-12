#!/usr/bin/env node
'use strict';

/**
 * Behavioral tests for detect-skills.js.
 *
 * Focuses on the pitfall this feature exists to address: **symlinks**.
 * The local `~/.claude/skills/` is entirely symlinks; filtering with
 * `isDirectory()` silently yields 0 skills, and "0" looks like "no
 * skills installed on this machine" -- the hardest bug category to
 * discover. Tests therefore use fixtures (temp dirs) rather than the
 * real skills directory for assertions.
 *
 * Usage: node scripts/test-detect-skills.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const D = require('./detect-skills.js');

let pass = 0, fail = 0;
const tmpRoots = [];

function ok(name, cond, detail) {
 if (cond) { pass++; console.log(` [ OK ] ${name}`); }
 else { fail++; console.log(` [FAIL] ${name}${detail ? ` — ${detail}` : ''}`); }
}
function section(t) { console.log(`\n${t}`); }

/** Create a temporary skill directory (with SKILL.md) and return its path. */
function mkSkill(parent, dirName, frontmatter) {
 const dir = path.join(parent, dirName);
 fs.mkdirSync(dir, { recursive: true });
 fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\n${frontmatter}\n---\n\n# ${dirName}\n`, 'utf8');
 return dir;
}
function mkTmp(prefix) {
 const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
 tmpRoots.push(d);
 return d;
}

/* ---------- 1. Frontmatter parsing ---------- */
section('1. Frontmatter parsing');
{
 const fm = D.parseFrontmatter('---\nname: alpha\ndescription: "quoted description"\nmetadata:\n version: "1.0"\n---\n\n# body\ndescription: body description does not count\n');
 ok('extracts name', fm.name === 'alpha', fm.name);
 ok('extracts description and strips quotes', fm.description === 'quoted description', fm.description);
 ok('does not pick up same-named key in body', fm.description !== 'body description does not count', fm.description);

 const folded = D.parseFrontmatter('---\nname: beta\ndescription: >\n first line\n second line\nname2: x\n---\n');
 ok('folded block description merged into one line', folded.description === 'first line second line', folded.description);
 ok('sibling key after folded block still parseable', folded.name2 === 'x', folded.name2);

 const none = D.parseFrontmatter('# no frontmatter\n');
 ok('no frontmatter returns empty object', Object.keys(none).length === 0);

 const piped = D.parseFrontmatter('---\nname: gamma\ndescription: |\n preserved\n newlines\n---\n');
 ok('block scalar | also read', piped.description === 'preserved newlines', piped.description);
}

/* ---------- 2. Symlinks (core regression) ---------- */
section('2. Symlink dereferencing');
{
 const real = mkTmp('hello-dev-real-');
 const links = mkTmp('hello-dev-links-');
 const actual = mkSkill(real, 'linked-skill', 'name: linked-skill\ndescription: skill discovered via symlink');
 fs.symlinkSync(actual, path.join(links, 'linked-skill'), 'dir');

 const r = D.detectSkills({ roots: [{ kind: 'user', path: links }] });
 ok('link directory counted as skill (isDirectory() would miss it)', r.count === 1, `count=${r.count}`);
 ok('name extracted from frontmatter after link resolution', r.skills[0] && r.skills[0].name === 'linked-skill', r.skills[0] && r.skills[0].name);
 ok('flagged as symlink', r.skills[0] && r.skills[0].symlink === true);

 // Same real dir via two links -> deduplicated by real path, not double-counted
 fs.symlinkSync(actual, path.join(links, 'linked-again'), 'dir');
 const r2 = D.detectSkills({ roots: [{ kind: 'user', path: links }] });
 ok('two links to same real path counted once', r2.count === 1, `count=${r2.count}`);
 ok('sources merged', r2.skills[0] && r2.skills[0].sources.length === 1, JSON.stringify(r2.skills[0] && r2.skills[0].sources));

 // Broken symlink: must not crash the entire detection
 fs.symlinkSync(path.join(real, 'does-not-exist'), path.join(links, 'broken'), 'dir');
 const r3 = D.detectSkills({ roots: [{ kind: 'user', path: links }] });
 ok('broken symlink skipped instead of throwing', r3.count === 1 && r3.skipped.length === 1, `count=${r3.count} skipped=${r3.skipped.length}`);
 ok('broken link recorded in diagnostics', (r3.skipped[0] || '').includes('broken link'), r3.skipped[0]);
}

/* ---------- 3. Root missing / empty roots ---------- */
section('3. Missing roots and empty roots');
{
 const empty = mkTmp('hello-dev-empty-');
 const r = D.detectSkills({ roots: [{ kind: 'user', path: empty }] });
 ok('empty root: 0 entries, 0 skills, exists', r.roots[0].exists && r.roots[0].entries === 0 && r.count === 0);

 const missing = path.join(os.tmpdir(), 'hello-dev-definitely-missing-' + Date.now());
 const r2 = D.detectSkills({ roots: [{ kind: 'user', path: missing }] });
 ok('nonexistent root counted in missingRoots with no roots entry', r2.missingRoots === 1 && r2.roots.length === 0, JSON.stringify(r2.roots));

 // "Root exists, has entries, resolves 0" -- symptom when symlink filter is broken
 const noSkillMd = mkTmp('hello-dev-noskill-');
 fs.mkdirSync(path.join(noSkillMd, 'plain-dir'));
 const r3 = D.detectSkills({ roots: [{ kind: 'user', path: noSkillMd }] });
 ok('directory without SKILL.md not counted, diagnostic recorded', r3.count === 0 && r3.roots[0].entries === 1 && r3.skipped.length === 1);
}

/* ---------- 4. Rule classification ---------- */
section('4. Applicable rule classification');
{
 const cases = [
 [{ name: 'hello-dev', source: 'user' }, 'hello-dev'],
 [{ name: 'hermes-agent-self-evolution', source: 'user' }, 'hermes-agent-self-evolution'],
 [{ name: 'lark-im', source: 'user' }, 'lark-*'],
 [{ name: 'va-preview', source: 'user' }, 'va-*'],
 [{ name: 'vibearound', source: 'user' }, 'vibearound'],
 [{ name: 'skill-creator', source: 'plugin:skill-creator' }, 'plugin:*'],
 [{ name: 'brand-new-thing', source: 'user' }, 'unclassified'],
 ];
 for (const [skill, expect] of cases) {
 ok(`${skill.name} -> ${expect}`, D.ruleOf(skill) === expect, D.ruleOf(skill));
 }
 // Rule labels must be unique, otherwise section 4.1 comparison yields ambiguous results
 const labels = D.RULES.map(r => r.label);
 ok('rule labels are unique', new Set(labels).size === labels.length, labels.join(','));
}

/* ---------- 5. Sorting and block generation ---------- */
section('5. Sorting and block generation');
{
 const base = mkTmp('hello-dev-sort-');
 const plug = mkTmp('hello-dev-plug-');
 mkSkill(base, 'zzz-user', 'name: zzz-user\ndescription: user-level');
 mkSkill(base, 'aaa-user', 'name: aaa-user\ndescription: user-level');
 mkSkill(plug, 'mmm-plugin', 'name: mmm-plugin\ndescription: plugin-level');

 const r = D.detectSkills({ roots: [{ kind: 'user', path: base }, { kind: 'plugin:x', path: plug }] });
 ok('user sorted before plugin', r.skills[0].source === 'user' && r.skills[2].source === 'plugin:x',
 r.skills.map(s => s.source).join(','));
 ok('sorted by name within same source', r.skills[0].name === 'aaa-user' && r.skills[1].name === 'zzz-user',
 r.skills.slice(0, 2).map(s => s.name).join(','));

 const block = D.renderBlock(r);
 ok('block has begin/end markers', block.startsWith(D.BLOCK_BEGIN) && block.endsWith(D.BLOCK_END));
 const rows = D.parseBlock(block);
 ok('block can be read back by parseBlock', rows && rows.length === 3, rows && String(rows.length));
 ok('read-back name/source/rule match detection',
 rows[0].name === 'aaa-user' && rows[0].source === 'user' && rows[0].rule === 'unclassified',
 JSON.stringify(rows[0]));

 // Pipe and newline would break table structure
 const dirty = mkTmp('hello-dev-dirty-');
 mkSkill(dirty, 'dirty', 'name: dirty\ndescription: a | b');
 const b2 = D.renderBlock(D.detectSkills({ roots: [{ kind: 'user', path: dirty }] }));
 const rowLine = b2.split('\n').find(l => l.includes('dirty'));
 ok('pipe in description is escaped', rowLine.includes('a \\| b'), rowLine);
 // Escaped pipe would mislead naive split('|') into reading wrong rule column --
 // must split columns on unescaped pipes only
 const dirtyRows = D.parseBlock(b2);
 ok('read-back not confused by escaped pipe', dirtyRows[0].rule === 'unclassified' && dirtyRows[0].source === 'user',
 JSON.stringify(dirtyRows[0]));

 // Name also comes from arbitrary SKILL.md; pipe in name must be escaped or table becomes unreadable
 const evil = mkTmp('hello-dev-evil-');
 mkSkill(evil, 'pipe', 'name: "name | with | pipes"\ndescription: normal');
 const evilRows = D.parseBlock(D.renderBlock(D.detectSkills({ roots: [{ kind: 'user', path: evil }] })));
 ok('name with pipes does not break columns', evilRows.length === 1 && evilRows[0].name === 'name | with | pipes' &&
 evilRows[0].source === 'user' && evilRows[0].rule === 'unclassified', JSON.stringify(evilRows));

 // Empty detection must still generate a valid (placeholder) table; parseBlock must not return null
 const none = D.detectSkills({ roots: [] });
 const b3 = D.renderBlock(none);
 ok('empty result generates placeholder row and is parseable', D.parseBlock(b3) !== null && D.parseBlock(b3).length === 0);

 // Document without markers must throw, not silently append
 const docNoMark = path.join(mkTmp('hello-dev-doc-'), 'no-mark.md');
 fs.writeFileSync(docNoMark, '# no markers\n', 'utf8');
 let threw = '';
 try { D.writeBlock(docNoMark, block); } catch (e) { threw = e.message; }
 ok('throws when target document lacks markers (no silent append)', threw.includes('generation marker'), threw);
}

/* ---------- 6. --write idempotency ---------- */
section('6. --write idempotency and CLI');
{
 const doc = path.join(mkTmp('hello-dev-w-'), 'doc.md');
 const roots = mkTmp('hello-dev-wr-');
 mkSkill(roots, 's1', 'name: s1\ndescription: a skill');
 const rootsArg = `user=${roots}`;

 const run = () => execFileSync(process.execPath,
 [path.join(__dirname, 'detect-skills.js'), '--write', '--doc', doc, '--roots', rootsArg],
 { encoding: 'utf8' });

 fs.writeFileSync(doc, `# doc\n\n${D.BLOCK_BEGIN}\n${D.BLOCK_END}\n\ntrailing\n`, 'utf8');
 run();
 const once = fs.readFileSync(doc, 'utf8');
 run();
 const twice = fs.readFileSync(doc, 'utf8');
 ok('repeated --write output stable (within date granularity)', once === twice);
 ok('write-back preserves content outside markers', once.startsWith('# doc\n') && once.endsWith('trailing\n'), JSON.stringify(once.slice(-20)));
 ok('write-back contains the skill', once.includes('| `s1` | user |'), once.split('\n').find(l => l.includes('s1')));

 const json = JSON.parse(execFileSync(process.execPath,
 [path.join(__dirname, 'detect-skills.js'), '--roots', rootsArg], { encoding: 'utf8' }));
 ok('default output is JSON with complete structure', json.count === 1 && Array.isArray(json.roots) && Array.isArray(json.skills));

 const md = execFileSync(process.execPath,
 [path.join(__dirname, 'detect-skills.js'), '--md', '--roots', rootsArg], { encoding: 'utf8' });
 ok('--md output can be parsed by parseBlock', D.parseBlock(md).length === 1);
}

/* ---------- 7. Validator degradation semantics ---------- */
// This section comes from a real defect: section 4.2 is a list "generated on one machine,
// committed to VCS" -- a different machine will inevitably mismatch.
// Initially "0 detected but document non-empty" was always a failure, causing guaranteed
// false failures on new machines. The check must distinguish "no local basis for judgment"
// (SKIP) from "symlink resolution broken" (FAIL).
//
// These three scenarios need a machine that resolves *no* skills at all. They therefore run
// the guard from a minimal **copy** of the repository instead of the repository itself:
// detection here always finds this repo's own `skills/` directory (the `bundled` root), so
// pointing HOME at an empty fixture can never reach 0 skills while the guard runs in-tree.
// The copy holds the unmodified guard code plus the document and the related files that
// checks 1-6 require.
section('7. Validator degradation semantics (check-collaboration-matrix.js)');
{
 const REPO = path.join(__dirname, '..');
 const SKEL = mkTmp('hello-dev-skel-');
 const SKEL_FILES = [
 'scripts/check-collaboration-matrix.js',
 'scripts/detect-skills.js',
 'scripts/lib/stages.js',
 'scripts/lib/home.js',
 'references/collaboration-matrix.md',
 'references/automation-charter.md',
 'modules/core/state-protocol.md',
 'modules/core/approval/git-gate.md',
 'modules/core/approval/ops-execution.md',
 'modules/core/approval/design-flow.md',
 ];
 for (const rel of SKEL_FILES) {
 const dst = path.join(SKEL, rel);
 fs.mkdirSync(path.dirname(dst), { recursive: true });
 fs.copyFileSync(path.join(REPO, rel), dst);
 }
 const CHECK = path.join(SKEL, 'scripts', 'check-collaboration-matrix.js');
 const runCheck = (home) => {
 const env = { ...process.env, HOME: home, CLAUDE_CONFIG_DIR: path.join(home, '.claude') };
 // Neutralise the host-signature and home overrides: a real WorkBuddy session exports
 // WORKBUDDY_SESSION (and a user may export HELLODEV_HOME/HELLODEV_HOST), either of which
 // would make the scanner read the developer's real skill roots no matter what HOME says.
 for (const k of ['HELLODEV_HOME', 'HELLODEV_HOST', 'WORKBUDDY_SESSION']) delete env[k];
 const r = require('child_process').spawnSync(process.execPath, [CHECK],
 { cwd: SKEL, encoding: 'utf8', env });
 return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
 };

 // Scenario a: machine has no skill roots at all -> cannot judge, SKIP with exit 0
 const bare = mkTmp('hello-dev-bare-');
 const a = runCheck(bare);
 ok('no skill roots -> exit 0 (no installed skills is not a doc defect)', a.code === 0, `code=${a.code}\n${a.out.slice(-300)}`);
 ok('no skill roots -> reports SKIP not pass', /SKIP|cannot judge|no skill roots/.test(a.out), a.out.slice(-200));

 // Scenario b: root exists but empty -> also cannot judge, SKIP with exit 0
 const emptyHome = mkTmp('hello-dev-emptyhome-');
 fs.mkdirSync(path.join(emptyHome, '.claude', 'skills'), { recursive: true });
 const b = runCheck(emptyHome);
 ok('empty skill root -> exit 0', b.code === 0, `code=${b.code}\n${b.out.slice(-300)}`);
 ok('empty skill root -> reports SKIP', /SKIP|cannot judge|no basis/.test(b.out), b.out.slice(-200));

 // Scenario c: root exists, has entries, resolves 0 -> symlink trap, must FAIL
 const trapHome = mkTmp('hello-dev-traphome-');
 fs.mkdirSync(path.join(trapHome, '.claude', 'skills', 'plain-dir'), { recursive: true });
 const c = runCheck(trapHome);
 ok('root exists, has entries, 0 resolved -> non-zero exit', c.code !== 0, `code=${c.code}\n${c.out.slice(-300)}`);
 ok('failure message points to symlink resolution', /symlinks not dereferenced|resolved to 0|Detected directory entries but parsed 0/.test(c.out), c.out.slice(-300));

 // Normal local path: when skills exist, must actually compare (not mask issues with SKIP).
 // The doc block was generated on the author's machine, so on any other machine the
 // comparison reports a difference -- which is expected and must not be turned into a
 // SKIP, and must not be turned into a failure either.
 //
 // The predicate must be measured in the SAME context the guard ran in. The guard detects
 // with cwd = <its own directory>/.., which in the skeleton is SKEL -- so the repository's
 // own bundled skills/ is not visible to it, and its "skills" are the real home's user
 // roots. An in-process detectSkills({}) call from this repository always counted this
 // repo's own bundled skills instead, so on any machine whose only skills are the bundled
 // ones (every fresh clone, CI) the predicate claimed "has skills" while the guard
 // correctly skipped -- a permanent false red on a machine-state fact. Spawn the same
 // CLI the guard uses, with the same env neutralisation as runCheck, under SKEL.
 const realHasSkills = (() => {
   const env = { ...process.env, HOME: os.homedir(), CLAUDE_CONFIG_DIR: path.join(os.homedir(), '.claude') };
   for (const k of ['HELLODEV_HOME', 'HELLODEV_HOST', 'WORKBUDDY_SESSION']) delete env[k];
   const r = require('child_process').spawnSync(process.execPath,
     [path.join(SKEL, 'scripts', 'detect-skills.js')], { cwd: SKEL, encoding: 'utf8', env });
   try { return JSON.parse(r.stdout).count > 0; } catch (e) { return false; }
 })();
 const real = runCheck(os.homedir());
 ok('real comparison executed when machine has skills', realHasSkills
 ? /S4\.2 consistent with live detection|S4\.2 content is inconsistent with live skill detection/.test(real.out)
 : real.code === 0,
 `detected=${realHasSkills}\n${real.out.slice(-300)}`);
 ok('content mismatch alone exits 0', real.code === 0, `code=${real.code}`);
}

/* ---------- 8. Document drift must be caught (adversarial cases) ---------- */
// The entire value of the validator is "drift must turn red". Inject each type of drift
// and assert it actually fails -- a perpetually-green validator is worse than none,
// because it makes people trust the document.
//
// Two classes of drift, deliberately treated differently:
//   - STRUCTURAL drift (missing markers, prose inside the block, a rewritten section
//     heading, row count disagreeing with the declared count) must exit non-zero. The
//     generator cannot produce these shapes, so they mean the file was edited by hand
//     or is inconsistent with itself -- a defect on any machine.
//   - CONTENT drift (the block lists a different set of installed skills than the reader's
//     machine) must be *reported* and still exit 0. The block is generated from the author's
//     installed skills and committed; every reader has a different set, so exact agreement
//     is impossible for anyone but the author, and a permanently-red guard just teaches
//     readers to ignore the whole script.
section('8. Document drift detection (injection, all on copies)');
{
 const REPO = path.join(__dirname, '..');
 const CHECK = path.join(__dirname, 'check-collaboration-matrix.js');
 const REAL_DOC = path.join(REPO, 'references', 'collaboration-matrix.md');
 // Inject drift on a **copy**. Real document is not tracked in git; if test rewrites it
 // and crashes midway, there is nowhere to recover -- drift tests are precisely the
 // most likely to fail midway.
 const COPY = path.join(mkTmp('hello-dev-doc-'), 'collaboration-matrix.md');
 const original = fs.readFileSync(REAL_DOC, 'utf8');
 const originalHash = require('crypto').createHash('sha256').update(original).digest('hex');
 const runCheck = () => {
 const r = require('child_process').spawnSync(process.execPath, [CHECK, '--doc', COPY],
 { cwd: REPO, encoding: 'utf8' });
 return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
 };
 const withDrift = (mutate, label, expect, code) => {
 fs.writeFileSync(COPY, mutate(original), 'utf8');
 try {
 const r = runCheck();
 const codeOk = code === 'fail' ? r.code !== 0 : r.code === 0;
 ok(label, codeOk && expect.test(r.out), `code=${r.code}\n${r.out.slice(-200)}`);
 } finally {
 fs.writeFileSync(COPY, original, 'utf8'); // restore copy for subsequent tests and final assertion
 }
 };

 // Structural drift: fatal.
 const CASES = [
 // A row injected without updating the summary line: the declared count and the rows are
 // written by the generator in one pass, so disagreeing means a broken block, not a
 // difference between machines.
 [t => t.replace('<!-- END GENERATED: skills -->',
 '| `ghost-skill` | user | forged | hello-dev |\r\n<!-- END GENERATED: skills -->'),
 'inject forged skill row without fixing row count -> fail', /declares \d+, table actually has \d+ rows/, 'fail'],
 [t => t.replace('<!-- BEGIN GENERATED: skills -->', ''),
 'delete generation marker -> fail', /generation marker/, 'fail'],
 // The mutation must survive CRLF line endings; a bare '\n' anchor silently makes the
 // replace a no-op and the case then passes/fails for the wrong reason.
 [t => t.replace(/(<!-- BEGIN GENERATED: skills -->)(\r?\n)/, '$1$2manually added prose$2'),
 'insert prose line inside block -> fail', /non-table row/, 'fail'],
 [t => t.replace('### 4.1 Routing Rules (manually maintained, authoritative)', '### 4.1 Routing Rules'),
 'section 4.1 heading rewritten -> fail', /title is not the contract title/, 'fail'],
 [t => t.replace('### 4.2 Detected Skills (auto-generated)', '### 4.2 Detected Skills'),
 'section 4.2 heading rewritten -> fail', /title is not the contract title/, 'fail'],
 // Content drift: reported, exit 0. This is the cross-machine case in its purest form --
 // the block points at a skill list that does not exist on this machine.
 [t => t.replace('| `hello-dev` | user |', '| `hello-dev-renamed` | user |'),
 'rename a skill in the block -> warning, exit 0', /\[WARN\] S4\.2 content is inconsistent/, 'warn'],
 ];
 for (const [mutate, label, expect, code] of CASES) withDrift(mutate, label, expect, code);

 // Cleanup: after restoring copy, must return to all-green
 const after = runCheck();
 ok('after full restore, validation passes', after.code === 0, `code=${after.code}`);

 // Real safety guarantee: the entire test round did not touch the real document
 const finalHash = require('crypto').createHash('sha256').update(fs.readFileSync(REAL_DOC, 'utf8')).digest('hex');
 ok('real document was not modified (hash unchanged)', finalHash === originalHash,
 `${originalHash.slice(0, 12)} -> ${finalHash.slice(0, 12)}`);
}

/* ---------- Cleanup ---------- */
for (const d of tmpRoots) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }

console.log(`\n${fail === 0 ? 'ALL PASSED' : 'FAIL'} ${pass} passed / ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
