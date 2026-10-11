# Cost Metrics

> For each optimization, first ask "how much did this cost the user", then ask "how much risk did this block".
> Only adding capabilities without testing costs makes the rules themselves the biggest usage cost.

## Metrics

| Metric | Meaning | Collection Method |
|------|------|----------|
| Average user confirmations | How many replies needed to advance one task | [Scenario Replay](scenario-replay.md) manual record |
| Average stage count | Number of stages actually entered | `scripts/state.js report` |
| Average document lines read | How many unrelated protocol lines were loaded | Estimated during replay |
| State file size | How much state data produced per task | `.hello-dev/state.json` size |
| Average retries after failure | How many times stuck on same issue | State machine retry count |
| Error classification rate | Proportion of wrong path selection | Replay observation |
| User cancellation rate | Proportion of users stopping midway | Replay observation |
| Repeated explanation ratio | Same question explained more than twice | Replay observation |
| Process block count | Times stopped by process, not by problem | Replay observation |

**Not auto-collected**: These numbers are meaningful only when humans look; auto-collection would become another telemetry to maintain.
Each metric states collection method; actual records go into `docs/progress_coding/`.

## Target Upper Limits

| Task Type | Target |
|----------|------|
| Small fix | Requirement confirmation <= 1 time; no design approval; no reading unrelated stage docs |
| Normal implementation | No re-confirming already-clear requirements; only load related protocols; Testing / Review retained |
| Complex design | Every major decision has trade-off record; every rejection has traceable reason |

Upper limits are **regression baselines**, not performance metrics: when exceeded, first judge whether it's a process defect or the task itself being complex.

## When to Use

1. **Before** changing protocol or adding rules: First check if current cost is already over limit -- if over, should delete, not add.
2. **After** one optimization: Compare confirmation count and block count for same task type.
3. Two consecutive times over limit: Escalate to protocol modification, not continue verbal reminders.

## Related

- Scenario and measurement definitions: [scenario-replay.md](scenario-replay.md)
- Path and not expanding authorization: [classifier.md](../modules/core/task/classifier.md)
