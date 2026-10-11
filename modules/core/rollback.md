# Rollback Mechanism — Teaching Reference

> **Authoritative Source**: Complete rules for rollback and retry follow [state-protocol.md](state-protocol.md).
> This file is a teaching reference providing design thinking and decision tables for the rollback mechanism.

## Core Rule

Review stage decides whether to continue:
- **PASS** -> Enter Ship
- **FAIL** -> Rollback to failed stage

## Rollback Decision Table

| Review Result | Rollback To | Action |
|------------|--------|------|
| Requirement FAIL | Requirement | Re-answer questions |
| Architecture FAIL | Architecture | Redesign |
| Implementation FAIL | Implementation | Rewrite code |
| Testing FAIL | Testing | Redo testing |

## Rollback Trigger Conditions

### Consistency Check Failure

| Type | Definition |
|------|------|
| promisesBroken | Promised but not built |
| partialImplementation | Built but incomplete |
| newFeaturesNotInDoc | Built but not promised |

### Execution Failure

| Error | Rollback To |
|------|--------|
| Build failure | Implementation |
| Test failure | Testing |
| Review failure | Corresponding stage |

### Escalation Condition

5 consecutive failures -> Escalate to user

## Rollback Execution Flow

1. Identify failed stage
2. Clear that stage's output (if any)
3. Record failure reason
4. Re-enter that stage
5. Execute that stage

## Rollback vs Restart

| Scenario | Action |
|------|------|
| Failure within stage | Retry that stage |
| Stage completed but failed | Rollback to that stage |
| Need to start over | User decides |
