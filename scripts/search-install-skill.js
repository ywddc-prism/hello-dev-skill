#!/usr/bin/env node
'use strict';

/**
 * Automatically search and install required skills
 *
 * **Tier 1 cross-host adaptation (2026-10-11)**: `analyze` and `usage-report` now work on both
 * Claude Code and WorkBuddy. When CLI is unavailable, falls back to directory scanning (WorkBuddy
 * constructs equivalent data from marketplace directory and installed_plugins.json).
 * `install` / `uninstall` actions still depend on `claude plugin install` CLI, which is not
 * available on WorkBuddy -- WorkBuddy users should use the host-provided tool
 * `search_and_install_skills` instead. See `modules/stages/bootstrap.md` §9 for this division.
 *
 * Design decisions (confirmed by user 2026-10-03):
 * 1. Trigger: Bootstrap stage, after task initialization
 * 2. Decision basis: Agent's own judgment (not hardcoded keywords)
 * 3. Post-install report: output one log line immediately after install, summarize at Ship
 *
 * Workflow:
 * 1. Collect info: task description, available plugins, installed plugins
 * 2. Impact analysis for installed plugins (P0-1): scan directory structure, extract component counts, calculate risk level
 * 3. Generate judgment prompt (with impact summary and scope constraints P0-2), provide to Agent for analysis
 * 4. Agent outputs installation plan (JSON format)
 * 5. Script executes installation and records to state.json
 *
 * Commands:
 * analyze - generate judgment prompt (with impact analysis and scope constraints)
 * install - execute installation plan
 * uninstall - uninstall plugins installed but unused in collab snapshot
 * usage-report - output plugin usage report (installed vs skills in collab snapshot)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');
const { execFile } = require('child_process');

const STATE_PATH = path.join(process.cwd(), '.hello-dev', 'state.json');
const PLUGIN_CACHE_PATH = path.join(process.cwd(), '.hello-dev', 'plugin-cache.json');

// Host-aware plugin roots (Tier 1 read-only adaptation, 2026-10-11).
// `pluginRoots()` returns the cache + marketplace paths for every host detected on
// this machine. On a pure-Claude host there is one, on pure-WorkBuddy one, on a
// dual-host machine both. Traversal functions below iterate all of them.
const { pluginRoots, detectHost } = require('./lib/host.js');
const { parseFrontmatter } = require('./detect-skills.js');

// Legacy single-host constants. Retained for any downstream consumer that reads
// them directly; traversal now uses `pluginRoots()` so they no longer gate the
// analyze / usage-report paths.
const PLUGIN_CACHE_BASE = path.join(os.homedir(), '.claude', 'plugins', 'cache');
const PLUGIN_MARKETPLACE_BASE = path.join(os.homedir(), '.claude', 'plugins', 'marketplaces');

// Risk levels
const RISK = { SAFE: 'safe', MODERATE: 'moderate', ELEVATED: 'elevated' };

// Scope constraints (P0-2)
const MAX_INSTALL_PER_RUN = 3;

// Utility functions 

/**
 * Execute command and write output to temp file (avoid pipe buffer limits)
 */
function execCommandToFile(command) {
 const tmpFile = path.join(os.tmpdir(), `plugin-list-${Date.now()}.json`);
 try {
 execSync(`${command} > ${tmpFile}`, { stdio: 'pipe' });
 const content = fs.readFileSync(tmpFile, 'utf8');
 fs.unlinkSync(tmpFile);
 return content;
 } catch (error) {
 if (fs.existsSync(tmpFile)) {
 fs.unlinkSync(tmpFile);
 }
 throw error;
 }
}

/**
 * Safely read JSON file, return null on failure
 */
function safeReadJson(filePath) {
 try {
 return JSON.parse(fs.readFileSync(filePath, 'utf8'));
 } catch {
 return null;
 }
}

/**
 * List subdirectory names under directory
 */
function listSubdirs(dir) {
 try {
 return fs.readdirSync(dir, { withFileTypes: true })
 .filter(e => e.isDirectory() || e.isSymbolicLink())
 .map(e => e.name)
 .filter(n => !n.startsWith('.'));
 } catch {
 return [];
 }
}

/**
 * Recursively count matching files
 */
function countFiles(dir, pattern) {
 let count = 0;
 try {
 const entries = fs.readdirSync(dir, { withFileTypes: true });
 for (const e of entries) {
 const full = path.join(dir, e.name);
 if (e.isDirectory()) {
 count += countFiles(full, pattern);
 } else if (e.isFile() && pattern.test(e.name)) {
 count++;
 }
 }
 } catch { /* ignore */ }
 return count;
}

/**
 * Safely read hooks.json and extract hook type list
 */
function extractHookTypes(hooksJsonPath) {
 const data = safeReadJson(hooksJsonPath);
 if (!data || !data.hooks) return [];
 return Object.keys(data.hooks);
}

/**
 * Safely read .mcp.json and extract MCP server count
 */
function countMcpServers(mcpJsonPath) {
 // .mcp.json has two formats:
 // 1. { "mcpServers": { "name": {...} } } (standard format, e.g. discord/telegram)
 // 2. { "server-name": { "type": "http", ... } } (flat format, e.g. example-plugin/github)
 const data = safeReadJson(mcpJsonPath);
 if (!data) return 0;
 if (data.mcpServers && typeof data.mcpServers === 'object') {
 return Object.keys(data.mcpServers).length;
 }
 // Flat format: each top-level key is a server
 return Object.keys(data).length;
}

// P0-1: Plugin impact analysis 

/**
 * Scan single plugin directory, extract component info and risk level
 *
 * @param {string} pluginDir - plugin root directory
 * @returns {{ skills: number, agents: number, commands: number, hooks: string[], mcpServers: number, riskLevel: string, impactSummary: string } | null}
 */
