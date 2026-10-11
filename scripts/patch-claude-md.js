#!/usr/bin/env node
'use strict';

/**
 * Append Hello Dev memory system implementation docs to the global memory
 * config (add mode).
 *
 * Host awareness:
 *   - Claude Code: writes to ~/.claude/CLAUDE.md (default)
 *   - WorkBuddy: writes to ~/.workbuddy/user-<hash>/MEMORY.md
 *     (WorkBuddy organizes by user ID directory, auto-injected per session)
 *
 * Rationale: The L0-L4 described in the global CLAUDE.md is a concept model
 * with no implementation, while SKILL.md says "don't create additional memory
 * systems" — the two contradict each other. This script only does incremental
 * append, never deletes or modifies existing content — deletion is a separate
 * decision the user must make independently.
 *
 * Idempotent: only appends when marker is not in the file; repeated runs are no-op.
 *
 * Usage:
 *   node scripts/patch-claude-md.js           # append (idempotent)
 *   node scripts/patch-claude-md.js --dry-run # only print what would be appended, no writes
 *   node scripts/patch-claude-md.js --check   # exit 0 if applied, otherwise exit 1
 *   node scripts/patch-claude-md.js --host workbuddy  # force specify host
 */

const fs = require('fs');
const path = require('path');
const { resolveHome } = require('./lib/home.js');

const MARKER = '<!-- hello-dev:memory-system -->';

/**
 * Detect host and return target file path.
 */
function resolveTarget() {
  const hostArg = process.argv.find(a => a.startsWith('--host='));
  const hostOverride = hostArg ? hostArg.split('=')[1] : null;
  // Not os.homedir(): on Windows it ignores HOME, which silently defeats HOME-based
  // test isolation. This single `home` is shared by BOTH host branches below
  // (isWorkbuddyHost/findWorkbuddyUserDir append '.workbuddy', the claude branch
  // appends '.claude'), so resolving it once here keeps them on one root.
  const home = resolveHome();

  if (hostOverride === 'workbuddy' || (!hostOverride && isWorkbuddyHost(home))) {
    const userDir = findWorkbuddyUserDir(home);
    if (!userDir) {
      console.error('X WorkBuddy user directory not found (~/.workbuddy/user-*/)');
      process.exit(1);
    }
    return { host: 'workbuddy', path: path.join(userDir, 'MEMORY.md') };
  }

  return { host: 'claude', path: path.join(home, '.claude', 'CLAUDE.md') };
}

/**
 * WorkBuddy host detection: WORKBUDDY_SESSION env var, or ~/.workbuddy/ exists
 * and ~/.claude/ does not.
 */
function isWorkbuddyHost(home) {
  if (process.env.WORKBUDDY_SESSION) return true;
  const hasWorkbuddy = fs.existsSync(path.join(home, '.workbuddy'));
  const hasClaude = fs.existsSync(path.join(home, '.claude'));
  return hasWorkbuddy && !hasClaude;
}

/**
 * Find the WorkBuddy user-level directory. WorkBuddy organizes as
 * ~/.workbuddy/user-<hash>/; takes the most recently modified one
 * (for multi-user scenarios).
 */
function findWorkbuddyUserDir(home) {
  const wbRoot = path.join(home, '.workbuddy');
  if (!fs.existsSync(wbRoot)) return null;
  try {
    const entries = fs.readdirSync(wbRoot, { withFileTypes: true })
      .filter(e => e.isDirectory() && e.name.startsWith('user-'));
    if (!entries.length) return null;
    // Sort by modification time descending, take the most recent
    entries.sort((a, b) => {
      const sa = fs.statSync(path.join(wbRoot, a.name)).mtimeMs;
      const sb = fs.statSync(path.join(wbRoot, b.name)).mtimeMs;
      return sb - sa;
    });
    return path.join(wbRoot, entries[0].name);
  } catch { return null; }
}

