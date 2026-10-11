# Code Review Checklist

---

## Basic Information

| Field | Value |
|------|-----|
| PR Number | #[N] |
| Branch | [Branch name] |
| Author | [Author] |
| Reviewer | [Reviewer] |
| Date | [YYYY-MM-DD] |

---

## Change Summary

```
[Brief description of changes]
```

---

## Checklist

### 1. Correctness

- [ ] Code logic is correct
- [ ] Boundary conditions handled
- [ ] Error handling complete
- [ ] Data validation thorough

### 2. Readability

- [ ] Naming is clear
- [ ] Function length appropriate (<50 lines)
- [ ] Comments necessary and accurate
- [ ] Code format consistent

### 3. Maintainability

- [ ] No duplicate code
- [ ] Module responsibilities clear
- [ ] Dependency relationships clear
- [ ] Easy to test

### 4. Performance

- [ ] No obvious performance issues
- [ ] Database queries optimized
- [ ] Resources properly released

### 5. Security

- [ ] No SQL injection
- [ ] No XSS
- [ ] Sensitive information not exposed
- [ ] Permission control correct

### 6. Testing

- [ ] Necessary unit tests present
- [ ] Tests cover key logic
- [ ] Tests are readable
- [ ] Tests are independent

---

## Comments

### Must Fix

| Location | Issue | Severity |
|------|------|--------|
| [file:line] | [Issue description] | High |

### Suggested Changes

| Location | Suggestion | Severity |
|------|------|--------|
| [file:line] | [Suggestion description] | Low |

### Strengths

- [ ] [What was done well]

---

## Decision

| Status | Description |
|------|------|
| Approve | Can be merged |
| Request Changes | Needs modification |
| Reject | Reject merge |

---

## Notes

[Other notes]