function scanPluginDirectory(pluginDir) {
 if (!fs.existsSync(pluginDir)) return null;

 // 1. Count skills (SKILL.md files under skills/)
 const skillsDir = path.join(pluginDir, 'skills');
 const skills = countFiles(skillsDir, /^SKILL\.md$/);

 // 2. Count agents (.md files under agents/)
 const agentsDir = path.join(pluginDir, 'agents');
 const agents = countFiles(agentsDir, /\.md$/);

 // 3. Count commands (.md files under commands/)
 const commandsDir = path.join(pluginDir, 'commands');
 const commands = countFiles(commandsDir, /\.md$/);

 // 4. Extract hooks info
 const hooksJsonPath = path.join(pluginDir, 'hooks', 'hooks.json');
 const hooks = fs.existsSync(hooksJsonPath) ? extractHookTypes(hooksJsonPath) : [];

 // 5. Extract MCP servers count
 const mcpJsonPath = path.join(pluginDir, '.mcp.json');
 const mcpServers = fs.existsSync(mcpJsonPath) ? countMcpServers(mcpJsonPath) : 0;

 // 6. Calculate risk level
 const riskLevel = classifyRisk({ hooks, mcpServers });

 // 7. Generate impact summary
 const impactSummary = formatImpactSummary({ skills, agents, commands, hooks, mcpServers, riskLevel });

 return { skills, agents, commands, hooks, mcpServers, riskLevel, impactSummary };
}

/**
 * Risk classification (P0-1 core logic)
 *
 * - safe: only skills/agents/commands, no hooks no MCP
 * - moderate: has hooks (only SessionStart/UserPromptSubmit/Stop etc. that don't modify behavior) or has commands
 * - elevated: has MCP servers or has PreToolUse/PostToolUse hooks
 */
function classifyRisk({ hooks, mcpServers }) {
 const INTERACTIVE_HOOKS = ['PreToolUse', 'PostToolUse'];

 // elevated: has MCP servers or has PreToolUse/PostToolUse hooks
 if (mcpServers > 0) return RISK.ELEVATED;
 if (hooks.some(h => INTERACTIVE_HOOKS.includes(h))) return RISK.ELEVATED;

 // moderate: has any hooks or has commands
 if (hooks.length > 0) return RISK.MODERATE;

 // safe: everything else
 return RISK.SAFE;
}

/**
 * Generate human-readable impact summary
 */
function formatImpactSummary({ skills, agents, commands, hooks, mcpServers, riskLevel }) {
 const parts = [];
 if (skills > 0) parts.push(`${skills} skill(s)`);
 if (agents > 0) parts.push(`${agents} agent(s)`);
 if (commands > 0) parts.push(`${commands} command(s)`);
 if (hooks.length > 0) parts.push(`hooks: ${hooks.join(', ')}`);
 if (mcpServers > 0) parts.push(`${mcpServers} MCP server(s)`);

 const components = parts.length > 0 ? parts.join(', ') : 'empty';
 return `[${riskLevel.toUpperCase()}] ${components}`;
}

/**
 * Get cached directory path for installed plugins.
 *
 * Iterates all host roots (Claude Code, WorkBuddy, or both on dual-host).
 * Each result carries a `host` field so callers can distinguish which host the
 * plugin belongs to.
 */
function getInstalledPluginDirs() {
 const results = [];
 for (const root of pluginRoots()) {
   if (!fs.existsSync(root.cache)) continue;
   for (const market of listSubdirs(root.cache)) {
     for (const plugin of listSubdirs(path.join(root.cache, market))) {
       for (const version of listSubdirs(path.join(root.cache, market, plugin))) {
         results.push({
           name: plugin,
           market,
           version,
           host: root.kind,
           dir: path.join(root.cache, market, plugin, version),
         });
       }
     }
   }
 }
 return results;
}

/**
 * Get marketplace plugin directory path (not installed but available plugins).
 *
 * Iterates all host roots. Each result carries a `host` field.
 */
function getMarketplacePluginDirs() {
 const results = [];
 for (const root of pluginRoots()) {
   if (!fs.existsSync(root.marketplace)) continue;
   for (const market of listSubdirs(root.marketplace)) {
     if (market.endsWith('.bak')) continue;

     // plugins/ directory (official plugins)
     const pluginsDir = path.join(root.marketplace, market, 'plugins');
     for (const plugin of listSubdirs(pluginsDir)) {
       results.push({
         name: plugin,
         market,
         group: 'plugins',
         host: root.kind,
         dir: path.join(pluginsDir, plugin),
       });
     }

     // external_plugins/ directory (external plugins)
     const externalDir = path.join(root.marketplace, market, 'external_plugins');
     for (const plugin of listSubdirs(externalDir)) {
       results.push({
         name: plugin,
         market,
         group: 'external_plugins',
         host: root.kind,
         dir: path.join(externalDir, plugin),
       });
     }
   }
 }
 return results;
}

/**
 * Perform impact analysis on all installed plugins
 *
 * @returns {Map<string, object>} pluginName → scan result
 */
function analyzeInstalledPlugins() {
 const analysis = new Map();
 for (const { name, dir } of getInstalledPluginDirs()) {
 const scan = scanPluginDirectory(dir);
 if (scan) analysis.set(name, scan);
 }
 return analysis;
}

/**
 * Perform impact analysis on all marketplace plugins (only analyze those on disk)
 *
 * @returns {Map<string, object>} pluginName → scan result
 */
function analyzeMarketplacePlugins() {
 const analysis = new Map();
 for (const { name, dir } of getMarketplacePluginDirs()) {
 const scan = scanPluginDirectory(dir);
 if (scan) analysis.set(name, scan);
 }
 return analysis;
}

// Original functionality 

/**
 * Get task description from state.json
 */
function getTaskDescription() {
 if (!fs.existsSync(STATE_PATH)) {
 throw new Error(`State file not found: ${STATE_PATH}`);
 }

 const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
 if (!state.task || !state.task.name) {
 throw new Error('No task name in state file');
 }

 return state.task.name;
}

