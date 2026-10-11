#!/usr/bin/env node
'use strict';

/**
 * Hello Dev — Git approval gate (PreToolUse hook)
 *
 * Sole responsibility: identify git operations before the Bash tool executes,
 * returning approval decisions by risk classification.
 * - Low risk (read-only / side-effect-free) → no output, use platform default
 * - Medium / high risk → permissionDecision: "ask",
 * force approval prompt
 *
 * Design constraints (important):
 * 1. Pure functional — no file writes, no network access — to avoid slowing
 * down every Bash call.
 * (Sole exception: when HELLODEV_GIT_GATE_TRACE is explicitly enabled,
 * write one trace line for host smoke test evidence)
 * 2. Exception behavior is governed by HELLODEV_GIT_GATE_MODE, default
 * fail-open (gate never becomes a blocking source)
 * 3. Only "tightens", never "relaxes": normal path never returns allow.
 * **But fail-open is the exception**: when classification throws and
 * mode=fail-open, silently pass through. This tension with "never return
 * allow" is deliberate — fail-open's semantics are "don't lock the repo
 * when the gate itself is broken", which takes priority over tightening.
 * Set HELLODEV_GIT_GATE_MODE=fail-closed for strict blocking.
 *
 * Environment variables:
 * HELLODEV_GIT_GATE=off User-level master switch (only settable by
 * user in their shell / settings)
 * HELLODEV_GIT_GATE_MODE=... Behavior on exception, see below
 * HELLODEV_GIT_GATE_SKIP_DIRS=... Project-level switch: comma-separated dir
 * names; skip if cwd contains any (see below)
 * HELLODEV_GIT_GATE_TRACE=<path> Host smoke test probe: append one JSON
 * line per invocation
 * HELLODEV_GIT_GATE_DEBUG=1 Print parse debug info to stderr
 *
 * HELLODEV_GIT_GATE_SKIP_DIRS — project-level switch:
 * Comma-separated directory name list. When any path segment of payload.cwd
 * matches a name in the list, the gate silently passes (no interception, no
 * trace writing). Used to temporarily disable the gate in non-HelloDev projects.
 * Example: HELLODEV_GIT_GATE_SKIP_DIRS=node_modules,tmp,vendor
 * Matching rule: cwd is split by `/`, and any segment **equal to** a name in
 * the list triggers a match.
 *
 * HELLODEV_GIT_GATE_MODE — what to do on classification exception:
 * fail-open (default) Classification throws → silently pass; gate never
 * becomes a blocking source
 * fail-closed Identified as git but classification fails →
 * permissionDecision: deny
 * Invalid value Treated as fail-open with stderr warning (config
 * errors should not lock the repo)
 *
 * Neither affects: non-git commands, inputs that can't be identified as git,
 * non-Bash tools, or disabled state.
 * When unidentifiable, fail-closed would lock all malformed-input Bash calls,
 * so it doesn't do that. fail-closed only applies to "confirmed git but
 * risk cannot be determined" commands — better to block for human judgment
 * than to allow a potentially irreversible git operation. This is the only
 * place where default behavior is tightened.
 */

const OFF = process.env.HELLODEV_GIT_GATE === 'off';
const DEBUG = process.env.HELLODEV_GIT_GATE_DEBUG === '1';
const SKIP_DIRS = (process.env.HELLODEV_GIT_GATE_SKIP_DIRS || '').split(',').map(s => s.trim()).filter(Boolean);

/** Check if cwd is in the skip list. Matching: any segment of cwd split by `/` equals a name in the list. */
function shouldSkipByCwd(cwd) {
 if (!SKIP_DIRS.length || !cwd) return false;
 const segs = String(cwd).split(/[\\/]/);
 return segs.some(seg => SKIP_DIRS.includes(seg));
}

/** Behavior on exception. Default fail-open; invalid values treated as fail-open with warning (config errors should not lock the repo). */
function resolveMode() {
 const raw = (process.env.HELLODEV_GIT_GATE_MODE || 'fail-open').trim().toLowerCase();
 if (raw === 'fail-closed') return { mode: 'fail-closed', warn: null };
 if (raw === 'fail-open' || raw === '') return { mode: 'fail-open', warn: null };
 return { mode: 'fail-open', warn: `Unknown HELLODEV_GIT_GATE_MODE=${raw}, treating as fail-open` };
}
const GATE = resolveMode();

