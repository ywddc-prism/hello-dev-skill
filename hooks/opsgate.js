#!/usr/bin/env node
'use strict';

/**
 * Hello Dev — Ops approval gate (PreToolUse hook)
 *
 * Sole responsibility: identify ops commands (kubectl / systemctl / terraform /
 * helm / docker etc.) before the Bash tool executes, returning approval
 * decisions by risk classification.
 *   - auto_read (known safe read-only)     -> no output, platform default
 *   - approval_required (state change)     -> permissionDecision: "ask",
 *                                            force approval prompt
 *   - unclassified (risk undetermined)     -> permissionDecision: "deny"
 *                                            (governed by HELLODEV_OPSGATE_MODE)
 *
 * The gate is cautious-execution, not prohibition: every recognized ops command
 * can be executed after user confirmation. Local system commands (rm, mkfs, dd,
 * shutdown, etc.) are NOT ops commands and are not managed by this gate.
 *
 * Relationship with git-gate.js:
 *   Both are isomorphic — classify only, no execution, no state writes.
 *   git-gate handles git, this gate handles ops commands.
 *   Risk table comes from scripts/lib/ops-policy.js, shared with runbook
 *   validation to prevent "hook blocks, runbook allows" drift.
 *
 * **Key difference** from git-gate: this gate defaults to deny-unclassified for
 * unrecognized ops verbs, not fail-open pass-through. Rationale: unrecognized
 * verbs within known ops tools may carry unknown semantics; the user can set
 * HELLODEV_OPSGATE_MODE=allow-unclassified when pass-through is needed.
 * But there is no hard-deny for recognized commands -- all are cautious-execution.
 *
 * Design constraints (same as git-gate):
 *   1. Pure functional — no file writes, no network access — to avoid slowing
 *      down every Bash call.
 *      (Sole exception: when HELLODEV_OPSGATE_TRACE is explicitly enabled,
 *      write one trace line for host smoke test evidence)
 *   2. Exception behavior is governed by HELLODEV_OPSGATE_MODE, default deny
 *      (unknown semantics don't pass through)
 *   3. Only "tightens", never "relaxes": never returns allow
 *
 * Environment variables:
 *   HELLODEV_OPSGATE=off               User-level master switch (only settable
 *                                     by user in their shell / settings)
 *   HELLODEV_OPSGATE_MODE=deny-unclassified|allow-unclassified
 *                                     What to do with unknown commands, see below
 *   HELLODEV_OPSGATE_SKIP_DIRS=...     Project-level switch: comma-separated dir
 *                                     names; skip if cwd contains any (see below)
 *   HELLODEV_OPSGATE_TRACE=<path>      Host smoke test probe: append one JSON
 *                                     line per invocation
 *   HELLODEV_OPSGATE_CALLER=<caller>   Trace source marker; no trace written
 *                                     when not set
 *   HELLODEV_OPSGATE_DEBUG=1           Print parse debug info to stderr
 *
 * HELLODEV_OPSGATE_SKIP_DIRS — project-level switch:
 *   Comma-separated directory name list. When any path segment of payload.cwd
 *   matches a name in the list, the gate silently passes (no interception, no
 *   trace writing). Used to temporarily disable the gate in non-HelloDev projects.
 *   Example: HELLODEV_OPSGATE_SKIP_DIRS=node_modules,tmp,vendor
 *   Matching rule: cwd is split by `/`, and any segment **equal to** a name in
 *   the list triggers a match.
 *
 * HELLODEV_OPSGATE_MODE — what to do with unclassifiable ops commands:
 *   deny-unclassified (default)  Unknown binary or cannot locate verb -> deny
 *   allow-unclassified           Allow unknown cases, use platform default
 *   Invalid value                Treated as default with stderr warning (config
 *                                errors should not lock the repo)
 *
 *   Both modes **do not change**: known read-only pass-through, known write ops
 *   ask, known high-risk deny. They only affect inputs where "this is recognized
 *   as an ops command but risk cannot be determined".
 */

const OFF = process.env.HELLODEV_OPSGATE === 'off';
const DEBUG = process.env.HELLODEV_OPSGATE_DEBUG === '1';
const SOURCE_VERSION = readSourceVersion();
const SKIP_DIRS = (process.env.HELLODEV_OPSGATE_SKIP_DIRS || '').split(',').map(s => s.trim()).filter(Boolean);

/** Check if cwd is in the skip list. Matching: any segment of cwd split by `/` equals a name in the list. */
function shouldSkipByCwd(cwd) {
  if (!SKIP_DIRS.length || !cwd) return false;
  const segs = String(cwd).split(/[\\/]/);
  return segs.some(seg => SKIP_DIRS.includes(seg));
}

/**
 * Find .hello-dev/state.json by walking up from cwd. Returns null if not found.
 * Pure read — no writes, no network, no caching.
 */
function findStateFile(cwd) {
  if (!cwd) return null;
  const fs = require('fs');
  const path = require('path');
  let dir = path.resolve(cwd);
  const root = path.parse(dir).root;
  while (true) {
    const candidate = path.join(dir, '.hello-dev', 'state.json');
    try { if (fs.statSync(candidate).isFile()) return candidate; } catch (_) { /* not found */ }
    if (dir === root) return null;
    dir = path.dirname(dir);
  }
}

/**
 * Check whether state.json contains a valid, non-expired opsApprove credential
 * whose intent.command matches the given command string.
 *
 * This is the per-command deny escape: when the hook would otherwise deny an
 * unclassified ops command, a pre-approved credential lets it pass.
 * The check is intentionally narrow — exact command match only, no fuzzy matching.
 *
 * @param {string} cwd     Working directory from the hook payload
 * @param {string} command The full command string being evaluated
 * @returns {boolean} true if a valid approval exists
 */
