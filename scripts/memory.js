#!/usr/bin/env node
'use strict';

/**
 * Hello Dev -- Memory System CLI v1 (sandbox compatible v16.1)
 *
 * Single store: {project}/.hello-dev/memory.json (runtime, like state.json not committed to VCS)
 *
 * Rationale: Global CLAUDE.md describes L0-L4 five-layer memory, but no implementation existed
 * in the repo -- Bootstrap does not retrieve, Ship does not write, memory is just prose nobody reads.
 * This file makes it an executable, verifiable, regression-testable read-write pipeline.
 *
 * Write gate (executable form of SKILL.md "candidate -> verify -> merge/reject -> write"):
 *   add/working must carry --source, and content must pass gate(). Speculation without real
 *   evidence, temporary fixes, repetitive changelog entries are all rejected -- not stored just
 *   because "it happened". Synonymous duplicates merge into existing entry.
 *
 * Three constraints from real testing, read before changing this section:
 *   1. **Lock must wrap entire read-modify-write**. recall used to read outside lock, write stale
 *      snapshot inside lock; add||recall concurrent 6 rounds lost 4 (55%+). Lock only protecting
 *      rename equals no protection at all.
 *   2. **findRoot must have identical semantics to state.js**. Return null on .git instead of
 *      continuing upward, otherwise same project splits into two .hello-dev/.
 *   3. **Read-only commands do not take write lock** (show/validate). recall writes hits so it is
 *      a write command, but when write fails it must degrade to read-only return, not let Bootstrap
 *      retrieval get locked out for 3s then fail.
 *
 * Usage:
 *   node scripts/memory.js add --layer L2 --content "..." --source <evidence> [--tags a,b]
 *   node scripts/memory.js recall [--layer L2] [--tag fix] [--limit 5]
 *   node scripts/memory.js show [--layer L0]
 *   node scripts/memory.js working <add|clear> [--content "..."] [--source <evidence>]
 *   node scripts/memory.js prune --id <id>   # precise single deletion (goes through lock and validation)
 *   node scripts/memory.js validate
 */

const fs = require('fs');
const path = require('path');
const crypto = require('node:crypto');

const DIR = '.hello-dev';
const FILE = 'memory.json';
const SCHEMA = 1;
const LAYERS = ['L0', 'L1', 'L2', 'L3', 'L4'];
const WORKING_MAX = 7;              // L1 capacity, from global CLAUDE.md "at most 7 info blocks"
const CONTENT_MAX = 4096;
const ENTRIES_MAX = 500;
// —— Outcome three-state + unknown ——
// **Do not record "task success" as improved**: success does not mean this experience contributed to success.
// unknown is a first-class citizen -- when unable to judge, explicitly preserve unknown,
// do not dress up retrieval count as confidence.
const OUTCOMES = ['improved', 'regressed', 'no_effect', 'unknown'];
// Max adoption/outcome records per experience, prevent single entry from bloating into a log via appending.
const EVIDENCE_MAX = 50;

function fail(msg) { throw new Error(msg); }
function now() { return new Date().toISOString(); }

