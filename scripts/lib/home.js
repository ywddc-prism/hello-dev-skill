'use strict';

/**
 * Hello Dev — Home-directory resolution (single source)
 *
 * Why this file exists: `os.homedir()` is not portable across the environments this
 * framework runs in, and it silently ignores an override that looks like it should work.
 * Measured on Windows (2026-10-11, Node 22):
 *
 *   HOME=C:\Users\dev            -> os.homedir() returns C:\Users\dev      (ignored HOME)
 *   USERPROFILE=<fake>          -> os.homedir() returns <fake>            (honored)
 *   HOME=<fake> only            -> os.homedir() returns the real profile  (ignored)
 *
 * So POSIX-style `HOME` does **not** relocate the home directory on win32: Node reads
 * `USERPROFILE` there. A test fixture that isolates by setting only `HOME` therefore keeps
 * reading the developer's real profile and produces permanent false results — exactly what
 * happened to `scripts/test-detect-skills.js` section 7 (5 assertions stuck red, with the
 * "symlink trap" signal silently suppressed because the real machine resolved its own skills).
 *
 * An earlier version of `detect-skills.js` half-compensated: `CLAUDE_CONFIG_DIR` was honored
 * for the `.claude` root but the `.workbuddy` root still came from `os.homedir()`. Half an
 * isolation is worse than none: the fixture looked isolated while one side kept leaking.
 *
 * Precedence (the contract; all callers inherit it):
 *   1. `HELLODEV_HOME` — explicit override. Named with the `HELLODEV_` prefix used by this
 *      repo's other override variables (HELLODEV_HOST, HELLODEV_SETTINGS, HELLODEV_SKILL_DIR,
 *      ...) so the convention stays uniform. This is the isolation hook for tests.
 *   2. `HOME` — honored on **all** platforms, not just POSIX. This is the deliberate
 *      "dual adaptation": on win32 Node ignores it, and Git Bash sets it to the real
 *      profile, so honoring it is correct in both cases and makes the two platforms behave
 *      the same way.
 *   3. `os.homedir()` — the platform API, unchanged as the final fallback.
 *
 * An empty or whitespace-only value is treated as unset, so `HELLODEV_HOME= cmd` does not
 * resolve the home directory to the current working directory.
 */

const os = require('os');
const path = require('path');

/**
 * Resolve the home directory.
 * @param {NodeJS.ProcessEnv} [env] - environment to read (injectable for tests)
 * @returns {string} absolute-ish home path, never empty
 */
function resolveHome(env = process.env) {
  for (const name of ['HELLODEV_HOME', 'HOME']) {
    const value = env && env[name];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return os.homedir();
}

/**
 * Resolve the Claude Code configuration directory.
 *
 * `CLAUDE_CONFIG_DIR` remains honored **first** because it is a real upstream convention
 * (not ours to redefine) and because existing callers/tests already rely on it. Then the
 * shared home precedence applies. The two must be resolved from the *same* home, which is
 * why this lives next to `resolveHome` rather than being re-derived per caller.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string} path to the claude config directory
 */
function resolveClaudeConfigDir(env = process.env) {
  const explicit = env && env.CLAUDE_CONFIG_DIR;
  if (typeof explicit === 'string' && explicit.trim() !== '') return explicit.trim();
  return path.join(resolveHome(env), '.claude');
}

/**
 * Resolve the WorkBuddy configuration directory.
 * Kept symmetric with `resolveClaudeConfigDir` so the two roots can never diverge again.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string} path to the workbuddy config directory
 */
function resolveWorkbuddyHome(env = process.env) {
  return path.join(resolveHome(env), '.workbuddy');
}

module.exports = { resolveHome, resolveClaudeConfigDir, resolveWorkbuddyHome };
