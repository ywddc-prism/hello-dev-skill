# Stage 7: Review - Evidence Audit

> Independently inspect requirements, implementation, documentation, and authorization boundaries after testing; not just reciting another generic checklist.

## Review Scope

- Against confirmed requirements and exclusions: anything missed or out of scope?
- Check changes and callers: did we introduce error handling, state consistency, concurrency, or recovery defects?
- Did builds, related regressions, behavior, and boundary verification actually execute? Are untested items clearly documented?
- Do tests cover counter-examples and rejection paths, not just restate current code behavior?
- Are documentation, examples, logs, and version metadata consistent with implementation?
- Did we falsely claim platform permissions, user approval, or test passage?
- Are user's existing changes preserved, avoiding unapproved Git/deploy/sync operations?

Use sub-agents only when independent review is needed and delegation authorization has been granted; serial self-review must also clearly document the actual scope checked. Do not force users to complete self-check questionnaires or satisfaction feedback.

## Review Methods

### 1. Requirement Consistency Review

- **Functional completeness**: Check each requirement document item against implementation
- **Exclusion confirmation**: Check if explicitly excluded features were implemented (scope creep)
- **Boundary conditions**: Are boundary conditions mentioned in requirements reflected in code?

### 2. Code Quality Review

- **Error handling**: Do critical paths have appropriate error handling? Can exceptions leak sensitive information?
- **State consistency**: Can state become inconsistent in concurrent scenarios? Are there race conditions?
- **Recovery ability**: Can the system recover to a consistent state after failure? Is there a rollback mechanism?
- **Resource management**: Are file handles, network connections, and memory properly released?

### 3. Test Coverage Review

- **Happy path**: Do main functional paths have test coverage?
- **Rejection path**: Do error handling, rejection paths, and boundary values have tests?
- **Regression tests**: Do modified code have corresponding regression tests? Are untested items clearly documented?
- **Test quality**: Do tests actually verify behavior, or just restate code logic?

### 4. Documentation Consistency Review

- **API documentation**: Are function signatures, parameters, and return values consistent with implementation?
- **Code examples**: Do README examples still run?
- **Change log**: Are important changes recorded in the changelog?
- **Version metadata**: Do version numbers in package.json, pyproject.toml, etc. need updating?

### 5. Authorization and Security Review

- **Permission claims**: Does the code claim permissions it hasn't obtained (e.g., platform features, user authorization)?
- **Git operations**: Are there unapproved commit, push, or branch operations?
- **Deployment operations**: Are there unapproved deploy, release, or sync operations?
- **User data**: Are user's existing changes preserved? Any accidental deletion or overwrite?

### 6. Common Pitfalls Check

| Pitfall type | Check point |
|-------------|-------------|
| **False pass** | Did tests actually execute? Or just print pass? |
| **Stale evidence** | Are test results from this run, or reused from old results? |
| **Implicit completion** | Is the stage explicitly marked as completed? Or silently skipped? |
| **Scope creep** | Were features beyond requirements added during implementation? |
| **Documentation drift** | Is documented behavior consistent with actual implementation? |

## Review Report

After review completion, record the following:

1. **Review scope**: Which files, modules, and features were actually checked
2. **Issues found**: Evidence, impact scope, and fix suggestions for each issue
3. **Resolution**: Which issues are fixed, which need follow-up
4. **Remaining risks**: Known but unfixed issues and their impact

### Report Format

```markdown
## Review Report

### Review Scope
- Files: `src/auth.js`, `src/session.js`
- Features: Login flow, session management
- Tests: `test/auth.test.js` (this run)

### Issues Found
1. **Issue Title**: [severity]
   - Evidence: [specific code location, test results]
   - Impact: [possible consequences]
   - Suggestion: [fix approach]

### Resolution
- Fixed: [issue list]
- Pending: [issue list and reasons]

### Remaining Risks
- [Known issues and their impact]
```

## When Issues Are Found

**Issue found -> Report evidence, impact, fix suggestion -> Rollback to implementation when changes are needed**

- Cannot complete at Review stage carrying old test passes
- Review discussion or report may be recorded, but must not write pass when unresolved blockers exist
- After fix, Testing and Review must both be re-executed; cannot skip

```bash
# Review passed
node scripts/state.js checkpoint "review" pass --reason "actual scope checked, findings and resolution"
node scripts/state.js stage review completed
node scripts/state.js stage ship in_progress

# Review found issues (needs rollback)
node scripts/state.js checkpoint "review" fail --reason "Issue found: [specific description]"
node scripts/state.js stage review rolled_back
node scripts/state.js stage implementation in_progress
```

Formal reports use [review-checklist-template.md](../templates/review-checklist-template.md) as needed; high-risk changes attach [rollback-plan-template.md](../templates/rollback-plan-template.md).