/**
 * Get task type from state.json
 */
function getTaskType() {
 if (!fs.existsSync(STATE_PATH)) return 'other';
 const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
 return (state.task && state.task.type) || 'other';
}

/**
 * Get available plugins list (P3-1: supports offline cache fallback)
 */
function getAvailablePlugins() {
 // Tier 1: Try CLI first (Claude Code host)
 try {
   const output = execCommandToFile('claude plugin list --available --json');
   const data = JSON.parse(output);
   const plugins = data.available || [];
   // Cache after successful fetch
   savePluginCache(plugins);
   return plugins;
 } catch (error) {
   // CLI failed (expected on WorkBuddy hosts where `claude` command does not exist)
   const host = detectHost();
   if (host === 'workbuddy' || host === 'dual') {
     console.log('Claude CLI unavailable; falling back to marketplace directory scan (host=' + host + ')');
     return getAvailablePluginsFromDisk();
   }
   console.error('Failed to get available plugins:', error.message);
   // P3-1: Fallback to cached plugins when CLI fails
   const cached = loadPluginCache();
   if (cached) {
     console.log('Falling back to cached plugin list');
     return cached;
   }
   console.error('No available cache, returning empty list');
   return [];
 }
}

/**
 * WorkBuddy fallback: build the available-plugins list by scanning marketplace directories.
 * Reads the first SKILL.md frontmatter found under each plugin's skills/ subtree for
 * description. Returns the same shape as `claude plugin list --available --json`.
 */
function getAvailablePluginsFromDisk() {
 const plugins = [];
 const seen = new Set();
 for (const root of pluginRoots()) {
   if (!fs.existsSync(root.marketplace)) continue;
   for (const market of listSubdirs(root.marketplace)) {
     if (market.endsWith('.bak')) continue;
     for (const subdir of ['plugins', 'external_plugins']) {
       const dir = path.join(root.marketplace, market, subdir);
       for (const pluginName of listSubdirs(dir)) {
         const id = pluginName + '@' + market;
         if (seen.has(id)) continue;
         seen.add(id);
         const description = readFirstSkillDescription(path.join(dir, pluginName));
         plugins.push({ id, name: pluginName, description: description || '(no description)' });
       }
     }
   }
 }
 return plugins;
}

/**
 * Get installed plugins list
 */
function getInstalledPlugins() {
 // Tier 1: Try CLI first (Claude Code host)
 try {
   const output = execCommandToFile('claude plugin list --json');
   const data = JSON.parse(output);
   return data.installed || [];
 } catch (error) {
   const host = detectHost();
   if (host === 'workbuddy' || host === 'dual') {
     console.log('Claude CLI unavailable; falling back to installed_plugins.json (host=' + host + ')');
     return getInstalledPluginsFromDisk();
   }
   console.error('Failed to get installed plugins:', error.message);
   return [];
 }
}

/**
 * WorkBuddy fallback: build the installed-plugins list from installed_plugins.json
 * (pure JSON file at ~/.workbuddy/plugins/installed_plugins.json). Returns the same
 * shape as `claude plugin list --json`.
 */
function getInstalledPluginsFromDisk() {
 const results = [];
 for (const root of pluginRoots()) {
   if (root.kind !== 'workbuddy') continue;
   const jsonPath = path.join(path.dirname(root.cache), 'installed_plugins.json');
   if (!fs.existsSync(jsonPath)) continue;
   let data;
   try { data = JSON.parse(fs.readFileSync(jsonPath, 'utf8')); } catch { continue; }
   const plugins = data.plugins || {};
   for (const [id, entries] of Object.entries(plugins)) {
     const entry = Array.isArray(entries) && entries.length > 0 ? entries[0] : entries;
     const name = id.split('@')[0];
     // Try to read description from the installed skill's SKILL.md
     const installPath = entry && entry.installPath;
     const description = installPath ? readFirstSkillDescription(installPath) : '';
     results.push({ id, name, description: description || '(no description)' });
   }
 }
 return results;
}

/**
 * Read the description from the first SKILL.md found under a plugin directory.
 * Scans up to 2 levels deep (skills/<name>/SKILL.md or direct SKILL.md).
 * Returns empty string if no description found.
 */
function readFirstSkillDescription(pluginDir) {
 if (!fs.existsSync(pluginDir)) return '';
 // Direct SKILL.md at root
 const direct = path.join(pluginDir, 'SKILL.md');
 if (fs.existsSync(direct)) {
   try {
     const fm = parseFrontmatter(fs.readFileSync(direct, 'utf8'));
     if (fm.description) return String(fm.description);
   } catch { /* ignore parse errors */ }
 }
 // skills/<name>/SKILL.md
 const skillsDir = path.join(pluginDir, 'skills');
 if (fs.existsSync(skillsDir)) {
   for (const skillName of listSubdirs(skillsDir)) {
     const skillMd = path.join(skillsDir, skillName, 'SKILL.md');
     if (fs.existsSync(skillMd)) {
       try {
         const fm = parseFrontmatter(fs.readFileSync(skillMd, 'utf8'));
         if (fm.description) return String(fm.description);
       } catch { /* ignore parse errors */ }
     }
   }
 }
 return '';
}

/**
 * Generate judgment prompt (P0-1 + P0-2 + P2-2 + P3-2 enhanced version)
 */
