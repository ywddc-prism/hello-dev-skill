# Error Recovery — Teaching Reference

> **Authoritative Source**: Complete rules for rollback and retry follow [state-protocol.md](state-protocol.md).
> This file is a teaching reference providing error recovery strategies and best practices; it does not override formal definitions in the state protocol.

## Error Types and Rollback Targets

| Error | Action | Rollback To |
|------|------|--------|
| Build failure | Return to Implementation | Implementation |
| Test failure | Return to Testing | Testing |
| Review failure | Return to failed stage | Corresponding stage |
| 5 consecutive failures | Escalate to user | — |

## Recovery Strategies

### Build Failure
1. Check error message
2. Locate error file
3. Fix code
4. Rebuild
5. Verify build passes

### Test Failure
1. Confirm test environment is healthy
2. Check test cases
3. Fix code or tests
4. Rerun tests

### Review Failure
1. Record failure reason
2. Rollback to failed stage
3. Rerun that stage

### Escalation Protocol

When 5 consecutive failures occur:

1. Stop auto-retrying
2. Record all failure information
3. Present options to user:
   - Try different approach
   - Simplify scope
   - Abandon this feature
4. Wait for user decision

## Error Prevention

### Before Implementation
- Verify all requirements are clarified
- Check for unknown dependencies
- Confirm tool availability

### During Implementation
- Build frequently
- Test early
- Keep commits small

### Before Review
- Self-check against checklist
- Verify all acceptance criteria
- Test boundary cases