function hasApprovedCommand(cwd, command) {
  const statePath = findStateFile(cwd);
  if (!statePath) return false;
  const fs = require('fs');
  let state;
  try {
    state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch (_) { return false; }
  if (!state || !state.ops || !Array.isArray(state.ops.approvals) || !state.ops.approvals.length) return false;
  if (!state.ops.steps || typeof state.ops.steps !== 'object') return false;

  const now = new Date();
  for (const approval of state.ops.approvals) {
    // Skip expired credentials
    if (approval.expiresAt && new Date(approval.expiresAt) <= now) continue;
    // Skip not-yet-effective credentials
    if (approval.approvedAt && new Date(approval.approvedAt) > now) continue;
    // Find the step this approval references
    for (const [, step] of Object.entries(state.ops.steps)) {
      if (step.digest !== approval.stepDigest) continue;
      // The step's command is what was registered. Exact match against the
      // incoming command. Fuzzy matching would defeat the purpose of binding
      // approval to a specific execution intent.
      if (typeof step.command === 'string' && step.command === command) return true;
    }
  }
  return false;
}

/** Behavior on exception. Default deny-unclassified; invalid values treated as default with warning. */
function resolveMode() {
  const raw = (process.env.HELLODEV_OPSGATE_MODE || 'deny-unclassified').trim().toLowerCase();
  if (raw === 'deny-unclassified') return { mode: 'deny-unclassified', warn: null };
  if (raw === 'allow-unclassified') return { mode: 'allow-unclassified', warn: null };
  return {
    mode: 'deny-unclassified',
    warn: `Unknown HELLODEV_OPSGATE_MODE=${raw}, treating as deny-unclassified`,
  };
}
const GATE = resolveMode();

// ==== INLINED (generated by scripts/inline-hooks.js; edit scripts/lib instead) ====
/*
 * Source: scripts/lib/bash-lex.js + ops-policy.js
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

/* ---------- scripts/lib/ops-policy.js ---------- */
/**
 * Hello Dev — Ops command risk policy (shared by opsgate and runbook validation)
 *
 * Origin: policy.js semantics from yunwei_loop, ported into HelloDev with added
 * Bash lexical preprocessing. Both consumers must stay consistent: hooks/opsgate.js
 * (via the block generated by scripts/inline-hooks.js) classifies Bash command
 * lines, and scripts/state.js `riskOfCommand()` -- called from `opsRegister` by
 * way of `assessCommand` -- classifies the runbook step's argv. Both share this
 * file's risk table to prevent "hook blocks, runbook allows" drift.
 *
 * Correction (this change): the two lines above used to name
 * `scripts/lib/policy.js` as the runbook-side consumer. That module does not
 * exist in this repository (`ls scripts/lib/policy.js` -> No such file or
 * directory). The real second consumer is `riskOfCommand()` in scripts/state.js
 * at :825. Naming a non-existent file pointed readers at a module they could
 * never open. The `Origin:` line above is historical provenance and is kept.
 *
 * Two dispositions for recognized commands:
 *   auto_read          Known-safe read-only queries -- not intercepted
 *   approval_required  Changes server/cluster/cloud/app state -- requires
 *                      pre-execution user confirmation (risk notification + rollback plan)
 *
 * The gate is cautious-execution, not prohibition: every recognized ops command
 * can be executed after user approval. The only deny scenario is "unclassified"
 * (cannot determine risk), governed by HELLODEV_OPSGATE_MODE.
 *
 * Local system commands (rm, dd, mkfs, shutdown, etc.) are NOT ops commands
 * and are not managed by this gate.
 *
 * Risk levels follow OpsLoop L0-L5:
 *   L0 read-only   L1 read-only but resource-intensive   L2 restricted write
 *   L3 state change L4 destructive/poorly reversible     L5 high-risk or uncontrolled semantics
 */

const SHELL_CONTROL = /[;&|`<>\n\r]|\$\(/;

const READ_KUBECTL = new Set([
  'get', 'describe', 'logs', 'top', 'explain', 'version', 'cluster-info',
  'api-resources', 'api-versions',
]);
const WRITE_KUBECTL = new Set([
  'apply', 'create', 'delete', 'edit', 'exec', 'patch', 'replace', 'scale', 'set',
  'taint', 'label', 'annotate', 'cordon', 'uncordon', 'drain', 'attach', 'cp', 'port-forward',
]);

const READ_SYSTEMCTL = new Set(['status', 'is-active', 'is-enabled', 'show', 'list-units']);
const WRITE_SYSTEMCTL = new Set(['start', 'stop', 'restart', 'reload', 'enable', 'disable', 'mask', 'unmask']);

// Read-only, side-effect-free system queries. df/free/uptime etc. never change
// state even with arguments.
const READ_ONLY_BINS = new Set(['df', 'free', 'uptime', 'hostname', 'id', 'whoami', 'pwd', 'date']);

// Destructive system-level commands. Not ops tools -- they are local system commands.
// This gate does NOT manage them (they are not in OPS_BINS either).
// Kept as empty set for backward compatibility; assessCommand no longer references it.
const ALWAYS_BLOCK_BINS = new Set();

// --- Container tooling: local development vs. remote egress ---
//
// Boundary re-drawn by this change. Reason: `docker` as a whole used to sit in
// OPS_BINS while its branch allow-listed only a handful of verbs, so
// `docker build`, `docker compose up`, `docker pull` and `docker system prune`
// -- all purely local development -- were classified "Not in Docker
// allowlist" and hard-DENIED. The complaints were about availability, and the
// cause was jurisdictional: these commands do not touch remote/production
// infrastructure, which is the only thing this gate claims to govern
// (ops-execution.md section 1).
//
// **Why the multi-token group verbs are listed individually and in full:**
// locateVerb returns only the FIRST non-option token. `docker compose up -d`
// yields verb='compose' (NOT 'up'), `docker system prune` yields verb='system'
// (NOT 'prune'). A pass list naming only `up` / `prune` / `rm` would therefore
// leave every `docker compose *` and every `docker system *` denied. The groups
// must be matched on their own name, which is what this set does.
//
// **Cost of that grouping, and how it is contained:** matching a group on its
// own name makes the group's *egress* subverbs pass too -- `docker image push`
// and `docker container push` reach the same remote registry as
// `docker push`. These are therefore pulled back out by an explicit egress
// check (isRegistryEgress) that runs BEFORE this pass list. The check tests the
// egress property rather than re-listing verbs, so the purely local subverbs of
// the same groups (`image prune`, `image ls`, `container ls`) keep passing.
const LOCAL_DEV_DOCKER_VERBS = new Set([
  'build', 'compose', 'pull', 'run', 'exec', 'rm', 'rmi', 'stop', 'kill',
  'start', 'restart', 'system', 'image', 'volume', 'network', 'container',
  'builder', 'buildx',
  // `context` is deliberately absent. Every other entry here is justified by
  // "this acts on the machine running the agent", which is exactly what
  // `docker context use prod` gives up: it re-points the CLI at ANOTHER daemon,
  // so every later docker call in the same shell hits production. Grouping it
  // with the local verbs was a regression -- measured against the pre-change
  // hook, `docker context use|create|remove` were deny and had become pass.
  // It is now a target-selection family with its own branch in assessCommand.
]);

// Read-only container queries. Split out from the local-development set because
// these are the "known safe" conclusion and must keep answering as such.
const READ_DOCKER_VERBS = new Set([
  'ps', 'images', 'logs', 'inspect', 'version', 'info', 'top',
]);

// Read-only `docker context` SUBVERBS: `docker context ls|show|inspect|export`.
//
// Why a separate set instead of adding these to READ_DOCKER_VERBS: that set is
// consulted as `READ_DOCKER_VERBS.has(verb)` against the TOP-LEVEL verb, and for
// `docker context ls` locateVerb returns verb='context', subverb='ls' -- so an
// entry there would never fire for these commands. Worse, `ls` / `show` /
// `export` are also real top-level docker verbs, and adding them would relax the
// fail-closed floor. Measured at the commit before this change:
//   `docker export x`  deny      `docker ls`  deny      `docker show x`  deny
// All three must stay deny; they are not part of this fix. This set is therefore
// matched on the subverb, inside the `verb === 'context'` branch only.
const CONTEXT_READ_SUBVERBS = new Set(['ls', 'show', 'inspect', 'export']);

// `docker context` subverbs that select or mutate WHICH daemon is targeted.
// `use` is the dangerous one -- it is sticky for the rest of the shell session.
const CONTEXT_TARGET_SUBVERBS = new Set(['use', 'create', 'remove', 'rm', 'update', 'import']);

// --- Remote endpoint qualifiers (docker/podman) ---
//
// Why this exists: the local-development exemption below rests on one premise --
// the command acts on the machine running the agent. `docker -H=tcp://prod:2375
// rm -f web` breaks that premise: it removes a container on a **production
// daemon** over the network. Measured against the pre-change hook, it was ask
// and had become pass.
//
// Why a scan instead of a verb test: the qualifier is invisible to locateVerb.
// `-H` / `--host` are absent from OPTION_TAKES_VALUE, and the `=`-form is
// skipped outright by its `if (t.includes('='))` branch, so
// locateVerb(['docker','-H=tcp://prod:2375','rm','-f','web']) -> ['rm','-f'] --
// byte-identical to the local `docker rm web`. Both landed in the same branch
// and both returned auto_read. The verb alone cannot distinguish them, so the
// qualifier has to be found by scanning the option prefix.
//
// Scope: only the docker/podman **global option prefix** is scanned, i.e. the
// tokens before the first non-option token. That positional limit is essential,
// not cosmetic: `docker run -c 512 ubuntu` uses `-c` for CPU shares *after* the
// verb, so a whole-argv scan for `-c` would re-deny ordinary local runs. Since
// docker's own `-H` / `--context` are global options, they must precede the
// subcommand -- scanning only the prefix catches them without that false
// positive.
const REMOTE_ENDPOINT_LONG = ['--host', '--context'];
const REMOTE_ENDPOINT_SHORT = ['-H', '-c'];

// How an endpoint chosen by environment (rather than by flag) is named in the
// approval prompt. Reported by the caller via options.remoteEndpointEnv.
const REMOTE_ENDPOINT_ENV_LABEL = 'DOCKER_HOST/DOCKER_CONTEXT env';

/**
 * Detect a docker/podman remote-endpoint qualifier in the global option prefix.
 *
 * Recognized: `-H=<v>`, `-H <v>`, `-H<v>` (attached), `--host=<v>`,
 * `--host <v>`, `--context=<v>`, `--context <v>`, `-c=<v>`, `-c <v>`.
 *
 * @param {string[]} argv Full argv including the binary at [0]
 * @returns {string|null} The qualifier that was found, or null.
 */
function dockerRemoteEndpoint(argv) {
  // Docker accepts only a short global option prefix; the budget also bounds
  // the loop if an unrecognized value-taking flag would otherwise consume the
  // verb and walk the whole argv.
  let budget = 6;
  let i = 1;
  while (i < argv.length && budget > 0) {
    const t = argv[i];
    if (!t.startsWith('-')) break;   // reached the verb: the global prefix is over
    budget--;
    if (t === '--') { i++; continue; }

    const eq = t.indexOf('=');
    if (eq > 0) {
      // `--flag=value` carries its own value; only a known endpoint flag counts.
      const name = t.slice(0, eq);
      if (REMOTE_ENDPOINT_LONG.includes(name) || REMOTE_ENDPOINT_SHORT.includes(name)) return name;
      i++;
      continue;
    }
    if (REMOTE_ENDPOINT_LONG.includes(t) || REMOTE_ENDPOINT_SHORT.includes(t)) {
      // Spaced value: consume it only when it does not itself look like an option.
      i += (i + 1 < argv.length && !argv[i + 1].startsWith('-')) ? 2 : 1;
      return t;
    }
    // Attached short value: `-Htcp://host:2375`.
    if (t.length > 2 && REMOTE_ENDPOINT_SHORT.includes(t.slice(0, 2))) return t.slice(0, 2);
    i++;
  }
  return null;
}

// Group verbs that can carry a standard `push` subverb, i.e. a second matching
// path to the same remote-registry egress as the top-level `push` verb:
// `docker image push`, `docker container push`, `docker compose push`.
//
// This set exists because `image` / `container` / `compose` are ALSO in
// LOCAL_DEV_DOCKER_VERBS (they have to be: `docker image prune`,
// `docker container ls` and `docker compose up -d` are local and must pass).
// Matching a group verb on its own name therefore releases its `push` subverb
// too. The egress check in assessCommand runs before the pass list and consults
// this set.
//
// `manifest` / `plugin` are deliberately NOT listed: they are absent from
// LOCAL_DEV_DOCKER_VERBS, so `docker manifest push` / `docker plugin push`
// already fall through to the fail-closed deny. Adding them here would relax
// that deny into an ask -- a change of the floor, not a fix of this defect.
const REGISTRY_EGRESS_GROUP_VERBS = new Set(['image', 'container', 'compose']);

// The docker/podman verbs that accept BuildKit's `--push` switch, i.e. "build
// the image and push the result straight to a registry". That family is the
// only place the flag is scanned for: a bare `--push` token can also be an
// argument passed to the program being run (`docker run -it img app.js
// --push`), and a blanket argv scan would turn that purely local invocation
// into an ask.
//
// `docker image build --push` (the pre-20.10 spelling of `docker build`, where
// the verb is `image` and the subverb is `build`) is handled by the same scan
// -- see isRegistryEgress -- so the legacy spelling is not left open either.
const BUILD_FAMILY_VERBS = new Set(['build', 'builder', 'buildx']);

// BuildKit output specifier that publishes the build result to a registry:
// `--output type=registry[,...]` / `-o type=registry`. Matched on the
// comma-delimited element rather than the whole token, because the spec is a
// comma-separated key=value list (`type=registry,compression=zstd,push=true`).
// `type=local` / `type=docker` / `type=tar` are local outputs and must not match.
const REGISTRY_OUTPUT_SPEC = /(?:^|,)type=registry(?:,|$)/;

/**
 * Whether argv is a container-registry **egress** action: an action that
 * publishes an image to a remote registry, i.e. leaves the local machine.
 *
 * Why this is a separate scan over the whole argv rather than a verb test:
 * the ways to push do not all surface as the verb.
 *
 *   1. Top-level verb: `docker push reg/img:1` -> locateVerb gives verb `push`.
 *   2. `--push` build flag: `docker build --push -t reg/img:1 .` and
 *      `docker buildx build --push -t x .` publish the built image directly to a
 *      registry. locateVerb CANNOT see this: it does not treat `--push` as
 *      option-with-value, so the flag surfaces as the *subverb* and the verb
 *      stays `build`. Measured: locateVerb(['docker','build','--push','-t','x','.'])
 *      -> ['build','--push'].
 *   3. Group verb + `push` subverb: `docker image push` / `docker container push`
 *      / `docker compose push`. Here locateVerb returns verb `image` /
 *      `container` / `compose`, which are in LOCAL_DEV_DOCKER_VERBS because
 *      their other subverbs (`prune`, `ls`, `build`, `up`) are purely local.
 *   4. BuildKit registry output: `docker build --output type=registry -t x .`.
 *      Same egress, expressed as an output target instead of a flag.
 *
 * Registering this as a *scan* over argv keeps the check independent of wherever
 * the flag lands in the token stream, so a future change to locateVerb's option
 * table cannot silently reopen the hole.
 *
 * `--push=true` is matched by the `=` prefix form; the bare `--push` means the
 * same thing to docker/buildx (it is a boolean flag, not a value-taking option),
 * so both spellings are egress.
 *
 * Scope limit, stated rather than implied: this recognizes the flag/spelling
 * family listed above, not "every possible way to touch a registry". Registry
 * cache writes (`--cache-to type=registry`) are a registry interaction but do
 * not publish an image, and are deliberately not intercepted here.
 *
 * Deliberately NOT treated as egress: `--no-push` (`'--no-push' !== '--push'`
 * and it does not start with `'--push='`).
 *
 * @param {string[]} argv Full argv including the binary at [0]
 * @param {string|null} verb   Result of locateVerb(argv)
 * @param {string|null} subverb Result of locateVerb(argv)
 * @returns {boolean}
 */
function isRegistryEgress(argv, verb, subverb) {
  // (1) top-level `push`, and (3) a pass-listed group whose subverb is `push`
  if (verb === 'push') return true;
  if (REGISTRY_EGRESS_GROUP_VERBS.has(verb) && subverb === 'push') return true;
  // (2) and (4): only a build verb can carry a build-time push.
  // `docker buildx build` has verb `buildx`; `docker image build` has verb
  // `image` with subverb `build`, so the subverb counts as well.
  const builds = BUILD_FAMILY_VERBS.has(verb)
    || (REGISTRY_EGRESS_GROUP_VERBS.has(verb) && BUILD_FAMILY_VERBS.has(subverb));
  if (!builds) return false;
  return argv.some((t) => t === '--push' || t.startsWith('--push=') || REGISTRY_OUTPUT_SPEC.test(t));
}

/**
 * Result constructor. disposition is three-valued; approvalMode is the execution
 * semantic for the host. Note: block's approvalMode is 'blocked' not 'none' —
 * blocking is not "no approval needed".
 */
function result(disposition, risk, reason) {
  return {
    disposition,
    approvalMode: disposition === 'auto_read' ? 'none'
      : disposition === 'approval_required' ? 'pre_execution' : 'blocked',
    risk,
    reason,
  };
}

// Only these options explicitly require a value. The criterion must be a whitelist
// rather than "not a dash = value": in `systemctl --no-pager restart nginx`,
// --no-pager is a boolean switch — if we consume restart as its value, the verb
// lands on nginx, and a normal restart command gets misclassified as unknown
// and blocked.
const OPTION_TAKES_VALUE = new Set([
  // kubectl
  '--context', '-s', '--server', '--cluster', '--user', '--namespace', '-n',
  '--kubeconfig', '--token', '--as', '--as-group', '--certificate-authority', '--client-certificate',
  '--client-key', '--cache-dir', '--request-timeout', '--profile', '--profile-output',
  // systemd
  '--unit', '-u', '--property', '-p', '--type', '--state', '--signal', '-s',
  '--boot', '-b', '--facility', '-p', '--priority', '-p', '--identifier', '-i',
  // terraform / helm / docker generic
  '--context', '-c', '--namespace', '-n', '--timeout', '-f', '--values',
  '--version', '-v', '--env', '-e', '--network', '--user', '-u',
]);

/**
 * Skip leading options to locate the real verb.
 *
 * Why this is needed: kubectl/systemctl global options come before the verb,
 * e.g. `kubectl --context=prod delete pod x`. Taking argv[1] directly gives
 * `--context=prod`, which falls into "not in allowlist" → misclassified as
 * unknown and blocked. fail-closed is safe but would block all normal ops
 * commands, degrading the gate into a friction source.
 *
 * Returns [verb, subverb]; when no verb exists returns [null, null], letting
 * the caller decide how to degrade.
 */
function locateVerb(argv, optionCount = 4) {
  let i = 1;
  while (i < argv.length && optionCount > 0) {
    const t = argv[i];
    if (!t.startsWith('-')) break;
    optionCount--;
    if (t.includes('=')) { i += 1; continue; }              // --flag=value carries its own value
    const bare = t.replace(/^-+/, '');                       // -n / --namespace
    if (OPTION_TAKES_VALUE.has(t) || OPTION_TAKES_VALUE.has(bare)) {
      // Has a value and the value doesn't look like an option: `-n ns` consumes, `-n --flag` does not
      if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) i += 2;
      else i += 1;
      continue;
    }
    i += 1;                                                  // Boolean flag, skip
  }
  if (i >= argv.length) return [null, null];
  return [argv[i], argv[i + 1] || null];
}

/**
 * Extract the remote command arguments from an ssh command line.
 *
 * ssh syntax: ssh [options] [user@]host [command [args...]]
 * Options that take values consume the next token. The first non-option token
 * after all options is the host. Everything after is the remote command.
 *
 * @param {string[]} argv  Full argv including 'ssh' at [0]
 * @returns {string[]|null} Remote command tokens, or null if no remote command
 */
function extractSshRemoteArgs(argv) {
  // SSH options that take a value argument (subset of common ones)
  const SSH_OPT_VALUE = new Set([
    '-b', '-c', '-D', '-E', '-e', '-F', '-i', '-J', '-l', '-L', '-m',
    '-o', '-O', '-p', '-R', '-S', '-W', '-w',
    '-B', '--bind-address', '--cert-key-id', '--sk-provider',
    '--user-known-hosts-file', '--identity-agent', '--jump-host',
    '--local-forward', '--mac', '--proxy-command', '--remote-forward',
    '--socketpath', '--timeout',
  ]);
  let i = 1;
  // Skip ssh options
  while (i < argv.length) {
    const t = argv[i];
    if (t.startsWith('-')) {
      // -- terminates option processing; rest is host + command
      if (t === '--') { i++; break; }
      if (SSH_OPT_VALUE.has(t)) { i += 2; continue; }
      // Boolean option or unknown -X form; skip just this token
      i++;
      continue;
    }
    break;
  }
  // Skip host (user@host or just host)
  if (i < argv.length) i++;
  // Everything remaining is the remote command
  if (i < argv.length) return argv.slice(i);
  return null;
}

/**
 * Colon-syntax host shape: `[user@]host`. Letters, digits, dot, underscore and
 * hyphen only, and must start and end with an alphanumeric character.
 */
const HOSTNAME_SHAPE = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;

/**
 * Whether a single rsync/scp token denotes a remote target.
 *
 * Why this exists: the scp/rsync branch in assessCommand used to answer only
 * "is the binary scp or rsync" and approve immediately, on the stated premise
 * "file transfer to/from a **remote** host" -- without ever checking that a
 * remote host was named. A local-to-local copy was therefore intercepted as L3
 * with the reason "Remote file transfer", a reason that contradicted the
 * command: `rsync -a --delete /a/src/ /b/dst/` has no remote target at all.
 *
 * The gate governs ops tools, i.e. actions against remote / production
 * infrastructure (ops-execution.md section 1). A local copy touches only the
 * local filesystem, so it is not an ops action and belongs to the platform's
 * default permission flow -- the same treatment rm / mkfs / dd receive.
 *
 * Recognized as remote:
 *   1. Explicit transport scheme: ssh://, rsync://, sftp://, scp://.
 *      file:// is local and is NOT remote.
 *   2. `host:path` / `user@host:path`, including the rsync daemon form
 *      `host::module` and a bare `host:` (which lists the remote home).
 *      Bracketed IPv6 literals (`[::1]:/path`) are remote hosts.
 *   3. Remote-shell transfer options `-e` / `--rsh` / `--rsh=<prog>` (rsync).
 *      They have no local meaning, so their presence alone marks the transfer
 *      as remote.
 *
 * NOT remote: a leading `/`, `./`, `../`, or a bare relative path.
 *
 * Deliberate ambiguity, recorded honestly: `host:path` and the Windows drive
 * letter `C:\path` both contain a colon. This repository runs on macOS/Linux,
 * so the decision is made on host-name shape -- the text to the left of the
 * colon must look like `[user@]host`. A local path that happens to look like a
 * hostname (a rare name such as `src:1/`) is therefore treated as remote; that
 * errs toward asking rather than toward letting a remote transfer pass
 * unexamined.
 *
 * @param {string} token One argv element (argv[0] included)
 * @returns {boolean}
 */
function isRemoteTarget(token) {
  if (typeof token !== 'string' || !token) return false;

  // Remote-shell transfer options. Evaluated before the dash guard below
  // (these start with '-'); only ever consulted for scp/rsync.
  if (token === '-e' || token === '--rsh' || token.startsWith('--rsh=')) return true;

  // Any other option is not a target.
  if (token.startsWith('-')) return false;

  // Bracketed IPv6 literal: [::1]:/path
  if (token.startsWith('[')) {
    const end = token.indexOf(']');
    return end > 1 && token[end + 1] === ':';
  }

  // Explicit scheme. file:// addresses the local filesystem.
  const scheme = token.match(/^([A-Za-z][A-Za-z0-9+.-]*):\/\//);
  if (scheme) return scheme[1].toLowerCase() !== 'file';

  // Local path shapes are never remote.
  if (token.startsWith('/') || token === '.' || token === '..'
      || token.startsWith('./') || token.startsWith('../')) return false;

  // Host colon syntax.
  const colon = token.indexOf(':');
  if (colon <= 0) return false;
  const host = token.slice(0, colon);
  const rest = token.slice(colon + 1);
  // Windows drive letter guard: single letter followed by `\` (or nothing).
  if (/^[A-Za-z]$/.test(host) && (rest === '' || rest.startsWith('\\'))) return false;
  const hostOnly = host.includes('@') ? host.slice(host.lastIndexOf('@') + 1) : host;
  return HOSTNAME_SHAPE.test(hostOnly);
}

/**
 * Escalate a risk level by one tier for remote execution wrapping.
 * Remote execution adds blast radius (network, production proximity).
 * L0 -> L3, L1 -> L3, L3 -> L3, L4 -> L4, L5 -> L5.
 */
function escalateRisk(risk) {
  if (risk === 'L0' || risk === 'L1' || risk === 'L2') return 'L3';
  return risk; // L3, L4, L5 stay
}

/**
 * Assess a single ops command.
 *
 * @param {string[]} argv      Structured argv, argv[0] is the binary
 * @param {object}   [options]
 * @param {boolean}  [options.fromShell=false]
 *        true means argv comes from a real shell command line (Bash hook scenario).
 *        In this case, skip the "arguments contain shell control characters" check —
 *        because the host shell handles `>` redirection and `|` pipes anyway.
 *        That check is designed for the runbook contract (argv arrays must not
 *        contain shell strings); applying it to shell scenarios would misclassify
 *        `kubectl get pods > f.json` as high-risk.
 * @param {boolean}  [options.remoteEndpointEnv=false]
 *        true means the caller found a `DOCKER_HOST=` / `DOCKER_CONTEXT=`
 *        assignment ahead of the binary, i.e. the command names a remote daemon
 *        through the environment rather than through `-H` / `--context`. The
 *        caller reports the fact; this function produces the disposition.
 *        Consumed ONLY by the docker/podman branch, where it voids the
 *        local-development exemption exactly as a flag qualifier does.
 *        Not passed by the runbook path (scripts/state.js), which carries
 *        structured argv -- see the note at the option's declaration.
 * @returns {{disposition:'auto_read'|'approval_required'|'block',
 *            approvalMode:'none'|'pre_execution'|'blocked',
 *            risk:'L0'|'L1'|'L2'|'L3'|'L4'|'L5',
 *            reason:string,
 *            unclassified?:boolean}}
 *        unclassified === true means "recognizable as an ops tool, but risk
 *        cannot be determined" -- the caller's allow/deny-unclassified policy
 *        should handle it. Without this flag, block means contract-level failure
 *        (invalid argv or shell control characters in runbook mode), not a
 *        risk-based prohibition. The gate is cautious-execution, not prohibition:
 *        every recognized ops command can proceed after user confirmation.
 */
function assessCommand(argv, options = {}) {
  const fromShell = options.fromShell === true;
  // The caller reports that the command carried a `DOCKER_HOST=` /
  // `DOCKER_CONTEXT=` assignment before the binary (see hooks/opsgate.js). It is
  // consumed ONLY inside the docker/podman branch and treated exactly like a
  // `-H` / `--context` qualifier: it names the same remote daemon, just through
  // the environment instead of a flag.
  //
  // Why an option and not a scan here: `normalize()` strips leading `VAR=VAL`
  // tokens (and the `env` wrapper) before this function is reached, so the
  // assignment is already gone from argv by the time the policy layer runs.
  // Producing it is the caller's job; turning it into a disposition stays here.
  //
  // Deliberately inconsistent with scripts/state.js:825: the runbook path does
  // NOT pass this option and its behavior is unchanged. Runbooks carry
  // structured argv where an env assignment belongs in its own field, so
  // scanning there is not meaningful -- widening it would be a separate change.
  const remoteEndpointEnv = options.remoteEndpointEnv === true;
  if (!Array.isArray(argv) || !argv.length || argv.some(x => typeof x !== 'string' || !x.length)) {
    return { ...result('block', 'L5', 'argv must be a non-empty string array'), unclassified: true };
  }
  // The whole point of structured argv is to avoid shell execution; control
  // characters mean the contract is broken. Only effective in runbook scenario,
  // see fromShell description. Marked unclassified: this is "contract broken"
  // not "known high-risk" — caller's allow/deny-unclassified should handle it.
  if (!fromShell && argv.some(x => SHELL_CONTROL.test(x))) {
    return { ...result('block', 'L5', 'Arguments contain shell control characters'), unclassified: true };
  }

  const bin = (argv[0].split('/').pop() || '').toLowerCase();
  const [verb, subverb] = locateVerb(argv);

  if (bin === 'kubectl') {
    if (READ_KUBECTL.has(verb)) return result('auto_read', 'L0', `Safe read-only Kubernetes command: ${verb}`);
    if (verb === 'config' && ['current-context', 'get-contexts', 'view'].includes(subverb)) {
      return result('auto_read', 'L0', `Safe read-only kubectl config query: ${subverb}`);
    }
    if (verb === 'auth' && subverb === 'can-i') return result('auto_read', 'L0', 'Safe read-only permission query');
    if (verb === 'rollout' && ['status', 'history'].includes(subverb)) {
      return result('auto_read', 'L0', `Safe read-only rollout query: ${subverb}`);
    }
    if (WRITE_KUBECTL.has(verb) || (verb === 'rollout' && ['restart', 'undo', 'resume', 'pause'].includes(subverb))) {
      // kubectl exec / attach / cp can run arbitrary programs inside the target
      // container — nominally a single verb, but actual semantics equal
      // "running a shell inside the cluster". Therefore escalate to L5: the
      // consequences depend on the unknown command inside the container.
      const arbitrary = ['exec', 'attach', 'cp'].includes(verb);
      return result(
        'approval_required',
        arbitrary ? 'L5' : 'L3',
        arbitrary
          ? `Can execute arbitrary programs inside target container: ${verb} (consequences depend on unspecified command)`
          : `Kubernetes state-changing command: ${verb}${subverb ? ` ${subverb}` : ''}`
      );
    }
    return { ...result('block', 'L4', `Not in Kubernetes allowlist: ${verb || '(missing verb)'}`), unclassified: true };
  }

  if (bin === 'systemctl') {
    if (READ_SYSTEMCTL.has(verb)) return result('auto_read', 'L0', `Safe read-only systemctl query: ${verb}`);
    if (WRITE_SYSTEMCTL.has(verb)) return result('approval_required', 'L3', `systemd state change: ${verb}`);
    return { ...result('block', 'L4', `Not in systemctl allowlist: ${verb || '(missing verb)'}`), unclassified: true };
  }

  if (READ_ONLY_BINS.has(bin)) return result('auto_read', 'L0', `Safe read-only system query: ${bin}`);

  if (bin === 'journalctl') {
    // journalctl itself is read-only, but unconstrained reads can overwhelm disk
    // IO or leak credentials in logs. Allow but downgrade to L1; the executor
    // path must limit output volume and timeout.
    return result('auto_read', 'L1', 'Read-only log query; executor must still limit output volume and timeout');
  }

  if (bin === 'terraform') {
    if (['plan', 'show', 'validate', 'version'].includes(verb)) {
      return result('auto_read', 'L1', `Terraform read-only/compute operation: ${verb}`);
    }
    if (['apply', 'destroy', 'import'].includes(verb)) {
      return result('approval_required', 'L4', `Terraform state change: ${verb}`);
    }
    return { ...result('block', 'L4', `Not in Terraform allowlist: ${verb || '(missing verb)'}`), unclassified: true };
  }

  if (bin === 'helm') {
    if (['list', 'status', 'history', 'get'].includes(verb)) {
      return result('auto_read', 'L0', `Helm read-only query: ${verb}`);
    }
    if (['install', 'upgrade', 'uninstall', 'rollback'].includes(verb)) {
      return result('approval_required', 'L3', `Helm state change: ${verb}`);
    }
    return { ...result('block', 'L4', `Not in Helm allowlist: ${verb || '(missing verb)'}`), unclassified: true };
  }

  if (bin === 'ssh') {
    // ssh can execute remote commands. Extract the remote command portion and
    // recursively assess it. If the remote command is a known ops tool, use its
    // risk level; otherwise treat ssh itself as L3 (remote execution).
    //
    // ssh syntax: ssh [options] [user@]host [command [args...]]
    // Options that take values are skipped; the first non-option token after
    // options is the host; everything after is the remote command.
    const remoteArgs = extractSshRemoteArgs(argv);
    if (remoteArgs && remoteArgs.length > 0) {
      // Recursively assess the remote command
      const remoteVerdict = assessCommand(remoteArgs, options);
      // Escalate: ssh wrapping an ops command inherits that command's risk
      // level (or higher), because remote execution adds latency and blast radius.
      const escalatedRisk = escalateRisk(remoteVerdict.risk);
      return result(
        'approval_required',
        escalatedRisk,
        `Remote execution via ssh: ${renderArgv(remoteArgs)} (remote command classified as ${remoteVerdict.risk})`
      );
    }
    // No remote command (interactive login shell) -> L3
    return result('approval_required', 'L3', 'SSH remote execution requires user approval');
  }

  if (bin === 'scp' || bin === 'rsync') {
    // Only file transfer to/from a **remote** host is an ops action. The
    // remark below used to be the only condition this branch applied, which
    // intercepted local-to-local copies as well (e.g. `rsync -a --delete
    // /a/src/ /b/dst/` reported as "Remote file transfer"). A local copy is
    // not an ops action -- see ops-execution.md section 1: "This gate only
    // manages ops tools (remote/production infrastructure)." It goes to the
    // platform's default permission flow, like rm / mkfs / dd.
    //
    // assessCommand receives only argv (the platform decides the cwd and the
    // hook is a pure function), so a leading `-` option cannot be resolved to
    // a local path here. Consequence, accepted deliberately: `rsync -a src/
    // dst/` -- relative paths on both sides, no cwd to compare against -- now
    // falls outside the gate. Only the remote forms keep asking.
    if (!argv.some(isRemoteTarget)) {
      return result('auto_read', 'L0', `Local file transfer, not an ops command (no remote target): ${bin}`);
    }
    return result('approval_required', 'L3', `Remote file transfer requires user approval: ${bin}`);
  }

  if (bin === 'docker' || bin === 'podman') {
    // Boundary re-drawn here. Two consequences are deliberate and recorded:
    //
    // (1) Why the group verbs (compose / system / image / volume / network /
    //     container / builder / buildx / context) are matched on their own
    //     names: locateVerb returns the first non-option token, so
    //     `docker compose up -d` has verb='compose' (not 'up') and
    //     `docker system prune` has verb='system' (not 'prune'). Matching only
    //     the subverb would leave every `docker compose *` and every
    //     `docker system *` in the deny fallthrough below.
    //
    // (1b) The price of that grouping, paid back explicitly. Grouping releases
    //     the group's egress subverbs and the build-time `--push` flag, which
    //     reach the same remote registry as `docker push` and were measured to
    //     have regressed from deny to pass:
    //       `docker build --push -t reg/img:1 .`
    //       `docker buildx build --push -t x .`
    //       `docker container push reg/img:1`
    //       `docker image push reg/img:1`
    //     All four are pulled back to ask by isRegistryEgress(), which is
    //     evaluated BEFORE the read-only and pass lists below -- ordering is
    //     load-bearing, because `image` / `container` are also pass-listed
    //     group verbs. The check is a property test (does this argv publish an
    //     image / request a build-time push), not a subverb re-listing, which
    //     is what keeps `image prune`, `image ls` and `container ls` passing.
    //
    // (2) Residual risk, stated rather than left silent. The gate is a pure
    //     function keyed by verb: it cannot see whether the target is a local
    //     container or a production host. After this re-drawing, these are no
    //     longer intercepted:
    //       - `docker exec -it <PRODUCTION container> sh`
    //       - `docker run -v /:/host ...`   (host filesystem mounted rw)
    //       - `docker run --privileged ...`
    //     They now pass exactly like their local counterparts, because the
    //     command line cannot distinguish them. Treating every `run`/`exec` as
    //     remote-backed would re-deny the ordinary local case -- which is the
    //     availability defect this change exists to fix. The levels below
    //     (L5 for run/exec) keep that inherent severity visible.
    //     Scope limit: this residual list covers the *unqualified* forms. A run
    //     or exec that names a remote endpoint is gated -- see (2a) below.
    //
    //     **Remote daemon targets.** This was first written as a
    //     pre-existing-and-unchanged claim covering the whole remote-daemon
    //     surface, which reversed the direction for the write side. Corrected
    //     once with before/after measurements (#129) -- and then corrected
    //     again (#130): the conclusion drawn from those measurements, "accept
    //     this surface rather than put a gate on it", was itself wrong.
    //
    //     The reasoning error is worth recording, because it looked sound. It
    //     went: locateVerb cannot see `--context` / `-H` / the `=`-form, so the
    //     same verb is indistinguishable whether it targets a local or a remote
    //     daemon, therefore no gate is possible. The first clause is true;
    //     "therefore no gate is possible" does not follow. It is only
    //     *locateVerb* that cannot see the qualifier -- a plain scan of the
    //     option prefix can, and now does (dockerRemoteEndpoint below). The gate
    //     stays pure and stays keyed by argv; it simply reads a token that
    //     locateVerb skips.
    //
    //     Measured regression this closes (pre-change -> released -> now):
    //       - `docker -H=tcp://prod:2375 rm -f web`         ask  -> pass -> ask L3
    //       - `docker -H=tcp://prod:2375 rmi img`           ask  -> pass -> ask L3
    //       - `docker -H=tcp://prod:2375 stop web`          ask  -> pass -> ask L3
    //       - `docker -H=tcp://prod:2375 kill web`          ask  -> pass -> ask L3
    //       - `docker -H=tcp://prod:2375 system prune -a`   deny -> pass -> ask L3
    //       - `docker --host=tcp://prod:2375 rm -f web`     ask  -> pass -> ask L3
    //       - `docker -H=tcp://prod:2375 run -it ubuntu`    ask L5 -> pass -> ask L5
    //       - `docker --context=prod build -t app .`        deny -> pass -> ask L3
    //     The generic run/exec exemption is NOT reversed: *unqualified*
    //     `docker run -it ubuntu` / `exec -it c sh` still pass, because there the
    //     gate genuinely cannot see the target. Only a *declared* endpoint is
    //     gated. The spaced `-H <value>` form needs no new handling: locateVerb
    //     lands on the URL as the verb, so it already hits the fail-closed deny
    //     above and still does.
    //     Unclosed forms (`DOCKER_HOST=... ` prefix, `env DOCKER_HOST=...`,
    //     `docker context use prod`) are registered with measurements in
    //     ops-execution.md section 3 rather than implied away.
    //
    //     (b) Read side -- unchanged by either correction: `docker --context
    //     prod ps` / `logs` / `inspect` returned pass (L0) at HEAD and still do.
    //     They answer for a remote daemon while still being labelled "Safe
    //     read-only container query", which is deliberate: reading is reading.
    if (READ_DOCKER_VERBS.has(verb)) {
      return result('auto_read', 'L0', `Safe read-only container query: ${verb}`);
    }
    // `docker context ...` -- target selection, not local development.
    //
    // Why it needs its own branch rather than a place in the pass list: the
    // verb is `context` and the action is in the SUBVERB, the same shape as
    // `docker compose up -d` (locateVerb(['docker','context','use','prod'])
    // -> ['context','use']). Listing `context` in LOCAL_DEV_DOCKER_VERBS
    // therefore released `use` / `create` / `remove` along with `ls`.
    //
    // Measured regression this closes (pre-change -> released -> now):
    //   `docker context use prod`      deny -> pass -> ask L3
    //   `docker context create c`      deny -> pass -> ask L3
    //   `docker context remove prod`   deny -> pass -> ask L3
    // and `docker context rm|update|import` with them.
    //
    // Ordering inside this branch is load-bearing: the read-only test comes
    // FIRST, otherwise `docker context ls` would be swept into the ask below
    // and the gate would over-tighten a pure query.
    if (verb === 'context') {
      if (CONTEXT_READ_SUBVERBS.has(subverb)) {
        return result('auto_read', 'L0', `Safe read-only docker context query: ${subverb}`);
      }
      // Bare `docker context` (no subverb) is the interactive form; it is still a
      // command that manages the daemon target, so it does not pass.
      if (!subverb || CONTEXT_TARGET_SUBVERBS.has(subverb)) {
        return result(
          'approval_required',
          'L3',
          `Selects or changes WHICH docker daemon is targeted${subverb ? ` (context ${subverb})` : ''} -- ${subverb === 'use' ? 'sticky for the rest of the shell session' : 'not a local development action'}: ${renderArgv(argv.slice(0, 5))}`
        );
      }
      // Unknown subverb: fall through to the fail-closed deny at the bottom of
      // this branch, exactly like any other unrecognized docker verb. It must
      // not become pass.
    }
    // Container-registry egress. Previously written as "The only container
    // action that leaves the local machine" gated on `verb === 'push'` alone.
    // That claim was false and the defect was measured: the verb test covers
    // only the top-level form, so four same-effect forms passed untouched.
    //   `docker build --push -t reg/img:1 .`      HEAD deny -> pass (bug)
    //   `docker buildx build --push -t x .`       HEAD deny -> pass (bug)
    //   `docker container push reg/img:1`         HEAD deny -> pass (bug)
    //   `docker image push reg/img:1`             HEAD deny -> pass (bug)
    // Nothing here is narrowed: these now ask, and `docker build -t app .` /
    // `docker image prune` / `docker container ls` keep passing, because the
    // check tests the egress property, not the group verb.
    if (isRegistryEgress(argv, verb, subverb)) {
      return result('approval_required', 'L3', `Publishes an image to a remote registry (leaves the local machine): ${renderArgv(argv.slice(0, 5))}`);
    }
    if (LOCAL_DEV_DOCKER_VERBS.has(verb)) {
      // Remote endpoint qualifier: the local-development premise no longer
      // holds, so the exemption below must not apply.
      //
      // Every entry of LOCAL_DEV_DOCKER_VERBS is justified by "this acts on the
      // machine running the agent". A `-H` / `--host` / `--context` naming
      // another daemon voids exactly that justification -- there is nothing
      // local left about `docker -H=tcp://prod:2375 rm -f web`, which removes a
      // container on a **production daemon**. Measured against the pre-change
      // hook, these had regressed to pass:
      //   `docker -H=tcp://prod:2375 rm -f web`         HEAD ask  -> pass (bug)
      //   `docker -H=tcp://prod:2375 rmi img`           HEAD ask  -> pass (bug)
      //   `docker -H=tcp://prod:2375 stop web`          HEAD ask  -> pass (bug)
      //   `docker -H=tcp://prod:2375 kill web`          HEAD ask  -> pass (bug)
      //   `docker -H=tcp://prod:2375 system prune -a`   HEAD deny -> pass (bug)
      //   `docker --host=tcp://prod:2375 rm -f web`     HEAD ask  -> pass (bug)
      // plus `docker -H=tcp://prod:2375 run -it ubuntu` / `exec -it c sh`
      // (HEAD ask L5) and `docker --context=prod build -t app .` (HEAD deny).
      //
      // Placement is load-bearing, and not where it was first drafted. This
      // sits INSIDE the pass-list branch, not before it, so it can only *void
      // the exemption* -- it can never upgrade an unknown verb. Putting it
      // ahead of the branch would turn `docker -H=tcp://x frobnicate` from the
      // fail-closed deny into an ask, i.e. relax the floor while claiming to
      // tighten. Unknown verbs therefore still deny, qualifier or not.
      //
      // Only write-ish verbs are affected: read-only verbs returned above and
      // keep their pre-change level, so a remote `ps` / `logs` / `inspect`
      // still answers pass (it is still only a query).
      // Same voiding, one more way to name the endpoint: a `DOCKER_HOST=` /
      // `DOCKER_CONTEXT=` assignment in the command's environment prefix. It is
      // the documented way to point the CLI at another daemon and the form most
      // likely to sit in a shell profile, so it is the one that silently reaches
      // production. Measured: `DOCKER_HOST=tcp://prod:2375 docker rm -f web` and
      // `env DOCKER_HOST=tcp://prod:2375 docker rm -f web` were ask at HEAD and
      // had regressed to pass, because normalize() strips the assignment before
      // this point and argv arrived byte-identical to the local `docker rm web`.
      //
      // Placement inherits the reasoning above: this stays INSIDE the pass-list
      // branch so it can only void the exemption. A `docker -H=tcp://x
      // frobnicate` still denies, with or without an env assignment.
      const qualifier = dockerRemoteEndpoint(argv)
        || (remoteEndpointEnv ? REMOTE_ENDPOINT_ENV_LABEL : null);
      if (qualifier) {
        return result(
          'approval_required',
          verb === 'run' || verb === 'exec' ? 'L5' : 'L3',
          `Remote daemon target (${qualifier}) -- acts on another machine, not local development: ${renderArgv(argv.slice(0, 5))}`
        );
      }
      // run/exec keep L5: the command executes an arbitrary program, and only
      // the jurisdiction changed, not the semantics.
      if (verb === 'run' || verb === 'exec') {
        return result('auto_read', 'L5', `Local container execution, outside the gate's remote/production jurisdiction: ${verb}`);
      }
      return result('auto_read', 'L2', `Local container development, not a remote/production ops action: ${verb}`);
    }
    return { ...result('block', 'L4', `Not in Docker allowlist: ${verb || '(missing verb)'}`), unclassified: true };
  }

  // DISM (Windows Deployment Image Servicing and Management): manages optional
  // features of the *local* host. Per ops-execution.md section 1 the gate only
  // governs ops tools aimed at remote/production infrastructure, so local host
  // configuration is not an ops action by itself -- but enabling/disabling a
  // component changes host state and needs a restart, so it stays behind
  // approval rather than being silently auto-read.
  if (bin === 'dism' || bin === 'dism.exe') {
    const rest = argv.slice(1).join(' ').toLowerCase();
    if (rest.includes('/get-') || rest.includes('/?')) {
      return result('auto_read', 'L0', `Read-only DISM query: ${renderArgv(argv.slice(1, 4))}`);
    }
    if (rest.includes('/enable-feature') || rest.includes('/disable-feature')) {
      const turningOff = rest.includes('/disable-feature');
      return result(
        'approval_required',
        'L3',
        `Windows optional feature ${turningOff ? 'disable' : 'enable'} changes host state${turningOff ? '' : ' and may require a restart'}: ${renderArgv(argv.slice(1, 5))}`
      );
    }
    return { ...result('block', 'L4', `Not in DISM allowlist: ${renderArgv(argv.slice(1, 3))}`), unclassified: true };
  }

  // wsl.exe: local developer VM/container runtime. Inventory and status are
  // read-only; anything that mutates host or distro state goes through
  // approval. Two cases deserve their own level: `--unregister` destroys a
  // distro's filesystem (L4), and `-e/--exec` runs an arbitrary command inside
  // a distro (L5) -- it is effectively a shell, so it must never be lumped in
  // with plain status queries.
  if (bin === 'wsl' || bin === 'wsl.exe') {
    const args = argv.slice(1);
    const has = (...tokens) => args.some(a => tokens.includes(a.toLowerCase()));

    if (has('-e', '--exec', '--shell-type')) {
      return result('approval_required', 'L5', `Arbitrary command execution inside a distro: ${renderArgv(args.slice(0, 3))}`);
    }
    if (has('--unregister')) {
      return result('approval_required', 'L4', `Destroys a distro filesystem: ${renderArgv(args.slice(0, 3))}`);
    }
    if (has('--install', '--shutdown', '--terminate', '-t', '--update', '--set-default-version',
            '--set-version', '--import', '--export', '--mount', '--unmount', '--set-default-user')) {
      return result('approval_required', 'L3', `WSL state change requires approval: ${renderArgv(args.slice(0, 3))}`);
    }
    if (!args.length) {
      return result('approval_required', 'L3', 'WSL interactive shell launch');
    }
    const READ_ONLY = new Set(['--status', '--version', '-l', '--list', '-v', '--verbose', '--online', '--help', '-h', '-d', '--distribution']);
    if (args.every(a => READ_ONLY.has(a.toLowerCase()))) {
      return result('auto_read', 'L0', `Read-only WSL query: ${renderArgv(args)}`);
    }
    return { ...result('block', 'L4', `Not in WSL allowlist: ${renderArgv(args.slice(0, 3))}`), unclassified: true };
  }

  // Unknown binary: blocked by default, never auto-classified as read-only.
  // This is the core of fail-closed — everything outside the allowlist must
  // first be explicitly defined.
  return { ...result('block', 'L4', `Unknown command blocked by default: ${bin}`), unclassified: true };
}

/**
 * Reconstruct a readable command line from structured argv, for Review Card
 * and prompt display only. Only tokens without shell metacharacters are output
 * verbatim; others go through JSON escaping — to prevent the displayed string
 * from being mistaken for a directly pasteable shell command.
 */
function quoteArg(value) {
  return /^[A-Za-z0-9_./:=@%+,-]+$/.test(value) ? value : JSON.stringify(value);
}

function renderArgv(argv) { return argv.map(quoteArg).join(' '); }

// Compatibility alias for the original `OPS.xxx` object access form in the hook
// (original require variable name was OPS)
const OPS = { ALWAYS_BLOCK_BINS, assessCommand, escalateRisk, extractSshRemoteArgs, isRemoteTarget, locateVerb, quoteArg, renderArgv, result };

// ==== END INLINED ====

function dbg(msg) { if (DEBUG) process.stderr.write('[hello-dev-opsgate] ' + msg + '\n'); }

function warn(msg) { process.stderr.write('[hello-dev-opsgate] warning: ' + msg + '\n'); }

/**
 * Forensic evidence caliber same as git-gate:
 *   caller not set        -- direct command-line call, indistinguishable from host-registered calls, no trace written
 *   caller=release-check  -- self-check call, proves script capability, excluded
 *   caller=host           -- injected by registrant, trusted as runtime evidence
 */
function trace(event) {
  const p = process.env.HELLODEV_OPSGATE_TRACE;
  if (!p) return;
  const caller = process.env.HELLODEV_OPSGATE_CALLER;
  if (!caller) { dbg('trace skipped: caller not set, indistinguishable from host-injected calls'); return; }
  try {
    require('fs').appendFileSync(p, JSON.stringify({
      at: new Date().toISOString(),
      event,
      caller,
      mode: GATE.mode,
      pid: process.pid,
      gate: 'hello-dev/opsgate',
      sourceVersion: SOURCE_VERSION,
    }) + '\n');
  } catch (e) { dbg('trace write failed: ' + (e && e.message)); }
}

/**
 * Walk up from hook's own directory to find SKILL.md and read version.
 * Don't use hardcoded $HOME path - host-registered hooks may be on copies,
 * hardcoded paths would read source version, making 'source vs runtime' comparison always equal.
 */
function readSourceVersion() {
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
}

/* ---------- Command parsing (isomorphic with git-gate) ---------- */

// Split compound commands (&& || ; | newlines), recursively enter sh -c "..." nesting
/* ---------- Command parsing (shared with other gate via scripts/lib/bash-lex.js) ---------- */
//
// splitSegments / tokenize / normalize extracted to shared module: both gates' lexical analysis must be consistent,
// otherwise same command would be split into different segments in git-gate vs opsgate, causing risk classification divergence.
// heredoc body skip also in shared module - fixing only one gate causes behavioral inconsistency.

/* ---------- Binaries this gate is responsible for ---------- */

/**
 * Only these binaries are 'ops commands'.
 * Criteria must be **whitelist**: leave git to git-gate, leave npm/other tools to platform default permission flow,
 * otherwise both gates would issue approval for same command, user sees two popups without knowing which to look at.
 *
 * `scp` / `rsync` are conditional members: being on this list only means the gate
 * looks at them. Whether they are actually ops commands is decided per command by
 * isRemoteTarget -- a remote target (`host:path`, `user@host:path`, `host::module`,
 * `ssh://` / `rsync://` / `sftp://`, `-e` / `--rsh`) makes the transfer an ops action;
 * a local-to-local copy does not name a remote host and is classified auto_read, so
 * it passes through to the platform's default permission flow like rm / mkfs / dd.
 */
const OPS_BINS = new Set([
  'kubectl', 'oc', 'helm', 'systemctl', 'journalctl', 'terraform', 'tofu',
  'docker', 'podman', 'aws', 'gcloud', 'az',
  'df', 'free', 'uptime', 'hostname', 'id', 'whoami', 'pwd', 'date',
  'ssh', 'scp', 'rsync',
  'wsl', 'dism',
]);

function binOf(token) { return (token.split('/').pop() || '').toLowerCase(); }

/**
 * Whether token falls under this gate's jurisdiction.
 *
 * Whitelist-based: only confirmed ops tools are managed.
 * Local system commands (rm, mkfs, dd, shutdown, etc.) are NOT ops commands
 * and are left to the platform's default permission flow.
 * Unrecognized binaries (custom scripts, npm ecosystem tools) also go to
 * platform default -- isomorphic with git-gate only handling git.
 */
function isOpsToken(token) {
  const b = binOf(token);
  return OPS_BINS.has(b);
}

/* ---------- Output ---------- */

const RISK_TEXT = {
  L5: { icon: '[WARN]', note: 'Consequences depend on unknown factors, user confirmation required before execution' },
  L4: { icon: '[WARN]', note: 'Destructive operation, possibly irreversible, user confirmation required' },
  L3: { icon: '[WARN]', note: 'Will change target state, please confirm scope and target environment' },
  L2: { icon: '[WARN]', note: 'Constrained write operation, please confirm scope' },
  L1: { icon: '[INFO]', note: 'Read-only but may consume resources or leak sensitive information' },
  L0: { icon: '[OK]', note: 'Safe read-only query, does not change target state' },
};

function emitAsk(command, verdict) {
  const t = RISK_TEXT[verdict.risk] || RISK_TEXT.L3;
  const shown = clip(command);
  const lines = [
    `Hello Dev · Ops approval gate -> ${t.icon} ${verdict.risk} · Pre-execution approval required`,
    `Command: ${shown}`,
    `Verdict: ${verdict.reason}`,
    `Conclusion: ${verdict.disposition === 'approval_required' ? 'State change, must be approved by user before execution' : 'Manual confirmation needed'}`,
    t.note + '.',
    'Required agent behavior: pause this operation and report the exact command and this reason to the user, then ask whether to authorize execution.',
    'Wait for explicit user confirmation before continuing. Do not attempt to reach the same effect through other commands, wrappers, or any indirect route while approval is pending.',
    'If the user declines, stop this operation and say so plainly; report what was not done instead of substituting another action.',
    'Clarification: "ask" means this operation is not yet authorized, not prohibited. Once the user approves it, the operation may be executed.',
    'Before requesting authorization, determine whether the target is production or a stateful service.',
    'If it is production or a stateful service, or that cannot be determined, the authorization request must include an interruption-risk assessment naming: what stops serving and for how long; why it will not interrupt, or what the interruption is; and the rollback point.',
    'If the impact cannot be bounded, say so instead of presenting the operation as safe.',
    'If the target is neither production nor stateful, the ordinary authorization request is sufficient; the assessment is not demanded for every ask.',
  ];
  if (shown !== command) lines.push(TRUNCATED_NOTE);
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason: lines.join('\n'),
    },
  }));
}

