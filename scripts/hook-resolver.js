#!/usr/bin/env node
'use strict';

/**
 * Host-agnostic Hello Dev hook entrypoint.
 *
 * Why this exists: the frontmatter hook command must be identical for every
 * client (Codex, Claude Code, WorkBuddy). A command containing a host home
 * directory is a hard dependency on that host's install layout, so it cannot
 * be shared. This file contains no host path at all; it locates its own copy
 * of the hooks via __dirname, the same technique hooks/git-gate.js already
 * uses for its version lookup (see the SOURCE_VERSION comment there).
 *
 * Because it derives everything from __dirname, it also works when a host
 * copies or symlinks this file somewhere other than the source checkout.
 *
 * Usage (from SKILL.md frontmatter, identical on all three clients):
 *   node "path/to/hello-dev/scripts/hook-resolver.js" git-gate
 *   node "path/to/hello-dev/scripts/hook-resolver.js" opsgate
 *
 * stdin (the PreToolUse payload) is forwarded verbatim, and the gate's
 * decision JSON on stdout is passed through untouched. Exit status is the
 * gate's own: always 0 (ask/deny travel in the JSON), non-zero only when the
 * gate cannot be loaded at all.
 */
const path = require('path');

const ALLOWED = {
  'git-gate': path.join(__dirname, '..', 'hooks', 'git-gate.js'),
  opsgate: path.join(__dirname, '..', 'hooks', 'opsgate.js'),
};

const requested = process.argv[2];
if (!Object.prototype.hasOwnProperty.call(ALLOWED, requested)) {
  console.error('hook-resolver: expected one of: ' + Object.keys(ALLOWED).join(', '));
  process.exit(2);
}
process.argv = [process.argv[0], ALLOWED[requested], ...process.argv.slice(3)];
require(ALLOWED[requested]);
