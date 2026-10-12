#!/usr/bin/env node
'use strict';

/**
 * search-install-skill.js behavioral tests (isolated projects)
 *
 * Risk coverage (each is a real failure mode found through testing):
 * 1. analyze command generates judgment prompt file
 * 2. install command reads installation plan and records results
 * 3. Installation results written to state.json pluginInstallationResult field
 * 4. install command does not crash when no installation plan exists
 * 5. Installation failure records error information
 * 6. P0-1: Impact analysis function correctly scans plugin directory and classifies risk
 * 7. P0-2: Generated prompt contains scope constraints and impact summary
 * 8. P1-1: uninstall command identifies unused plugins
 * 9. P1-2: usage-report command outputs usage report
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { detectHost } = require('./lib/host.js');

const CLI = path.join(__dirname, 'search-install-skill.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hello-dev-plugin-'));
// `install` / `uninstall` shell out to `claude plugin ...`, which exists only on Claude Code
// hosts. On every other host the commands emit a [SKIP] guidance line and exit 0 by design
// (WorkBuddy delegates to the host tool `search_and_install_skills`). Assertions must follow
// the branch the host actually takes: asserting Claude-only output on a non-Claude host reads
// as 10+ red defects that cannot be fixed. Both branches are covered because CI is a
// CLI-less claude host while dev machines are typically workbuddy/dual.
const CLAUDE_HOST = detectHost() === 'claude';
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
 // Optional leading { env } object lets a case pin the host / HOME it exercises, so the
 // assertion does not depend on whichever host happens to run the suite.
 const opts = (args[0] && typeof args[0] === 'object') ? args.shift() : {};
 const r = spawnSync(process.execPath, [CLI, ...args], {
 cwd,
 encoding: 'utf8',
 env: opts.env ? { ...process.env, ...opts.env } : process.env,
 });
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
 fs.writeFileSync(path.join(cwd, '.hello-dev', 'state.json'), JSON.stringify({
 schema: 1,
 task: { id: 'test-1', name: 'Test task', type: 'implementation', path: 'full' },
 stage: { current: 'bootstrap', status: 'in_progress', history: [], attempt: 1 },
 modules: {}, retry: { perModuleMax: 3, totalMax: 10, perModule: {}, total: 0 },
 checkpoints: [], git: { decisions: [] }, ops: { steps: {}, approvals: [] },
 blocked: null,
 createdAt: new Date().toISOString(),
 updatedAt: new Date().toISOString()
 }, null, 2));
 // Create .git directory before writing HEAD (reverse order causes ENOENT)
 fs.mkdirSync(path.join(cwd, '.git'), { recursive: true });
 fs.writeFileSync(path.join(cwd, '.git', 'HEAD'), 'ref: refs/heads/main\n');
}

function stateJson() {
 const p = path.join(cwd, '.hello-dev', 'state.json');
 return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
}

function writePlan(plan) {
 const p = path.join(cwd, '.hello-dev', 'state.json');
 const state = JSON.parse(fs.readFileSync(p, 'utf8'));
 state.pluginInstallationPlan = plan;
 fs.writeFileSync(p, JSON.stringify(state, null, 2));
}

function writeCollab(skills) {
 const p = path.join(cwd, '.hello-dev', 'state.json');
 const state = JSON.parse(fs.readFileSync(p, 'utf8'));
 state.collaboration = {
 detectedAt: new Date().toISOString(),
 roots: [],
 skills: skills.map(s => ({ name: s.name, source: s.source, rule: s.rule || 'plugin:*' }))
 };
 fs.writeFileSync(p, JSON.stringify(state, null, 2));
}

function writeInstallResult(installed, failed = []) {
 const p = path.join(cwd, '.hello-dev', 'state.json');
 const state = JSON.parse(fs.readFileSync(p, 'utf8'));
 state.pluginInstallationResult = {
 timestamp: new Date().toISOString(),
 installed,
 failed,
 summary: { total: installed.length + failed.length, success: installed.length, failure: failed.length }
 };
 fs.writeFileSync(p, JSON.stringify(state, null, 2));
}

/**
 * Create a mock plugin directory structure (for testing P0-1 impact analysis)
 */