/**
 * The display line is bounded so an oversized command cannot flood the host UI.
 * When it is bounded, the message says so explicitly: the instruction above it asks the
 * agent to report the *exact* command, and reporting a silently truncated string as if it
 * were complete would misrepresent what was stopped. The agent issued the command, so it
 * can always reproduce it in full.
 */
const TRUNCATED_NOTE =
  'Note: the Command line above is truncated for display only. Report the full command you attempted, not the truncated form.';

function emitDeny(command, reason) {
  const shown = clip(command);
  const lines = [
    'Hello Dev · Ops approval gate -> [UNCLASSIFIED] Cannot determine risk',
    `Command: ${shown}`,
    `Reason: ${reason}`,
    'This command is recognized as an ops tool but its risk cannot be determined. It is not auto-treated as read-only.',
    'Required agent behavior: pause this operation and report the exact command and this reason to the user, then ask whether to authorize executing it.',
    'Wait for explicit user confirmation before continuing. Do not attempt to bypass this restriction through other commands, rewording, aliases, wrappers, a different tool, or any indirect route.',
    'This gate does not take over the user\'s own shell: the user may run the exact command directly if they choose.',
    'Note: this deny means "cannot classify", not "prohibited due to risk". If the user approves, the operation may proceed.',
  ];
  if (shown !== command) lines.splice(2, 0, TRUNCATED_NOTE);
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: lines.join('\n'),
    },
  }));
}

