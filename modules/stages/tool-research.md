> Mandatory stage in the full 15-stage chain. Positioned between Requirement and Feature Design; skippable only via a recorded, user-approved `state.js skip` — a skip proposal must account for the open development questions listed by the Requirement stage.
>
> Purpose: research the development approach before design — technology routes, effectiveness monitoring, and the open-source ecosystem — and hand the open questions to the Architecture stage as **key points**.

# Stage: Tool Research - Development Research

## Teaching Goal

Before designing features and architecture, we need to understand **how this should be developed**: the technology route and its trade-offs, how the result's effectiveness will be monitored, and what the open-source ecosystem already offers.

This is a research-first process:

1. Research the development approach: technology routes and framework choices, effectiveness monitoring / evaluation, and the surrounding ecosystem
2. Evaluate the options against the problem domain, constraints, and quality bar — every fact with a source
3. Produce findings plus **key points** — the decision points that are confirmed with the user at the Architecture stage

**Our principle: research the development approach before you design around assumptions. Tool Research is not for re-validating the project's existing tools; it is for discovering the routes and options that are actually available.**

**Input**: the development questions listed at the [Requirement](requirement.md) stage. **Output**: findings and key points (below).

---

## Research Scope (required coverage)

When a category below is applicable to the task, it must not be omitted. Add task-specific questions as needed.

### 1. Technology Route and Framework Choices

Identify the candidate approach(es) and their trade-offs for this task. Example (agent development): an orchestration framework (e.g. LangGraph) vs. a lighter library vs. self-built — with evidence on maturity, maintenance, license, and fit.

```
Search keywords:
- "[domain] framework github"
- "[domain] open source framework comparison"
- "[library1] vs [library2] vs [library3]"
- "build vs buy [capability]"
```

### 2. Effectiveness Monitoring / Evaluation

Research how the result's effectiveness will be verified and monitored, and which options fit. Example (agent development): tracing, evaluation harnesses, metrics, human-in-the-loop review. Do not assume an approach — present the candidates.

### 3. Ecosystem and Reference Implementations

Survey what already exists in the open-source ecosystem: frameworks, libraries, tools, data/integration layers, frontend tooling, and reference projects.

```
Search keywords:
- "[domain] data API github", "[provider] SDK documentation"
- "[stack] [component] library github", "[stack] [capability] tooling"
- "[domain] reference implementation github", "awesome [domain]"
- "[domain] dashboard / admin / editor reference projects"
```

---

## Research Results Presentation

After completing the research, compile the results — every fact carries a source.

### Open-Source Options Comparison Table

| Category | Tool / Framework | Stars | Positioning | Pros | Cons | Applicable Scenario | Source |
|----------|------------------|-------|-------------|------|------|---------------------|--------|
| Framework | [Name] | 14k | [positioning] | [pro] | [con] | [scenario] | [link / version] |

### Recommended Solution Combinations

Where useful, present combinations as inputs to the key points below:

**Solution A: Lightweight (Quick Launch)**
```
Framework: [Framework] + [Library]
Data: Direct call to [API]
Features: Simple and fast, but has some risk
```

**Solution B: Stable (Recommended)**
```
Framework: [Framework] + [Library]
Backend: [Language] encapsulated API
Data: [Library] + Self-built service
Features: Stable and reliable, extensible
```

**Solution C: Professional**
```
Framework: [Framework] + [Library]
Backend: [Language]
Data: Paid API
Features: Most professional, but higher cost
```

---

## Key Points

Every research output ends with a **Key Points** list — one entry per decision point:

| Field | Content |
|-------|---------|
| Decision question | What must be decided (e.g. "use LangGraph or not") |
| Options | Candidate choices, with trade-offs |
| Recommendation | The recommended option, with reasoning |
| Evidence | Sources / measurements supporting it |

**This stage does not make these decisions.** Key points are confirmed with the user one at a time at the [Architecture](architecture.md) stage, where the confirmation is recorded as evidence. Findings and key points are presented in this stage; constraints or preferences the user volunteers here are recorded as inputs to the architecture discussion.

---

## Record

Record the research for the task — findings and key points — in the conversation, and in the project's design notes when useful:

```markdown
## Development Research Results

**Research time**: [date]

### Findings

[comparison table and notes, each fact with a source]

### Key Points

[the key point list above]
```
