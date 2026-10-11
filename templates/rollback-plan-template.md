# Rollback Plan

---

## Basic Information

| Field | Value |
|------|-----|
| Version | [Version number] |
| Release Date | [YYYY-MM-DD] |
| Rollback Target | [Version to roll back to] |
| Rollback Reason | [Reason] |

---

## Rollback Trigger Conditions

### Automatic Trigger

- [ ] Error rate > [X]%
- [ ] Response time > [X]ms
- [ ] [Other metrics]

### Manual Trigger

- [ ] Critical bug
- [ ] Data issue
- [ ] Security issue

---

## Rollback Steps

### 1. Notification

```
- [ ] Notify team
- [ ] Notify stakeholders
- [ ] Record start time
```

### 2. Execute Rollback

```
- [ ] Stop new features
- [ ] Switch traffic to old version
- [ ] Verify rollback succeeded
```

### 3. Verification

| Check Item | Expected | Actual | Result |
|--------|------|------|------|
| Service status | Running | - | - |
| Functionality normal | Yes | - | - |
| Data integrity | Yes | - | - |

### 4. Follow-up

- [ ] Analyze root cause
- [ ] Create fix plan
- [ ] Update monitoring system
- [ ] Post-mortem meeting

---

## Rollback Checklist

```
[ ] Stop service writes
[ ] Backup current data
[ ] Execute rollback command
[ ] Verify service startup
[ ] Verify functionality normal
[ ] Verify data integrity
[ ] Notify stakeholders
[ ] Record completion time
```

---

## Rollback Commands

```bash
# [Command description]
[Command]

# [Verification command]
[Verification command]
```

---

## Post-Rollback State

| Item | Status |
|------|------|
| Database | [Status] |
| Cache | [Status] |
| Queue | [Status] |
| Configuration | [Status] |

---

## Contacts

| Role | Name | Phone |
|------|------|------|
| Owner | [Name] | [Phone] |
| On-Call | [Name] | [Phone] |