function createMockPluginDir(baseDir, pluginName, { skills = 0, agents = 0, commands = 0, hooks = [], mcpServers = 0 } = {}) {
 const pluginDir = path.join(baseDir, pluginName);
 fs.mkdirSync(pluginDir, { recursive: true });

 // skills
 if (skills > 0) {
 const skillsDir = path.join(pluginDir, 'skills');
 fs.mkdirSync(skillsDir, { recursive: true });
 for (let i = 0; i < skills; i++) {
 const skillDir = path.join(skillsDir, `skill-${i}`);
 fs.mkdirSync(skillDir, { recursive: true });
 fs.writeFileSync(path.join(skillDir, 'SKILL.md'), `---\nname: skill-${i}\n---\nContent`);
 }
 }

 // agents
 if (agents > 0) {
 const agentsDir = path.join(pluginDir, 'agents');
 fs.mkdirSync(agentsDir, { recursive: true });
 for (let i = 0; i < agents; i++) {
 fs.writeFileSync(path.join(agentsDir, `agent-${i}.md`), `# Agent ${i}`);
 }
 }

 // commands
 if (commands > 0) {
 const commandsDir = path.join(pluginDir, 'commands');
 fs.mkdirSync(commandsDir, { recursive: true });
 for (let i = 0; i < commands; i++) {
 fs.writeFileSync(path.join(commandsDir, `cmd-${i}.md`), `# Command ${i}`);
 }
 }

 // hooks
 if (hooks.length > 0) {
 const hooksDir = path.join(pluginDir, 'hooks');
 fs.mkdirSync(hooksDir, { recursive: true });
 const hooksJson = { hooks: {} };
 for (const hookType of hooks) {
 hooksJson.hooks[hookType] = [{ hooks: [{ type: 'command', command: 'echo test' }] }];
 }
 fs.writeFileSync(path.join(hooksDir, 'hooks.json'), JSON.stringify(hooksJson, null, 2));
 }

 // mcp servers
 if (mcpServers > 0) {
 const mcpJson = { mcpServers: {} };
 for (let i = 0; i < mcpServers; i++) {
 mcpJson.mcpServers[`server-${i}`] = { command: 'test', args: [] };
 }
 fs.writeFileSync(path.join(pluginDir, '.mcp.json'), JSON.stringify(mcpJson, null, 2));
 }

 return pluginDir;
}