// Mirrors the WRAPPERS set inside normalize() (scripts/lib/bash-lex.js), plus
// `export`. Duplicated rather than exported because bash-lex.js is inlined into
// and shared with hooks/git-gate.js, which is out of scope for this fix; if that
// list ever changes, this one has to follow.
//
// `export` is here but NOT in normalize()'s list, and that asymmetry is the
// point: `export DOCKER_HOST=...` is a declaration, not a prefix of the command
// it affects, so normalize() correctly leaves it in place and the segment's
// binary becomes `export` (not an ops tool, so the segment is skipped). The
// declaration nevertheless selects the daemon for every LATER command, so this
// scan has to see it. `export` is a shell builtin, not a command that gets
// exec'd, so treating it as a wrapper costs nothing.
const ENV_PREFIX_WRAPPERS = new Set([
  'sudo', 'doas', 'command', 'nohup', 'nice', 'time', 'env', 'xcrun', 'export',
]);

// docker/podman environment variables that select WHICH daemon the CLI talks to.
const REMOTE_ENDPOINT_ENV_VARS = new Set(['DOCKER_HOST', 'DOCKER_CONTEXT']);

const ENV_ASSIGN_RE = /^([A-Za-z_][A-Za-z0-9_]*)=/;

/**
 * Whether a raw command segment carries a DOCKER_HOST= / DOCKER_CONTEXT=
 * assignment ahead of the binary — `DOCKER_HOST=... docker rm -f web`, the same
 * thing behind `env` / `sudo` / `export`, or a bare `export DOCKER_HOST=...`
 * declaration that stands on its own line.
 *
 * Detection ONLY. This returns a boolean and never a disposition: deciding what
 * such a command means stays in scripts/lib/ops-policy.js, which is the single
 * source of truth shared with runbook validation.
 *
 * Why it runs on the RAW segment: normalize() strips leading `VAR=VAL` tokens
 * and recognized wrappers (`env` among them) before assessCommand is reached, so
 * the policy layer receives `['docker','rm','-f','web']` — byte-identical to the
 * local `docker rm -f web`, with no way to tell it targets a production daemon.
 *
 * Only the leading run is scanned, the same prefix discipline as
 * dockerRemoteEndpoint(): a `DOCKER_HOST=` further along (`docker run -e
 * DOCKER_HOST=tcp://x img`) sets the variable INSIDE the container and does not
 * move the CLI's own target, so it must not match. A whole-segment scan would
 * break that case, which is why the option tokens of a wrapper are stepped over
 * rather than ending the scan.
 *
 * Scope of that option step-over, stated rather than implied: it makes the SCAN
 * reach an assignment sitting behind a wrapper's options (`env -i DOCKER_HOST=...`).
 * It does NOT make `env -i ... docker rm -f web` ask, because that segment is
 * discarded before this scan's result is ever used -- normalize() strips the
 * wrapper but leaves its option in place, so tokens[0] is `-i`, isOpsToken('-i')
 * is false and the whole segment is skipped. Measured: `env -i DOCKER_HOST=...
 * docker rm -f web` -> pass, and likewise `sudo -u root ...` (a value-taking
 * option, which additionally ends this scan at `root`) and `sudo -n ...` (which
 * does not). The limitation is not docker-specific -- `env -i kubectl delete pod
 * x` also passes -- and is registered in ops-execution.md rather than fixed here.
 */
