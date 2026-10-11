# Contrast Report - Limit Exceeded Comparison Report

> Assists user decisions based on recorded facts; does not fabricate historical versions, root causes, or success rates.

Triggered when: Rejection reaches current module or global limit, or user requests comparing approaches.

```bash
node scripts/state.js report
```

CLI only prints facts: rejection timeline, reasons, counts, current module status, and failed checkpoints. It does not auto-generate design approaches, read non-existent old files, or arrange subsequent tasks.
Agent supplements above facts with:

1. Attempted approaches and verifiable artifacts; mark missing if no version snapshot exists.
2. Cause analysis, clearly distinguishing "verified" from "speculated".
3. Differences, costs, and acceptance methods between next approach and existing approaches.
4. A question for user decision: continue, change direction, pause, or terminate.

Continuing requires explicit approval before calling `node scripts/state.js retry-resume --reason "basis for user's decision"`; does not reset counts. Pause or termination preserves state honestly; does not write uncompleted tasks as success.

State and limits: see [state-protocol.md](state-protocol.md).
