# UX Research & Interaction Design Template

---

## Research Overview

| Field | Value |
|-------|-------|
| Product/Feature | [Name] |
| Research Date | [YYYY-MM-DD] |
| Researcher | [Agent / Team] |
| Version | [v1.0] |

---

## 1. Research Goals & Methods

### Goals

- [ ] What do we need to learn?
- [ ] What decisions will this research inform?

### Methods Used

| Method | Purpose | Sample Size | Date |
|--------|---------|-------------|------|
| [User interview / Survey / Heuristic evaluation / ...] | [Why] | [N] | [When] |

---

## 2. User Personas

### Persona 1: [Name]

| Attribute | Description |
|-----------|-------------|
| Role | [Job title / user type] |
| Technical proficiency | [Low / Medium / High] |
| Primary goal | [What they want to achieve] |
| Pain points | [Current frustrations] |
| Usage context | [Device, frequency, environment] |
| Quote | "[Representative statement]" |

### Persona 2: [Name]

[Same structure as above]

---

## 3. User Journey Map

### Journey: [Journey Name]

```
 Phase 1        Phase 2        Phase 3        Phase 4
 [Discovery] -> [Onboarding] -> [Core Task]  -> [Completion]
    |               |               |               |
  Touchpoints:   Touchpoints:   Touchpoints:   Touchpoints:
  [list]         [list]         [list]         [list]
    |               |               |               |
  Emotions:      Emotions:      Emotions:      Emotions:
  [curve]        [curve]        [curve]        [curve]
    |               |               |               |
  Pain points:   Pain points:   Pain points:   Pain points:
  [list]         [list]         [list]         [list]
```

### Key Tasks (Priority Order)

| Priority | Task | Entry Point | Steps | Success Criteria |
|----------|------|-------------|-------|-----------------|
| P0 | [Task] | [Where] | [N steps] | [How we know it's done] |
| P1 | [Task] | [Where] | [N steps] | [How we know it's done] |
| P2 | [Task] | [Where] | [N steps] | [How we know it's done] |

---

## 4. Information Architecture

### Site Map / Section Hierarchy

```
 [Root]
  [Section 1]
     [Subsection 1.1]
     [Subsection 1.2]
  [Section 2]
     [Subsection 2.1]
     [Subsection 2.2]
  [Section 3]
```

### Content Grouping Principles

- [Rule 1: e.g., "Group by user task, not by data type"]
- [Rule 2: e.g., "Maximum 7 items per navigation level"]
- [Rule 3: e.g., "Most-used features at top level"]

---

## 5. Interaction Flow Diagrams

### Flow: [Feature/Action Name]

```
 [Trigger]
    |
    v
 [Step 1: Description]
    |
    +-- [Branch: Condition] --> [Alternative path]
    |
    v
 [Step 2: Description]
    |
    v
 [Completion / Feedback]
```

> **Visual prototype**: Reference `wireframes/[feature-name]-flow.svg` for the interactive wireframe.

### State Design

| State | Trigger | Display | User Action |
|-------|---------|---------|-------------|
| Default | [Condition] | [What user sees] | [What they can do] |
| Loading | [Condition] | [What user sees] | [What they can do] |
| Success | [Condition] | [What user sees] | [What they can do] |
| Error | [Condition] | [What user sees] | [What they can do] |
| Empty | [Condition] | [What user sees] | [What they can do] |

---

## 6. Navigation & Wayfinding

### Primary Navigation

| Pattern | Description | Rationale |
|---------|-------------|-----------|
| [Sidebar / Tabs / Top nav / ...] | [How it works] | [Why this pattern] |

### Navigation Map

```
 [Home] -- [Section A] -- [Detail]
            [Section B] -- [Detail]
            [Section C] -- [Detail]
```

### Wayfinding Aids

- Breadcrumbs: [Yes/No, format]
- Back navigation: [Browser back / in-app back / both]
- Current location indicator: [How]
- Search: [Global / scoped / both]

---

## 7. Error Handling & Edge Cases

| Scenario | User Sees | User Can Do |
|----------|-----------|-------------|
| Empty data | [Empty state illustration] | [CTA to create/add] |
| No search results | [Message + suggestions] | [Refine search / clear filters] |
| Network error | [Error message + retry] | [Retry / go back] |
| Validation error | [Inline error messages] | [Fix and resubmit] |
| Destructive action | [Confirmation dialog] | [Confirm / cancel] |
| Timeout | [Timeout message] | [Retry / contact support] |

---

## 8. Usability Standards

### Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| Max clicks to complete key task | [N] | [Count per task] |
| Perceived load time | [< N seconds] | [Skeleton screen / progress] |
| Feedback latency | [< N ms] | [After every user action] |

### Consistency Rules

- [Rule 1: e.g., "Same icon always means same action"]
- [Rule 2: e.g., "Primary action always in same position"]
- [Rule 3: e.g., "Destructive actions always require confirmation"]

### Accessibility Requirements

| Standard | Level | Notes |
|----------|-------|-------|
| WCAG | [A / AA / AAA] | [Specific requirements] |
| Screen reader | [Required / Not required] | [ARIA landmarks, labels] |
| Keyboard navigation | [Full / Partial] | [Tab order, shortcuts] |
| Color contrast | [Ratio] | [Minimum for text / UI components] |
| Touch target size | [Minimum px] | [Mobile-specific] |

---

## 9. Open Questions

| Question | Status | Resolution |
|----------|--------|------------|
| [Question] | [Open / Resolved] | [Answer or pending] |

---

## 10. Revision History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| v1.0 | [Date] | Initial version | [Agent] |
