# Memory System Guide

> This file extracted from `SKILL.md` memory section; details write gate, strength boundaries, known limitations, and CLI usage.
> Core rules still follow `SKILL.md`.

## Storage and Read/Write

When project uses HelloDev memory, the only storage is target project `.hello-dev/memory.json`, read and written by `scripts/memory.js`.
The L0-L4 five layers in the selected host's global instruction file (`~/.claude/CLAUDE.md` or WorkBuddy `~/.workbuddy/user-*/MEMORY.md`) are its **layered labels**, not a second system:

```bash
node scripts/memory.js recall --layer L2 --limit 5   # Bootstrap retrieval
node scripts/memory.js add --layer L2 --content "..." --source <real evidence>   # Ship write
```

## Write Gate (Discipline's First Fence)

Before writing, pass through a gate: **Candidate -> Validation -> Merge/Reject -> Write**.

- **Only accept confirmed facts**: Unconfirmed speculation, temporary solutions, and repeated logs all rejected
- **Merge preferred over creation**: Same-layer same-meaning duplicates merge rather than create new; when merging, new `--source` appends to existing evidence (add only, never remove)
- **Do not record development logs** (go to `docs/progress_coding/`) and unconfirmed speculation
- **Memory gaps do not block flow**: `recall` degrades to read-only return when lock is occupied, rather than failing

### Language Coverage

The shipped gate uses **English-only** predicate, speculation, temporary-solution and log vocabularies, following the existing user's decision. Chinese and other languages may pass without semantic screening; a non-empty source or valid storage structure does not certify the content as a fact. Confirm non-English entries manually, or use an explicitly reviewed English rendering with the original evidence. Do not automatically restore bilingual dictionaries or treat a successful CLI exit as factual validation.

### Write Gate CLI Mandatory Rules

- Missing `--source` -> reject
- Speculative tone -> reject
- Temporary solution -> reject
- Development log -> reject
- Same-layer same-meaning duplicate -> merge (new `--source` appends to existing evidence)

## Strength Boundaries (State Honestly; Do Not Overestimate)

### What Write Gate Can Do

- Validate `--source` is non-empty and not too long
- Determine declarative sentences by "whether clauses have predicates"
- Use regex to detect speculative tone, temporary solutions, development logs

### What Write Gate Cannot Do

- **Cannot verify evidence truthfulness**: `--source` only validates "non-empty and not too long"; cannot verify whether content is truly a file, command output, or user's exact words -- it constrains **the slot where evidence must be left**, not the evidence's truthfulness itself
- **Cannot fully intercept speculation**: Regex detection of speculative tone, temporary solutions, and development logs can be bypassed by deliberately constructed wording (known limitation)
- **Cannot distinguish syntactically isomorphic boundaries**: `Script generated index` (should reject) and `State machine fixed race condition` (syntactically isomorphic; also rejected) cannot be distinguished by regex

**Conclusion**: This gate is **discipline's first fence, not a security boundary**. Truthfulness guaranteed by writer at call time; for scenarios requiring 100% accuracy, please confirm manually.

## Known Misjudgments

Write gate determines declarative sentences by "whether clauses have predicates"; predicate words enumerated by word list; exists in two boundary directions:

| Scenario | Example | Behavior |
|------|------|------|
| Should reject but syntactically isomorphic | `Script generated index` vs `State machine fixed race condition` | Cannot distinguish by regex; both actually rejected |
| Single-character predicate only recognized at sentence end | `Updated to latest version`, `Added metric config item` | Only caught because single-character predicate recognized at sentence end |

**P3 Relaxation (L2 Episodic Memory)**: L2 layer allows past-tense experience sentences (e.g., "Fixed login race condition"), on condition **not pure log** (no Markdown/commit prefix). L3/L4 still strict.

## Root Location and Read-Only Fallback

`findRoot` recognizes **any** state file under `.hello-dev/` (`state.json` or `memory.json`); so when `state.json` is already at project root, memory written from subdirectories also lands at root; does not produce two storages.

When root not found, write commands and read-only commands both fall back to `process.cwd()` -- this means **executing `show`/`recall`/`validate` in wrong directory silently returns empty storage or ancestor directory's memory**; `recall` does not output `path` field; caller cannot tell which was read. **Confirm cwd before writing**.

## CLI Quick Reference

```bash
node scripts/memory.js show        # View total and layered counts
node scripts/memory.js validate    # Self-check for no-source/duplicates/over-capacity
node scripts/memory.js working add|clear   # Maintain L1 (capacity 7; FIFO when exceeded)
node scripts/memory.js prune --id <id>     # Precisely delete single entry by id
```

- `prune` goes through lock and structure validation; no path bypassing validation to directly modify file
- Accidental deletion can recover previous version from `memory.json.bak` in same directory

## Portable Package Manifest

Archive generated by `scripts/portable.js pack` contains `hello-dev-portable.json` (schema=2), recording:

- Packaging machine hostname
- Timestamp
- Skill version (extracted from SKILL.md frontmatter)
- Memory entry count
- Hook path validation status

On install, manifest moves to `.hello-dev/` for reuse by secondary install. Inspect report shows schema version -- schema=1 is old package (no skillVersion/memoryEntryCount/hookPaths); recommend repackaging; schema=2 is current version.

Windows machines use `restore.ps1` (PowerShell); Unix/macOS use `restore.sh` (bash).