// **Must be character-for-character identical to state.js findRoot** (copied from state.js:39-48).
// First round fix once added an extra "any .hello-dev/ directory is root" rule here for cold start, result:
// project root already has empty .hello-dev/, cwd in subdirectory, memory built at root, state built in subdirectory,
// same project splits into two .hello-dev/ (second review reproduced: memory->R, state->R/sub).
// Cold start changed to caller fallback `findRoot() || process.cwd()` -- this is exactly what state.js cmdInit
// does (state.js:184), both paths now have identical semantics.
//
// Acceptance: before changing here, compare against state.js; if the two findRoots are no longer character-for-character
// identical, that is a divergence regression.
// Determine if this directory is "project root with state files".
// **Character-for-character identical**: three scripts each have a copy, test-memory.js:9d compares verbatim (excluding comments).
function isStateFile(dir) {
  const d = path.join(dir, DIR);
  if (!fs.existsSync(d)) return false;
  return fs.readdirSync(d).some(f =>
    f === 'memory.json' || f === 'evolve.json' || /^state(\.sibling-.+)?\.json$/.test(f));
}
function findRoot(start) {
  let dir = path.resolve(start || process.cwd());
  for (;;) {
    // Recognize **any** state file under .hello-dev/, not just own file.
    // Only recognizing own creates two stores: root already has state.json, cwd in subdirectory,
    // memory walks up to .git and returns null, cold start lands in subdirectory -- measured
    // `state.json@<R>` while `memory.json@<R>/src`, `recall @src=1` / `@R=0`.
    // Reverse is same (root only has memory.json, state cold starts from subdirectory).
    // **All three must be updated simultaneously, and character-for-character identical after stripping comments**:
    // test-memory.js:9d is cross-file verbatim comparison, changing only one immediately turns red.
    // Selection (--task) stays in statePath, not in findRoot.
    if (isStateFile(dir)) return dir;
    if (fs.existsSync(path.join(dir, '.git'))) return null;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function memPath(root) { return path.join(root, DIR, FILE); }

/** Recovery guidance when structure/parse fails.
 * Backup created by writeMem before each successful write, so **only exists after at least one write** --
 * when first write corrupts (or file externally cleared then corrupted) no .bak exists,
 * error must state this truthfully, otherwise points to nonexistent file (second review MAJOR-2a). */
function corrupt(p, detail) {
  const bak = `${p}.bak`;
  const hint = fs.existsSync(bak)
    ? `previous backup at ${path.basename(p)}.bak, restore first then rerun`
    : `no backup yet (memory never successfully written, or backup cleared); please manually inspect and repair the file`;
  return `Memory file error: ${p}\n  ${detail}\n  Does not auto-overwrite original; ${hint}`;
}

function text(value, label, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > (max || CONTENT_MAX)) {
    fail(`${label} must be 1-${max || CONTENT_MAX} characters of non-empty text`);
  }
  return value.trim();
}

function parseLayer(v) {
  if (v === undefined) fail('--layer required, values: ' + LAYERS.join('|'));
  if (!LAYERS.includes(v)) fail(`--layer must be ${LAYERS.join('|')}, got ${v}`);
  return v;
}

function parseTags(v) {
  if (v === undefined) return [];
  const tags = String(v).split(',').map(s => s.trim()).filter(Boolean);
  if (tags.length > 10) fail('--tags max 10');
  if (tags.some(t => t.length > 32)) fail('single tag max 32 characters');
  return [...new Set(tags)];
}

function emptyMemory() {
  return { schema: SCHEMA, entries: [], working: [], createdAt: now(), updatedAt: now() };
}

/** Read and validate; illegal structure not auto-repaired, fail clearly for human recovery. */
function read(root) {
  const p = memPath(root);
  if (!fs.existsSync(p)) return emptyMemory();
  let m;
  try { m = JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { fail(corrupt(p, `unreadable or format error: ${e.message}`)); }
  const object = x => x && typeof x === 'object' && !Array.isArray(x);
  const stamp = v => typeof v === 'string' && Number.isFinite(Date.parse(v));
  if (!object(m) || m.schema !== SCHEMA || !Array.isArray(m.entries) || !Array.isArray(m.working) ||
      !stamp(m.createdAt) || !stamp(m.updatedAt)) fail(corrupt(p, 'top-level structure illegal'));
  // —— Adoption feedback (retrieved / applied / outcome three-way separation) ——
  // **Backward compatibility**: old entries lack adopted/outcomes, must still be legal --
  // mandatory fields would make all existing memory.json fail on read
  // (state.js ops section hit same pitfall).
  // But once field exists, strictly validate: adding field without validation equals
  // claiming evidence exists when it does not.
  const okEvidence = v => typeof v === 'string' && v.trim() && v.length <= 1024;
  const okAdopt = a => object(a) && stamp(a.at) && okEvidence(a.source) &&
    (a.scope === undefined || (typeof a.scope === 'string' && a.scope.trim() && a.scope.length <= 256));
  const okOutcome = o => object(o) && stamp(o.at) && OUTCOMES.includes(o.result) &&
    okEvidence(o.source) &&
    (o.note === undefined || (typeof o.note === 'string' && o.note.length <= 1024)) &&
    (o.adoptAt === undefined || stamp(o.adoptAt));
  const okEntry = e => object(e) && typeof e.id === 'string' && LAYERS.includes(e.layer) &&
    typeof e.content === 'string' && typeof e.source === 'string' && e.source.trim() &&
    Array.isArray(e.tags) && stamp(e.createdAt) && stamp(e.updatedAt) && Number.isSafeInteger(e.hits) && e.hits >= 0 &&
    (e.adopted === undefined || (Array.isArray(e.adopted) && e.adopted.every(okAdopt))) &&
    (e.outcomes === undefined || (Array.isArray(e.outcomes) && e.outcomes.every(okOutcome)));
  if (!m.entries.every(okEntry)) fail(corrupt(p, 'illegal entry exists'));
  if (!m.working.every(w => object(w) && typeof w.content === 'string' && w.content.trim() &&
    typeof w.source === 'string' && stamp(w.at))) fail(corrupt(p, 'working memory illegal'));
  // —— Snapshots (backward compatibility: old files without snapshots field treated as empty array) ——
  if (m.snapshots !== undefined) {
    if (!Array.isArray(m.snapshots)) fail(corrupt(p, 'snapshots must be array'));
    const okSnap = s => object(s) && typeof s.tag === 'string' && stamp(s.at) &&
      object(s.hits) && Object.values(s.hits).every(v => Number.isSafeInteger(v) && v >= 0);
    if (!m.snapshots.every(okSnap)) fail(corrupt(p, 'illegal snapshot exists'));
  }
  return m;
}

// Exclusive creation lock, protects **entire read-modify-write** (not just rename).
//
// Difference from state.js "no auto-retry on conflict": state.json critical section can be very long,
// blind retries would mask anomalies; memory.js critical section is a sub-millisecond JSON read-modify-write,
// short waits under concurrent writers are normal contention.
// Immediate failure silently loses data (measured 8 writes only persist 1). Therefore only **bounded** wait;
// timeout still reports error per protocol and requires manual handling, no infinite retry.
const LOCK_WAIT_MS = 3000;
const LOCK_POLL_MS = 20;

function sleepSync(ms) {
  const sab = new SharedArrayBuffer(4);
  const ia = new Int32Array(sab);
  Atomics.wait(ia, 0, 0, ms);
}

function tryLock(root) {
  const dir = path.join(root, DIR);
  fs.mkdirSync(dir, { recursive: true });
  const lock = path.join(dir, 'memory.lock');
  try {
    fs.mkdirSync(lock);   // exclusive creation: EEXIST if already exists
    fs.writeFileSync(path.join(lock, 'owner.json'),
      JSON.stringify({ pid: process.pid, at: now(), cmd: process.argv.slice(2).join(' ') }));
    return lock;
  } catch (e) {
    // Sandbox environment may rewrite e.code (e.g. CODEBUDDY_BROKER_DENY),
    // but e.message still preserves original EEXIST. Both detection methods accepted.
    if (e.code === 'EEXIST' || (e.message && e.message.includes('EEXIST'))) return null;
    throw e;
  }
}

function releaseLock(lock) {
  try { fs.rmSync(lock, { recursive: true, force: true }); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
}

/** Write command: retry until timeout if lock unavailable, then fail clearly. */
function withLock(root, fn) {
  const lockPath = path.join(root, DIR, 'memory.lock');
  const deadline = Date.now() + LOCK_WAIT_MS;
  let lock = tryLock(root);
  while (!lock && Date.now() < deadline) { sleepSync(LOCK_POLL_MS); lock = tryLock(root); }
  if (!lock) fail(`Memory lock occupied for over ${LOCK_WAIT_MS}ms; after confirming no write process, manually remove ${lockPath}; Agent must not auto-delete`);
  try { return fn(); } finally { releaseLock(lock); }
}

/**
 * Read-modify-write must be fully locked: reading before locking writes stale snapshot back,
 * overwrites others' writes under concurrency.
 * When lock unavailable, degrade to fn(null, read()) (read-only path), caller decides tolerance --
 * recall takes degradation (retrieval must not fail due to write lock), add/working must take strict path.
 */
function withLockRMW(root, fn, { degrade = false } = {}) {
  const lockPath = path.join(root, DIR, 'memory.lock');
  let lock = tryLock(root);

  // Degradation path **must not** first wait full LOCK_WAIT_MS: bootstrap promises retrieval
  // "sub-second, non-blocking"; waiting 3 seconds then degrading equals no degradation.
  // Only give one short contention window, if lock not acquired immediately go read-only.
  if (!lock && degrade) {
    sleepSync(LOCK_POLL_MS);
    lock = tryLock(root);
    if (!lock) return { degraded: true, value: fn(null, read(root)) };
  }

  const deadline = Date.now() + LOCK_WAIT_MS;
  while (!lock && Date.now() < deadline) { sleepSync(LOCK_POLL_MS); lock = tryLock(root); }
  if (!lock) {
    fail(`Memory lock occupied for over ${LOCK_WAIT_MS}ms; after confirming no write process, manually remove ${lockPath}; Agent must not auto-delete`);
  }
  try { return { degraded: false, value: fn(lock, read(root)) }; }
  finally { releaseLock(lock); }
}

/** Before each successful write, keep previous content as .bak (only keep most recent), so corrupt() guidance is actually executable. */
function writeMem(root, m) {
  m.updatedAt = now();
  const p = memPath(root);
  const bak = `${p}.bak`;
  try {
    if (fs.existsSync(p)) fs.copyFileSync(p, bak);
  } catch (e) {
    // Backup failure should not discard this write, but let user know recovery path may be incomplete
    console.error(`[WARN] Backup failed, ${bak} may not be latest: ${e.message}`);
  }
  const tmp = `${p}.${process.pid}.${crypto.randomUUID()}.tmp`;
  let created = false;
  try {
    fs.writeFileSync(tmp, JSON.stringify(m, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
    created = true;
    fs.renameSync(tmp, p);
  } finally { if (created && fs.existsSync(tmp)) fs.unlinkSync(tmp); }
  return p;
}

/**
 * Normalize for deduplication judgment.
 * Only fold whitespace and CJK/Latin punctuation, **preserve** . - etc. semantic characters --
 * removing `.` would make `minimum version v1.5` and `v15` judge as same entry (measured occurrence).
 * Preserve case differences: `contract must have evidence` vs `Evidence` may differ semantically,
 * better not merge than mistakenly merge.
 */
function fingerprint(s) {
  return s.replace(/\s+/g, '').replace(/[""'',;!?]/g, '');
}

// ——— Write gate: shared by add and working, avoid L1 bypass ———
// **English-only lexicon.** This gate used to carry Chinese patterns. They were removed on purpose: the package
// ships in English, and a bilingual lexicon doubles the drift surface while the Chinese half is untested.
// Consequence worth knowing: Chinese entries are NOT lexically analysed here. Translate before recording.
//
// Three real bypass classes and two false positive classes found by testing; run test-memory.js groups 1 and 2
// before touching anything below:
//   Bypass: `this might work` (was only matched at sentence start), `- add config item` (prefix blocked it),
//           `temporary fix: ...` (was completely undefended), the `working` entry point skipped the gate entirely.
//   False positive: `see docs/...`, `merge strategy is squash` (word boundary hit path vs common word).
function gate(content, layer) {
  // 1. Speculation: hedging and unconfirmed wording, not limited to sentence start.
  // `speculation` itself is deliberately NOT a trigger: `The gate rejects speculation.` is a declarative fact
  // and must stay accepted (regression case).
  const SPECULATION = /\b(?:might|maybe|perhaps|probably|possibly|presumably|apparently|seems?|appears?|not sure|uncertain|unconfirmed|unverified|estimated|approximately|tentatively|i think)\b|\b(?:to be |to )?confirm(?:ed|ation)?\b|\b(?:needs?|pending|awaiting|requires?) (?:confirmation|verification)\b|\bif (?:no|without|there (?:is|are) no) (?:issues?|problems?|objections?)\b|\bif everything (?:is )?(?:fine|ok|okay|good)\b|\bTBD\b|\bTBC\b|\bXXX\b/i;
  if (SPECULATION.test(content)) {
    fail('Rejected: unconfirmed speculation is not stored in memory (write gate accepts confirmed facts only)');
  }

  // 2. Temporary fixes. These are **compound phrases, not bare words**: a bare `temporary` would also reject
  // legitimate facts like `this value belongs to a temporary variable` (measured false positive, not theory).
  // `hardcode` and `for now` carry the load for the couple of entries that only say "Temporary: ...".
  const TEMPORARY = /\b(?:temporary|interim|provisional) (?:fix|solution|workaround|hack|measure|patch|approach|bridge)\b|\btemporarily\b|\bwork[-\s]?around\b|\bstopgap\b|\bhotfix\b|\bquick[-\s]?fix\b|\bhard[-\s]?cod\w*\b|\bfor now\b|\bchange (?:it |this )?later\b|\bfix (?:it |this )?later\b|\bclean (?:it |this )?up later\b|\bTODO\b|\bFIXME\b/i;
  if (TEMPORARY.test(content)) {
    fail('Rejected: temporary fixes are not stored in memory, they belong in an issue or todo list');
  }

  // 3. Dev changelog. The real criterion is **whether the entry is a declarative sentence**, not whether it has
  // list markers. Declarative sentences carry a predicate (`is`, `requires`, `must`, `consists of`) and describe
  // facts; changelog fragments have no predicate (`add config item`, `- rollback to previous version`) and record
  // an action. This boundary took three rounds to settle, conclusions kept here to avoid relitigating it:
  //   * Blocking every sentence-initial verb falsely kills `fix failure is normal`, `rollback strategy is snapshot`.
  //   * Blocking on structure markers alone lets through `add config item`, `refactor the module` (tests catch it).
  //   * Negative lookahead to exclude nouns falsely kills `new capabilities need registration`.
  // Predicate judgment is the only variant satisfying every positive and negative case.
  //
  // Predicates must be judged **per clause**, not over the whole string:
  // `api rate limited, state is normal` -- `is` sits in the second clause and must not exempt the first one.
  // Clause splitting keeps `v1.5` intact by only breaking on a period that is not between digits.
  // A colon deliberately does NOT split, otherwise conventional commits (`fix: ...`) lose their colon and
  // the dedicated detection below never fires.
  const clauses = content.split(/(?<!\d)\.(?!\d)|[,;!?\n\r]+/)
    .map(c => c.trim()).filter(Boolean);
  const STATEMENT = /\b(?:is|are|was|were|be|being|been|must|should|requires?|needs?|means?|consists?|consisting|comprises?|defines?|can|could|includes?|contains?|depends?|belongs?|responsible|handles?|records?|tracks?|stores?|implies|ensures?|prevents?|allows?|enables?|exposes?|returns?|raises?|retains?|keeps?|serves?|represents?|describes?)\b/i;
  const isStatementClause = c => STATEMENT.test(c);

  // Generic change verbs: what turns a sentence into "somebody did something to the codebase".
  // Base forms matter at clause start; past forms matter **anywhere** in the clause --
  // `script generated index` has its verb mid-clause and previously slipped straight through.
  const CHANGE_BASE = 'refactor|restructure|update|add|remove|delete|fix|rename|rollback|roll back|revert|merge|install|deploy|publish|configure|generate|create|build|clean|clear|move|change|adjust|modify|execute|compile|implement|optimise|optimize|migrate|initialize|format|enable|disable|replace|split|bump|ship|patch|prune|import|export|truncate|reset|restore';
  const CHANGE_PAST = 'added|updated|removed|deleted|fixed|renamed|refactored|restructured|merged|reverted|rolled back|generated|created|built|deployed|published|installed|configured|cleaned|cleared|moved|changed|adjusted|modified|executed|compiled|implemented|optimised|optimized|migrated|initialized|formatted|enabled|disabled|replaced|split|bumped|shipped|patched|pruned|imported|exported|truncated|reset|restored|wrote|ran';
  const CHANGE_ANY = CHANGE_BASE + '|' + CHANGE_PAST;

  // Perfective: past-tense verb anywhere in the clause. The past form IS the English perfective marker.
  const DONE = new RegExp(`\\b(?:${CHANGE_PAST})\\b`, 'i');

  // Light verb + change noun -- the English shape of recording that an action has an outcome:
  // `api has rate limiting`, `module got a cache`. Deliberately a narrow noun list: the bare pattern
  // `has <word>` would reject plain facts like `the api has three endpoints`.
  const LIGHT_VERB = /\b(?:has|have|had|got|gets?|introduced|applied)\s+(?:a|an|the|some|no|their|its)?\s*(?:rate[-\s]?limit\w*|throttl\w*|retry|retries|cach\w*|index|indexes|indices|snapshot|fallback\w*|timeout\w*|time[-\s]?outs?|circuit breaker|lock\w*|poll\w*|batch\w*|migration|shim|wrapper|guard|hook\w*|flag\w*)\b/i;

  // Sentence-initial action, possibly behind a Markdown prefix (`#### `, `+ `, `- [x] `, `>> `, backticks, numbering).
  // **ReDoS discipline (do not "simplify" this back)**: the prefix loop requires whitespace *between* groups, so each
  // prefix fragment can be consumed in exactly one way. The previous form `(?:[-]...+[ \t]*)*` allowed N dashes to be
  // split in 2^(N-1) ways and took 43.5s for 30 dashes, 254s for 504. Groups are also written so that no single group
  // can be re-entered without consuming a token, which keeps the whole prefix linear.
  // A symbol may still sit glued to the verb (`-add config item`), which the C-1 review found missing once.
  const MARKER = '(?:#+|\\*+|\\(\\d+\\)|\\d+[).\\]]|\\[ *[xX ]? *\\]|`+|[-*>+·]+)';
  const PREFIX = `^[ \\t]*(?:${MARKER}(?:[ \\t]+${MARKER})*)?[ \\t]*`;
  const headInitial = new RegExp(
    PREFIX + '(?:so |then |and |also |now |just |finally )?(?:' + CHANGE_ANY + ')\\b', 'i');

  // Conventional commits (`fix:`, `feat(auth):`). The type word **must carry a colon**, otherwise
  // `docs/progress_coding/`, `merge strategy` get false-killed. Anchored to clause start for the same reason.
  const commitEn = /^[ \t]*(?:[-*>+·][ \t]*)?(?:docs|feat|fix|chore|refactor|style|test|perf|build|ci|revert|merge|release)(?:\([^)]*\))?[ \t]*:/i;

  // P3 relaxation: L2 episodic memory holds this task's successes and failures, whose natural shape is past tense
  // (`fixed login race condition`, `found the memory leak came from an uncleaned cache`). Blocking those made the
  // L2 layer effectively unusable. Relaxation: an L2 entry is exempt **unless it is pure changelog**.
  // The distinction therefore rests on whether the sentence is worth recording:
  //   - Markdown/commit prefix, or a bare verb-initial sentence with no experience marker -> pure changelog
  //   - experience marker present (root cause / race condition / lesson / because ...) -> a real experience
  //
  // Experience markers judge the **whole content, not each clause**: splitting
  // `regression introduced during refactor, lesson is boundary tests cannot be skipped` puts `lesson` in the second
  // clause, so per-clause judgment would read the first clause as pure changelog and falsely reject. That failure was
  // actually measured, hence whole-content here.
  //
  // The list only carries causal/phenomenon nouns, never generic bug words: `fixed login bug` records an action and
  // must not pass just because `bug` appears. It differs from `fixed login race condition` not syntactically -- the two
  // are isomorphic -- but in whether anything says why the fact is worth keeping.
  const EXPERIENCE = /\b(?:race condition|deadlock|starvation|memory leak|leak\w*|overflow|underflow|bottleneck|blocking|corruption|contention|timeout\w*|thread safety|regression\w*|boundary|edge case|root cause|caused by|because|due to|lesson\w*|takeaway|retro|retrospective|pitfall\w*|trade[-\s]?off|found that|discovered that|turned out)\b|\b(?:key|core|crux)\b[\s\S]{0,20}\b(?:is|was)\b|\breason\b[\s\S]{0,30}\b(?:is|was)\b/i;
  const isExperience = EXPERIENCE.test(content);
  const CHANGE_INITIAL = new RegExp(`^[ \\t]*(?:${CHANGE_ANY})\\b`, 'i');
  const flowPrefix = clauses.some(c => {
    // Markdown/numbering/commit prefix -> definitely changelog
    if (/^[ \t]*(?:[-*>+·]+|\(\d+\)|\d+[.)\]]|#+|\[ *[xX ]? *\]|`|\*\*)/.test(c)) return true;
    if (commitEn.test(c)) return true;
    // bare verb-initial sentence -> experience marker decides
    if (CHANGE_INITIAL.test(c)) {
      if (isExperience) return false;
      return true;
    }
    return false;
  });
  const skipExperience = layer === 'L2' && !flowPrefix;

  // Every clause that is not a declarative sentence gets checked. Exempting the two checks from the predicate test
  // would false-kill `merge strategy: see AGENTS.md` and `CI: needs manual approval`.
  const hit = clauses.some(c => !isStatementClause(c) && !skipExperience &&
    (commitEn.test(c) || headInitial.test(c) || DONE.test(c) || LIGHT_VERB.test(c)));
  if (hit) {
    fail('Rejected: this looks like a dev changelog entry, it belongs in docs/progress_coding/, not memory');
  }
}

// ——— add: write gate ———
function cmdAdd(args) {
  const { flags } = args;
  const layer = parseLayer(flags.layer);
  const content = text(flags.content, '--content');
  const tags = parseTags(flags.tags);

  if (flags.source === undefined) fail('Missing --source: memory must have real evidence (file, command output or user verbatim), speculation without source always rejected');
  const source = text(flags.source, '--source', 1024);
  gate(content, layer);

  // Same as state.js cmdInit: use cwd when root not found (cold start creates .hello-dev/ in current directory)
  const root = findRoot() || process.cwd();

  const r = withLockRMW(root, (lock, m) => {
    // Merge takes priority over create: same layer same fingerprint treated as same fact
    const fp = fingerprint(content);
    const dup = m.entries.find(e => e.layer === layer && fingerprint(e.content) === fp);
    if (dup) {
      // --force = overwrite original entry with this content/source; without it, only merge new tags and **strengthen source**.
      // Both must return, otherwise continues to push second entry -- measured produced duplicates and lost original source.
      if (flags.force) {
        const contentChanged = dup.content !== content;
        dup.content = content;
        dup.source = source;
        // **tags must also follow force** (review C-2): original only overwrites content/source,
        // tags stay put -- `--tags c,d --force` silently drops c,d while source already overwritten.
        // Half-overwrite is self-contradictory: caller thinks force means "overwrite original entry with these params"
        // (this file's own comments say so). Without --tags, keep original tags (not mistakenly cleared).
        if (flags.tags !== undefined) dup.tags = tags;
        // hits same logic (review m-3): hits is retrieval count "against old content", charter section 5
        // puts retrieved alongside applied/outcome. Keeping hits after content change,
        // new content enters with false evidence of "already retrieved N times". Content changed means reset to zero.
        if (contentChanged) dup.hits = 0;
        // **Must clear evidence when content changes** (review M-4): adopted/outcomes collected against
        // **old content** (which step used it, what result). Content overwritten but still carrying
        // old evidence equals recording "effect of old fact" on new fact -- directly violates
        // charter section 5 "evidence must correspond to current version".
        // Same fingerprint but different content (e.g. only punctuation changed) also reaches here,
        // so judge by **content** not fingerprint.
        if (contentChanged && (dup.adopted?.length || dup.outcomes?.length)) {
          dup.adopted = [];
          dup.outcomes = [];
        }
        dup.updatedAt = now();
      } else {
        dup.tags = [...new Set([...dup.tags, ...tags])];
        // Source only increases, never decreases: second call with better source must not be silently voided
        if (!dup.source.split('').map(s => s.trim()).includes(source)) {
          dup.source = `${dup.source}${source}`;
        }
        dup.updatedAt = now();
      }
      writeMem(root, m);
      return { merged: true, forced: !!flags.force, id: dup.id, layer, path: memPath(root) };
    }

    if (m.entries.length >= ENTRIES_MAX) fail(`Memory entries reached limit ${ENTRIES_MAX}; prune old entries first, or merge with same-content add`);
    const id = 'mem-' + crypto.randomBytes(4).toString('hex');
    m.entries.push({ id, layer, content, source, tags, hits: 0, createdAt: now(), updatedAt: now() });
    const p = writeMem(root, m);
    // --force with **no existing entry** has nothing to do (review m-4): original silently returns
    // `merged:false`, identical to "successfully added one entry" return -- caller cannot distinguish
    // "created new" from "force had no effect". SPEC allows --force, but only dup branch takes effect.
    if (flags.force) {
      return { merged: false, id, layer, path: p,
        forced: false, note: '--force no existing entry to overwrite, created as normal add' };
    }
    return { merged: false, id, layer, path: p };
  });
  return r.value;
}

// ——— recall: read point ———
// Writing hits must not slow retrieval: bootstrap.md promises "sub-second, non-blocking".
// When lock unavailable, degrade to read-only return (no hit accumulation), never exit 1.
function cmdRecall(args) {
  const { flags } = args;
  if (flags.layer !== undefined) parseLayer(flags.layer);
  const root = findRoot() || process.cwd();   // read-only cmd: return 0 entries in empty project rather than error
  const limit = flags.limit === undefined ? 10 : Number(flags.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) fail('--limit must be integer 1-50');
  const tag = flags.tag !== undefined ? text(flags.tag, '--tag', 32) : null;
  const q = flags.q !== undefined ? fingerprint(text(flags.q, '--q')) : null;

  const r = withLockRMW(root, (lock, m) => {
    let hits = m.entries.slice();
    if (flags.layer !== undefined) hits = hits.filter(e => e.layer === flags.layer);
    if (tag !== null) hits = hits.filter(e => e.tags.includes(tag) || e.tags.some(g => g.includes(tag)));
    if (q !== null) hits = hits.filter(e => fingerprint(e.content).includes(q));
    hits.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.hits - a.hits);
    const out = hits.slice(0, limit);

    // Lock-internal read-modify-write: only accumulate hits when lock is held.
    // Reading outside then writing a stale snapshot = concurrent overwrite (measured 4/6 rounds lost).
    if (lock && out.length) {
      const ids = new Set(out.map(e => e.id));
      m.entries.forEach(e => { if (ids.has(e.id)) e.hits += 1; });
      writeMem(root, m);
    }
    return { count: out.length, entries: out, hitsRecorded: !!(lock && out.length) };
  }, { degrade: true });

  if (r.degraded && r.value.count) {
    console.error('[WARN] Memory lock occupied, retrieval-only this time (no hit accumulation)');
  }
  return r.value;
}

// ——— adopt: record "this lesson was actually applied" ———
// Separate from hits (retrieved): **retrieved ≠ applied**. hits only says it appeared in results;
// it cannot be evidence that "the lesson worked" — that's exactly the "packaging confidence via retrieval count" the original plan flagged.
function cmdAdopt(args) {
  const { flags } = args;
  if (flags.id === undefined) fail('--id required (use recall entries[].id)');
  const id = text(flags.id, '--id', 64);
  if (flags.source === undefined) fail('Missing --source: adoption must have real evidence (which step of this task used it)');
  const source = text(flags.source, '--source', 1024);
  const scope = flags.scope !== undefined ? text(flags.scope, '--scope', 256) : undefined;
  const root = findRoot() || process.cwd();

  const r = withLockRMW(root, (lock, m) => {
    const e = m.entries.find(x => x.id === id);
    if (!e) fail(`Entry not found: ${id} (run recall to get id)`);
    if (!lock) fail('Cannot acquire memory lock, unable to write adoption record');   // adoption is evidence, no degradation
    e.adopted = e.adopted || [];
    if (e.adopted.length >= EVIDENCE_MAX) fail(`Adoption records for this entry reached limit ${EVIDENCE_MAX}`);
    const rec = { at: now(), source, ...(scope !== undefined ? { scope } : {}) };
    e.adopted.push(rec);
    e.updatedAt = now();
    writeMem(root, m);
    return { id, adopted: e.adopted.length, scope: scope === null ? undefined : scope, path: memPath(root) };
  });
  return r.value;
}

// ——— outcome: record result after adoption ———
// **Must include --evidence**: results without verifiable evidence cannot be stored
// (otherwise anyone could fill in "improved").
// Same lesson can be evaluated multiple times, so store as array; old records are **not overwritten** —
// that's exactly what "old evidence expires" prevents: new results cannot rewrite history, only append.
// evolve.js judges by timestamp whether evidence is still valid.
function cmdOutcome(args) {
  const { flags } = args;
  if (flags.id === undefined) fail('--id required');
  const id = text(flags.id, '--id', 64);
  const result = flags.result;
  if (!OUTCOMES.includes(result)) fail(`--result must be ${OUTCOMES.join('|')}`);
  if (flags.evidence === undefined) fail('Missing --evidence: result must have verifiable evidence (test output, command output, or user quote)');
  const evidence = text(flags.evidence, '--evidence', 1024);
  const note = flags.note !== undefined ? text(flags.note, '--note', 1024) : undefined;
  const root = findRoot() || process.cwd();

  const r = withLockRMW(root, (lock, m) => {
    const e = m.entries.find(x => x.id === id);
    if (!e) fail(`Entry not found: ${id}`);
    if (!lock) fail('Cannot acquire memory lock, unable to write outcome record');
    // Recording outcome without adoption = broken causal chain: result cannot be attributed to any adoption.
    if (!e.adopted || !e.adopted.length) fail('No adoption record for this entry; adopt first, then record outcome');
    e.outcomes = e.outcomes || [];
    if (e.outcomes.length >= EVIDENCE_MAX) fail(`Outcome records for this entry reached limit ${EVIDENCE_MAX}`);
    // Attach to most recent adoption so "which adoption caused this outcome" is traceable
    const adoptAt = e.adopted[e.adopted.length - 1].at;
    e.outcomes.push({ at: now(), result, source: evidence, ...(note !== undefined ? { note } : {}), adoptAt });
    e.updatedAt = now();
    writeMem(root, m);
    return { id, result, outcomes: e.outcomes.length, path: memPath(root) };
  });
  return r.value;
}

// ——— show: full inspection (read-only, no write lock) ———
function cmdShow(args) {
  const { flags } = args;
  if (flags.layer !== undefined) parseLayer(flags.layer);
  // Read-only command also falls back to cwd: in a directory without .hello-dev/,
  // reading an empty store is more useful than failing — otherwise freshly cloned
  // projects can't even run `show`/`validate`.
  const root = findRoot() || process.cwd();
  const m = read(root);
  const entries = flags.layer === undefined ? m.entries : m.entries.filter(e => e.layer === flags.layer);
  const byLayer = Object.fromEntries(LAYERS.map(l => [l, m.entries.filter(e => e.layer === l).length]));
  return { path: memPath(root), total: m.entries.length, byLayer, working: m.working, entries, updatedAt: m.updatedAt };
}

// ——— working: L1 working memory ———
// Must go through the same gate(): previously only validated non-empty, so `might want to change this`
// / `temporary solution: ...` all went straight to disk.
function cmdWorking(args) {
  const { flags, positionals } = args;
  const action = positionals[0];
  if (!['add', 'clear'].includes(action || '')) fail('Usage: memory.js working <add|clear> [--content ...] [--source ...]');
  const root = findRoot() || process.cwd();   // same cold-start semantics as state.js cmdInit

  let content = null, source = null;
  if (action === 'add') {
    if (flags.content === undefined) fail('--content required');
    content = text(flags.content, '--content');
    if (flags.source === undefined) fail('Missing --source: working memory also requires real evidence');
    source = text(flags.source, '--source', 1024);
    gate(content, 'L1');   // L1 working memory stays strict (don't relax past tense)
  }

  const r = withLockRMW(root, (lock, m) => {
    if (action === 'clear') {
      const n = m.working.length;
      m.working = [];
      writeMem(root, m);
      return { cleared: n };
    }
    m.working.unshift({ content, source, at: now() });
    const dropped = Math.max(0, m.working.length - WORKING_MAX);
    if (dropped) m.working = m.working.slice(0, WORKING_MAX);   // exceed 7 items, drop oldest first
    writeMem(root, m);
    return { size: m.working.length, dropped };
  });
  return r.value;
}

// ——— validate: read-only self-check (no write lock) ———
// ——— prune: delete entries ———
// Reason for existence: memory.js originally had **no delete capability**; once ENTRIES_MAX(500)
// was reached, add would report "archive or merge old entries first" but no tool could do it,
// permanently locking writes (previous review M7).
// Garbage entries (test data shoved in with --source t) also couldn't be cleaned.
// Delete has same authority as add: must go through lock + read structure validation + writeMem
// leaving .bak; no bypass path that directly modifies the file — otherwise bad structure
// would be silently written back.
function cmdPrune(args) {
  const { flags } = args;
  if (flags.id === undefined) fail('Missing --id: only exact delete by id allowed, no batch or layer-wide clear');
  const id = text(flags.id, '--id', 64);

  const root = findRoot() || process.cwd();
  const r = withLockRMW(root, (lock, m) => {
    const i = m.entries.findIndex(e => e.id === id);
    if (i < 0) fail(`Entry not found: ${id} (use show to see id; delete is exact match, no prefix)`);
    const [gone] = m.entries.splice(i, 1);
    writeMem(root, m);   // .bak left before delete (writeMem backs up previous version before each write)
    return {
      deleted: true, id: gone.id, layer: gone.layer,
      content: gone.content, remaining: m.entries.length, path: memPath(root),
    };
  });
  return r.value;
}

function cmdValidate() {
  const root = findRoot() || process.cwd();   // same as cmdShow: read-only command doesn't fail on missing root
  const m = read(root);
  const byLayer = Object.fromEntries(LAYERS.map(l => [l, m.entries.filter(e => e.layer === l).length]));
  // read() already forces source non-empty, so noSource is always 0 — keeping it as an assertion
  // that "if it ever appears, the structure was bypassed"
  const noSource = m.entries.filter(e => !e.source.trim()).length;
  const dupes = [];
  const seen = new Map();
  for (const e of m.entries) {
    const k = e.layer + '|' + fingerprint(e.content);
    if (seen.has(k)) dupes.push(`${seen.get(k)} / ${e.id}`);
    else seen.set(k, e.id);
  }
  const overLimit = m.entries.length > ENTRIES_MAX;
  const overWorking = m.working.length > WORKING_MAX;
  return {
    ok: noSource === 0 && dupes.length === 0 && !overWorking && !overLimit,
    total: m.entries.length, byLayer, working: m.working.length,
    noSource, duplicates: dupes,
    overLimit, overWorking, entriesMax: ENTRIES_MAX, workingMax: WORKING_MAX,
    path: memPath(root),
  };
}

// ——— snapshot: record current hits values for all entries (for evolve.js recall-check comparison) ———
// Usage: Bootstrap stage takes snapshot before recall, Ship stage recall-check compares snapshot vs current
// to determine which entries were retrieved but not adopted during the task.
// Snapshots stored in memory.json's snapshots array.
const SNAPSHOTS_MAX = 20;
function cmdSnapshot(args) {
  const { flags } = args;
  const tag = flags.tag !== undefined ? text(flags.tag, '--tag', 64) : 'task-start';
  const root = findRoot() || process.cwd();

  return withLockRMW(root, (lock, m) => {
    if (!lock) fail('Cannot acquire memory lock, unable to write snapshot');
    m.snapshots = m.snapshots || [];
    const snap = {
      tag,
      at: now(),
      hits: {},
    };
    for (const e of m.entries) {
      snap.hits[e.id] = e.hits || 0;
    }
    m.snapshots.push(snap);
    // Keep only the most recent N snapshots
    if (m.snapshots.length > SNAPSHOTS_MAX) {
      m.snapshots = m.snapshots.slice(-SNAPSHOTS_MAX);
    }
    m.updatedAt = now();
    writeMem(root, m);
    return { tag, at: snap.at, entries: Object.keys(snap.hits).length, total: m.snapshots.length,
      path: memPath(root) };
  });
}

// ——— CLI parsing: validate arguments per command, reject unknown/duplicate/missing-value flags and extra positionals ———
// Previously used global FLAG_NAMES: `show --force`, `recall --content x`, `add junk`
// were all silently accepted, and `--tags a,b --tags c` would silently drop a,b.
// Now each command declares a whitelist.
const SPEC = {
  add:      { pos: [0, 0], flags: ['layer', 'content', 'source', 'tags', 'force'] },
  recall:   { pos: [0, 0], flags: ['layer', 'tag', 'q', 'limit'] },
  show:     { pos: [0, 0], flags: ['layer'] },
  working:  { pos: [1, 1], flags: ['content', 'source'] },
  adopt:    { pos: [0, 0], flags: ['id', 'source', 'scope'] },
  outcome:  { pos: [0, 0], flags: ['id', 'result', 'evidence', 'note'] },
  prune:    { pos: [0, 0], flags: ['id'] },
  validate: { pos: [0, 0], flags: [] },
  snapshot: { pos: [0, 0], flags: ['tag'] },
};
const VALUE_FLAGS = new Set(['layer', 'content', 'source', 'tags', 'tag', 'q', 'limit',
  'id', 'scope', 'result', 'evidence', 'note']);

function parseArgs(cmd, argv) {
  const spec = SPEC[cmd];
  const flags = {};
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    // --force is a boolean flag, but must still pass whitelist and duplicate checks:
    // unconditional acceptance would let `show --force`, `recall --force` all exit 0
    // (found in second review), and `show --force` in the same comment was exactly
    // the counterexample I claimed to have fixed.
    if (a === '--force') {
      if (!spec.flags.includes('force')) fail(`Command ${cmd} does not support flag --force`);
      if (flags.force !== undefined) fail('Duplicate flag --force');
      flags.force = true;
      continue;
    }
    if (a.startsWith('--')) {
      const name = a.slice(2);
      if (!spec.flags.includes(name)) fail(`Command ${cmd} does not support flag --${name}`);
      if (!VALUE_FLAGS.has(name)) fail(`Flag --${name} does not accept a value`);
      if (i + 1 >= argv.length) fail(`Flag --${name} missing value`);
      if (flags[name] !== undefined) fail(`Duplicate flag --${name} (not merged, to avoid silent discard)`);
      flags[name] = argv[++i];
      continue;
    }
    positionals.push(a);
  }
  if (positionals.length < spec.pos[0] || positionals.length > spec.pos[1]) {
    fail(`Command ${cmd} wrong number of arguments, expected ${spec.pos[0]}–${spec.pos[1]} positional args`);
  }
  return { flags, positionals };
}

const COMMANDS = { add: cmdAdd, recall: cmdRecall, show: cmdShow, working: cmdWorking, prune: cmdPrune,
  adopt: cmdAdopt, outcome: cmdOutcome, validate: cmdValidate, snapshot: cmdSnapshot };

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd || !Object.prototype.hasOwnProperty.call(COMMANDS, cmd)) {
    console.error('Usage: node scripts/memory.js <add|recall|show|working|prune|adopt|outcome|validate|snapshot> [flags]');
    console.error(Object.keys(COMMANDS).join(' | '));
    process.exit(cmd ? 2 : 0);
  }
  try {
    const out = COMMANDS[cmd](parseArgs(cmd, rest));
    console.log(JSON.stringify(out, null, 2));
  } catch (e) {
    console.error(`[FAIL] ${e.message}`);
    process.exit(1);
  }
}

// **Must have require.main guard**: evolve.js reuses read() here for memory validation (M-2);
// without the guard, require would execute the CLI directly, print usage, and exit —
// the consumer crashes immediately.
// Same convention as evolve.js's guard (review MINOR-6 noted the two files were out of sync).
if (require.main === module) main();

// Export read-only validation entry: **do NOT export add/working etc. write commands**,
// consumers should not have write access.
// M-2 fix is "reuse validation" not "copy a version in evolve" — copying creates a second
// source of truth, and when the two drift, illegal memories can pass through one of them.
module.exports = { read, memPath };