function hasRemoteEndpointEnv(segment) {
  let sawWrapper = false;
  for (const t of tokenize(segment)) {
    if (ENV_PREFIX_WRAPPERS.has(t)) { sawWrapper = true; continue; }
    // Options belonging to a wrapper (`env -i`, `sudo -u`) sit between the
    // wrapper and the assignment. They only appear while the prefix is still a
    // wrapper run, so stepping over them cannot reach the argument list of the
    // real binary -- `docker run -e DOCKER_HOST=... img` still stops at `docker`.
    if (sawWrapper && t.startsWith('-') && t !== '-') continue;
    const m = ENV_ASSIGN_RE.exec(t);
    if (m) {
      if (REMOTE_ENDPOINT_ENV_VARS.has(m[1])) return true;
      continue;
    }
    break;   // first token that is neither wrapper nor assignment: prefix is over
  }
  return false;
}

function main() {
  if (OFF) { dbg('gate disabled via HELLODEV_OPSGATE=off'); return; }
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
    dbg(`skip: cwd=${cwd} matches HELLODEV_OPSGATE_SKIP_DIRS`);
    return;
  }

  trace('inspect');
  if (GATE.warn) warn(GATE.warn);

  const found = [];           // segments judged as ask (state change)
  const readable = [];        // segments judged as auto_read (don't block, but log evidence)
  let unclassified = null;    // recognized as ops tool but **risk cannot be determined** segment
  let sawOps = false;

  // A remote-endpoint assignment found in ANY segment applies to the segments
  // that follow it, so the flag accumulates across the whole command line.
  //
  // Why it has to survive across segments: `export DOCKER_HOST=tcp://prod:2375`
  // on its own line is the shell-profile / script-header shape, and it is the
  // form this gate most needs to catch. Left per-segment it was missed twice
  // over -- the `export` segment was skipped entirely (its binary is `export`,
  // not an ops tool) and the following `docker rm -f web` segment looked exactly
  // like the local case. Measured against the pre-change hook that shape was
  // ask and had become pass.
  //
  // Scope: the scan still matches only the two variables that select a docker
  // daemon (REMOTE_ENDPOINT_ENV_VARS). It is deliberately NOT a general
  // "any assignment" rule -- `export FOO=bar` must stay pass.
  let sawRemoteEndpointEnv = false;

  for (const seg of splitSegments(command)) {
    // Scanned on the raw segment, before normalize() strips the assignment.
    if (hasRemoteEndpointEnv(seg)) sawRemoteEndpointEnv = true;
    const norm = normalize(tokenize(seg));
    if (!norm) continue;
    const segs = norm.nested ? splitSegments(norm.nested) : [seg];
    for (const s of segs) {
      const n = norm.nested ? normalize(tokenize(s)) : norm;
      if (!n || !n.tokens) continue;
      // Arm BEFORE the ops-token test below, not after it.
      //
      // Why: inside `bash -c "..."` the segments are the inner ones (`s`), not the
      // outer `seg` scanned above, so a declaration segment had to be recorded here
      // or it was lost. And it has to be recorded before the isOpsToken discard,
      // because a declaration segment IS the segment that gets discarded -- `export`
      // is not an ops command, so `isOpsToken('export')` is false and the segment
      // never reaches assessCommand. Recording after that test would mean the one
      // segment that carries the finding is exactly the one that cannot report it.
      //
      // Measured regression this closes: `bash -c "export DOCKER_HOST=tcp://prod:2375;
      // docker rm -f web"` and the `sh -c` spelling were ask against the pre-change
      // hook and had become pass. The in-segment prefix forms (`bash -c
      // "DOCKER_HOST=... docker rm -f web"`) were never affected and still ask.
      sawRemoteEndpointEnv = sawRemoteEndpointEnv || hasRemoteEndpointEnv(s);
      if (!isOpsToken(n.tokens[0])) continue;   // not a command this gate manages
      sawOps = true;
      let verdict;
      try {
        // fromShell: this gate receives the whole shell command line, `>` redirects and `|` pipes
        // are handled by host shell, should not be treated as 'concatenating shell strings' and misjudged as high-risk.
        // remoteEndpointEnv: reported, not decided. A DOCKER_HOST= / DOCKER_CONTEXT=
        // assignment is stripped by normalize() before this point, so it is detected on
        // the raw segment and handed over as an option; the disposition it produces is
        // ops-policy.js's call. See hasRemoteEndpointEnv above.
        // sawRemoteEndpointEnv has just been armed above from this very segment, so
        // it carries both cases: a declaration in this segment's own prefix, and one
        // seen in any earlier segment (`export DOCKER_HOST=...` on its own line, or
        // an earlier inner segment of a `bash -c "..."` wrapper).
        verdict = OPS.assessCommand(n.tokens, {
          fromShell: true,
          remoteEndpointEnv: sawRemoteEndpointEnv,
        });
      } catch (e) {
        // Recognized as ops command but threw during classification -> classify as unclassified
        dbg(`classify threw on "${s}": ${e && e.message}`);
        unclassified = unclassified || { seg: s, why: `Classification error: ${e && e.message}` };
        continue;
      }
      dbg(`segment="${s}" -> ${verdict.disposition}${verdict.unclassified ? ' (unclassified)' : ''}`);
      if (verdict.disposition === 'block') {
        // All block outcomes are unclassified (contract failure or unknown verb).
        // No hard-deny path: the gate is cautious-execution, not prohibition.
        unclassified = unclassified || { seg: s, why: verdict.reason };
      } else if (verdict.disposition === 'approval_required') {
        found.push({ seg: s, verdict });
      } else {
        readable.push({ seg: s, verdict });
      }
    }
  }

  // Judgment order: ask > unclassified policy > pass.
  // All recognized ops commands that need approval are ask, not deny.
  // The user confirms, understands the risk, prepares a rollback plan, and then executes.
  if (found.length) {
    trace('ask');
    emitAsk(command, found[0].verdict);
    return;
  }

  // Reaching here: no ask.
  // auto_read (readable) is a **definitive safe read-only conclusion**, must pass -
  // otherwise gate would block all `kubectl get`, `systemctl status`, degrading into friction source.
  if (readable.length && !unclassified) {
    trace('pass-readable');
    dbg(`readable only: ${readable.length} segments safe read-only`);
    return;
  }
  // Risk cannot be determined -> hand to mode switch. Default deny-unclassified.
  if (unclassified) {
    if (GATE.mode === 'deny-unclassified') {
      // Before denying, check whether the user has pre-approved this exact command
      // via opsApprove credentials in .hello-dev/state.json. If a valid, non-expired
      // approval exists whose intent.command matches, pass instead of deny.
      // This is the per-command in-band escape documented in ops-execution.md 3.2.
      if (cwd && hasApprovedCommand(cwd, command)) {
        trace('pass-approved-ops');
        dbg('pass: command has a valid opsApprove credential in state.json');
        return;
      }
      trace('deny-unclassifiable');
      emitDeny(command, unclassified.why);
      return;
    }
    dbg('allow-unclassified: ' + unclassified.why);
    return;
  }
  if (sawOps) dbg('ops command with no verdict, handling per default mode');
}

function clip(cmd) { return cmd.length > 200 ? cmd.slice(0, 200) + ' …' : cmd; }

try { main(); } catch (e) {
  // Outer catch-all. Same as git-gate: reaching here means command couldn't be read at all,
  // blocking at this point equals locking down all Bash calls, cost far exceeds benefit.
  dbg(`fail-open(outer): ${e && e.message} (mode=${GATE.mode} cannot determine if ops command based on this)`);
}
