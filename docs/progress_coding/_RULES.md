# Development Process Logging Rules

> Change records appended immediately; record only facts; code, configuration, scripts, and directly related documentation synced in same change set.

## Directory and ID

```text
docs/progress_coding/
 change-counter.json
 frontend-dev-log.md
 backend-dev-log.md
```

1. Read counter current before modification; increment to get this change's ID; must not reuse IDs from completed entries.
2. Frontend and backend for same feature use same ID; each appends one entry; consecutive batches can be assigned new IDs.
3. Immediately append record and update current/last_updated after each code modification; do not wait until Ship to backfill.
4. Append only; do not rewrite past records. When later finding failures or completion verification, append explanation or new entry; do not beautify history.
5. Same project allocates IDs serially; do not let multiple writers grab numbers simultaneously; when conflicts found, coordinate first; do not overwrite others' records.

## Record Format

```markdown
# <ID> | <Feature Name> | <Date> | <Change Type>

**Involved Files:**
- path/to/file

**Change Content:**
Describe actual changes, reasons, and verification status; unverified completion cannot be written as "complete".

**Ripple Sync:**
- [done/skip/warn] Product documentation --> File path or reason for no sync needed
- [done/skip/warn] Architecture documentation --> File path or reason needing confirmation
```

Counter retains other existing fields; update example:

```json
{"current": 42, "last_updated": "2026-09-25T10:30:00+08:00"}
```

## Classification and Direct Impact

| Type | Path Examples | Record |
|------|----------|------|
| Frontend | src/, pages/, components/, assets/, *.vue, *.jsx, *.tsx | frontend-dev-log.md |
| Backend | api/, server/, backend/, services/, controllers/, *.go, *.py, *.java | backend-dev-log.md |
| This repo's governance scripts, hooks, configuration, skill docs | scripts/, hooks/, SKILL.md, modules/, references/ | backend-dev-log.md |
| Product and architecture docs | docs/prd/, PRD/, docs/product/, docs/arch/, architecture/, docs/architecture/ | Follow this time's related feature record |

Paths are hints; when conflicting, choose by responsibility; cannot misclassify backend as frontend just because some directory is named src.
This repo's module protocol is the framework architecture documentation; do not create unrelated PRD to satisfy the table. Pure observation does not change logs. Existing journal or other logs in history can be retained; do not continue creating duplicate logs.

- **done**: Directly related documentation synced.
- **skip**: No sync needed; explain reason.
- **warn**: Unresolved issues exist; clearly state responsibility and limitations; cannot claim all complete.

## Completion Check

After each Implementation batch write, check logs and documentation. Testing executes build, relevant regression, behavior, and boundary verification per [testing protocol](../../modules/stages/testing.md); explain reasons for inapplicable items; do not use fabricated UI tests to fill in. Review cross-checks changes with records; Ship reports actual verification and unexecuted items.

Must not write development logs to memory/memory.md. Memory only contains user preferences and project understanding.
