'use strict';

/**
 * Host detection — single source for all scripts that branch on host type.
 *
 * Returns one of: 'workbuddy' | 'claude' | 'dual'
 *
 * Priority (mirrors `scripts/detect-skills.js:detectHost`, kept in lock-step):
 *   1. `HELLODEV_HOST` env override (for testing and explicit dispatch)
 *   2. WorkBuddy signature: `WORKBUDDY_SESSION` env var, or `~/.workbuddy/` dir exists
 *      and `~/.claude/` does not
 *   3. Claude Code: default (`~/.claude/` exists or no other host signature)
 *   4. 'dual': both host signatures exist simultaneously
 *
 * Why this lives in its own file: multiple scripts need to branch on host
 * (detect-skills.js, search-install-skill.js, future host-specific tools). Keeping
 * the detection logic in one place prevents drift — if the signature rules change,
 * every consumer updates from this single source.
 */

const fs = require('fs');
const path = require('path');
const { resolveHome } = require('./home.js');

/**
 * Detect the current host type.
 * @param {NodeJS.ProcessEnv} [env] - injectable for tests
 * @returns {'workbuddy' | 'claude' | 'dual'}
 */
function detectHost(env = process.env) {
  if (env.HELLODEV_HOST) return env.HELLODEV_HOST;
  const home = resolveHome(env);
  const hasWorkbuddy = !!env.WORKBUDDY_SESSION ||
    fs.existsSync(path.join(home, '.workbuddy'));
  const hasClaude = fs.existsSync(path.join(home, '.claude'));
  if (hasWorkbuddy && hasClaude) return 'dual';
  if (hasWorkbuddy) return 'workbuddy';
  return 'claude';
}

/**
 * Return the plugin directory roots for the current host.
 * Each entry: { cache, marketplace, kind: 'workbuddy' | 'claude' }
 *
 * On 'dual' hosts (both signatures present), returns both sets so callers can
 * scan both. On pure-host hosts, returns one.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ cache: string, marketplace: string, kind: string }[]}
 */
function pluginRoots(env = process.env) {
  const home = resolveHome(env);
  const host = detectHost(env);
  const out = [];
  if (host === 'claude' || host === 'dual') {
    out.push({
      cache: path.join(home, '.claude', 'plugins', 'cache'),
      marketplace: path.join(home, '.claude', 'plugins', 'marketplaces'),
      kind: 'claude',
    });
  }
  if (host === 'workbuddy' || host === 'dual') {
    out.push({
      cache: path.join(home, '.workbuddy', 'plugins', 'cache'),
      marketplace: path.join(home, '.workbuddy', 'plugins', 'marketplaces'),
      kind: 'workbuddy',
    });
  }
  return out;
}

module.exports = { detectHost, pluginRoots };
