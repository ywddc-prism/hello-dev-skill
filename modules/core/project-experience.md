> Warning: **Historical Design (v9-v13 era)** — This file is not read by the current flow.
> Authoritative definitions are in `SKILL.md` and `modules/stages/`. Retained for: tracing early design intent.
> Index and state: see "Authority" column in `modules/index.md`.

# Project Experience Template - Enhanced

> Project experience template with confidence tracking and lifecycle management.

---

## Frontmatter

```yaml
---
name: scenario-[project]-[timestamp]
description: [one-line summary]
metadata:
  type: scenario
  project: [project name]
  tags: [relevant-tags]
  created: 2026-09-10
  expires: 2030-12-31
  status: active
---
```

## Complete Template

```markdown
---
name: [scenario]-[project]-[timestamp]
description: [one-line summary]
metadata:
  type: scenario
  project: [project name]
  tags: [relevant-tags]
  created: [ISO-8601]
  expires: [ISO-8601 or null]
  status: active
---

## Experience Description

[Detailed description of what happened]

## Context

- Project: [project name]
- Scenario: [scenario description]
- Technologies involved: [tech stack]
- Project stage: [stage when experience was gained]

## Decision Process

1. [Decision point 1]
   - Options considered: [list]
   - Chosen: [choice]
   - Reason: [why]
   
2. [Decision point 2]
   - ...

## Outcome

[Actual result - be specific]

## Why Succeeded/Failed

[In-depth analysis of cause]

## How to Apply

[How to apply this experience next time]
- **When:** [specific situations]
- **How:** [step-by-step guidance]
- **Warning:** [common pitfalls to avoid]

**Linked memories:**
- [[related-memory-1]]
- [[related-memory-2]]
- [[related-memory-3]]

## Confidence & Validation

| Metric | Value | Description |
|------|-----|------|
| Confidence | 50/100 | Initial value |
| Application count | 0 | Cumulative |
| Success count | 0 | Cumulative |
| Failure count | 0 | Cumulative |
| Last applied | - | Most recent |
| Last reviewed | - | Most recent manual review |
| Next review | [created+30d] | Planned review time |
| Status | active | Current status |

### Confidence History

| Date | Operation | Change | Reason |
|------|------|------|------|
| - | - | - | - |

### Application History

| Date | Application Scenario | Result | Notes |
|------|----------|------|------|
| - | - | - | - |

## Review Notes

### Review Records

| Date | Reviewer | Conclusion | Notes |
|------|--------|------|------|
| - | - | - | - |

### Items Pending Review

- [ ] [Review item description]

---

## Verification Checklist

On creation:
- [ ] Memory file format is correct
- [ ] Frontmatter is complete (name, description, metadata)
- [ ] "How to Apply" section is specific and actionable
- [ ] Related memories are linked
- [ ] Confidence is set to 50

On application:
- [ ] Context matches
- [ ] Technology is still current
- [ ] Operated as recommended
- [ ] Application result recorded

On review:
- [ ] Technology is still applicable
- [ ] Context matches
- [ ] Recommendations are still valid
- [ ] Update confidence or archive
```

---

## Storage Location

`.hello-dev/experience/project-[project-name].md`

Notes:
- One file per project
- Different scenarios separated by `## Scenario N` sections
- Or one file per scenario

---

## Example

```markdown
---
name: scenario-ecommerce-api-20260910
description: Pagination API missing limit causing full table scan
metadata:
  type: scenario
  project: ecommerce-backend
  tags: [api, pagination, postgresql, performance]
  created: 2026-09-10
  expires: 2030-12-31
  status: active
---

## Experience Description

When implementing the product list API, pagination limit parameter was not set, causing queries to return all table data.

## Context

- Project: ecommerce-backend
- Scenario: Product list API implementation
- Technologies involved: Node.js, PostgreSQL, Express
- Project stage: Implementation

## Decision Process

1. **Is pagination needed?**
   - Options: Not needed / Client-side pagination / Server-side pagination
   - Chosen: Not needed (small data volume)
   - Reason: Data volume was thought to be small at the time

2. **Implementation approach?**
   - Options: Return all / Paginate
   - Chosen: Return all
   - Reason: Quick implementation

## Outcome

After launch, when product count exceeded 10,000, API response time exceeded 10 seconds.

## Why Succeeded/Failed

**Failure reasons:**
1. Underestimated data growth speed
2. Did not consider boundary cases
3. Missing performance tests

## How to Apply

**When:** Implementing any list-type API

**How:**
1. Add pagination parameters `page` and `limit` by default
2. Set reasonable defaults (limit=20)
3. Set maximum limit (max limit=100)
4. Add performance tests

**Warning:** Never return unpaginated large datasets

**Linked memories:**
- [[pagination-default-limit]]
- [[api-perf-testing]]

## Confidence & Validation

| Metric | Value |
|------|-----|
| Confidence | 50/100 |
| Application count | 0 |
| Success count | 0 |
| Failure count | 0 |
| Last applied | - |
| Last reviewed | - |
| Next review | 2026-10-10 |
| Status | active |

### Application History

| Date | Application Scenario | Result | Notes |
|------|----------|------|------|
| 2026-09-12 | Order list API | Pass | Added pagination, performance normal |
```