function dbg(msg) { if (DEBUG) process.stderr.write('[hello-dev-git-gate] ' + msg + '\n'); }

/**
 * Forensic standards (determining whether evidence counts):
 *
 * caller not set — Direct command-line invocation. Scripts cannot
 * distinguish this from host-registered invocations,
 * so it is **not treated as host-registered evidence**
 * and not written to trace.
 * caller=release-check — release-check self-check, proving script capability,
 * excluded.
 * caller=host — Set only by the host process when registering the
 * hook, accepted as runtime evidence.
 *
 * Why not write "unknown" traces: once the probe is enabled, any direct
 * invocation from any shell would produce records, and these invocations go
 * through the same shell environment, making them indistinguishable from
 * host-injected invocations — recording them would cause the report to treat
 * its own forensic action as "host already registered". Better one record short
 * than to create false evidence.
 */
function trace(event) {
 const p = process.env.HELLODEV_GIT_GATE_TRACE;
 if (!p) return;
 const caller = process.env.HELLODEV_GIT_GATE_CALLER;
 if (!caller) { dbg('trace skipped: caller not set, cannot distinguish from host-injected invocation'); return; }
 try {
 const fs = require('fs');
 fs.appendFileSync(p, JSON.stringify({
 at: new Date().toISOString(),
 event,
 caller, // Only account when source is explicitly declared
 mode: GATE.mode,
 pid: process.pid,
 gate: 'hello-dev/git-gate',
 sourceVersion: SOURCE_VERSION,
 }) + '\n');
 } catch (e) { dbg('trace write failed: ' + (e && e.message)); }
}

/**
 * Runtime version: find SKILL.md by walking up from the **hook's own directory**
 * and read the version.
 *
 * Not using a fixed path like $HOME/.claude/skills/... — the host-registered
 * hook may be elsewhere; if that's a copy, a hardcoded path would read the
 * source version, making "source vs runtime" always equal, rendering the
 * comparison meaningless. Walking back from __dirname gets the version of the
 * actually executed copy. Read failure returns unknown, never affects
 * classification.
 */
const SOURCE_VERSION = (() => {
 try {
 const fs = require('fs'), path = require('path');
 let dir = __dirname;
 for (let i = 0; i < 6; i++) {
 const f = path.join(dir, 'SKILL.md');
 if (fs.existsSync(f)) {
 const m = fs.readFileSync(f, 'utf8').match(/^\s*version:\s*"?([^"\n]+)"?\s*$/m);
 if (m) return m[1].trim();
 }
 const up = path.dirname(dir);
 if (up === dir) break;
 dir = up;
 }
 return 'unknown';
 } catch (e) { return 'unknown'; }
})();

/** Under fail-closed, the deny output when "confirmed git but risk cannot be determined". */
function emitDeny(cmd, reason) {
 process.stdout.write(JSON.stringify({
 hookSpecificOutput: {
 hookEventName: 'PreToolUse',
 permissionDecision: 'deny',
 permissionDecisionReason: [
 'Hello Dev · Git approval gate → fail-closed',
 `Command: ${cmd}`,
 `Reason: ${reason}`,
 'Identified as a git operation, but risk cannot be determined. Rejecting execution per fail-closed policy.',
 'Resolution: use an equivalent git subcommand with classifiable risk, or have the user execute after confirming the exact command.',
 ].join('\n'),
 },
 }));
}

/* ---------- Risk table ---------- */

// Read-only or side-effect-free subcommands
const SAFE = new Set([
 'status', 'log', 'show', 'diff', 'diff-tree', 'diff-index', 'diff-files',
 'blame', 'annotate', 'grep', 'shortlog', 'whatchanged', 'describe',
 'rev-parse', 'rev-list', 'cat-file', 'ls-files', 'ls-tree', 'ls-remote',
 'count-objects', 'name-rev', 'show-ref', 'for-each-ref', 'var', 'help',
 'version', 'archive', 'format-patch', 'patch-id', 'stripspace', 'merge-base',
 'verify-pack', 'verify-commit', 'verify-tag', 'check-ignore', 'check-attr',
 'check-ref-format', 'interpret-trailers', 'fetch', 'fsck', 'repack', 'init',
 'get-tar-commit-id', 'range-diff', 'merge-tree', 'gitk', 'bugreport',
]);

