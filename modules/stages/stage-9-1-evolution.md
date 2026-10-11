# Stage: Evolution - Pattern Extraction & Self-Optimization

> Mandatory stage after Learn. Detect deficiencies from evidence data, generate improvement candidates, apply after manual approval.

---

## Executable Flow (Replacing Pure Prose Template)

### Step 1: Run Diagnostics

Auto-detect issues from memory.json evidence data:

```bash
node scripts/evolve.js diagnose
```

Output includes five types of diagnostic signals:
- **retrievalQuality**: Retrieved but never adopted (retrieval does not equal adoption)
- **harmfulMemories**: outcome contains regressed (memories causing regression)
- **deadPatterns**: L3/L4 created over 14 days ago with 0 retrievals
- **lowValueMemories**: outcome all no_effect
- **evidenceGaps**: Has adopt but no outcome

### Step 2: Generate Improvement Candidates

Auto-generate candidates based on diagnostic results:

```bash
node scripts/evolve.js generate
```

Candidate type mapping:
| Diagnostic Signal | Candidate Type | Candidate Content |
|---------|---------|---------|
| retrievalQuality (L3/L4) | L4-update | Adjust entry descriptions or tags |
| harmfulMemories | L4-correction | Generate replacement processes |
| deadPatterns | memory-prune | Mark as deprecated |
| lowValueMemories | memory-merge | Suggest merging |

Candidates automatically pass FORBIDDEN_PATTERNS check (approval rules, raters, protected tests, etc. -- those touching forbidden zones are not generated).

### Step 3: Review Candidates

```bash
# View all pending candidates
node scripts/evolve.js candidates --status generated

# Approve one by one
node scripts/evolve.js approve --candidate <id> --reason "Approval reason"
# Or reject
node scripts/evolve.js reject-candidate --candidate <id> --reason "Rejection reason"
```

### Step 4: Apply Approved Candidates

Approved candidates require manual application of changes. This script does not auto-modify code (charter specifies framework code as "candidate only").

---

## Supplementary: Manual Pattern Extraction (When Diagnostics Cannot Cover)

### Identify Success Patterns

```markdown
| Pattern | What Worked | When to Apply | Evidence |
|---------|-------------|---------------|----------|
| [pattern] | [description] | [situations] | [link] |
```

### Save to L3 Semantic Memory

```bash
node scripts/memory.js add --layer L3 --content "Pattern name: brief description" --source "Task verified" --tags pattern,category
```

### Identify Anti-Patterns

```markdown
| Anti-Pattern | What Went Wrong | Warning Signs | Better Approach |
|--------------|-----------------|---------------|-----------------|
| [anti] | [description] | [signs] | [alternative] |
```

---

## Checklist

```
[ ] Run diagnose to get diagnostic report
[ ] Run generate to generate candidates
[ ] Approve/reject candidates one by one
[ ] Manually apply changes for approved candidates
[ ] (Optional) Manually extract patterns not covered by diagnostics to L3
```

## Next Stage

- [Stage 9.2: Reflection](stage-9-2-reflection.md) - Personal reflection

## Related Documents

- [Stage 9: Learn](../stages/stage-9-learn.md) - Learn stage overview
- [Stage 9.3: Archive](../stages/stage-9-3-archive.md) - Archive stage
