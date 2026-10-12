# User Experience Feedback

> v15.1 positioning change: This file is an **optional** 6-dimension detailed evaluation profile, no longer the main path.
> The main path is the development journal at `docs/progress_coding/journal.md` (a per-project file, not published with this repository) with one-line-per-task objective records
> (fields from `.hello-dev/state.json`, independent of recall).
> Reason: The 30-point questionnaire in this framework's history **never produced a single data point** -- requiring users to fill long forms
> yields near-zero collection rates. First get objective data flowing; detailed evaluation is reserved for when users are willing.

## Overview

This file collects optional 6-dimension experience ratings to supplement Journal's objective data.

---

## Why Collect Feedback?

| Value | Description |
|-------|-------------|
| Discover pain points | Identify bottlenecks and frustrations in the process |
| Validate improvements | Confirm if optimizations are effective |
| Quantify impact | Measure with data, not feelings |
| Guide iteration | Prioritize high-frequency issues |

---

## When to Collect

**At Ship stage, write Journal entry first** (required, objective data), then **optionally** invite 6-dimension detailed evaluation (optional, does not block delivery):

```
Journal entry recorded. If you want a detailed evaluation of this experience, you can reply with 6 numbers (e.g. 4,5,4,3,4,5); no pressure if you don't want to.
```

---

## Scoring Dimensions

| Dimension | Meaning | Scoring Standard |
|-----------|---------|------------------|
| Requirement Understanding | Did I clearly understand your needs? | 1=completely misunderstood, 5=fully understood |
| Communication Experience | Engagement through questions and options | 1=too verbose, 5=just right |
| Technical Explanation | Clarity of technical decision explanations | 1=can't understand, 5=fully understand |
| Learning Value | What you learned through development | 1=nothing learned, 5=learned a lot |
| Development Efficiency | Overall development speed | 1=too slow, 5=very fast |
| Final Result | Satisfaction with deliverables | 1=unsatisfied, 5=very satisfied |

---

## Quick Scoring Format

```markdown
**This Project**: [project name]

**Total Score**: X/30

| Dimension | 1 | 2 | 3 | 4 | 5 |
|-----------|---|---|---|---|---|
| Requirement Understanding | - | - | - | x | - |
| Communication Experience | - | - | - | - | x |
| Technical Explanation | - | - | x | - | - |
| Learning Value | - | - | - | x | - |
| Development Efficiency | - | - | - | - | x |
| Final Result | - | - | - | x | - |
```

Or just reply with numbers: `4,4,4,3,4,5` = Total 24/30

---

## Selection Format

**Most valuable:** (Select 1-2 most important)
- A. Clear requirement analysis
- B. Clear technical decision explanations
- C. Good feeling of learning while doing
- D. Helped make many decisions
- E. Good code quality
- F. Transparent progress
- G. Other: ___

**Most needs improvement:** (Select 1-2 most wanted to improve)
- A. Too many questions
- B. Too much explanation, verbose
- C. Waiting time too long
- D. Want faster results
- E. Not enough code comments
- F. Stage flow too long
- G. Other: ___

---

## Full Feedback Template

```markdown
### [Date] - [Project Name]
**Total Score**: X/30

| Dimension | Score | Reason (optional) |
|-----------|-------|-------------------|
| Requirement Understanding | X | [reason] |
| Communication Experience | X | [reason] |
| Technical Explanation | X | [reason] |
| Learning Value | X | [reason] |
| Development Efficiency | X | [reason] |
| Final Result | X | [reason] |

**Most Valuable**: A, B
**Needs Improvement**: A, D

**Detailed Feedback**:
[Any other comments]
```

---

## Historical Records

> Empty history is expected (see note at the top). New records are appended here.

<!-- Add historical feedback using this format:

### 2024-01-15 - User Management System
**Total Score**: 26/30

| Dimension | Score |
|-----------|-------|
| Requirement Understanding | 5 |
| Communication Experience | 4 |
| Technical Explanation | 5 |
| Learning Value | 4 |
| Development Efficiency | 4 |
| Final Result | 4 |

**Most Valuable**: A, C
**Needs Improvement**: B

-->

---

## Trend Tracking

Regularly analyze feedback trends to identify areas needing priority improvement.

### Score Trend Table

> The following table is a **format example**, not real data. Real data should replace it after accumulation.

| Date | Project | Total | Trend | Key Insight |
|------|---------|-------|-------|-------------|
| (Example) 2024-01-15 | User Management | 26/30 | - | Initial baseline |
| (Example) 2024-01-20 | Order Module | 24/30 |    | Requirement understanding dropped |
| (Example) 2024-01-25 | Payment Integration | 27/30 | up | Improvement effective |

### Trend Analysis by Dimension

| Dimension | Trend | Analysis |
|-----------|-------|----------|
| Requirement Understanding | up/down/stable | [analysis] |
| Communication Experience | up/down/stable | [analysis] |
| Technical Explanation | up/down/stable | [analysis] |
| Learning Value | up/down/stable | [analysis] |
| Development Efficiency | up/down/stable | [analysis] |
| Final Result | up/down/stable | [analysis] |

---

## High-Frequency Improvement Items

Track frequency of improvement items to prioritize high-frequency issues.

| Count | Option | Description | Status | Improvement |
|-------|--------|-------------|--------|-------------|
| (Example) 5 | A | Too many questions | Pending | Reduce question frequency |
| (Example) 3 | B | Too verbose | In progress | Simplify explanations |
| (Example) 2 | D | Want faster results | Complete | Enabled fast path |

---

## Data-Driven Improvement Process

```
Collect Feedback -> Analyze Trends -> Identify Issues -> Plan Improvement -> Verify Effect
```

### Step 1: Weekly Analysis
- Review all feedback from this week
- Calculate average scores per dimension
- Identify dimensions with declining scores

### Step 2: Monthly Summary
- Count high-frequency improvement items
- Determine top 3 priority improvements
- Create improvement plan

### Step 3: Improvement Verification
- Collect feedback within 2 weeks after improvement
- Compare scores before and after
- Confirm improvement is effective, then solidify

---

## Anonymous Feedback Option

If users don't want to share feedback publicly, they can submit anonymously:

```
[Anonymous Feedback]
Project: [project type, e.g., "medium feature development"]
Total: [X/30]
Most Valuable: [option]
Needs Improvement: [option]
Suggestions: [any text]
```

---

## Privacy Notice

- All feedback is anonymized by default
- Specific project names are optional
- Data is used only for process improvement