// Most destructive: require explicit confirmation, and hints must include
// rollback clues
const HIGH = 'HIGH';
const MED = 'MED';

const RISK_TEXT = {
 HIGH: { icon: '', note: 'Destructive operation, potentially irreversible' },
 MED: { icon: '', note: 'Will change repo state, please confirm scope' },
};

const ROLLBACK_HINT = {
 'reset --hard': 'git reflog → git reset --hard HEAD@{n} (uncommitted content cannot be recovered)',
 'clean': 'Deleted untracked files cannot be recovered via git; check system trash/backups',
 'push --force': 'If remote was overwritten: git reflog (local) + collaborators\' local copies; remind collaborators to re-fetch',
 'branch -D': 'git reflog can recover the branch tip commit: git branch <name> <sha>',
 'checkout --': 'Overwritten working tree changes cannot be recovered',
 'restore': 'Overwritten working tree changes cannot be recovered',
 'stash drop': 'Lost stash records are irrecoverable',
 'rebase': 'git reflog + git rebase --abort; if already pushed, force push is needed',
 'filter-branch': 'Rewrites all history; full repo backup required first',
 'update-ref -d': 'After ref deletion, only reflog / backups can recover it',
};

/* ---------- Command parsing ---------- */

// Split compound commands (&& || ; | newlines), and recursively enter
// sh -c "..." nesting
/* ---------- Command parsing (shared with opsgate via scripts/lib/bash-lex.js) ---------- */
//
// splitSegments / tokenize / normalize extracted to shared module: both gates'
// lexer must be consistent, or the same command would be split differently
// under git-gate vs opsgate, causing risk classification divergence.
// heredoc body skipping is also in the shared module — fixing only one gate
// would create behavioral inconsistency.
// ==== INLINED (generated by scripts/inline-hooks.js; edit scripts/lib instead) ====
/*
 * Source: scripts/lib/bash-lex.js
 * This block is generated by scripts/inline-hooks.js — **do not edit here**;
 * edit the source module under scripts/lib/ and re-run inline-hooks.js.
 * self-check verifies inline content matches the source module; drift = failure.
 */
/* ---------- scripts/lib/bash-lex.js ---------- */
/**
 * Hello Dev — Bash command lexer (shared by git-gate and opsgate)
 *
 * Why extracted: The two gates' splitSegments were originally identical
 * (differing only in backslash handling), and the heredoc false-positive fix
 * had to apply to both -- fixing only one gate would cause behavior inconsistency.
 *
 * Why heredoc must be skipped:
 *   Content after `git commit -F - <<EOF` and before `EOF` is **body text to be written
 *   to a file**, not commands to be executed. splitSegments originally split by newlines,
 *   treating each line of the body as an independent command, causing `kubectl` / `rsync` /
 *   `git reset --hard` appearing in the body to be falsely intercepted.
 *   In practice: commit messages containing ops tool names were blocked twice in a row,
 *   only passing on the third rewording attempt -- that was a workaround, not a fix.
 *
 *   Counter-cost (honestly recorded): If someone embeds commands in a heredoc then
 *   feeds it to `bash`, that content won't be caught at text stage. But it should be
 *   caught at actual execution time; catching at text stage only forces users to reword,
 *   and rewording does not reduce any real risk.
 *
 * Segmentation semantics:
 *   - `;` `&&` `||` `|` and newlines -> split (newlines only effective in **non-heredoc regions**)
 *   - Separators inside quotes -> no split
 *   - `sh -c "..."` content -> recursively parsed
 *   - Heredoc body -> skipped, produces no segments
 */

/**
 * Check if `<<` at position is a heredoc start (returns delimiter).
 *
 * Supported forms (covers actual usage encountered):
 *   <<EOF  <<'EOF'  <<"EOF"  <<-EOF  <<- 'EOF'  <<<foo (returns null here, is here-string)
 *
 * Bash permits optional whitespace between `<<` (or `<<-`) and the delimiter
 * (e.g. `<< 'EOF'` or `<<- "EOF"`). This function must skip that whitespace,
 * otherwise the body leaks and is classified as commands -- measured defect
 * from change #119: `cat >> f.md << 'EOF'\nbody with rm\nEOF` was being split
 * into command segments, triggering spurious denials.
 *
 * @returns {string|null} delimiter; null if not heredoc
 */
