# Pattern Index

## About This Index

This is the **Pattern Index** for Hello Dev. It catalogs all patterns used across stages with their purpose, usage context, and examples.

## Pattern Categories

| Category | Description | Patterns |
|----------|-------------|----------|
| [Design Patterns](#design-patterns) | Software architecture patterns | 12 |
| [Teaching Patterns](#teaching-patterns) | Learning and explanation patterns | 8 |
| [Process Patterns](#process-patterns) | Workflow and process patterns | 6 |
| [Decision Patterns](#decision-patterns) | Decision-making patterns | 5 |
| [Testing Patterns](#testing-patterns) | Testing and verification patterns | 7 |

---

## Design Patterns

### 1. Component Design

**Purpose**: Organize code into single-responsibility units

**When to use**: Any UI or service component

**Example**:
```tsx
// Good: Single responsibility
function UserCard({ user }) {
 return <div>{user.name}</div>;
}

// Bad: Multiple responsibilities
function UserCard({ user, onUpdate, onDelete }) {
 // Too many responsibilities
}
```

**Related**: [Separation of Concerns](#2-separation-of-concerns)

---

### 2. Separation of Concerns

**Purpose**: Keep different layers independent

**When to use**: Always

**Layers**:
```

 UI Layer (React Components) 
 ↓ calls 
 Service Layer (API calls) 
 ↓ returns 
 UI Layer (displays data) 

```

**Related**: [Component Design](#1-component-design)

---

### 3. Result Type Pattern

**Purpose**: Explicit error handling

**When to use**: Any async operation that can fail

**Example**:
```typescript
// Good: Explicit success/failure
async function fetchUser(id: string) {
 try {
 const data = await api.get(`/users/${id}`);
 return { success: true, data };
 } catch (error) {
 return { success: false, error: error.message };
 }
}

// Bad: Silent failure
async function fetchUser(id: string) {
 try {
 return await api.get(`/users/${id}`);
 } catch {
 return []; // What happened?
 }
}
```

---

### 4. Early Return Pattern

**Purpose**: Reduce nesting, improve readability

**When to use**: Handle special cases (loading, error, empty) first

**Example**:
```tsx
// Good: Early returns
function UserList({ users, isLoading, error }) {
 if (isLoading) return <Loading />;
 if (error) return <Error message={error} />;
 if (!users.length) return <Empty />;

 return <ul>{users.map(u => <UserItem key={u.id} user={u} />)}</ul>;
}
```

---

### 5. Derived State Pattern

**Purpose**: Calculate from source, not store separately

**When to use**: When a value can be computed from other values

**Example**:
```tsx
// Good: Derived state
function OrderSummary({ items }) {
 const total = items.reduce((sum, item) => sum + item.price, 0);
 return <div>Total: ${total}</div>;
}

// Bad: Stored derived state
function OrderSummary({ items }) {
 const [total, setTotal] = useState(0);
 useEffect(() => {
 setTotal(items.reduce((sum, item) => sum + item.price, 0));
 }, [items]);
 return <div>Total: ${total}</div>; // Can become stale!
}
```

---

### 6. Container/Presentational Pattern

**Purpose**: Separate data fetching from rendering

**When to use**: Components that need data

**Example**:
```tsx
// Presentational: Just renders
function UserList({ users, onSelect }) {
 return <ul>{users.map(u => <li onClick={() => onSelect(u)}>{u.name}</li>)}</ul>;
}

// Container: Fetches data
function UserListContainer() {
 const [users, setUsers] = useState([]);
 // ... fetch logic
 return <UserList users={users} onSelect={handleSelect} />;
}
```

---

### 7. Service Layer Pattern

**Purpose**: Centralize API calls and business logic

**When to use**: Any interaction with external APIs

**Example**:
```typescript
// services/users.ts
export const userService = {
 async getAll(): Promise<User[]> { /* ... */ },
 async getById(id: string): Promise<User> { /* ... */ },
 async create(data: CreateUserDto): Promise<User> { /* ... */ },
 async update(id: string, data: UpdateUserDto): Promise<User> { /* ... */ },
 async delete(id: string): Promise<void> { /* ... */ },
};
```

---

### 8. Repository Pattern

**Purpose**: Abstract data source

**When to use**: When data might come from multiple sources

**Example**:
```typescript
interface UserRepository {
 findAll(): Promise<User[]>;
 findById(id: string): Promise<User | null>;
}

class InMemoryUserRepository implements UserRepository { /* ... */ }
class APIUserRepository implements UserRepository { /* ... */ }
```

---

### 9. Provider Pattern

**Purpose**: Share state without prop drilling

**When to use**: Global state needed by many components

**Example**:
```tsx
<ThemeProvider theme={theme}>
 <AuthProvider user={user}>
 <App />
 </AuthProvider>
</ThemeProvider>
```

---

### 10. Hook Composition Pattern

**Purpose**: Reuse stateful logic

**When to use**: Complex state logic needed in multiple components

**Example**:
```typescript
function useUser(id: string) {
 const [user, setUser] = useState(null);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState(null);

 useEffect(() => {
 fetchUser(id)
 .then(setUser)
 .catch(setError)
 .finally(() => setLoading(false));
 }, [id]);

 return { user, loading, error };
}
```

---

### 11. Strategy Pattern

**Purpose**: Select algorithm at runtime

**When to use**: Multiple ways to accomplish the same task

**Example**:
```typescript
const sortStrategies = {
 alphabetical: (items) => [...items].sort((a, b) => a.name.localeCompare(b.name)),
 byDate: (items) => [...items].sort((a, b) => b.createdAt - a.createdAt),
 byPriority: (items) => [...items].sort((a, b) => b.priority - a.priority),
};

// Usage
const sorted = sortStrategies[currentSortStrategy](items);
```

---

### 12. Observer Pattern

**Purpose**: Notify dependents of state changes

**When to use**: Multiple components need to react to same data

**Example**:
```typescript
// Simple event emitter
class Store {
 private listeners = new Set();

 subscribe(listener) {
 this.listeners.add(listener);
 return () => this.listeners.delete(listener);
 }

 notify() {
 this.listeners.forEach(l => l(this.state));
 }
}
```

---

## Teaching Patterns

### T1. Progressive Disclosure

**Purpose**: Avoid overwhelming with information

**When to use**: Any complex topic

**Example**:
```
Level 1: What it does
Level 2: How it works
Level 3: Why it's designed that way
Level 4: When to use alternatives
```

---

### T2. Analogical Reasoning

**Purpose**: Connect new concepts to familiar ones

**When to use**: Explaining abstract or unfamiliar concepts

**Example**:
```
"Props in React are like parameters in a function.
You pass them in, the component uses them, but can't modify them."
```

---

### T3. Pattern Labeling

**Purpose**: Help users recognize patterns in the future

**When to use**: When encountering a reusable solution

**Example**:
```tsx
// [PATTERN: Result Type]
async function fetchData() {
 return { success: true, data } or { success: false, error };
}
```

---

### T4. Mistake Warning

**Purpose**: Prevent common errors

**When to use**: Before writing code that often causes issues

**Example**:
```
// [WARNING: Common Mistake]
// Don't use == for type comparison
// Use === instead
```

---

### T5. Cognitive Apprenticeship

**Purpose**: Model expert thinking

**When to use**: Complex decision-making

**Example**:
```
"When I see X, I first check Y because Z.
Then I consider A and B before deciding."
```

---

### T6. Scaffolding

**Purpose**: Support learning with temporary guidance

**When to use**: Complex tasks that might overwhelm

**Example**:
```
Step 1: I'll do X, you do Y
Step 2: You do X and Y, I'll check
Step 3: You do X and Y alone
```

---

### T7. Learn by Doing

**Purpose**: Reinforce through practice

**When to use**: After explaining a concept

**Example**:
```
"We've covered how hooks work. Now try implementing
useToggle - a hook that returns [value, toggleFunction]."
```

---

### T8. Connect to Prior Knowledge

**Purpose**: Build on existing understanding

**When to use**: When new concept relates to previous one

**Example**:
```
"This is similar to the UserCard we built earlier,
but now we're adding the ability to edit inline."
```

---

## Process Patterns

### P1. D-S-C (Diagnose-Suggest-Confirm)

**Purpose**: Collaborative problem solving

**When to use**: Requirement analysis

**Steps**:
```
1. Diagnose: "I understand your problem is X"
2. Suggest: "Here's what I recommend: Y"
3. Confirm: "Does this solution work for you?"
```

---

### P2. Ask-Option-Decide

**Purpose**: User-driven decision making

**When to use**: Architecture decisions

**Steps**:
```
1. Ask: Present context and constraints
2. Options: Show alternatives with pros/cons
3. Decide: User makes the choice
```

---

### P3. Spiral Development

**Purpose**: Iterate with increasing complexity

**When to use**: Large, uncertain projects

**Example**:
```
Sprint 1: Core feature, minimal UI
Sprint 2: Add error handling
Sprint 3: Add edge cases
Sprint 4: Polish and optimize
```

---

### P4. Test-First

**Purpose**: Define behavior before implementation

**When to use**: TDD mode

**Steps**:
```
1. Write failing test
2. Write minimal code to pass
3. Refactor
4. Repeat
```

---

### P5. Document-Gate

**Purpose**: Ensure understanding before proceeding

**When to use**: Document-Driven mode

**Checklist**:
```
[ ] Interface documented
[ ] Behavior defined
[ ] Edge cases specified
[ ] User confirms understanding
```

---

### P6. Rollback Protocol

**Purpose**: Handle failures gracefully

**When to use**: When Review fails

**Steps**:
```
1. Identify failed stage
2. Record failure reason
3. Clear stage outputs
4. Re-enter stage
5. Execute with lessons learned
```

---

## Decision Patterns

### D1. First Principles

**Purpose**: Break down to fundamentals

**When to use**: Complex, unclear problems

**Steps**:
```
1. What are we trying to achieve?
2. What do we know for certain?
3. What assumptions are we making?
4. What would the ideal solution look like?
```

---

### D2. Worst-First

**Purpose**: Identify and mitigate risks early

**When to use**: High-stakes decisions

**Steps**:
```
1. What could go wrong?
2. How bad would it be?
3. How likely is it?
4. How can we prevent/monitor it?
```

---

### D3. Five Whys

**Purpose**: Find root cause

**When to use**: Debugging, problem analysis

**Example**:
```
Why did the feature fail? → API timeout
Why timeout? → Server overloaded
Why overloaded? → Cache miss
Why cache miss? → Cache size too small
Why too small? → Initial estimate wrong
```

---

### D4. Pre-Mortem

**Purpose**: Anticipate failures before starting

**When to use**: Before major implementation

**Steps**:
```
"Imagine it's 6 months later and the project failed.
Why did it fail?"
```

---

### D5. Comparative Analysis

**Purpose**: Evaluate options systematically

**When to use**: Technology choices, architecture decisions

**Steps**:
```
1. Define criteria (cost, complexity, flexibility, etc.)
2. Score each option against criteria
3. Weight criteria by importance
4. Calculate weighted scores
5. Make decision
```

---

## Testing Patterns

### TS1. Risk-Based Testing

**Purpose**: Prioritize testing effort

**When to use**: Limited time/resources

**Prioritization**:
```
High Risk: Detailed testing
Medium Risk: Standard testing 
Low Risk: Smoke testing
```

---

### TS2. Boundary Testing

**Purpose**: Find edge case failures

**When to use**: Any input validation

**Boundaries to test**:
- Empty ("", [], null, undefined)
- Minimum (0, 1, -1)
- Maximum (MAX_INT, string length)
- Just over boundaries

---

### TS3. Happy Path Testing

**Purpose**: Verify normal operation

**When to use**: Every feature

**Example**:
```
Test the most common user flow from start to finish
```

---

### TS4. Error Path Testing

**Purpose**: Verify graceful error handling

**When to use**: Any operation that can fail

**Scenarios**:
- Network failure
- Invalid input
- Permission denied
- Resource not found

---

### TS5. Regression Testing

**Purpose**: Ensure no new bugs introduced

**When to use**: After any change

**Approach**:
```
1. Run existing test suite
2. Add tests for fixed bugs
3. Verify old bugs still fixed
```

---

### TS6. Integration Testing

**Purpose**: Verify component interactions

**When to use**: After unit tests

**Example**:
```
User clicks button → API called → State updated → UI reflects change
```

---

### TS7. Snapshot Testing

**Purpose**: Catch unintended UI changes

**When to use**: UI components

**Process**:
```
1. Create baseline snapshot
2. After changes, compare to baseline
3. Review differences
4. Update snapshot if change is intentional
```

---

## Pattern Usage by Stage

| Stage | Primary Patterns | Secondary Patterns |
|-------|-----------------|-------------------|
| Bootstrap | [T1](#t1-progressive-disclosure), [P1](#p1-d-s-c-diagnose-suggest-confirm) | - |
| Requirement | [P1](#p1-d-s-c-diagnose-suggest-confirm), [D1](#d1-first-principles) | [T2](#t2-analogical-reasoning) |
| Feature Design | [P2](#p2-ask-option-decide), [D5](#d5-comparative-analysis) | [T3](#t3-pattern-labeling) |
| Architecture | [P2](#p2-ask-option-decide), [1](#1-component-design) | [7](#7-service-layer-pattern) |
| Implementation | [1](#1-component-design), [2](#2-separation-of-concerns), [4](#4-early-return-pattern) | [3](#3-result-type-pattern) |
| Testing | [TS1](#ts1-risk-based-testing), [TS2](#ts2-boundary-testing) | [TS5](#ts5-regression-testing) |
| Review | [P6](#p6-rollback-protocol), [D3](#d3-five-whys) | [T4](#t4-mistake-warning) |

---

## Pattern Search

**Find patterns by need:**

| Need | Recommended Patterns |
|------|---------------------|
| "How to organize code?" | [1](#1-component-design), [2](#2-separation-of-concerns) |
| "How to handle errors?" | [3](#3-result-type-pattern), [TS4](#ts4-error-path-testing) |
| "How to test?" | [TS1](#ts1-risk-based-testing), [TS2](#ts2-boundary-testing) |
| "How to decide?" | [P2](#p2-ask-option-decide), [D5](#d5-comparative-analysis) |
| "How to teach?" | [T1](#t1-progressive-disclosure), [T2](#t2-analogical-reasoning) |

---

## Contributing Patterns

To add a new pattern:

1. Create a new file: `patterns/{category}-{name}.md`
2. Follow the template:

```markdown
---
name: pattern-{name}
description: Brief description
category: {category}
layer: L3
---
# Pattern: {Name}

## Purpose
[What this pattern solves]

## When to Use
[Conditions when to apply]

## Example
[Code/example]

## Related Patterns
[[pattern-name]]
```

3. Update this index with a link

---

## Related Documents

- [Hello Dev SKILL.md](../SKILL.md) - Main skill documentation
- [Learn Stage](../modules/stages/stage-9-learn.md) - Where patterns are extracted
- [Evolution Stage](../modules/stages/stage-9-1-evolution.md) - Pattern identification
