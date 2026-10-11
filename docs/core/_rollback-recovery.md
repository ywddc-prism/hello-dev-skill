# Rollback State Recovery Design

## Overview

This document describes the state recovery mechanism for Hello Dev's Rollback system. When Review fails and a rollback is triggered, the system must be able to restore the state of the failed stage while preserving valuable work from previous stages.

## Problem Statement

When a Rollback is triggered:
1. The failed stage needs to be re-executed
2. Previous stages' work should be preserved (not re-done)
3. User decisions from previous stages should be preserved
4. The agent should know exactly where to resume

## State Management

### State Types

| State Type | Description | Preservation |
|------------|-------------|---------------|
| **Decision State** | User decisions made | Always preserved |
| **Document State** | Generated documents | Always preserved |
| **Context State** | Current understanding | Always preserved |
| **Execution State** | In-progress work | Cleared |
| **Output State** | Stage outputs | Preserved (for reference) |

### State Preservation Matrix

| Stage | Decisions | Documents | Context | Outputs |
|-------|-----------|-----------|---------|---------|
| Requirement | | | | |
| Feature Design | | | | |
| (Tool Research) | | | | |
| Architecture | | | | |
| Implementation | | - | | (code preserved) |
| Testing | | | | (re-run) |

## Rollback Decision Tree

```
Review Result: FAIL

 ISSUE TRACING 

 Req Feature Arch 
 Issue Issue Issue 

 IDENTIFY ROOT CAUSE 

 Major Minor Edge 
 Issue Issue Case 

 ROLLBACK DECISION 

```

## Rollback Actions by Stage

### Requirement Issue

```markdown
## Rollback to Requirement

**Preserve:**
- [ ] Problem statement
- [ ] User context understanding
- [ ] MoSCoW decisions (partially)

**Re-evaluate:**
- [ ] Success criteria (may need adjustment)
- [ ] Constraints (may have changed)
- [ ] Scope (may need clarification)

**Actions:**
1. Load preserved context
2. Re-display requirement document
3. Ask specific clarification questions
4. Update only changed parts
5. Re-confirm with user
```

### Feature Design Issue

```markdown
## Rollback to Feature Design

**Preserve:**
- [ ] Feature breakdown structure
- [ ] Priority decisions
- [ ] Core feature definitions

**Re-evaluate:**
- [ ] Interaction details
- [ ] State design
- [ ] Data flow

**Actions:**
1. Load preserved feature structure
2. Identify specific feature(s) with issues
3. Re-design only problematic features
4. Update feature document
5. Ensure consistency with Requirement
```

### Architecture Issue

```markdown
## Rollback to Architecture

**Preserve:**
- [ ] All user decisions made
- [ ] Technology stack choices
- [ ] Component structure

**Re-evaluate:**
- [ ] Specific decision that caused issue
- [ ] Integration points
- [ ] Data flow

**Actions:**
1. Load all preserved decisions
2. Identify specific decision(s) with issues
3. Present options for that specific decision
4. Make new decision
5. Update architecture document
6. Propagate changes to Implementation
```

### Implementation Issue

```markdown
## Rollback to Implementation

**Preserve:**
- [ ] Architecture decisions
- [ ] Design choices
- [ ] Working code from other modules

**Re-evaluate:**
- [ ] Specific implementation with issue
- [ ] Test coverage for that module
- [ ] Integration with other modules

**Actions:**
1. Load preserved architecture context
2. Identify specific module/component with issue
3. Fix only the problematic code
4. Re-run tests for that module
5. Verify no regression in other modules
```

### Testing Issue

```markdown
## Rollback to Testing

**Preserve:**
- [ ] Test strategy
- [ ] Test cases defined
- [ ] Implementation code

**Re-evaluate:**
- [ ] Test execution
- [ ] Boundary conditions
- [ ] Regression tests

**Actions:**
1. Load preserved test strategy
2. Re-execute failed tests
3. Identify root cause of failures
4. Fix issue or update test expectations
5. Complete all test cases
```

## State Snapshot Format

### Decision Snapshot

```markdown
---
name: decisions-{loop-id}-{stage}
description: User decisions from {stage}
metadata:
 type: decision-snapshot
 layer: L0
 loop_id: {loop-id}
 stage: {stage-name}
 timestamp: {ISO-8601}
---

# Decisions Snapshot - {Stage}

## Decision 1: {Topic}

**Question**: {what was asked}
**Options presented**: {list}
**User choice**: {choice}
**Reasoning**: {why user chose this}
**Preserved context**: {relevant context}

## Decision 2: {Topic}
...
```