function heredocDelimiterAt(command, i) {
  if (command[i] !== '<' || command[i + 1] !== '<') return null;
  let j = i + 2;
  if (command[j] === '<') return null;                 // <<< is here-string, no multiline body
  if (command[j] === '-') j++;                          // <<- allows indentation
  // Bash permits whitespace between `<<`/`<<-` and the delimiter. Without this
  // skip, `<< 'EOF'` hits the regex-break below with delim='', returns null,
  // and the body gets classified as commands -- same defect that change #119
  // found when the agent's own doc append (using `<< 'EOF'`) was blocked.
  while (j < command.length && /[ \t]/.test(command[j])) j++;
  let quote = null;
  let delim = '';
  while (j < command.length) {
    const ch = command[j];
    if (quote) {
      if (ch === quote) { j++; break; }
      delim += ch; j++;
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; j++; continue; }
    if (/[\s;&|<>]/.test(ch)) break;
    delim += ch; j++;
  }
  return delim || null;
}

/**
 * Scan from heredoc body start to delimiter that **occupies a line alone**,
 * return index after it.
 *
 * Returns command.length when delimiter not found -- unclosed heredoc,
 * remaining content is all body, process as body (prefer under-analysis over false interception).
 */
function skipHeredocBody(command, start, delim) {
  const marker = new RegExp(`^[ \\t]*${delim.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[ \\t]*$`);
  let lineStart = start;
  while (lineStart <= command.length) {
    const nl = command.indexOf('\n', lineStart);
    const lineEnd = nl === -1 ? command.length : nl;
    if (marker.test(command.slice(lineStart, lineEnd))) return nl === -1 ? command.length : nl + 1;
    if (nl === -1) break;
    lineStart = nl + 1;
  }
  return command.length;
}

/**
 * Split Bash command line into semantic segments.
 *
 * @param {string} command Full command line (may contain newlines, e.g. heredoc / multiline)
 * @returns {string[]} Non-empty, trimmed segments
 *
 * Each segment represents "a potentially executable command"; body text does not count --
 * caller takes tokens[0] of each segment to determine command name, so segmentation
 * accuracy directly determines false interception rate.
 */
function splitSegments(command) {
  const out = [];
  let cur = '';
  let quote = null;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];

    // heredoc: skip entire body, produce no segment
    const delim = heredocDelimiterAt(command, i);
    if (delim) {
      const bodyStart = command.indexOf('\n', i);
      // The start line itself (containing `<<EOF`) is kept as part of current segment
      if (bodyStart === -1) { cur += command.slice(i); i = command.length; break; }
      cur += command.slice(i, bodyStart + 1);
      const next = skipHeredocBody(command, bodyStart + 1, delim);
      // After body skip, `next` falls after the delimiter line's newline. If there's content
      // there (`cat <<EOF\nbody\nEOF\necho done`), current segment must close first --
      // otherwise `echo done` gets merged into previous segment, `cat` becomes the command
      // name for the whole segment, and subsequent commands go completely unchecked.
      if (next < command.length && command[next - 1] === '\n') {
        out.push(cur); cur = '';
      }
      i = next - 1;   // for's i++ will advance to next
      continue;
    }

    if (quote) {
      cur += ch;
      if (ch === '\\' && quote === '"') { cur += (command[++i] || ''); continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === '&' || ch === '|') {
      if (command[i + 1] === ch) i++;
      out.push(cur); cur = ''; continue;
    }
    if (ch === ';' || ch === '\n') { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim()).filter(Boolean);
}

/**
 * Strip shell wrappers (sudo/nohup/env etc., VAR=VAL assignments),
 * and identify `sh -c "..."` nested commands.
 *
 * @returns {{tokens?: string[], nested?: string}|null} null means empty segment
 */
function normalize(tokens) {
  const WRAPPERS = new Set(['sudo', 'doas', 'command', 'nohup', 'nice', 'time', 'env', 'xcrun']);
  let i = 0;
  while (i < tokens.length) {
    const t = tokens[i];
    if (WRAPPERS.has(t)) { i++; continue; }
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t)) { i++; continue; }
    break;
  }
  const rest = tokens.slice(i);
  if (rest.length === 0) return null;
  const isShell = /(^|\/)(sh|bash|zsh|dash|ksh)$/.test(rest[0]);
  if (isShell) {
    const ci = rest.indexOf('-c');
    if (ci !== -1 && rest[ci + 1]) return { nested: rest[ci + 1] };
  }
  return { tokens: rest };
}

