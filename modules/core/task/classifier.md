# Task Classifier

> Classify by actual side effects and decision needs; do not mechanically start full flow by keywords.

1. **Pure read-only**: Explain, search, check state, read logs, and summarize. Do not initialize state; do not require modification authorization.
2. **Design type**: Still need to decide behavior, interfaces, data model, or architecture. Confirm requirements first; design/full submits modules for approval.
3. **Implementation type**: Goal, boundaries, and approach are clear. Implementation path; avoid redesigning already-approved small changes.
4. **Other tasks with writes**: Document organization, operations, etc. confirmed by actual side effects; other path still goes through verification and review. Cannot use "other" to bypass authorization.

When there is real ambiguity, do read-only check first and ask only **one question that affects the result**; do not expand all ambiguities into architecture design. The questioning itself follows the `grill-me` discipline used by the [requirement stage](../../stages/requirement.md): recommended answer before each question, decision-tree order, facts resolved by reading the codebase rather than by asking.

Path definitions follow [SKILL.md](../../../SKILL.md) and [state-protocol.md](../state-protocol.md).
Fast only applies when the scope survey reports a single logical change unit (one file, de-duplicated <50 lines, no dependencies, not spanning business modules, no undecided design point); it does not reduce requirement confirmation, testing, review, and logging obligations. Large changes without confirmed approach cannot disguise as implementation just to reduce questions.
The routing decision uses the escalation criterion defined once in [escalation.md](escalation.md), section "Change-complexity checkpoint", and the module-root definition of "spans business modules" in that same section; this file does not define its own thresholds, and [SKILL.md](../../../SKILL.md) merely cites that section.

Deployment, Git changes, installation sync, and deletion require corresponding operation authorization; user confirming development task does not automatically authorize these actions.