### Document Snapshot

```markdown
---
name: doc-{loop-id}-{stage}
description: {document type} from {stage}
metadata:
 type: document-snapshot
 layer: L0
 loop_id: {loop-id}
 stage: {stage-name}
 timestamp: {ISO-8601}
---

# {Document Type} - {Stage}

## Table of Contents

1. [Section 1](#section-1)
2. [Section 2](#section-2)

## Section 1

{content}
```

### Context Snapshot

```markdown
---
name: context-{loop-id}-{stage}
description: Working context from {stage}
metadata:
 type: context-snapshot
 layer: L1
 loop_id: {loop-id}
 stage: {stage-name}
 timestamp: {ISO-8601}
---

# Context - {Stage}

## Current Understanding

{understanding of the problem, requirements, architecture}

## Open Questions

- [ ] {question 1}
- [ ] {question 2}

## Assumptions

- {assumption 1}
- {assumption 2}

## Risks

- {risk 1}
- {risk 2}
```

## Rollback Execution Protocol

### Step 1: Capture Current State

```
Before rollback:
1. Save all decisions to L0 snapshots
2. Save current documents to L0
3. Update L1 working context
4. Record rollback reason to L0
```

### Step 2: Clear Failed Stage Outputs

```
Failed stage outputs:
1. Remove incomplete artifacts
2. Clear execution state
3. Reset stage-specific context
4. Keep decisions for reference
```

### Step 3: Load Preserved State

```
Preserved state to load:
1. Previous stages' decisions
2. Previous stages' documents
3. User preferences
4. Architecture context
```

### Step 4: Re-enter Failed Stage

```
Stage-specific actions:
1. Display preserved decisions
2. Explain what was decided before
3. Focus on the specific issue
4. Ask targeted questions
5. Make new decisions if needed
```

### Step 5: Propagate Changes

```
After fixing:
1. Update affected documents
2. Notify user of changes
3. Verify consistency with preserved work
4. Proceed to next stage
```

## Rollback Metrics

```markdown
## Rollback Metrics

**This Rollback:**
| Metric | Value |
|--------|-------|
| Rollback count | {N} |
| Failed stage | {stage} |
| Preserved decisions | {X} |
| Re-decisions | {Y} |
| Time spent | {duration} |

**Rollback History:**
| Loop | Stage | Cause | Resolution |
|------|-------|-------|------------|
| {id} | {stage} | {cause} | {resolution} |
```

## Recovery Best Practices

### 1. Preserve Decisions, Not Just Code

```markdown
// Instead of:
"Rollback because code has bugs"

// Do:
"Rollback because the implementation doesn't match decision X.
Decision X is preserved and will be re-examined."
```

### 2. Incremental Recovery

```markdown
// Instead of:
"Re-do everything from Architecture"

// Do:
"Architecture decision Y caused the issue.
Only Y needs re-evaluation, other decisions preserved."
```

### 3. Document the Recovery

```markdown
// After recovery:
"Rollback reason: {reason}
Preserved: {list}
Re-evaluated: {list}
Changes made: {list}
No regression in: {list}"
```

### 4. Learn from Rollback

```markdown
// To L2 after recovery:
"Issue in this loop: {description}
Root cause: {cause}
Recovery action: {action}
Prevention for next time: {prevention}"
```

## Rollback Decision Matrix

| Issue Type | Severity | Scope | Rollback Target | Scope |
|------------|----------|-------|-----------------|-------|
| Missing requirement | High | Core | Requirement | Full |
| Unclear requirement | Medium | Specific | Requirement | Partial |
| Wrong architecture | High | System | Architecture | Full |
| Architecture gap | Medium | Specific | Architecture | Partial |
| Implementation bug | High | Module | Implementation | Module |
| Integration issue | High | Cross-module | Implementation | Related |
| Test failure | Medium | Module | Testing | Module |
| Edge case miss | Low | Specific | Testing | Specific |

## Related Documents

- [Rollback Rules](../../modules/core/rollback.md) - Basic rollback rules
- [Learn Stage](../../modules/stages/stage-9-learn.md) - Post-loop learning
- [Memory System](../../SKILL.md#memory) - Memory operations