/** Split by whitespace and quotes (preserved inside quotes, unquoting left to caller). */
function tokenize(segment) {
  const tokens = [];
  let cur = '';
  let quote = null;
  let has = false;
  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i];
    if (quote) {
      if (ch === '\\' && quote === '"') { cur += segment[++i] || ''; continue; }
      if (ch === quote) { quote = null; continue; }
      cur += ch; has = true; continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; has = true; continue; }
    if (ch === ' ' || ch === '\t') { if (has) { tokens.push(cur); cur = ''; has = false; } continue; }
    cur += ch; has = true;
  }
  if (has) tokens.push(cur);
  return tokens;
}

// ==== END INLINED ====

// Skip git's global options, locate the subcommand
const OPT_WITH_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace',
 '--exec-path', '--config-env', '--super-prefix', '--attr-source']);

function parseGit(tokens) {
 if (!/(^|\/)git(\.exe)?$/.test(tokens[0])) return null;
 let i = 1;
 while (i < tokens.length) {
 const t = tokens[i];
 if (OPT_WITH_VALUE.has(t)) { i += 2; continue; }
 if (t.startsWith('--git-dir=') || t.startsWith('--work-tree=') ||
 t.startsWith('--namespace=') || t.startsWith('--exec-path=') ||
 t.startsWith('--config-env=') || t.startsWith('-c')) { i++; continue; }
 if (t.startsWith('-')) { i++; continue; } // -p / --no-pager / --bare ...
 break;
 }
 const sub = tokens[i];
 if (!sub) return { sub: null, args: [] };
 return { sub, args: tokens.slice(i + 1) };
}

/* ---------- Risk classification ---------- */

function has(args, ...flags) { return args.some(a => flags.includes(a)); }
function hasPrefix(args, prefix) { return args.some(a => a.startsWith(prefix)); }

