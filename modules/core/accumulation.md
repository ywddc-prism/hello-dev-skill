> Warning: **Historical Design (v9-v13 era)** — This file is not read by the current flow.
> Authoritative definitions are in `SKILL.md` and `modules/stages/`. Retained for: tracing early design intent.
> Index and state: see "Authority" column in `modules/index.md`.

# Experience Accumulation System

## Two Types of Accumulation

| Type | Scope | Purpose |
|------|-------|---------|
| Project Experience | Within a loop | Learn from current project's successes and failures |
| User Insights | Cross-project | Understand user behavior, build better software |

## Extraction Timing

| Stage | Extracted | Memory Type |
|-------|-----------|-------------|
| Architecture | Design decisions and outcomes | scenario |
| Implementation | Implementation patterns and issues | scenario/procedural |
| Testing | Edge case discoveries | scenario |
| Review | Review issues and resolutions | scenario |
| Ship | Release process optimizations | procedural |

## Success Patterns

Record as success pattern when any of:
- Good outcome after solution choice
- Quick resolution of complex problem
- Reused historical implementation to avoid duplication
- Avoided an anticipated pitfall

## Failure Patterns

Record as failure pattern when any of:
- Poor outcome after solution choice
- Encountered unexpected pitfall
- Discovered design flaw during implementation
- Repeated a known mistake

## Application Rules

The **core value** of experience accumulation is triggering Rollback:

> If current loop encounters a situation similar to historical failure, immediately Rollback and fix to avoid repeating mistakes.

See:
- [Project Experience Template](./project-experience.md)
- [User Insights Template](./user-insights.md)