function generateJudgmentPrompt(taskDescription, availablePlugins, installedPlugins, installedAnalysis, marketplaceAnalysis, taskType, pluginWeights) {
 const installedIds = new Set(installedPlugins.map(p => p.id));
 const uninstalledPlugins = availablePlugins.filter(p => !installedIds.has(p.id));

 // Build "Already Installed & Relevant" section (user requirement: prioritize installed skills)
 let installedRelevantSection = '';
 if (installedPlugins.length > 0 && installedAnalysis.size > 0) {
   installedRelevantSection = '\n## Already Installed Plugins — Consider Using These First\n\n';
   installedRelevantSection += 'Before installing new plugins, check if these already-installed plugins can meet the requirement:\n\n';
   installedRelevantSection += '| Plugin | Risk Level | Component Summary | Historical Usage |\n';
   installedRelevantSection += '|------|----------|----------|------------|\n';
   for (const p of installedPlugins) {
     const scan = installedAnalysis.get(p.name) || installedAnalysis.get(p.id);
     const weight = pluginWeights.get(p.name) || pluginWeights.get(p.id);
     const weightStr = weight ? `${weight.rate}% (${weight.note})` : 'No historical data';
     if (scan) {
       installedRelevantSection += `| ${p.name} | ${scan.riskLevel} | ${scan.impactSummary} | ${weightStr} |\n`;
     }
   }
   installedRelevantSection += '\n';
 }

 // Build impact analysis table for installed plugins
 let installedAnalysisSection = '';
 if (installedAnalysis.size > 0) {
 installedAnalysisSection = '\n## Installed Plugin Impact Analysis\n\n';
 installedAnalysisSection += '| Plugin | Risk Level | Component Summary | Historical Usage |\n';
 installedAnalysisSection += '|------|----------|----------|------------|\n';
 for (const p of installedPlugins) {
 const scan = installedAnalysis.get(p.name) || installedAnalysis.get(p.id);
 const weight = pluginWeights.get(p.name) || pluginWeights.get(p.id);
 const weightStr = weight ? `${weight.rate}% (${weight.note})` : 'No historical data';
 if (scan) {
 installedAnalysisSection += `| ${p.name} | ${scan.riskLevel} | ${scan.impactSummary} | ${weightStr} |\n`;
 } else {
 installedAnalysisSection += `| ${p.name} | unknown | Not analyzed | ${weightStr} |\n`;
 }
 }
 }

 // P2-2: Historical usage feedback
 let historicalFeedback = '';
 if (pluginWeights.size > 0) {
 const unusedPlugins = [];
 for (const [name, weight] of pluginWeights) {
 if (weight.rate === 0) {
 unusedPlugins.push(name);
 }
 }
 if (unusedPlugins.length > 0) {
 historicalFeedback = `\n## Historical Usage Feedback (P2-2)\n\nThe following plugins were not used after last install (usage rate 0%), please choose carefully:\n`;
 for (const name of unusedPlugins) {
 historicalFeedback += `- ${name}\n`;
 }
 historicalFeedback += `\nRecommend prioritizing plugins with high historical usage, avoid repeatedly installing unused plugins.\n`;
 }
 }

 // Build impact analysis list for available plugins (P0-1) — limited to top 10 by relevance
 // User requirement: avoid information overload (239 plugins → top 10)
 const MAX_AVAILABLE_DISPLAY = 10;
 const sortedAvailable = [...uninstalledPlugins].sort((a, b) => {
   const scanA = marketplaceAnalysis.get(a.name) || marketplaceAnalysis.get(a.id);
   const scanB = marketplaceAnalysis.get(b.name) || marketplaceAnalysis.get(b.id);
   const riskOrder = { safe: 0, moderate: 1, elevated: 2 };
   const riskA = scanA ? riskOrder[scanA.riskLevel] ?? 3 : 3;
   const riskB = scanB ? riskOrder[scanB.riskLevel] ?? 3 : 3;
   return riskA - riskB; // safe first
 });
 const topAvailable = sortedAvailable.slice(0, MAX_AVAILABLE_DISPLAY);
 let availableWithAnalysis = '';
 for (const p of topAvailable) {
   const scan = marketplaceAnalysis.get(p.name) || marketplaceAnalysis.get(p.id);
   const analysisStr = scan ? `\n Impact: ${scan.impactSummary}` : '\n Impact: Not analyzed (no cache on disk)';
   availableWithAnalysis += `- **${p.name}** (${p.id})\n ${p.description}${analysisStr}\n\n`;
 }
 if (uninstalledPlugins.length > MAX_AVAILABLE_DISPLAY) {
   availableWithAnalysis += `\n... and ${uninstalledPlugins.length - MAX_AVAILABLE_DISPLAY} more (not shown to avoid information overload). Run \`node scripts/search-install-skill.js analyze --all\` to see full list.\n`;
 }

 // P0-2: Scope constraints
 const scopeConstraints = `
## Scope Constraints

1. **Check installed first**: before recommending any new plugin, explicitly state which already-installed plugins were considered and why they are insufficient (if any)
2. **Max installs per run**: at most ${MAX_INSTALL_PER_RUN} plugins
3. **Priority order**: safe > moderate > elevated (prefer low-risk plugins)
4. **Task matching**: current task type is \`${taskType}\`, don't recommend pure testing/documentation plugins (if task type is implementation)
5. **elevated plugins need extra justification**: when selecting elevated level plugins, must explain in reason why safe/moderate plugins cannot meet requirements
6. **Scope marking (P3-2)**: each plugin needs \`scope\` field: \`permanent\` (long-term tool, cross-task usage) or \`temporary\` (temporary tool, this task only)
`;

 let prompt = `# Plugin Installation Decision

## Task Description
${taskDescription}
${installedRelevantSection}${installedAnalysisSection}${historicalFeedback}
## Already Installed Plugins (full list)
${installedPlugins.map(p => `- ${p.name} (${p.id})`).join('\n') || '(none)'}

## Available But Not Installed Plugins (top ${MAX_AVAILABLE_DISPLAY} by risk level)
${availableWithAnalysis || '(none)'}
${scopeConstraints}
## Decision Requirements

**Priority order**:
1. **Check already-installed plugins first** — before installing anything new, verify whether an already-installed plugin can meet the requirement
2. Only install new plugins when no installed plugin covers the need
3. Does the task explicitly require a specific plugin's functionality not yet installed?
4. Does the task involve domain-specific operations (e.g. database, security scanning, deployment)?
5. Are there plugins that can significantly improve task completion efficiency or quality?
6. Prefer safe level plugins, moderate next, elevated needs extra justification
7. Prefer plugins with high historical usage (avoid repeatedly installing unused plugins)

## Risk Level Description

- **safe**: only skills/agents/commands, no hooks no MCP. Does not modify session behavior, safest.
- **moderate**: has hooks (like SessionStart etc. that don't modify tool behavior) or has commands. Slight session impact.
- **elevated**: has MCP servers or has PreToolUse/PostToolUse hooks. Intercepts tool calls or connects to external services.

## Scope Description (P3-2)

- **permanent**: long-term tools, cross-task usage (e.g. hello-dev, superpowers)
- **temporary**: temporary tools, this task only (e.g. domain-specific test tools, one-time scripts)

Ship stage will suggest cleaning up temporary plugins.

## Output Format

Please output a JSON object in the following format:

\`\`\`json
{
 "need_install": true/false,
 "reason": "Decision rationale",
 "plugins": [
 {
 "id": "Plugin ID",
 "name": "Plugin name",
 "reason": "Specific reason for selecting this plugin",
 "risk_level": "safe/moderate/elevated",
 "impact": "Impact summary",
 "scope": "permanent/temporary"
 }
 ]
}
\`\`\`

Output only JSON, no other content.
`;

 return prompt;
}