function classify(sub, args) {
 if (!sub) return null;
 const a = args;

 // Conditionally safe subcommands
 switch (sub) {
 case 'branch':
 if (has(a, '-D', '--delete', '--delete-force')) return { risk: HIGH, label: 'branch -D', why: 'Delete branch (bypasses unmerged check)', hint: ROLLBACK_HINT['branch -D'] };
 if (has(a, '-d', '-m', '-M', '-c', '-C', '--move', '--copy', '--edit-description', '--set-upstream-to', '-u')) return { risk: MED, label: 'branch write op', why: 'Create/rename/delete/set upstream branch', hint: 'git branch -d: if accidentally deleted, check reflog' };
 return null;
 case 'tag':
 if (a.length === 0 || has(a, '-l', '--list', '-n', '-v', '--contains', '--merged', '--no-merged', '--points-at')) return null;
 return { risk: MED, label: 'tag write op', why: 'Create or delete tag', hint: 'Accidentally deleted local tags can be recreated; already pushed tags need git push --delete' };
 case 'remote':
 if (a.length === 0 || has(a, '-v', '--verbose', 'show', 'get-url')) return null;
 return { risk: MED, label: 'remote config change', why: 'Add/remove/modify remote repository URL', hint: 'git remote -v to verify current state' };
 case 'config':
 if (hasPrefix(a, '--get') || has(a, '-l', '--list') || hasPrefix(a, '--show')) return null;
 return { risk: MED, label: 'config write', why: 'Modify git repo or global config', hint: 'git config --list to verify; global config is in ~/.gitconfig' };
 case 'stash':
 if (a[0] === 'drop' || a[0] === 'clear') return { risk: HIGH, label: 'stash ' + a[0], why: 'Discard stash records', hint: ROLLBACK_HINT['stash drop'] };
 if (a[0] === 'list' || a[0] === 'show') return null;
 return { risk: MED, label: 'stash ' + (a[0] || 'push'), why: 'Stash/restore working tree changes', hint: 'git stash list to view, git stash pop to restore' };
 case 'reflog':
 if (a[0] === 'expire' || a[0] === 'delete') return { risk: HIGH, label: 'reflog ' + a[0], why: 'Clear the last resort for recovering commits', hint: 'After this, lost commits will be unrecoverable' };
 return null;
 case 'symbolic-ref':
 if (has(a, '-d', '--delete')) return { risk: HIGH, label: 'symbolic-ref -d', why: 'Delete symbolic ref such as HEAD', hint: 'git symbolic-ref HEAD refs/heads/<branch> to recreate' };
 return a.length === 0 ? null : { risk: MED, label: 'symbolic-ref write', why: 'Change symbolic ref target', hint: 'git symbolic-ref HEAD to verify' };
 case 'clean':
 if (has(a, '-n', '--dry-run')) return null;
 return { risk: HIGH, label: 'clean', why: 'Delete untracked files and directories, unrecoverable via git', hint: ROLLBACK_HINT['clean'] };
 case 'reset':
 if (has(a, '--hard')) return { risk: HIGH, label: 'reset --hard', why: 'Discard all changes in working tree and staging area', hint: ROLLBACK_HINT['reset --hard'] };
 return { risk: MED, label: 'reset', why: 'Move HEAD / reset staging area', hint: 'git reflog to return to previous position' };
 case 'checkout':
 if (has(a, '-f', '--force') || has(a, '--') || a.includes('.')) return { risk: HIGH, label: 'checkout discard changes', why: 'Overwrite working tree files with repository content', hint: ROLLBACK_HINT['checkout --'] };
 return { risk: MED, label: 'checkout', why: 'Switch branch or check out content', hint: 'git switch - to return to previous branch' };
 case 'switch':
 if (has(a, '-f', '--force', '--discard-changes')) return { risk: HIGH, label: 'switch --force', why: 'Force switch and discard local changes', hint: ROLLBACK_HINT['checkout --'] };
 return { risk: MED, label: 'switch', why: 'Switch branch', hint: 'git switch - to return to previous branch' };
 case 'restore':
 if (has(a, '--staged', '-S') && !has(a, '--worktree', '-W')) return { risk: MED, label: 'restore --staged', why: 'Unstage changes', hint: 'File content is not lost, can be re-added with git add' };
 return { risk: HIGH, label: 'restore', why: 'Overwrite working tree files with repository content, discarding uncommitted changes', hint: ROLLBACK_HINT['restore'] };
 case 'worktree':
 if (a.length === 0 || has(a, 'list')) return null;
 return { risk: MED, label: 'worktree ' + a[0], why: 'Add/remove worktree directory', hint: 'git worktree list to view existing worktrees' };
 case 'submodule':
 if (a.length === 0 || has(a, 'status', 'summary', '-q', '--quiet')) return null;
 return { risk: MED, label: 'submodule ' + a[0], why: 'Update/initialize submodules', hint: 'git submodule status to verify' };
 case 'gc':
 if (hasPrefix(a, '--prune=now') || has(a, '--aggressive', '--prune=now')) return { risk: MED, label: 'gc aggressive prune', why: 'Immediately clear unreachable objects, bypassing reflog grace period', hint: 'Recommend git reflog expire check before execution' };
 return null;
 case 'push':
 if (has(a, '-f', '--force', '--force-with-lease', '--force-if-includes', '--mirror', '--delete', '-d') || a.some(t => t.startsWith('+'))) {
 return { risk: HIGH, label: 'push force/delete', why: 'Overwrite or delete remote history, affects collaborators', hint: ROLLBACK_HINT['push --force'] };
 }
 return { risk: MED, label: 'push', why: 'Push local commits to remote (publish externally)', hint: 'git revert to create a reverse commit' };
 case 'rebase':
 return { risk: HIGH, label: 'rebase', why: 'Rewrite commit history', hint: ROLLBACK_HINT['rebase'] };
 case 'filter-branch':
 case 'filter-repo':
 return { risk: HIGH, label: sub, why: 'Batch rewrite all history', hint: ROLLBACK_HINT['filter-branch'] };
 case 'update-ref':
 if (has(a, '-d', '--no-deref')) return { risk: HIGH, label: 'update-ref -d', why: 'Directly delete a reference', hint: ROLLBACK_HINT['update-ref -d'] };
 return { risk: MED, label: 'update-ref', why: 'Directly modify a reference', hint: 'git reflog to view reference change history' };
 case 'update-index':
 if (has(a, '--refresh')) return null;
 return { risk: MED, label: 'update-index', why: 'Directly modify the index', hint: 'git reset to rebuild the index' };
 case 'rm':
 return { risk: MED, label: 'rm', why: 'Delete files from working tree and index', hint: 'Deleted changes can be recovered via git checkout -- <path>' };
 case 'mv':
 return { risk: MED, label: 'mv', why: 'Move/rename version-controlled files', hint: 'git mv can be reversed' };
 }

 if (SAFE.has(sub)) return null;

 return { risk: MED, label: sub, why: 'git operation that changes repo state', hint: null };
}