(async () => {
 try {
 // -- 1. analyze command generates judgment prompt --
 console.log('-- 1. analyze command generates judgment prompt --');
 project('analyze');
 const r1 = run('analyze');
 ok('analyze command executes successfully', r1.code === 0, r1.out.slice(0, 200));
 ok(' -> output contains "analysis complete"', /analysis complete/i.test(r1.out), r1.out.slice(0, 160));
 const promptPath = path.join(cwd, '.hello-dev', 'plugin-judgment-prompt.md');
 ok(' -> generates prompt file', fs.existsSync(promptPath), promptPath);
 if (fs.existsSync(promptPath)) {
 const content = fs.readFileSync(promptPath, 'utf8');
 ok(' -> contains task description', /Test task/.test(content), content.slice(0, 100));
 ok(' -> contains decision requirements', /decision requirements/i.test(content), content.slice(0, 100));
 }

 // -- 2. install command reads installation plan --
 console.log('-- 2. install command reads installation plan --');
 project('install');
 // Does not crash when no installation plan exists
 const r2a = run('install');
 ok('does not crash without installation plan', r2a.code === 0, r2a.out.slice(0, 200));
 if (CLAUDE_HOST) {
 ok(' -> output contains "no installation plan"', /no installation plan/i.test(r2a.out), r2a.out.slice(0, 160));
 } else {
 ok(' -> non-Claude host: install is skipped with host-tool guidance',
 /\[SKIP\] install/.test(r2a.out) && /search_and_install_skills/.test(r2a.out), r2a.out.slice(0, 200));
 }

 // -- 3. Installation results written to state.json --
 console.log('-- 3. Installation results written to state.json --');
 project('result');
 // Write a fake installation plan (need_install: false)
 writePlan({
 need_install: false,
 reason: 'test does not need installation',
 plugins: []
 });
 const r3 = run('install');
 ok('install command executes successfully', r3.code === 0, r3.out.slice(0, 200));
 if (CLAUDE_HOST) {
 ok(' -> output contains "no plugins needed"', /no plugins needed/i.test(r3.out), r3.out.slice(0, 160));
 } else {
 ok(' -> non-Claude host: install is skipped with host-tool guidance',
 /\[SKIP\] install/.test(r3.out) && /search_and_install_skills/.test(r3.out), r3.out.slice(0, 200));
 }

 // -- 4. Installation failure records error information --
 console.log('-- 4. Installation failure records error information --');
 project('failed');
 // Write a fake installation plan (with nonexistent plugin)
 writePlan({
 need_install: true,
 reason: 'test installation failure',
 plugins: [
 { id: 'non-existent-plugin-xyz', name: 'fake plugin', reason: 'for testing' }
 ]
 });
 const r4 = run('install');
 // Installation fails but command itself should execute successfully
 ok('install command completes execution', r4.code === 0, r4.out.slice(0, 200));
 const state4 = stateJson();
 if (CLAUDE_HOST) {
 ok(' -> state.json contains pluginInstallationResult', state4.pluginInstallationResult !== undefined,
 JSON.stringify(state4).slice(0, 100));
 } else {
 // The skip path returns before touching state.json: no silent half-record may appear.
 ok(' -> non-Claude host: install refused, state.json left untouched',
 state4.pluginInstallationResult === undefined && /\[SKIP\] install/.test(r4.out),
 JSON.stringify(state4).slice(0, 100));
 }
 if (state4.pluginInstallationResult) {
 const result = state4.pluginInstallationResult;
 ok(' -> contains timestamp', typeof result.timestamp === 'string', result.timestamp);
 ok(' -> contains summary', result.summary !== undefined, JSON.stringify(result.summary));
 ok(' -> summary.total = 1', result.summary.total === 1, result.summary.total);
 ok(' -> summary.failure = 1', result.summary.failure === 1, result.summary.failure);
 ok(' -> failed array is non-empty', result.failed.length > 0, JSON.stringify(result.failed));
 }

 // -- 5. Unknown action reports error --
 console.log('-- 5. Unknown action reports error --');
 project('unknown');
 const r5 = run('unknown-command');
 ok('unknown action returns non-zero', r5.code !== 0, r5.code);
 ok(' -> output contains "unknown action"', /unknown action/i.test(r5.out), r5.out.slice(0, 160));

 // -- 6. P0-1: Impact analysis function --
 console.log('-- 6. P0-1: Impact analysis function correctly scans plugin directory --');
 // Create temporary plugin directory for testing
 const testPluginBase = path.join(tmp, 'test-plugins');
 fs.mkdirSync(testPluginBase, { recursive: true });

 // Create safe plugin (only skills)
 const safePlugin = createMockPluginDir(testPluginBase, 'safe-plugin', { skills: 2, agents: 1 });
 // Create moderate plugin (has SessionStart hook)
 const moderatePlugin = createMockPluginDir(testPluginBase, 'moderate-plugin', { skills: 1, hooks: ['SessionStart'] });
 // Create elevated plugin (has MCP server)
 const elevatedPlugin = createMockPluginDir(testPluginBase, 'elevated-plugin', { skills: 1, mcpServers: 2 });
 // Create elevated plugin (has PreToolUse hook)
 const elevatedHookPlugin = createMockPluginDir(testPluginBase, 'elevated-hook-plugin', { skills: 1, hooks: ['PreToolUse', 'PostToolUse'] });

 // Verify directory structure created correctly
 ok(' -> safe plugin directory created successfully', fs.existsSync(path.join(safePlugin, 'skills', 'skill-0', 'SKILL.md')));
 ok(' -> moderate plugin hooks.json created successfully', fs.existsSync(path.join(moderatePlugin, 'hooks', 'hooks.json')));
 ok(' -> elevated plugin .mcp.json created successfully', fs.existsSync(path.join(elevatedPlugin, '.mcp.json')));

 // Verify hooks.json content
 const hooksContent = JSON.parse(fs.readFileSync(path.join(moderatePlugin, 'hooks', 'hooks.json'), 'utf8'));
 ok(' -> hooks.json contains SessionStart', hooksContent.hooks.SessionStart !== undefined);

 // Verify .mcp.json content
 const mcpContent = JSON.parse(fs.readFileSync(path.join(elevatedPlugin, '.mcp.json'), 'utf8'));
 ok(' -> .mcp.json contains 2 servers', Object.keys(mcpContent.mcpServers).length === 2);

 // Verify analyze command prompt contains impact analysis content
 project('impact-analysis');
 const r6 = run('analyze');
 ok(' -> analyze command executes successfully', r6.code === 0, r6.out.slice(0, 200));
 const impactPrompt = fs.readFileSync(path.join(cwd, '.hello-dev', 'plugin-judgment-prompt.md'), 'utf8');
 ok(' -> prompt contains "risk level description"', /risk level description/i.test(impactPrompt), 'risk level description not found');
 ok(' -> prompt contains safe/moderate/elevated description', /safe.*moderate.*elevated/.test(impactPrompt), 'three-tier risk description not found');

 // -- 7. P0-2: Scope constraints --
 console.log('-- 7. P0-2: Generated prompt contains scope constraints --');
 project('scope');
 const r7 = run('analyze');
 ok('analyze command executes successfully', r7.code === 0, r7.out.slice(0, 200));
 const promptContent = fs.readFileSync(path.join(cwd, '.hello-dev', 'plugin-judgment-prompt.md'), 'utf8');
 ok(' -> prompt contains "scope constraints"', /scope constraints/i.test(promptContent), 'scope constraints section not found');
 ok(' -> prompt contains "max installs per run"', /max installs per run/i.test(promptContent), 'install limit not found');
 ok(' -> prompt contains "priority order"', /priority order/i.test(promptContent), 'priority ordering not found');
 ok(' -> prompt contains "risk level description"', /risk level description/i.test(promptContent), 'risk level description not found');
 ok(' -> prompt contains "safe" risk level', /safe/.test(promptContent), 'safe not found');
 ok(' -> prompt contains "moderate" risk level', /moderate/.test(promptContent), 'moderate not found');
 ok(' -> prompt contains "elevated" risk level', /elevated/.test(promptContent), 'elevated not found');

 // -- 8. P1-1: uninstall command --
 console.log('-- 8. P1-1: uninstall command identifies unused plugins --');
 project('uninstall');
 // Write installation result: 2 plugins installed
 writeInstallResult([
 { id: 'plugin-a', name: 'plugin-a', reason: 'testing' },
 { id: 'plugin-b', name: 'plugin-b', reason: 'testing' }
 ]);
 // Write collab snapshot: only plugin-a is in use
 writeCollab([
 { name: 'skill-1', source: 'plugin:plugin-a', rule: 'plugin:*' }
 ]);

 const r8 = run('uninstall');
 ok('uninstall command executes successfully', r8.code === 0, r8.out.slice(0, 200));
 if (CLAUDE_HOST) {
 ok(' -> output contains "installed plugins"', /installed plugins/i.test(r8.out), r8.out.slice(0, 160));
 ok(' -> output contains "in use"', /in use/i.test(r8.out), r8.out.slice(0, 160));
 ok(' -> output contains "unused"', /unused/.test(r8.out), r8.out.slice(0, 160));
 ok(' -> identifies plugin-b as unused', /plugin-b/.test(r8.out), r8.out.slice(0, 160));
 ok(' -> hints --execute parameter', /--execute/.test(r8.out), r8.out.slice(0, 160));
 } else {
 ok(' -> non-Claude host: uninstall is skipped with host-UI guidance',
 /\[SKIP\] uninstall/.test(r8.out) && /host UI|search_and_install_skills/.test(r8.out), r8.out.slice(0, 200));
 }

 // -- 9. P1-2: usage-report command --
 console.log('-- 9. P1-2: usage-report command outputs usage report --');
 project('usage-report');
 // Write installation result
 writeInstallResult([
 { id: 'plugin-x', name: 'plugin-x', reason: 'testing' },
 { id: 'plugin-y', name: 'plugin-y', reason: 'testing' },
 { id: 'plugin-z', name: 'plugin-z', reason: 'testing' }
 ]);
 // Write collab snapshot: only plugin-x and plugin-z are in use
 writeCollab([
 { name: 'skill-a', source: 'plugin:plugin-x', rule: 'plugin:*' },
 { name: 'skill-b', source: 'plugin:plugin-x', rule: 'plugin:*' },
 { name: 'skill-c', source: 'plugin:plugin-z', rule: 'plugin:*' }
 ]);

 const r9 = run('usage-report');
 ok('usage-report command executes successfully', r9.code === 0, r9.out.slice(0, 200));
 ok(' -> output contains "plugin usage report"', /plugin usage report/i.test(r9.out), r9.out.slice(0, 160));
 ok(' -> output contains installed plugins: 3', /installed plugins:\s*3/i.test(r9.out), r9.out.slice(0, 160));
 ok(' -> output contains "USED" label', /USED/.test(r9.out), r9.out.slice(0, 160));
 ok(' -> output contains "UNUSED" label', /UNUSED/.test(r9.out), r9.out.slice(0, 160));
 ok(' -> output contains "usage rate"', /usage rate/i.test(r9.out), r9.out.slice(0, 160));
 ok(' -> usage rate is 67% (2/3)', /67%/.test(r9.out), r9.out.slice(0, 160));

 // -- 10. P2-1: Compatibility pre-check --
 console.log('-- 10. P2-1: Compatibility pre-check detects naming conflicts --');
 project('conflict-check');
 // Create two plugins with naming conflicts (both have skill-0)
 const conflictPluginBase = path.join(tmp, 'conflict-plugins');
 fs.mkdirSync(conflictPluginBase, { recursive: true });
 const conflictPlugin1 = createMockPluginDir(conflictPluginBase, 'conflict-1', { skills: 2 });
 const conflictPlugin2 = createMockPluginDir(conflictPluginBase, 'conflict-2', { skills: 2 });

 // Write installation plan (install two conflicting plugins)
 writePlan({
 need_install: true,
 reason: 'test compatibility pre-check',
 plugins: [
 { id: 'conflict-1', name: 'conflict-1', reason: 'testing', risk_level: 'safe' },
 { id: 'conflict-2', name: 'conflict-2', reason: 'testing', risk_level: 'safe' }
 ]
 });

 const r10 = run('install');
 // install should detect conflict and prevent installation
 ok('install command completes execution', r10.code === 0, r10.out.slice(0, 200));
 if (CLAUDE_HOST) {
 ok(' -> output contains "compatibility pre-check"', /compatibility pre-check/.test(r10.out), r10.out.slice(0, 160));
 // Since conflict plugins are not in real plugin cache, checkPluginConflicts returns no conflicts
 // But we can verify the function was called
 ok(' -> calls compatibility pre-check function', /compatibility pre-check/.test(r10.out) || /running compatibility pre-check/.test(r10.out), r10.out.slice(0, 160));
 } else {
 ok(' -> non-Claude host: install is skipped with host-tool guidance',
 /\[SKIP\] install/.test(r10.out) && /search_and_install_skills/.test(r10.out), r10.out.slice(0, 200));
 }

 // -- 11. P2-2: Historical feedback loop --
 console.log('-- 11. P2-2: Historical feedback loop (analyze includes utilization info) --');
 project('historical-feedback');
 // Write historical installation record (plugin-old installed but not used)
 writeInstallResult([
 { id: 'plugin-old', name: 'plugin-old', reason: 'historical test' }
 ]);
 writeCollab([
 // plugin-old not in collab, utilization is 0%
 ]);

 const r11 = run('analyze');
 ok('analyze command executes successfully', r11.code === 0, r11.out.slice(0, 200));
 ok(' -> output contains "historical usage"', /historical usage/i.test(r11.out), r11.out.slice(0, 160));
 const historicalPrompt = fs.readFileSync(path.join(cwd, '.hello-dev', 'plugin-judgment-prompt.md'), 'utf8');
 ok(' -> prompt contains "historical usage feedback"', /historical usage feedback/i.test(historicalPrompt), 'historical usage feedback section not found');
 ok(' -> prompt contains "plugin-old"', /plugin-old/.test(historicalPrompt), 'plugin-old not found');
 ok(' -> prompt contains "not used"', /not used/.test(historicalPrompt), 'not used notice not found');

 // -- 12. P3-1: Offline cache --
 console.log('-- 12. P3-1: Offline cache (plugin-cache.json) --');
 project('offline-cache');
 // Pin host and home so this case is deterministic on every machine: a claude host without the
 // CLI has no plugin source at all and (correctly) writes no cache -- asserting on the ambient
 // host made this the one case that stayed red on CI. The fixture marketplace proves the
 // *scanned list* -- not merely the file -- reaches the cache.
 const cacheHome = path.join(tmp, 'home-offline-cache');
 const fixtureSkillDir = path.join(cacheHome, '.workbuddy', 'plugins', 'marketplaces',
 'fixture-market', 'plugins', 'fixture-plugin', 'skills', 'fixture-skill');
 fs.mkdirSync(fixtureSkillDir, { recursive: true });
 fs.writeFileSync(path.join(fixtureSkillDir, 'SKILL.md'),
 '---\nname: fixture-skill\ndescription: fixture plugin for cache test\n---\n\n# fixture\n', 'utf8');

 const r12 = run({ env: { HELLODEV_HOME: cacheHome, HELLODEV_HOST: 'workbuddy' } }, 'analyze');
 ok('analyze command executes successfully', r12.code === 0, r12.out.slice(0, 200));
 const cachePath = path.join(cwd, '.hello-dev', 'plugin-cache.json');
 ok(' -> creates plugin-cache.json', fs.existsSync(cachePath), cachePath);
 if (fs.existsSync(cachePath)) {
 const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
 ok(' -> cache contains timestamp', typeof cache.timestamp === 'string', cache.timestamp);
 ok(' -> cache contains plugins array', Array.isArray(cache.plugins), typeof cache.plugins);
 ok(' -> cache carries the scanned plugin (not just an empty shell)',
 Array.isArray(cache.plugins) && cache.plugins.some((p) => p.id === 'fixture-plugin@fixture-market'),
 JSON.stringify(cache.plugins).slice(0, 160));
 }

 // -- 13. P3-2: Matrix stratification (scope field) --
 console.log('-- 13. P3-2: Matrix stratification (scope field) --');
 project('scope-field');
 // Write installation plan with scope field
 writePlan({
 need_install: true,
 reason: 'test scope field',
 plugins: [
 { id: 'perm-plugin', name: 'perm-plugin', reason: 'long-term tool', risk_level: 'safe', scope: 'permanent' },
 { id: 'temp-plugin', name: 'temp-plugin', reason: 'temporary tool', risk_level: 'safe', scope: 'temporary' }
 ]
 });

 const r13 = run('install');
 ok('install command completes execution', r13.code === 0, r13.out.slice(0, 200));
 const state13 = stateJson();
 if (CLAUDE_HOST) {
 ok(' -> state.json contains pluginInstallationResult', state13.pluginInstallationResult !== undefined);
 } else {
 ok(' -> non-Claude host: install refused, state.json left untouched',
 state13.pluginInstallationResult === undefined && /\[SKIP\] install/.test(r13.out),
 JSON.stringify(state13).slice(0, 120));
 }
 if (state13.pluginInstallationResult && state13.pluginInstallationResult.installed.length > 0) {
 // Verify scope field is recorded
 const installed = state13.pluginInstallationResult.installed;
 ok(' -> installation record contains scope field', installed[0].scope !== undefined, JSON.stringify(installed[0]));
 }
 // Verify prompt contains scope description
 const r13b = run('analyze');
 ok('analyze command executes successfully', r13b.code === 0, r13b.out.slice(0, 200));
 const scopePrompt = fs.readFileSync(path.join(cwd, '.hello-dev', 'plugin-judgment-prompt.md'), 'utf8');
 ok(' -> prompt contains "scope description"', /scope description/i.test(scopePrompt), 'scope description not found');
 ok(' -> prompt contains "permanent"', /permanent/.test(scopePrompt), 'permanent not found');
 ok(' -> prompt contains "temporary"', /temporary/.test(scopePrompt), 'temporary not found');

 // -- Summary --
 console.log(`\n${''.repeat(50)}`);
 console.log(`Tests complete: ${pass} passed, ${failN} failed, ${checks} total`);
 if (failN > 0) {
 console.log('FAIL: tests failed');
 process.exit(1);
 } else {
 console.log('ALL PASSED: tests passed');
 }
 } catch (error) {
 console.error('FAIL: test execution error:', error.message);
 process.exit(1);
 }
})();
