# Stage 7: Review - Evidence Review

> Independently check requirements, implementation, documentation, and authorization boundaries after testing; not reciting a generic checklist.

## Review Scope

- Against confirmed requirements and exclusions: is anything missing or over-scoped?
- Check changes and callers: do they introduce error handling, state consistency, concurrency, or recovery defects?
- Were build, relevant regression, behavior, and boundary verifications actually executed? Are untested items clearly explained?
- Do tests cover counter-examples and rejection paths, not just restate current code behavior?
- Are documentation, examples, logs, and version metadata consistent with implementation?
- Are platform permission guarantees, user approvals, or test passes falsely claimed?
- Are user's existing changes preserved; are unapproved Git/deployment/sync operations avoided?

Only use sub-agents when independent review is needed and delegated authorization has been obtained; serial self-review must also clearly state actually-checked scope. Do not require users to complete self-check questionnaires or satisfaction feedback.

## Review Methods

### 1. Requirement Consistency Review

- **Feature completeness**: Check against requirement document; verify each feature point is implemented
- **Exclusion confirmation**: Check whether explicitly excluded features were implemented (over-scope changes)
- **Boundary conditions**: Are boundary conditions mentioned in requirements reflected in code?

### 2. Code Quality Review

- **Error handling**: Do critical paths have appropriate error handling? Can exceptions leak sensitive information?
- **State consistency**: Can state become inconsistent in concurrent scenarios? Are there race conditions?
- **Recovery capability**: Can it recover to consistent state after failure? Is there a rollback mechanism?
- **Resource management**: Are file handles, network connections, and memory properly released?

### 3. Test Coverage Review

- **Happy path**: Are main feature paths covered by tests?
- **Reverse path**: Are error handling, rejection paths, and boundary values tested?
- **Regression tests**: Does modified code have corresponding regression tests? Are untested items clearly explained?
- **Test quality**: Do tests really verify behavior, or just restate code logic?

### 4. Documentation Consistency Review

- **API documentation**: Do function signatures, parameters, and return values match implementation?
- **Code examples**: Do README examples still work?
- **Changelog**: Are important changes recorded in changelog?
- **Version metadata**: Do package.json, pyproject.toml, etc. version numbers need updating?

### 5. Authorization and Security Review

- **Permission claims**: Does code claim permissions not obtained (e.g., platform features, user authorization)?
- **Git operations**: Are there unapproved commit, push, or branch operations?
- **Deployment operations**: Are there unapproved deployment, release, or sync operations?
- **User data**: Are user's existing changes preserved? Are there unexpected deletions or overwrites?

### 6. Common Pitfall Check

| Pitfall Type | Check Point |
|---------|--------|
| **False pass** | Were tests really executed? Or just printed pass? |
| **Stale evidence** | Are test results from this run? Or reusing old results? |
| **Implicit completion** | Was stage explicitly marked completed? Or quietly skipped? |
| **Scope creep** | Were features beyond requirements added during implementation? |
| **Documentation drift** | Do documented behaviors match actual implementation? |

## Review Report

After review completes, record the following:

1. **Review scope**: Which files, modules, and feature points were actually checked
2. **Issues found**: Evidence, impact scope, and fix suggestions for each issue
3. **Resolution**: Which issues are fixed; which need follow-up
4. **Remaining risks**: Known but unfixed issues and their impact

### Report Format

```markdown
## Review Report

### Review Scope
- Files: `src/auth.js`, `src/session.js`
- Features: Login flow, session management
- Tests: `test/auth.test.js` (this run)

### Issues Found
1. **Issue title**: [severity]
   - Evidence: [specific code location, test results]
   - Impact: [possible consequences]
   - Suggestion: [fix approach]

### Resolution
- Fixed: [issue list]
- Pending: [issue list and reasons]

### Remaining Risks
- [Known issues and their impact]
```

## Handling Issues

**Issue found -> Report evidence, impact, fix suggestion -> Rollback to implementation when implementation changes needed**

- Cannot complete Review stage with old test pass
- Review discussions or reports can be recorded; but pass must not be written when unresolved blockers exist
- After fix, must re-execute Testing and Review; cannot skip

```bash
# Review passed
node scripts/state.js checkpoint "Review" pass --reason "Actually-checked scope, findings, and resolutions"
node scripts/state.js stage review completed
node scripts/state.js stage ship in_progress

# Review found issues (needs rollback)
node scripts/state.js checkpoint "Review" fail --reason "Issue found: [specific description]"
node scripts/state.js stage review rolled_back
node scripts/state.js stage implementation in_progress
```

Use [review-checklist-template.md](../../templates/review-checklist-template.md) for formal reports as needed; attach [rollback-plan-template.md](../../templates/rollback-plan-template.md) for high-risk changes.

## Memory Integration Check

Before completing Review stage, verify memory system integration:

### Bootstrap Recall Verification

Check if Bootstrap stage executed snapshot and recall:

```bash
# Check for snapshots taken during Bootstrap
node scripts/memory.js show | grep -A10 '"snapshots"'
```

If no snapshots found in the current task's time window, Bootstrap did not execute recall. Record this as a Review finding:

```bash
node scripts/state.js checkpoint "Memory integration" warn --reason "Bootstrap did not execute snapshot/recall; evidence pipeline not opened"
```

### Ship Recall-Check Verification

Check if Ship stage executed recall-check (for tasks that have already passed Ship):

```bash
# Run recall-check to see if it produces output
node scripts/evolve.js recall-check 2>&1
```

If recall-check reports entries that were retrieved but not adopted, and this is the first time seeing them (not from a previous task), Ship did not complete evidence recovery. Record this as a Review finding.

### Evidence Pipeline Health

Check overall evidence pipeline status:

```bash
# Count entries with adopted/outcomes
python3 -c "import json; d=json.load(open('.hello-dev/memory.json')); adopted=sum(1 for e in d['entries'] if e.get('adopted')); outcomes=sum(1 for e in d['entries'] if e.get('outcomes')); print(f'Adopted: {adopted}, Outcomes: {outcomes}, Total: {len(d[\"entries\"])}')"
```

If adopted count is much lower than total, the evidence pipeline is underutilized. This is not a blocking issue but should be noted in Review for future improvement.

Memory integration is a **Review checkpoint**, not a gate. Missing memory operations do not block Ship, but should be recorded as findings for future improvement. The goal is to gradually increase evidence pipeline utilization through visibility, not through hard blocking.