const BLOCK = `
---

## Memory System Implementation (Hello Dev)

> The L0-L4 from "Five-Layer Cognitive Memory System" above **have corresponding
> implementation fields** within the Hello Dev repository; this section maps
> between the two and documents actual read/write entry points. Consistent with
> SKILL.md "Memory" chapter; does not add a second system.

<!-- hello-dev:memory-system -->

### Storage

The sole active storage is the **target project's** \`.hello-dev/memory.json\`
(runtime state, like \`.hello-dev/state.json\` it is not version-controlled),
read/written via \`scripts/memory.js\` in the skill installation directory.
Do not manually edit this file, and do not create memory storage in other locations.

### L0-L4 Mapping

| Layer | memory.json field | Write timing | Read timing |
|-------|-------------------|--------------|-------------|
| L0 Perceptual | \`entries\` where \`layer: "L0"\` | During stage execution, capture key inputs, errors, decision points | Bootstrap |
| L1 Working | \`working\` | Active context for current task, capacity 7 items, FIFO when exceeded | Start of each stage |
| L2 Episodic | \`entries\` where \`layer: "L2"\` | Ship stage writes success/failure lessons from this task | Bootstrap, searched by \`tags\` |
| L3 Semantic | \`entries\` where \`layer: "L3"\` | Stable facts accumulated over time (concepts, principles, architecture constraints) | Bootstrap |
| L4 Procedural | \`entries\` where \`layer: "L4"\` | Reusable workflows and practices | Bootstrap |

### Read/Write Entry Points

\`\`\`bash
node scripts/memory.js add --layer L2 --content "..." --source <real evidence> [--tags a,b]
node scripts/memory.js recall [--layer L2] [--tag fix] [--limit 5]
node scripts/memory.js show
\`\`\`

- **Write gate (mandatory)**: \`add\` must include \`--source\` (real evidence: file,
  command output, or user's exact words). Speculation without source, temporary
  workarounds, and duplicate logs are all rejected — consistent with SKILL.md
  "candidate -> validate -> merge/reject -> write".
- **Read points**: Bootstrap stage retrieves L2/L3/L4; Ship stage writes this task's lessons.
- **Not recorded**: development logs, unconfirmed speculation. Logs go to
  \`docs/progress_coding/\`, state goes to \`.hello-dev/state.json\`.
`;

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const checkOnly = args.includes('--check');
  const knownFlags = new Set(['--dry-run', '--check']);
  const unknown = args.filter(a => !a.startsWith('--host=') && !knownFlags.has(a));
  if (unknown.length) {
    console.error(`X Unknown arguments: ${unknown.join(' ')}`);
    process.exit(2);
  }

  const { host, path: TARGET } = resolveTarget();

  // WorkBuddy's MEMORY.md may not exist yet; need to create it first
  if (!fs.existsSync(TARGET)) {
    if (host === 'workbuddy') {
      if (dryRun) {
        console.log(`--- dry-run: will create ${TARGET} ---`);
      } else {
        fs.mkdirSync(path.dirname(TARGET), { recursive: true });
        fs.writeFileSync(TARGET, '# Hello Dev Memory\n\n');
      }
    } else {
      console.error(`X Target file not found: ${TARGET}`);
      process.exit(1);
    }
  }

  const before = fs.existsSync(TARGET) ? fs.readFileSync(TARGET, 'utf8') : '';
  const applied = before.includes(MARKER);

  if (checkOnly) {
    if (applied) { console.log(`[OK] Applied [${host}]: ${TARGET}`); process.exit(0); }
    console.log(`X Not applied [${host}]: ${TARGET}`);
    process.exit(1);
  }

  if (applied) {
    console.log(`[SKIP] Marker already exists, skipping (idempotent) [${host}]: ${TARGET}`);
    return;
  }

  if (dryRun) {
    console.log(`--- dry-run [${host}]: would append to ${TARGET} ---`);
    console.log(BLOCK);
    console.log('--- not written ---');
    return;
  }

  const backup = `${TARGET}.bak-${Date.now()}`;
  if (fs.existsSync(TARGET)) fs.copyFileSync(TARGET, backup);
  const after = before.replace(/\s*$/, '\n\n') + BLOCK.replace(/^\n/, '');
  fs.writeFileSync(TARGET, after);

  console.log(`[OK] Appended [${host}]: ${TARGET}`);
  console.log(`   Backup: ${backup}`);
  console.log(`   Added ${BLOCK.split('\n').length} lines; no existing content modified`);
  console.log(`   Verify: node scripts/patch-claude-md.js --check --host=${host}`);
}

main();
