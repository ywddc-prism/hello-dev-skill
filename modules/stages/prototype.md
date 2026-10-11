# Stage: Prototype - Interleaved UX + UI Design

> Mandatory stage in the `design/full` execution path. Replaces the former sequential `ux-design` and `ui-design` stages. Positioned between Architecture and Implementation.
> Position in shorter paths: skipped (along with tool-research, feature-design, and architecture), as its purpose (building a verifiable prototype) is only needed when the full design loop is active.

## Teaching Goal

This stage is about **building and modifying a working prototype through interleaved UX and UI decisions, verified by the user each round**.

The prototype stage serves two purposes:

1. **Build from scratch**: In the design/full path, iteratively construct a prototype through rounds of UX+UI decisions
2. **Respond to modification requests**: When the user requests frontend changes (adjust layout, change colors, modify interactions, fix visual issues), apply those changes directly to the prototype and verify

Instead of completing all UX decisions then all UI decisions then generating a document, UX and UI work together as a single prototype-building and modification loop:

- Each iteration produces a **runnable HTML prototype** (not a document)
- The user **experiences** the prototype, not reads about it
- Feedback and modification requests from the experience drive the next iteration
- After convergence, the prototype serves as the authoritative design specification

**By the end of this stage, you will:**
- Have a working interactive prototype that demonstrates all key interactions and visual decisions
- Have verified every major UX and UI decision through actual user experience, not document review
- Have addressed all frontend modification requests through direct prototype updates
- Have design tokens and component specs extracted from the working prototype, not invented abstractly

---

## How This Works

```
 THE ITERATION LOOP

 ROUND 1: Foundation
   STEP 1: Establish baseline (personas, key tasks, visual direction)
   STEP 2: Build prototype v1 (HTML/CSS/JS - runnable in browser)
   STEP 3: User experiences the prototype (opens in browser, interacts)
   STEP 4: User provides feedback (what works, what does not, what is missing)
   STEP 5: Record decisions and feedback

 ROUND 2: Refinement
   STEP 1: Apply feedback from round 1
   STEP 2: Add next layer of decisions (error states, responsive, theme)
   STEP 3: Build prototype v2
   STEP 4: User experiences v2
   STEP 5: Record decisions and feedback

 ROUND N: Convergence
   STEP 1: Apply final feedback
   STEP 2: Build prototype vN
   STEP 3: User confirms: "this is right"
   STEP 4: Extract design tokens and component specs from the prototype
   STEP 5: Generate specification documents from the prototype (not before it)
```

---

## Iteration Protocol

### Round Structure

Each round has a fixed structure:

1. **Scope**: identify which UX and UI decisions this round will address
2. **Build**: produce a runnable HTML prototype incorporating those decisions
3. **Present**: serve the prototype to the user (via `present_files` or localhost preview)
4. **Experience**: user interacts with the prototype in a real browser
5. **Feedback**: user provides structured feedback (approve / annotate / reject per decision)
6. **Record**: decisions and feedback are recorded in the state

### Decision Categories

Decisions are grouped by concern but addressed together in each round:

**UX concerns** (interaction, information, flow):
- User personas and their key tasks
- Information architecture and navigation
- Interaction flows per feature
- Error handling and edge case states
- Usability standards (clicks to complete, accessibility)

**UI concerns** (visual, spatial, thematic):
- Visual style direction and mood
- Color system and contrast
- Typography scale
- Spacing and layout grid
- Component visual specifications
- Responsive strategy
- Theme and dark mode

### Round Planning

Before each round, the agent identifies:
- Which UX decisions to address (from the UX concern list)
- Which UI decisions to address (from the UI concern list)
- What the prototype should demonstrate
- What the verification criteria are (what the user should try)

Example round plan:
```
ROUND 2 PLAN:
  UX decisions: Interaction flow for [feature X], error handling for [scenario Y]
  UI decisions: Component specs for [button, card], responsive layout for [dashboard]
  Prototype should: Show the complete flow for feature X, including error states
  User should try: Complete the main task, trigger an error, resize the window
```

### Feedback Classification

User feedback on each prototype is classified as:

- **approve**: The decision works as demonstrated; record and move on
- **annotate**: The direction is right but needs adjustment; specify what to change
- **reject**: The approach is wrong; needs a different solution

Annotations and rejections carry specific guidance that feeds into the next round.

---

## Modification Requests

The prototype stage does not only build from scratch. It also handles **direct frontend modification requests** from the user at any point during the stage.

### What Counts as a Modification Request

- "Change the button color to blue"
- "Move the navigation to the left sidebar"
- "Make this card layout responsive"
- "The spacing between these sections is too tight"
- "Add a dark mode toggle"
- "This interaction flow feels wrong, change it to..."

### How Modifications Are Handled

When the user requests a frontend modification during the prototype stage:

1. **Identify the change**: UX concern (interaction/flow) or UI concern (visual/layout)
2. **Apply to prototype**: update the HTML/CSS/JS directly
3. **Present updated prototype**: serve the modified version to the user
4. **User verifies**: the user experiences the change in context
5. **Record the decision**: log what was changed and why

Modifications do not require a new "round" — they are applied immediately and verified in the same interaction. However, they count toward the iteration budget (maximum 5 rounds total, including modifications that trigger re-verification).

### Modification vs. New Round

| Scenario | Action |
|----------|--------|
| User says "change button to blue" | Apply modification, present, verify |
| User says "the whole navigation pattern is wrong" | Open a new round to reconsider the decision |
| User says "add a feature that wasn't in the scope" | New round (scope expansion) |
| User says "this spacing is off by a few pixels" | Apply modification, present, verify |

### Modifications After Convergence

