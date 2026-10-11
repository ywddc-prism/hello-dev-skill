# Intent Resolver - Intent Mapping

> State machines are for the system; users should not bear the state machine's internal terminology. Users speak task language; this handles mapping.

## Start with Natural Language

| You Say | Internal Path | What Actually Happens |
|------|----------|----------|
| "Give me a plan first, don't change code" | design/full | Requirement -> Feature Design -> Architecture -> **stop before implementation** |
| "Plan is confirmed, implement directly" | implementation | Requirement confirmation -> Implementation -> Testing -> Review -> Ship |
| "Fix a small bug", "Fix a typo" | fast | Requirement confirmation -> Implementation -> Testing -> Review -> Ship; no design approval |
| "Help me research XX", "What's the principle" | Pure read-only | Answer directly; do not initialize state or require modification authorization |
| "Continue last task" | resume | Read `.hello-dev/state.json`; continue based on current stage and block markers |
| "Stop this task" | Stop immediately | Do not complete stages or do closing execution; already-written logs preserved |
| "This doesn't work, start over" | rolled_back | Preserve failure history; re-implement and verify per path |

Classification only determines **path**, not **authorization**. Deployment, Git write operations, installation sync, and deletion always require separate confirmation; not automatically granted because intent is "implementation".

## Ask Only One Question

When there is real ambiguity, do read-only check first and ask only **one question that affects the result** -- typically "plan first, or plan confirmed and can start".
Do not escalate all ambiguities into architecture design, and do not use a string of questionnaires to confirm what has already been clearly stated.
This is a **rate** rule, not a **depth** rule: one question at a time, but each one carries a recommended answer and the questions follow decision-tree order (`grill-me` discipline, see [requirement.md](../../stages/requirement.md)). Asking one shallow question to stay within the rate is not compliance, and batching the tree into one turn to move faster is not either.

## Mapping Basis

- Judging read-only / design / implementation / risk follows [classifier.md](classifier.md) -- it classifies by actual side effects; does not mechanically start full flow by keywords.
- Path and stage definitions follow [SKILL.md](../../../SKILL.md) and [state-protocol.md](../state-protocol.md).
- Underlying CLI (`scripts/state.js`) retained as recovery and audit interface: used directly when state is abnormal, host interrupted, or evidence needs to be preserved; not forced through intent layer.

## Boundaries

- Intent layer is mapping rules; not an executable parser; not a new subsystem; when uncertain, follow classifier's conservative branch.
- "Just do it" is authorization to skip questions; not to skip stages, logs, Testing, or Review.
- Do not expand authorization scope because intent expression is vague; scope follows actual changes and user confirmation.
