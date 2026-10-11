# Test Report Template

---

## Basic Information

| Field | Value |
|------|-----|
| Project | [Project name] |
| Feature | [Feature name] |
| Tester | [Name] |
| Test Date | [YYYY-MM-DD] |
| Test Type | Unit/Integration/End-to-end |

---

## Test Summary

| Metric | Value |
|------|-----|
| Total Cases | [N] |
| Passed | [N] |
| Failed | [N] |
| Pass Rate | [X%] |

---

## Test Results

### Passed Cases

| ID | Case | Result |
|----|------|------|
| TC-001 | [Case name] | PASS |

### Failed Cases

| ID | Case | Result | Defect ID |
|----|------|------|--------|
| TC-002 | [Case name] | FAIL | BUG-001 |

### Blocked Cases

| ID | Case | Result | Block Reason |
|----|------|------|----------|
| TC-003 | [Case name] | BLOCKED | [Reason] |

---

## Defect List

| ID | Title | Severity | Status | Owner |
|----|------|--------|------|--------|
| BUG-001 | [Title] | High | Open | - |

### Defect Details

**BUG-001: [Title]**

- **Severity:** High/Medium/Low
- **Priority:** P0/P1/P2/P3
- **Environment:** [Environment]
- **Steps:**
  1. [Step 1]
  2. [Step 2]
- **Expected:** [Expected result]
- **Actual:** [Actual result]
- **Screenshots:** [Attachment]

---

## Test Environment

| Item | Version |
|------|------|
| OS | [System] |
| Browser | [Browser] |
| API | [Version] |
| DB | [Version] |

---

## Risk Assessment

| Risk | Impact | Probability | Mitigation |
|------|------|------|----------|
| [Risk] | [Impact] | [Probability] | [Measure] |

---

## Conclusions and Recommendations

### Test Conclusion

[Whether tests passed; can release or needs fix]

### Recommendations

- [ ] Recommendation 1
- [ ] Recommendation 2

---

## Signatures

| Role | Name | Date | Signature |
|------|------|------|------|
| Testing | [Name] | [Date] | |
| Development | [Name] | [Date] | |
| Product | [Name] | [Date] | |