// P3-1: Offline cache 

/**
 * Save available plugins list to cache
 */
function savePluginCache(plugins) {
 try {
 const cache = {
 timestamp: new Date().toISOString(),
 plugins: plugins
 };
 fs.writeFileSync(PLUGIN_CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
 console.log(`Cached ${plugins.length} available plugins to ${PLUGIN_CACHE_PATH}`);
 } catch (error) {
 console.error('Failed to save plugin cache:', error.message);
 }
}

/**
 * Load available plugins list from cache
 */
function loadPluginCache() {
 try {
 if (!fs.existsSync(PLUGIN_CACHE_PATH)) return null;
 const cache = JSON.parse(fs.readFileSync(PLUGIN_CACHE_PATH, 'utf8'));
 const age = Date.now() - new Date(cache.timestamp).getTime();
 const ageHours = Math.round(age / (1000 * 60 * 60));
 console.log(`Using cached plugin list (${ageHours} hours old, ${cache.plugins.length} plugins)`);
 return cache.plugins;
 } catch (error) {
 console.error('Failed to load plugin cache:', error.message);
 return null;
 }
}

// P2-1: Compatibility pre-check 

/**
 * Check for naming conflicts between plugins to be installed
 *
 * Scan each plugin's skills/agents/commands/hooks/MCP servers,
 * Detect same-name components. Return conflict list when conflicts found.
 *
 * @param {string[]} pluginIds - list of plugin IDs to install
 * @returns {{ hasConflict: boolean, conflicts: Array<{type, name, plugins}> }}
 */
function checkPluginConflicts(pluginIds) {
 const conflicts = [];

 // Collect all component names for each plugin
 const componentsByPlugin = new Map();

 for (const pluginId of pluginIds) {
 const pluginDir = findInstalledPluginDir(pluginId);
 if (!pluginDir) continue;

 const components = new Set();

 // Collect skills names
 const skillsDir = path.join(pluginDir, 'skills');
 if (fs.existsSync(skillsDir)) {
 for (const skill of listSubdirs(skillsDir)) {
 components.add(`skill:${skill}`);
 }
 }

 // Collect agents names
 const agentsDir = path.join(pluginDir, 'agents');
 if (fs.existsSync(agentsDir)) {
 try {
 const agentFiles = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));
 for (const file of agentFiles) {
 components.add(`agent:${file.replace('.md', '')}`);
 }
 } catch { /* ignore */ }
 }

 // Collect commands names
 const commandsDir = path.join(pluginDir, 'commands');
 if (fs.existsSync(commandsDir)) {
 try {
 const cmdFiles = fs.readdirSync(commandsDir).filter(f => f.endsWith('.md'));
 for (const file of cmdFiles) {
 components.add(`command:${file.replace('.md', '')}`);
 }
 } catch { /* ignore */ }
 }

 // Collect hook types
 const hooksJsonPath = path.join(pluginDir, 'hooks', 'hooks.json');
 if (fs.existsSync(hooksJsonPath)) {
 const hooks = extractHookTypes(hooksJsonPath);
 for (const hook of hooks) {
 components.add(`hook:${hook}`);
 }
 }

 // Collect MCP server names
 const mcpJsonPath = path.join(pluginDir, '.mcp.json');
 if (fs.existsSync(mcpJsonPath)) {
 const data = safeReadJson(mcpJsonPath);
 if (data) {
 if (data.mcpServers) {
 for (const server of Object.keys(data.mcpServers)) {
 components.add(`mcp:${server}`);
 }
 } else {
 // Flat format
 for (const server of Object.keys(data)) {
 components.add(`mcp:${server}`);
 }
 }
 }
 }

 componentsByPlugin.set(pluginId, components);
 }

 // Detect conflicts: same component name appears in multiple plugins
 const componentToPlugins = new Map();
 for (const [pluginId, components] of componentsByPlugin) {
 for (const comp of components) {
 if (!componentToPlugins.has(comp)) {
 componentToPlugins.set(comp, []);
 }
 componentToPlugins.get(comp).push(pluginId);
 }
 }

 for (const [comp, plugins] of componentToPlugins) {
 if (plugins.length > 1) {
 const [type, name] = comp.split(':');
 conflicts.push({ type, name, plugins });
 }
 }

 return { hasConflict: conflicts.length > 0, conflicts };
}

