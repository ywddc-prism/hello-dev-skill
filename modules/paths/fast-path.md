# Fast Path

> Reduce design and explanation; do not reduce authorization, verification, and traceability.

Applicable: Approach is clear, and the scope survey decides the path from the affected-file list, the number of logical change units, and whether the change spans business modules -- not from a bare line count. A de-duplicated estimate of <50 lines, no new dependencies, and no architecture changes is only the scope survey's lower-bound evidence, not a standalone threshold; operations with high safety or data risk cannot choose fast just because line count is small.

The path decision consumes the escalation criterion defined once in [escalation.md](../core/task/escalation.md), section "Change-complexity checkpoint"; this file does not define its own threshold, and [SKILL.md](../../SKILL.md) merely cites that section rather than restating it. Read that section for the escalation branches. "Spans business modules" is decided mechanically by module root, per the decidable definition in the same section.

For even smaller changes (single file, ≤ 10 lines, no sub-agents needed), see [tiny-path.md](tiny-path.md).

```text
Bootstrap -> Initialization -> Requirement -> Implementation -> Testing -> Review -> Ship -> Learn -> Evolution -> Reflection -> Archive
```

Requirement can be very short; when user has confirmed or explicitly says "just do it", record the basis and do not re-ask; but do not delete stages.
Testing executes all applicable layers; Review checks side effects; logs still appended immediately. When scope expansion is discovered, re-confirm first; do not continue implicitly expanding authorization along the fast path.

Comparison: [full-flow.md](full-flow.md). CLI transitions and checkpoints in [state-protocol.md](../core/state-protocol.md).

**Design stages**: UX Design and UI Design stages are part of the `design/full` path only. They do not appear in the fast path. When the scope survey determines a task qualifies for the fast path, no interaction design or visual design stages are executed; the existing design decisions (if any) are consumed as-is.
