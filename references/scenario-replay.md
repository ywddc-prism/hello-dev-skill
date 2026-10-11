# HelloDev Scenario Replay

> Unit tests prove "mechanism is correct"; experience replay proves "mechanism is worth using".
> This file is a **manual replay checklist**; does not auto-execute, does not write state files, does not produce new automation burden.

## How to Use

Pick 1-3 scenarios similar to current work; run through them in a real project; fill in the "Observation" column.
Do not pursue running all 10; mark date for ones run; leave unrun ones blank -- blankness itself is information.

## Scenario List

| # | Scenario | Key Observation Points | Observation (fill actual values) |
|---|------|------------|------------------|
| 1 | Small bug fix | Did it mistakenly enter design approval; confirmation count | |
| 2 | Add one API | Did it re-confirm already-clear requirements | |
| 3 | Complex refactoring | Did it stop where it should stop; can module split be judged | |
| 4 | Architecture design only | Did it overstep into implementation; did it produce unnecessary documentation | |
| 5 | Resume after stopping midway | Did resume pick up original state, or restart | |
| 6 | Requirements expand midway | Did it re-confirm scope, rather than implicitly expand authorization | |
| 7 | Rework after test failure | Was old pass mistakenly reused; did rolled_back preserve history | |
| 8 | Git operation rejected | Did prompt clearly explain rollback path; was it mistakenly passed | |
| 9 | Concurrent task conflict | Lock conflict behavior; did it overwrite others' state | |
| 10 | Installation copy behind | Did release-check discover before users affected | |

## Six Metrics per Scenario

| Metric | What It Asks | What Counts as Problem |
|------|--------|------------|
| User confirmation count | How many replies needed to advance | Small fix > 1 time exceeds expectation |
| Repeated questions | Did it ask about already-clear things | 1 occurrence is recorded |
| Task type misjudgment | Was path chosen correctly | Wrong path needs manual correction |
| Unnecessary documentation | Did it produce files nobody reads | Output unrelated to requirements |
| Understands next step | Does it know what to do next at end | Requires user to ask |
| Stop/continue position | Should have stopped but didn't; should have proceeded but didn't | Either direction counts as defect |

## Interpretation

- **Single fluctuation does not change rules**: One replay's numbers may be task-specific.
- **Same defect reproducing across scenarios triggers escalation**: Only when same issue appears twice consecutively is it worth changing protocol or prompts.
- Record in `docs/progress_coding/`; do not write to memory (that is for preferences and project understanding, not logs).

## Related

- Path judgment basis: [classifier.md](../modules/core/task/classifier.md)
- Cost upper limits and targets: [cost-metrics.md](cost-metrics.md)
- Checks that only verify internal correctness: `bash scripts/self-check.sh`