/**
 * Find directory path for installed plugin.
 *
 * Searches all host roots; returns the first match (host-agnostic lookup).
 * Returns null if not found in any root.
 */
function findInstalledPluginDir(pluginId) {
 for (const root of pluginRoots()) {
   if (!fs.existsSync(root.cache)) continue;
   for (const market of listSubdirs(root.cache)) {
     for (const plugin of listSubdirs(path.join(root.cache, market))) {
       if (plugin === pluginId || plugin === pluginId.split('@')[0]) {
         for (const version of listSubdirs(path.join(root.cache, market, plugin))) {
           return path.join(root.cache, market, plugin, version);
         }
       }
     }
   }
 }
 return null;
}

// P2-2: Historical feedback loop 

/**
 * Calculate historical usage weight for plugins
 *
 * Extract usage from historical pluginInstallationResult,
 * Compare pluginInstallationResult.installed vs collaboration.skills,
 * Calculate usage rate for each plugin.
 *
 * @returns {Map<string, {used: number, total: number, rate: number}>}
 */
function calculatePluginWeights() {
 const weights = new Map();

 if (!fs.existsSync(STATE_PATH)) return weights;

 try {
 const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
 const installResult = state.pluginInstallationResult;
 const collab = state.collaboration;

 if (!installResult || !installResult.installed || installResult.installed.length === 0) {
 return weights;
 }

 if (!collab || !collab.skills) {
 // No collab snapshot, all plugins marked as 'unknown'
 for (const p of installResult.installed) {
 const pluginName = p.name || p.id;
 weights.set(pluginName, { used: 0, total: 1, rate: 0, note: 'No collab snapshot' });
 }
 return weights;
 }

 // Count skills per plugin in collab
 const collabPluginSkills = new Map();
 for (const skill of collab.skills) {
 if (skill.source && skill.source.startsWith('plugin:')) {
 const pluginName = skill.source.replace('plugin:', '');
 const current = collabPluginSkills.get(pluginName) || 0;
 collabPluginSkills.set(pluginName, current + 1);
 }
 }

 // Calculate usage rate for each installed plugin
 for (const p of installResult.installed) {
 const pluginName = p.name || p.id;
 const skillsInCollab = collabPluginSkills.get(pluginName) || 0;
 const isUsed = skillsInCollab > 0;

 weights.set(pluginName, {
 used: isUsed ? 1 : 0,
 total: 1,
 rate: isUsed ? 100 : 0,
 skillsInCollab,
 note: isUsed ? `Using ${skillsInCollab} skills` : 'Not used'
 });
 }
 } catch (error) {
 console.error('Failed to calculate plugin usage rate:', error.message);
 }

 return weights;
}

/**
 * Install plugin
 */
function installPlugin(pluginId) {
 return new Promise((resolve, reject) => {
 execFile('claude', ['plugin', 'install', pluginId], { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
 if (error) {
 reject(new Error(`Failed to install plugin ${pluginId}: ${error.message}`));
 return;
 }
 resolve({ id: pluginId, success: true });
 });
 });
}

/**
 * Uninstall plugin
 */
function uninstallPlugin(pluginId) {
 return new Promise((resolve, reject) => {
 execFile('claude', ['plugin', 'uninstall', pluginId, '-y'], { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
 if (error) {
 reject(new Error(`Failed to uninstall plugin ${pluginId}: ${error.message}`));
 return;
 }
 resolve({ id: pluginId, success: true });
 });
 });
}

// Main flow 

async function main() {
 const args = process.argv.slice(2);
 const action = args[0] || 'analyze';

 switch (action) {
 case 'analyze':
 await analyze();
 break;
 case 'install':
 await install();
 break;
 case 'uninstall':
 await uninstall();
 break;
 case 'usage-report':
 await usageReport();
 break;
 default:
 console.error(`Unknown action: ${action}`);
 console.error('Available actions: analyze, install, uninstall, usage-report');
 process.exit(1);
 }
}

/**
 * Analysis phase: collect info, impact analysis, generate judgment prompt
 */
async function analyze() {
 try {
 console.log('Starting analysis of plugins needed for task...');

 // 1. Get task description
 const taskDescription = getTaskDescription();
 const taskType = getTaskType();
 console.log(`Task: ${taskDescription} (type: ${taskType})\n`);

 // 2. Get available and installed plugins
 console.log('Fetching plugin list...');
 const [availablePlugins, installedPlugins] = await Promise.all([
 getAvailablePlugins(),
 getInstalledPlugins()
 ]);

 console.log(`Available plugins: ${availablePlugins.length}`);
 console.log(`Installed plugins: ${installedPlugins.length}`);

 // 3. P0-1: Impact analysis
 console.log('\nScanning plugin directory structure...');
 const installedAnalysis = analyzeInstalledPlugins();
 const marketplaceAnalysis = analyzeMarketplacePlugins();
 console.log(`Analyzed: ${installedAnalysis.size} installed plugins, ${marketplaceAnalysis.size} marketplace plugins`);

 // P2-2: Calculate historical usage weights
 const pluginWeights = calculatePluginWeights();
 if (pluginWeights.size > 0) {
 console.log(`Calculated historical usage for ${pluginWeights.size} plugins`);
 }

 // 4. Generate judgment prompt (with impact summary, scope constraints, historical feedback, scope marking)
 const prompt = generateJudgmentPrompt(
 taskDescription, availablePlugins, installedPlugins,
 installedAnalysis, marketplaceAnalysis, taskType, pluginWeights
 );

 // 5. Save prompt to temp file
 const promptPath = path.join(process.cwd(), '.hello-dev', 'plugin-judgment-prompt.md');
 fs.writeFileSync(promptPath, prompt, 'utf8');

 console.log('\nAnalysis complete');
 console.log(`Judgment prompt saved to: ${promptPath}`);

 // Output risk summary
 const riskCounts = { safe: 0, moderate: 0, elevated: 0 };
 for (const [, scan] of marketplaceAnalysis) {
 riskCounts[scan.riskLevel] = (riskCounts[scan.riskLevel] || 0) + 1;
 }
 console.log(`\nMarketplace risk distribution: safe=${riskCounts.safe}, moderate=${riskCounts.moderate}, elevated=${riskCounts.elevated}`);

 console.log('\nNext steps:');
 console.log('1. Have Agent read and analyze the above prompt');
 console.log('2. Agent outputs installation plan (JSON format)');
 console.log('3. Save installation plan to .hello-dev/state.json pluginInstallationPlan field');
 console.log('4. Run: node scripts/search-install-skill.js install');

 } catch (error) {
 console.error('Analysis failed:', error.message);
 process.exit(1);
 }
}

