#!/usr/bin/env node
'use strict';

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

module.exports = { heredocDelimiterAt, normalize, skipHeredocBody, splitSegments, tokenize };
