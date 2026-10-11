# Stage: Archive - Loop Archive

> Mandatory final stage. Permanent storage + Search optimization + Loop closure.

**Purpose**: Build a searchable knowledge base from every loop.

**By the end of Archive, you will have:**
- [PATTERN: Knowledge Preservation] - Storing knowledge for future retrieval
- [PATTERN: Search Optimization] - Making knowledge findable
- [PATTERN: Loop Closure] - Proper termination of each loop

## Completion Condition

Checkpoint `Archive complete` must pass. Evidence: loop artifacts organized, memory index updated, closure record written.

---

## Stage Overview

```

 ARCHIVE Stage 

 1. [Gather Loop Artifacts] → 2. [Organize by Type] 
 ↓ ↓ 
 3. [Update Memory Index] → 4. [Tag for Search] 
 ↓ ↓ 
 5. [Generate Archive Report] → 6. [Close Loop] 

```

## Step 1: Gather Loop Artifacts

**Collect all artifacts from this loop:**

```markdown
## Loop Artifacts

**Documents Created**:
| Document | Path | Purpose |
|----------|------|---------|
| [doc 1] | [path] | [purpose] |
| [doc 2] | [path] | [purpose] |

**Code Files**:
| File | Path | Description |
|------|------|-------------|
| [file 1] | [path] | [description] |
| [file 2] | [path] | [description] |

**Memory Files**:
| Memory | Path | Type |
|--------|------|------|
| [mem 1] | [path] | L0/L1/L2/L3/L4 |
| [mem 2] | [path] | L0/L1/L2/L3/L4 |

**Test Evidence**:
| Evidence | Path | Type |
|----------|------|------|
| [ev 1] | [path] | screenshot/log |
```

## Step 2: Organize by Type

**Group artifacts for easy retrieval:**

```markdown
## Artifact Organization

### By Type

```
archive/{loop-id}/
 documents/ # PRD, architecture, etc.
 requirement.md
 architecture.md
 test-report.md
 code/ # Implementation files
 src/
 tests/
 memories/ # Loop-specific memories
 experience.md
 reflection.md
 evolution.md
 evidence/ # Screenshots, logs
 screenshots/
 logs/
```

### By Relevance

**Frequently accessed**: Documents users will reference often
- Architecture decisions
- Key implementation patterns

**Occasionally accessed**: Troubleshooting info
- Test results
- Debug logs

**Archive**: Rarely accessed but worth keeping
- Iteration history
- Abandoned approaches
```

## Step 3: Update Memory Index

**Update MEMORY.md with new entries:**

```markdown
## Memory Index Update

**New Entries Added**:

### L2 Episodic (Experience)
| File | Description | Related |
|------|-------------|---------|
| [file.md](l2-episodic/file.md) | [description] | [[related]] |

### L3 Semantic (Concepts/Patterns)
| File | Description | Related |
|------|-------------|---------|
| [file.md](l3-semantic/file.md) | [description] | [[related]] |

### L4 Procedural (Skills)
| File | Description | Related |
|------|-------------|---------|
| [file.md](l4-procedural/file.md) | [description] | [[related]] |

**Index Statistics Update**:
| Layer | Before | After | Change |
|-------|--------|-------|--------|
| L0 | [X] | [X] | [+/-Y] |
| L1 | [X] | [X] | [+/-Y] |
| L2 | [X] | [X] | [+Y] |
| L3 | [X] | [X] | [+Y] |
| L4 | [X] | [X] | [+Y] |
```

## Step 4: Tag for Search

**Add searchable tags to all archived content:**

```markdown
## Search Tags

**Auto-generated tags** (add to each file's frontmatter):

```yaml
tags:
 - {project-name}
 - {technology}
 - {pattern}
 - {outcome}
 - {date}
```

**Tag categories**:

| Category | Tags |
|----------|------|
| Project | [project names involved] |
| Technology | [tech stack used] |
| Pattern | [patterns identified] |
| Outcome | success/partial/failed |
| Complexity | simple/medium/complex |
| Role | frontend/backend/fullstack |

**Tag cloud for this loop**:
```
[tag1] [tag2] [tag3] [tag4] [tag5]
```
```

## Step 5: Generate Archive Report

```markdown
## Archive Report - {Loop ID}

**Loop ID**: {id}
**Date**: {ISO-8601}
**Duration**: {duration}

### Archive Summary

| Category | Count | Size |
|----------|-------|------|
| Documents | [X] | [size] |
| Code Files | [X] | [size] |
| Memories | [X] | [size] |
| Evidence | [X] | [size] |
| **Total** | [X] | [size] |

### Archive Location

```
{archive-path}/{loop-id}/
```

### Memory System Update

| Layer | New Entries | Total |
|-------|-------------|-------|
| L0 | [X] | [total] |
| L1 | [X] | [total] |
| L2 | [X] | [total] |
| L3 | [X] | [total] |
| L4 | [X] | [total] |

### Search-Ready Tags

- [tag list]

### Accessibility

**Frequently referenced**:
- [[document-name]]: [reason]

**For future loops**:
- [[pattern-name]]: [when to use]
- [[experience-name]]: [when to recall]
```

## Step 6: Close Loop

**Final loop closure:**

```markdown
## Loop Closure

**Loop ID**: {id}
**Status**: CLOSED

### Final Metrics

| Metric | Value |
|--------|-------|
| Duration | {duration} |
| Stages Completed | [X/10] |
| Code Changed | [X lines] |
| Tests Added | [X] |
| Issues Found | [X] |
| Patterns Learned | [X] |
| Memory Entries | [X] |

### What Made This Loop Successful

1. [Factor 1]
2. [Factor 2]

### What to Improve Next Time

1. [Improvement 1]
2. [Improvement 2]

### Ready for Next Loop

The loop is now archived. All artifacts are searchable.
Memory system is updated with new experiences and patterns.

**Next Action**: Start new loop or review archived loops
```

## Checklist

```
[ ] Loop artifacts gathered
[ ] Artifacts organized by type
[ ] Memory index updated
[ ] Search tags added
[ ] Archive report generated
[ ] Loop closed
```

## Loop Complete

```markdown
## Loop Complete

**Loop ID**: {id}
**Duration**: {duration}
**Outcome**: {success/partial/failed}

**Archive**: {archive-path}/{loop-id}

**Final Memory Status**:
- L0: {count} records
- L1: {count} active blocks
- L2: {count} experiences (+{X} from this loop)
- L3: {count} concepts (+{X} from this loop)
- L4: {count} skills (+{X} from this loop)

**Patterns Learned**:
- [[pattern-name]]

**Insights Gained**:
- [insight]

**Next Loop Recommendations**:
- [recommendation]

---

**Thank you for completing this Hello Dev session.**
**Your knowledge is now preserved and searchable.**
**Ready for your next challenge.**
```

## Related Documents

- [Stage 9.1: Evolution](stage-9-1-evolution.md) - Evolution stage
- [Stage 9.2: Reflection](stage-9-2-reflection.md) - Reflection stage
- [Stage 9: Learn](../stages/stage-9-learn.md) - Learn stage overview