/**
 * Installation phase: execute installation plan
 */
async function install() {
  try {
    // Host check: install requires `claude plugin install` CLI which is Claude Code only.
    // On non-Claude hosts (WorkBuddy, dual), output guidance instead of failing.
    const { detectHost } = require('./lib/host.js');
    const host = detectHost();
    if (host !== 'claude') {
      console.log('[SKIP] install: `claude plugin install` requires Claude Code CLI (detected host: ' + host + ').');
      console.log('  On WorkBuddy, use the host-provided tool `search_and_install_skills` instead.');
      console.log('  The `analyze` command still works for generating judgment prompts on any host.');
      return;
    }

    console.log('Starting plugin installation...');

 // 1. Read state
 if (!fs.existsSync(STATE_PATH)) {
 throw new Error(`State file not found: ${STATE_PATH}`);
 }

 const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));

 // 2. Read installation plan
 const plan = state.pluginInstallationPlan;
 if (!plan) {
 console.log('No installation plan, skipping installation');
 return;
 }

 if (!plan.need_install) {
 console.log(`No plugins needed: ${plan.reason}`);
 return;
 }

 if (!plan.plugins || plan.plugins.length === 0) {
 console.log('No plugins in installation plan');
 return;
 }

 // P0-2: Scope constraints check
 if (plan.plugins.length > MAX_INSTALL_PER_RUN) {
 console.log(`Warning: installation plan contains ${plan.plugins.length} plugins, exceeds limit ${MAX_INSTALL_PER_RUN}`);
 console.log(`Will only install first ${MAX_INSTALL_PER_RUN}`);
 plan.plugins = plan.plugins.slice(0, MAX_INSTALL_PER_RUN);
 }

 // P2-1: Compatibility pre-check
 console.log('Running compatibility pre-check...');
 const pluginIds = plan.plugins.map(p => p.id);
 const conflictCheck = checkPluginConflicts(pluginIds);
 if (conflictCheck.hasConflict) {
 console.error('\n Detected plugin conflicts, blocking installation:');
 for (const conflict of conflictCheck.conflicts) {
 console.error(` - ${conflict.type}:${conflict.name} duplicated in [${conflict.plugins.join(', ')}]`);
 }
 console.error('\nPlease remove conflicting plugins from installation plan, or choose alternatives');
 return;
 }
 console.log(' Compatibility pre-check passed\n');

 console.log(`Decision rationale: ${plan.reason}\n`);
 console.log(`About to install ${plan.plugins.length} plugins:`);
 plan.plugins.forEach((p, i) => {
 console.log(` ${i + 1}. ${p.name} (${p.id})`);
 if (p.risk_level) console.log(` Risk: ${p.risk_level}`);
 console.log(` Reason: ${p.reason}`);
 });
 console.log();

 // 3. Execute installation
 const installed = [];
 const failed = [];

 for (const plugin of plan.plugins) {
 try {
 console.log(`Installing ${plugin.name}...`);
 await installPlugin(plugin.id);
 console.log(`Installed: ${plugin.name}\n`);
 // P3-2: Record scope (permanent/temporary)
 installed.push({
 ...plugin,
 scope: plugin.scope || 'permanent' // Default permanent
 });
 } catch (error) {
 console.error(`Installation failed: ${plugin.name}`);
 console.error(` ${error.message}\n`);
 failed.push({ ...plugin, error: error.message });
 }
 }

 // 4. Record installation results to state.json
 state.pluginInstallationResult = {
 timestamp: new Date().toISOString(),
 installed,
 failed,
 summary: {
 total: plan.plugins.length,
 success: installed.length,
 failure: failed.length
 }
 };

 fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');

 console.log('');
 console.log(`Installation complete: ${installed.length}/${plan.plugins.length}`);
 if (failed.length > 0) {
 console.log(`Failed: ${failed.length}`);
 failed.forEach(p => console.log(` - ${p.name}: ${p.error}`));
 }
 console.log(`Results recorded to state.json`);

 // 5. Update collaboration matrix
 if (installed.length > 0) {
 try {
 console.log('\nUpdating collaboration matrix...');
 execSync('node scripts/detect-skills.js --write', { stdio: 'inherit' });
 console.log('Collaboration matrix updated');
 } catch (error) {
 console.error('Failed to update collaboration matrix (does not affect installation):', error.message);
 }
 }

 } catch (error) {
 console.error('Installation failed:', error.message);
 process.exit(1);
 }
}

/**
 * P1-1: Uninstall command
 *
 * Read state.json pluginInstallationResult.installed list,
 * Compare collab snapshot, identify installed_but_unused plugins, generate and execute uninstall recommendations.
 */