/* ---------- Output ---------- */

function emit(cmd, info) {
 const t = RISK_TEXT[info.risk];
 const lines = [
 `Hello Dev · Git approval gate → ${t.icon} ${info.risk}`,
 `Command: ${cmd}`,
 `Classification: ${info.label} — ${info.why}`,
 t.note + '. Execute immediately upon approval; if rejected, please explain and I will switch to a non-destructive approach.',
 ];
 if (info.hint) lines.push(`Rollback reference: ${info.hint}`);
 process.stdout.write(JSON.stringify({
 hookSpecificOutput: {
 hookEventName: 'PreToolUse',
 permissionDecision: 'ask',
 permissionDecisionReason: lines.join('\n'),
 },
 }));
}

function main() {
 if (OFF) { dbg('gate disabled via HELLODEV_GIT_GATE=off'); return; }
 let raw = '';
 try { raw = require('fs').readFileSync(0, 'utf8'); } catch (e) { return; }
 if (!raw.trim()) return;

 let payload;
 try { payload = JSON.parse(raw); } catch (e) { dbg('bad json payload'); return; }
 if (payload.tool_name !== 'Bash') return;

 const command = payload?.tool_input?.command;
 if (typeof command !== 'string' || !command.trim()) return;

 // Project-level switch: silently pass if cwd is in skip list
 const cwd = payload?.cwd;
 if (shouldSkipByCwd(cwd)) {
 dbg(`skip: cwd=${cwd} matches HELLODEV_GIT_GATE_SKIP_DIRS`);
 return;
 }

 trace('inspect');
 if (GATE.warn) process.stderr.write('[hello-dev-git-gate] Warning: ' + GATE.warn + '\n');

 const found = [];
 let unclassifiable = null; // Confirmed git but no risk conclusion for the subcommand
 for (const seg of splitSegments(command)) {
 const norm = normalize(tokenize(seg));
 if (!norm) continue;
 const segs = norm.nested ? splitSegments(norm.nested) : [seg];
 for (const s of segs) {
 const n = norm.nested ? normalize(tokenize(s)) : norm;
 if (!n || !n.tokens) continue;
 const parsed = parseGit(n.tokens);
 if (!parsed) continue;
 if (!parsed.sub) { unclassifiable = unclassifiable || { seg: s, why: 'git without subcommand' }; continue; }
 let info;
 try { info = classify(parsed.sub, parsed.args); }
 catch (e) {
 // Sole tightening point: confirmed git, but classification threw.
 unclassifiable = unclassifiable || { seg: s, why: `subcommand ${parsed.sub} classification error: ${e && e.message}` };
 continue;
 }
 dbg(`segment="${s}" sub=${parsed.sub} -> ${info ? info.risk : 'SAFE'}`);
 if (info) found.push(info);
 }
 }

 if (found.length === 0) {
 // Has git but risk undetermined: decide pass/deny by mode.
 if (unclassifiable && GATE.mode === 'fail-closed') {
 trace('deny-unclassifiable');
 emitDeny(clip(command), unclassifiable.why);
 return;
 }
 if (unclassifiable) dbg('fail-open: ' + unclassifiable.why);
 return;
 }
 const worst = found.some(f => f.risk === HIGH) ? found.find(f => f.risk === HIGH) : found[0];
 trace('ask');
 emit(clip(command), worst);
}

function clip(cmd) { return cmd.length > 200 ? cmd.slice(0, 200) + ' ...' : cmd; }

try { main(); } catch (e) {
 // Outer safety net. fail-closed can only tighten for "confirmed git" cases —
 // reaching here means the command couldn't even be read, so it's impossible
 // to tell if it's git; blocking here would lock all Bash.
 dbg(`fail-open(outer): ${e && e.message} (mode=${GATE.mode} cannot determine if git from this)`);
}
process.exit(0);
