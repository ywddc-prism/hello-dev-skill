> **Historical stage document (superseded).** This file described the former sequential UI Design stage. As of Change #120, UX Design and UI Design are merged into a single interleaved [Prototype](prototype.md) stage. This file is retained for historical reference only and is not part of the current execution path.

> Mandatory stage in the `design/full` execution path. Positioned between Architecture and Implementation.
> Position in shorter paths: skipped (along with tool-research, ux-design, feature-design, and architecture), as its purpose (visual design system) is only needed when the full design loop is active.

# Stage: UI Design - Visual Design & Design System

## Teaching Goal

This stage is about **translating the interaction model into a visual design system** that Implementation can follow precisely.

We work through each visual design decision one at a time:
- I ask one question about visual style, layout, or component appearance
- You answer based on brand identity and UX specification
- I record the answer and build the design system
- After all decisions, I generate the UI specification and design system documents

**By the end of this stage, you will:**
- Have a complete visual design language (colors, typography, spacing, shadows)
- Know exactly how every component looks in every state
- Have responsive layout rules for all screen sizes
- Be able to hand off a design system that developers can implement without ambiguity

---

## How This Works

```
 THE CONVERSATION FLOW

 STEP 1: I ask ONE question about visual design
 "Question 1: Visual Style Direction - ..."

 STEP 2: You answer
 Your answer: [your response]

 STEP 3: I record and confirm
 "Got it. I've noted that [summary].
 Next question..."

 STEP 4: Repeat until done

 STEP 5: Generate UI specification + Design System
 "Based on all your answers, here's our design system"
```

---

## Current Status

```
 UI DESIGN DECISIONS - IN PROGRESS

 [ ] Decision 1: Visual Style Direction
 [ ] Decision 2: Color System
 [ ] Decision 3: Typography Scale
 [ ] Decision 4: Spacing & Layout Grid
 [ ] Decision 5: Component Visual Specs
 [ ] Decision 6: Responsive Strategy
 [ ] Decision 7: Theme & Dark Mode

 Progress: 0 / 7 completed
```

---

## Decision Sequence

### Decision 1: Visual Style Direction

Establish the overall aesthetic:
- Style keywords (minimal, playful, corporate, technical, etc.)
- Reference designs or brands that embody the desired look
- Mood and emotional tone

Visualize as a style reference board (SVG/HTML mockup referenced in the UI spec).

### Decision 2: Color System

Define the complete color palette:
- Primary color(s) and their roles
- Secondary/accent colors
- Semantic colors (success, warning, error, info)
- Neutral palette (grays for text, borders, backgrounds)
- Color contrast ratios (WCAG AA minimum)

### Decision 3: Typography Scale

Define the type system:
- Font families (heading, body, monospace)
- Type scale (size steps, line heights, letter spacing)
- Font weights and their usage
- Responsive type adjustments

### Decision 4: Spacing & Layout Grid

Define the spatial system:
- Spacing scale (4px/8px base unit system)
- Layout grid (columns, gutters, margins per breakpoint)
- Container widths and content max-widths
- Component internal padding rules

### Decision 5: Component Visual Specs

For each component defined in the UX specification, specify:
- Default appearance (colors, borders, shadows, radius)
- Hover, focus, active, disabled states
- Size variants (small, medium, large)
- Anatomy (which parts, how they relate)

Visualize as component specification sheets (SVG/HTML referenced in the UI spec).

### Decision 6: Responsive Strategy

Define how the design adapts:
- Breakpoint definitions (mobile, tablet, desktop, wide)
- Layout changes per breakpoint (stack, sidebar collapse, grid reflow)
- Component-level responsive behavior (hide, transform, resize)
- Touch target sizes for mobile

### Decision 7: Theme & Dark Mode

Define theming approach:
- CSS custom properties (design tokens) structure
- Light theme vs dark theme color mappings
- Theme switching mechanism
- Per-component theme overrides (if any)

---

## Inputs from Prior Stages

| Source | What we consume |
|--------|----------------|
| Feature Design | Page/component list, feature priorities, state design |
| UX Design | Information architecture, interaction flows, navigation patterns, usability standards |
| Architecture | Technology constraints (CSS framework, component library, rendering approach) |

---

## UX Usability Review

After the UI specification is generated, the UX Designer performs a usability review:
1. Check every interaction flow against the visual design
2. Verify color contrast meets accessibility standards
3. Confirm touch targets meet minimum size requirements
4. Validate that error/empty/loading states are visually defined
5. Report findings to the team lead

If issues are found, the team lead decides whether to iterate (max 2 rounds).

---

## Handoff to Implementation

The UI specification and design system feed into Implementation:
- Design tokens become CSS variables / theme configuration
- Component specs become the acceptance criteria for UI implementation
- Responsive rules become layout test cases
- The design system document becomes the reference for visual QA

---

## Stage Deliverables

| Deliverable | Template | Description |
|-------------|----------|-------------|
| UI specification | [ui-design-template.md](../../templates/ui-design-template.md) | Visual style, color system, typography, spacing, component specs, responsive strategy |
| Design system | [design-system-template.md](../../templates/design-system-template.md) | Design tokens, component library spec, icon spec, theme definitions |
| Visual mockups | SVG/HTML references | Component specification sheets and layout mockups referenced in the UI spec |