async function uninstall() {
  try {
    // Host check: uninstall requires `claude plugin uninstall` CLI which is Claude Code only.
    const { detectHost } = require('./lib/host.js');
    const host = detectHost();
    if (host !== 'claude') {
      console.log('[SKIP] uninstall: `claude plugin uninstall` requires Claude Code CLI (detected host: ' + host + ').');
      console.log('  On WorkBuddy, manage plugins through the host UI or `search_and_install_skills` tool.');
      return;
    }

    console.log('Checking for uninstallable plugins...');

 if (!fs.existsSync(STATE_PATH)) {
 throw new Error(`State file not found: ${STATE_PATH}`);
 }

 const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));

 // 1. Read installation results
 const installResult = state.pluginInstallationResult;
 if (!installResult || !installResult.installed || installResult.installed.length === 0) {
 console.log('No installation records, cannot determine which plugins to uninstall');
 return;
 }

 // 2. Read collab snapshot
 const collab = state.collaboration;
 if (!collab || !collab.skills) {
 console.log('No collaboration snapshot, cannot determine usage');
 console.log('Hint: first run node scripts/state.js collab detect');
 return;
 }

 // 3. Extract plugin sources appearing in collab
 const collabPluginSources = new Set();
 for (const skill of collab.skills) {
 if (skill.source && skill.source.startsWith('plugin:')) {
 collabPluginSources.add(skill.source.replace('plugin:', ''));
 }
 }

 // 4. Identify installed_but_unused
 const installed = installResult.installed;
 const unused = [];
 const inUse = [];

 for (const p of installed) {
 const pluginName = p.name || p.id;
 if (collabPluginSources.has(pluginName)) {
 inUse.push(p);
 } else {
 unused.push(p);
 }
 }

 // 5. Output report
 console.log(`\nInstalled plugins: ${installed.length}`);
 console.log(` In use: ${inUse.length}`);
 inUse.forEach(p => console.log(` - ${p.name || p.id}`));
 console.log(` Not used: ${unused.length}`);
 unused.forEach(p => console.log(` - ${p.name || p.id}`));

 if (unused.length === 0) {
 console.log('\nAll installed plugins appear in collaboration table, no need to uninstall');
 return;
 }

 // 6. Check for --execute flag
 const shouldExecute = process.argv.includes('--execute');

 if (!shouldExecute) {
 console.log('\nRecommend uninstalling the above unused plugins');
 console.log('To confirm uninstall, run: node scripts/search-install-skill.js uninstall --execute');
 return;
 }

 // 7. Execute uninstall
 console.log('\nStarting uninstall...');
 const uninstalled = [];
 const uninstallFailed = [];

 for (const p of unused) {
 const pluginId = p.id || p.name;
 try {
 console.log(`Uninstalling ${p.name || p.id}...`);
 await uninstallPlugin(pluginId);
 console.log(`Uninstalled: ${p.name || p.id}`);
 uninstalled.push(p);
 } catch (error) {
 console.error(`Uninstall failed: ${p.name || p.id} - ${error.message}`);
 uninstallFailed.push({ ...p, error: error.message });
 }
 }

 // 8. Update state.json
 installResult.uninstalled = uninstalled;
 installResult.uninstallFailed = uninstallFailed;
 installResult.uninstallTimestamp = new Date().toISOString();
 fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');

 console.log(`\nUninstall complete: ${uninstalled.length}/${unused.length}`);
 if (uninstallFailed.length > 0) {
 console.log(`Failed: ${uninstallFailed.length}`);
 }

 } catch (error) {
 console.error('Uninstall failed:', error.message);
 process.exit(1);
 }
}

/**
 * P1-2: Usage report
 *
 * Compare installed plugins vs collab snapshot skills, output usage report.
 */
async function usageReport() {
 try {
 if (!fs.existsSync(STATE_PATH)) {
 throw new Error(`State file not found: ${STATE_PATH}`);
 }

 const state = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));

 // 1. Read installation results
 const installResult = state.pluginInstallationResult;
 if (!installResult || !installResult.installed || installResult.installed.length === 0) {
 console.log('No installation records');
 return;
 }

 // 2. Read collab snapshot
 const collab = state.collaboration;
 if (!collab || !collab.skills) {
 console.log('No collaboration snapshot');
 console.log('Hint: run node scripts/state.js collab detect to generate snapshot');
 return;
 }

 // 3. Count skills per plugin in collab
 const collabPluginSkills = new Map();
 for (const skill of collab.skills) {
 if (skill.source && skill.source.startsWith('plugin:')) {
 const pluginName = skill.source.replace('plugin:', '');
 const current = collabPluginSkills.get(pluginName) || [];
 current.push(skill.name);
 collabPluginSkills.set(pluginName, current);
 }
 }

 // 4. Generate report
 const installed = installResult.installed;
 let totalSkills = 0;
 let usedSkills = 0;

 console.log(' Plugin Usage Report \n');
 console.log(`Install time: ${installResult.timestamp}`);
 console.log(`Detection time: ${collab.detectedAt}`);
 console.log(`Installed plugins: ${installed.length}`);
 console.log(`Collab skills: ${collab.skills.length}`);
 console.log('');

 for (const p of installed) {
 const pluginName = p.name || p.id;
 const skillsInCollab = collabPluginSkills.get(pluginName) || [];
 const isUsed = skillsInCollab.length > 0;

 totalSkills++;
 if (isUsed) usedSkills++;

 console.log(`[${isUsed ? 'USED' : 'UNUSED'}] ${pluginName}`);
 if (isUsed) {
 console.log(` Skills in collab: ${skillsInCollab.join(', ')}`);
 } else {
 console.log(` Not appearing in collaboration table`);
 }
 }

 // 5. Summary
 console.log('\n Summary ');
 console.log(`Usage rate: ${usedSkills}/${totalSkills} (${Math.round(usedSkills / totalSkills * 100)}%)`);

 if (usedSkills < totalSkills) {
 console.log(`\nRecommendation: ${totalSkills - usedSkills} plugins not used, consider uninstalling`);
 console.log('Run: node scripts/search-install-skill.js uninstall');
 }

 } catch (error) {
 console.error('Report generation failed:', error.message);
 process.exit(1);
 }
}

main().catch(error => {
 console.error('Execution failed:', error.message);
 process.exit(1);
});