If the user requests modifications after the prototype has converged (all decisions approved):
1. Apply the modification
2. Re-verify the affected area
3. Update extracted specifications if the change affects design tokens or component specs
4. Record the modification in the decision log

---

## Prototype Fidelity Requirements

The prototype must be:

1. **Runnable**: a real HTML file that opens in a browser and can be interacted with
2. **Representative**: demonstrates the decisions being verified, not a complete product
3. **Honest**: uses real data patterns (not "Lorem ipsum" where real content would change the design)
4. **Interactive**: clickable, scrollable, with state changes (not static mockups)

The prototype does NOT need to be:
- Production-quality code
- Fully responsive (unless responsiveness is the current round's focus)
- Connected to a real backend (mock data is sufficient)
- Accessible (unless accessibility is the current round's focus)

---

## Convergence and Completion

### When to Stop Iterating

The stage completes when ALL of the following are true:
- All UX concern decisions have been approved (or resolved through iteration)
- All UI concern decisions have been approved (or resolved through iteration)
- The user has confirmed the final prototype represents the intended design
- All pending modification requests have been applied and verified
- Design tokens and component specs have been extracted from the prototype

### Maximum Iterations

Default maximum: **5 rounds**. After 5 rounds without convergence:
1. Identify which decisions remain unresolved
2. Present the unresolved decisions to the user with the agent's recommendation
3. User makes a binding decision on each unresolved item
4. Final prototype is updated to reflect binding decisions
5. Stage completes

### Deliverables

After convergence, the following are produced:

| Deliverable | Source | Description |
|-------------|--------|-------------|
| Final prototype | The last approved HTML prototype | The authoritative design artifact; the specification is extracted from it |
| UX specification | Extracted from prototype + decision log | User personas, journey maps, interaction flows, usability standards |
| UI specification | Extracted from prototype + decision log | Visual style, color system, typography, spacing, component specs, responsive strategy |
| Design tokens | Extracted from prototype CSS | CSS custom properties for colors, typography, spacing, shadows |
| Component specs | Extracted from prototype components | Each component's anatomy, variants, states, sizes |

**Key principle**: the specification documents are **extracted from the working prototype**, not written independently. The prototype is the source of truth; the documents describe what the prototype demonstrates.

---

## State Integration

```bash
# Enter the prototype stage
node scripts/state.js stage prototype in_progress

# Start a new round
node scripts/state.js checkpoint "Round 1: Foundation" pass --reason "Scope: personas, key tasks, visual direction"

# Record a decision
node scripts/state.js checkpoint "Decision: navigation pattern = sidebar" pass --reason "User approved after experiencing prototype v1"

# Complete a round
node scripts/state.js checkpoint "Round 1 complete" pass --reason "3 UX + 2 UI decisions approved, prototype v1 verified"

# Record a modification
node scripts/state.js checkpoint "Modification: button color changed to blue" pass --reason "User requested and verified"

# Complete the stage (all rounds done, converged)
node scripts/state.js stage prototype completed
```

### Completion Conditions

| Condition | Evidence |
|-----------|----------|
| All decisions resolved | Every UX and UI concern has an approved decision or a binding user resolution |
| Final prototype verified | User confirmed the last prototype represents the intended design |
| All modifications applied | Every pending modification request has been applied and verified |
| Specifications extracted | UX spec, UI spec, design tokens, and component specs derived from the prototype |
| Round limit respected | Did not exceed 5 rounds without explicit user authorization to extend |

---

## Inputs from Prior Stages

| Source | What we consume |
|--------|----------------|
| Feature Design | Page/component list, feature priorities, state design |
| Tool Research | Component library, CSS framework, prototyping approach |
| Architecture | Technology constraints (rendering approach, build tool) |

---

## Handoff to Implementation

The prototype and extracted specifications feed into Implementation:
- The final prototype becomes the **visual and interaction reference** for implementation
- Design tokens become CSS variables / theme configuration
- Component specs become acceptance criteria for UI implementation
- Interaction flows become behavior test cases
- Usability standards become verification criteria in Testing

---

## Comparison with Former Sequential Model

| Aspect | Former (sequential) | Current (interleaved) |
|--------|--------------------|-----------------------|
| Stage count | 2 (ux-design, ui-design) | 1 (prototype) |
| Decision order | All UX first, then all UI | Mixed, per round |
| Verification | Document review after completion | Prototype experience per round |
| Primary artifact | Specification documents | Runnable HTML prototype |
| When spec is written | Before implementation, from decisions | After convergence, extracted from prototype |
| Feedback loop | UX -> UI -> Implementation (late feedback) | Each round (early and continuous) |
| Risk of rework | High (UI discovers UX constraints late) | Low (UX and UI validated together) |
| Frontend modifications | Handled in Implementation (code-level) | Handled in Prototype (prototype-level, before Implementation) |

---

## Iteration Protocol (Fallback)

If the prototype stage is somehow split back into separate concerns (e.g., a future need to revisit only UX after UI is done):
1. The team lead identifies which concern needs revisiting
2. A new round is opened targeting that concern
3. The prototype is updated to reflect changes
4. The user verifies the updated prototype
5. Maximum 2 fallback rounds; after that, the team lead makes a binding decision

---

## Stage Deliverables

| Deliverable | Template | Description |
|-------------|----------|-------------|
| Final prototype | HTML file(s) | Runnable interactive prototype; the authoritative design artifact |
| UX specification | [ux-research-template.md](../../templates/ux-research-template.md) | Extracted from prototype; user personas, journey maps, interaction flows, usability standards |
| UI specification | [ui-design-template.md](../../templates/ui-design-template.md) | Extracted from prototype; visual style, color system, typography, spacing, component specs |
| Design system | [design-system-template.md](../../templates/design-system-template.md) | Extracted from prototype; design tokens, component library spec, theme definitions |
