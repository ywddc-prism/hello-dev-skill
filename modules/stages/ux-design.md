> **Historical stage document (superseded).** This file described the former sequential UX Design stage. As of Change #120, UX Design and UI Design are merged into a single interleaved [Prototype](prototype.md) stage. This file is retained for historical reference only and is not part of the current execution path.

> Mandatory stage in the `design/full` execution path. Positioned between Feature Design and Tool Research.
> Position in shorter paths: skipped (along with tool-research, feature-design, architecture, and ui-design), as its purpose (interaction design and user research) is only needed when the full design loop is active.

# Stage: UX Design - Interaction Design & User Experience

## Teaching Goal

This stage is about **understanding the user and designing the interaction model before choosing tools or architecture**.

We will work through each UX decision one at a time:
- I ask one question about user needs or interaction flow
- You answer based on your understanding of the target users
- I record the answer and refine the interaction model
- After all decisions, I generate the UX specification document

**By the end of this stage, you will:**
- Have a clear picture of who uses this product and what they need
- Know the interaction flow for every key feature
- Have defined information architecture and navigation structure
- Establish usability standards that UI Design and Implementation must meet

---

## How This Works

```
 THE CONVERSATION FLOW

 STEP 1: I ask ONE question about UX
 "Question 1: User Persona - ..."

 STEP 2: You answer
 Your answer: [your response]

 STEP 3: I record and confirm
 "Got it. I've noted that [summary].
 Next question..."

 STEP 4: Repeat until done

 STEP 5: Generate UX specification
 "Based on all your answers, here's our UX spec"
```

---

## Current Status

```
 UX DESIGN DECISIONS - IN PROGRESS

 [ ] Decision 1: Target Users & Personas
 [ ] Decision 2: User Journey & Key Tasks
 [ ] Decision 3: Information Architecture
 [ ] Decision 4: Interaction Flow (per feature)
 [ ] Decision 5: Navigation & Wayfinding
 [ ] Decision 6: Error Handling & Edge Cases
 [ ] Decision 7: Usability Standards

 Progress: 0 / 7 completed
```

---

## Decision Sequence

### Decision 1: Target Users & Personas

Identify who uses this product. For each persona, we define:
- Name, role, technical proficiency
- Primary goals and pain points
- Usage context (mobile, desktop, frequency)

### Decision 2: User Journey & Key Tasks

Map the critical path each persona takes through the product:
- Entry point -> key actions -> completion
- What are the top 3-5 tasks?
- Where do users typically struggle?

### Decision 3: Information Architecture

Define how content and features are organized:
- Top-level sections and their hierarchy
- Content grouping principles
- Search and discovery patterns

### Decision 4: Interaction Flow (per feature)

For each key feature, define the step-by-step interaction:
- What triggers this action?
- What does the user see at each step?
- What are the possible branches?

Visualize as interaction flow diagrams (SVG/HTML wireframes referenced in the UX specification).

### Decision 5: Navigation & Wayfinding

How users move through the product:
- Primary navigation pattern (sidebar, tabs, breadcrumbs)
- Secondary navigation (search, filters, shortcuts)
- Back/forward/history behavior

### Decision 6: Error Handling & Edge Cases

How the product communicates problems:
- Empty states (no data, no results)
- Error states (network failure, validation errors)
- Loading states (skeleton screens, spinners, progress bars)
- Confirmation dialogs for destructive actions

### Decision 7: Usability Standards

Measurable quality criteria:
- Maximum clicks to complete any key task
- Consistency rules (same pattern for same interaction)
- Accessibility requirements (WCAG level, screen reader support)
- Performance perception targets (perceived load time, feedback latency)

---

## Handoff to Next Stage

The UX specification produced here feeds into:
- **Tool Research**: component library selection must support the defined interaction patterns
- **Architecture**: API design must serve the user journey's data requirements
- **UI Design**: visual design must respect the information architecture and interaction flows
- **Implementation**: acceptance criteria derived from usability standards

---

## Iteration Protocol

If UI Design later reveals interaction constraints (e.g., a visual pattern that requires a different flow), UX Design may be revisited:
1. UI Designer raises the constraint via the team lead
2. Team lead decides whether to roll back UX Design stage
3. If rolled back, UX Designer addresses the specific constraint and re-submits
4. Maximum 2 iteration rounds; after that, the team lead makes a binding decision

---

## Stage Deliverables

| Deliverable | Template | Description |
|-------------|----------|-------------|
| UX specification | [ux-research-template.md](../../templates/ux-research-template.md) | User personas, journey maps, interaction flows, usability standards |
| Interaction flow diagrams | SVG/HTML wireframes | Visual prototypes referenced in the UX spec; generated as supplementary artifacts |
