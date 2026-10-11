> Mandatory stage in the `design/full` execution path. Positioned between Requirement and Feature Design.
> Position in shorter paths: skipped (along with feature-design and architecture), as its purpose (open-source framework and tool research) is only needed when architecture decisions are pending.

# Stage: Tool Research - Open Source Framework and Tool Research

## Teaching Goal

Before designing features and architecture, we need to understand **what already exists in the open-source ecosystem**.

This is a research-first process:
1. Search for existing open-source frameworks, libraries, tools, and reference projects
2. Evaluate which options fit the problem domain, constraints, and quality bar
3. You choose which to adopt, adapt, or build yourself

**Our principle: survey the ecosystem before you design around what you already have. Tool Research is not for re-validating the project's existing tools; it is for discovering what the open-source world already offers.**

---

## Research Tasks

I need to search the open-source ecosystem, not re-validate what the project already uses.

### 1. Frameworks and Core Libraries

```
Search keywords:
- "[domain] framework github"
- "[domain] open source framework comparison"
- "[library1] vs [library2] vs [library3] 2025"
- "best [stack] frameworks 2025"
```

### 2. Data and Integration Layer

```
Search keywords:
- "[domain] data API github"
- "[domain] open source API library"
- "[provider] SDK documentation"
```

### 3. Frontend / Tooling / Components

```
Search keywords:
- "[stack] [component] library github"
- "[stack] [capability] tooling"
- "[domain] dashboard / admin / editor reference projects"
```

### 4. Reference Projects

```
Search keywords:
- "[domain] reference implementation github"
- "[domain] open source system"
- "awesome [domain]"
```

---

## Research Results Presentation

After completing the search, I will compile in the following format:

## Research Results Presentation

After completing the search, I will compile in the following format:

### Open-Source Options Comparison Table

| Category | Tool / Framework | Stars | Positioning | Pros | Cons | Applicable Scenario |
|----------|------------------|-------|-------------|------|------|---------------------|
| Framework | [Name] | 14k | [positioning] | [pro] | [con] | [scenario] |
| Data layer | [Library] | 14k | [positioning] | [pro] | [con] | [scenario] |
| Tooling | [Tool] | - | [positioning] | [pro] | [con] | [scenario] |

### Recommended Solution Combinations

Based on your needs, I may recommend several combinations:

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

## Your Choice

**Please tell me:**

1. **Which solution do you prefer?** (A / B / C / Mixed / Other)
2. **Any specific frameworks or tools you want to use?** (even if not on the list)
3. **Any technologies you must avoid?** (unfamiliar, disliked, incompatible license)

---

## Record Decision

Your choice will be recorded:

```markdown
## Tool Research Results

**Research Time**: [date]

### Researched Tools

| Category | Tool / Framework | Stars | Research Conclusion |
|----------|------------------|-------|---------------------|
| Framework | [Name] | 14k | Recommended for core stack |
| Data layer | [Library] | 14k | Suitable for backend service |
| Data layer | [API] | - | Can use directly, with some risk |

### Solution Selection

> "[Your original words]"

**Selected Solution**: [solution name]
**Reason**: [why this choice]
**Backup Plan**: [what to use if this doesn't work]
```

---

**After your search results come out, I will show the full open-source comparison and wait for your choice.**
