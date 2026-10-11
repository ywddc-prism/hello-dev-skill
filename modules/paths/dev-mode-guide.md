> Info: **Positioning**: This document describes the three development modes from the v9 era (Standard / Document-Driven / TDD).
> v15.1's task type classification (design / implementation / other) already covers most of their differences;
> mode selection is downgraded to an **optional ceremony intensity gear**, not affecting stage completeness (Testing / Review cannot be skipped at any gear level).

# Development Mode Guide

> Choose the appropriate development mode to make development more efficient.

---

## Three Development Modes

| Mode | Applicable Scenarios | Development Pace | Documentation Requirements |
|------|----------|----------|----------|
| **Standard Mode** | Beginners, complex projects, critical systems | Steady | Complete |
| **Document-Driven** | Experienced, team collaboration, knowledge transfer | Medium | Core docs |
| **TDD Mode** | Refactoring, testing-critical, long-term maintenance | Fast | Test docs |

---

## Standard Mode

### When to choose?

- [ ] You are a beginner, still learning
- [ ] Project is complex, many decisions
- [ ] Unsure about technical approach
- [ ] Need in-depth discussion

### Development Pace

```
Requirement -> Discussion -> Decision -> Documentation -> Implementation -> Testing -> Review
 ^_________________________________________|
 (Each stage may rollback)
```

### Characteristics

- Discuss every decision
- Detailed requirement documents
- Complete architecture design
- Thorough testing

### Warning: Requirement Confirmation Mechanism

**Must execute**:
1. Agent generates requirement understanding summary
2. User judges whether understanding is correct
3. Correct misunderstandings (if needed)
4. Repeat until user confirms correctness

**Confirmation template**:
```
My understanding:
- Problem: ...
- User: ...
- Core requirements: ...

Correct / Incorrect / Uncertain
```

### Suitable projects

- Learning projects
- Critical business systems
- New technology exploration

---

## Document-Driven Mode

### When to choose?

- [ ] You have experience, know how to do it
- [ ] Need team collaboration
- [ ] Need knowledge transfer
- [ ] Long project cycle

### Development Pace

```
Requirement doc -> Design doc -> Implementation -> Review doc -> Testing
 ^___________________________|
 (Documentation drives implementation)
```

### Characteristics

- Documentation first
- Implement per documentation
- Documentation as contract
- Changes require documentation updates

### Suitable projects

- Team projects
- Outsourced projects
- Projects requiring handover

### Documentation Requirements

| Document | Required | Detail Level |
|------|------|----------|
| Requirement doc | Yes | Complete |
| Interface doc | Yes | Complete |
| Architecture doc | Yes | Summary |
| Test doc | Warning | Summary |

### Warning: Requirement Confirmation Mechanism

**Must execute**:
1. Agent generates requirement understanding summary
2. User judges whether understanding is correct
3. Correct misunderstandings (if needed)
4. Repeat until user confirms correctness

**Confirmation template**:
```
My understanding:
- Problem: ...
- User: ...
- Core requirements: ...

Correct / Incorrect / Uncertain
```

---

## TDD Mode (Test-Driven Development)

### When to choose?

- [ ] Refactoring existing code
- [ ] Need high test coverage
- [ ] Bug fixes
- [ ] Core algorithms/logic

### Development Pace

```
Red -> Green -> Refactor
| | |
v v v
Write test Write code Optimize
(Fail) (Pass) (Keep passing)
```

### Characteristics

- Tests first
- Small quick steps
- Worry-free refactoring
- Fast feedback

### Suitable projects

- Core business logic
- Open source projects
- High-reliability systems

### TDD Flow

```
1. Write a failing test
 Clarify what to do

2. Write minimal code to make it pass
 Do not over-design

3. Refactor
 Improve code; keep tests passing

4. Repeat
```

### Warning: Requirement Confirmation Mechanism

**Must execute**:
1. Agent generates requirement understanding summary
2. User judges whether understanding is correct
3. Correct misunderstandings (if needed)
4. Repeat until user confirms correctness

**Confirmation template**:
```
My understanding:
- Problem: ...
- User: ...
- Core requirements: ...

Correct / Incorrect / Uncertain
```

---

## Mode Comparison

| Dimension | Standard Mode | Document-Driven | TDD |
|------|----------|----------|-----|
| Suitable for | Beginners | Experienced | Skilled |
| Development speed | Slow | Medium | Fast |
| Documentation quality | High | High | Low |
| Test coverage | Medium | Medium | High |
| Code quality | High | Medium | High |
| Learning value | High | Medium | Medium |
| **Requirement confirmation** | Yes, required | Yes, required | Yes, required |

---

## How to Choose

### Ask yourself a few questions

```
1. Are you familiar with this tech stack?
 Not familiar -> Standard mode
 Familiar -> Continue

2. Need team collaboration?
 Yes -> Document-driven
 No -> Continue

3. Are tests important?
 Very important -> TDD
 So-so -> Document-driven
```

### Decision Tree

```
Start
 |
 v
Are you familiar with this domain?
 |
 No > Standard mode
 |
 Yes
 |
 v
 Need team collaboration?
 |
 Yes > Document-driven
 |
 No
 |
 v
 Is test-driven important?
 |
 Yes > TDD
 |
 No > Document-driven
```

---

## Mode Switching

### Can switch during development

```
Scenario: Started with standard mode, later found tests are very important

1. Complete current feature
2. Start using TDD for next feature
3. Or mix approaches
```

### Hybrid Mode

```
Most features: Document-driven
Core logic: TDD
Exploratory work: Standard mode
```

---

## Recommended Configurations

### Beginner Recommendation

```
Mode: Standard
Characteristics:
- More discussion
- Detailed documentation
- Thorough testing
- Frequent review
```

### Team Recommendation

```
Mode: Document-driven
Characteristics:
- Documentation first
- Clear interfaces
- Standardized process
- Code review
```

### High Quality Recommendation

```
Mode: TDD + Document-driven
Characteristics:
- Tests first
- Core documentation
- Strict review
- High coverage
```

---

## Quick Start

Choose based on your situation:

| Your Situation | Recommended Mode | Start Command |
|----------|----------|----------|
| Learning new tech | Standard | `implement feature --mode standard` |
| Team project | Document-driven | `implement feature --mode doc-driven` |
| Refactoring code | TDD | `refactor module --mode tdd` |
| Quick prototype | Document-driven | `implement feature --mode doc-driven --fast` |
