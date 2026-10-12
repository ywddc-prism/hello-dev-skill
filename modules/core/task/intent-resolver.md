# Intent Resolver - Intent Mapping

> State machines are for the system; users should not bear the state machine's internal terminology. Users speak task language; this handles mapping.

## Start with Natural Language

| You Say | What Actually Happens |
|------|----------|
| "Give me a plan first, don't change code" | Full chain through design stages, **stop before implementation** |
| "Plan is confirmed, implement directly" | Full chain; design stages skipped only via approved `state.js skip` |
| "Fix a small bug", "Fix a typo" | Full chain; agent proposes skipping design stages if the scope survey shows no design point |
| "Help me research XX", "What's the principle" | Pure read-only: answer directly; do not initialize state or require modification authorization |
| "Continue last task" | resume: read `.hello-dev/state.json`; continue based on current stage and block markers |
| "Stop this task" | Stop immediately: do not complete stages or do closing execution; already-written logs preserved |
| "This doesn't work, start over" | rolled_back: preserve failure history; re-implement and verify per the full chain |

There is one execution path (the full chain); lightening it is a recorded, user-approved `state.js skip` at a design-stage boundary, not a second route. Classification only determines **the plan**, not **authorization**: deployment, Git write operations, installation sync, and deletion always require separate confirmation; not automatically granted because intent is "implementation".

## Ask Only One Question

When there is real ambiguity, do read-only check first and ask only **one question that affects the result** -- typically "plan first, or plan confirmed and can start".
Do not escalate all ambiguities into architecture design, and do not use a string of questionnaires to confirm what has already been clearly stated.
This is a **rate** rule, not a **depth** rule: one question at a time, but each one carries a recommended answer and the questions follow decision-tree order (`grill-me` discipline, see [requirement.md](../../stages/requirement.md)). Asking one shallow question to stay within the rate is not compliance, and batching the tree into one turn to move faster is not either.

## Mapping Basis

- Judging read-only / design / implementation / risk follows [classifier.md](classifier.md) -- it classifies by actual side effects; it does not pick a second route, because there is only one.
- Stage definitions follow [SKILL.md](../../../SKILL.md) and [state-protocol.md](../state-protocol.md); any stage reduction is a recorded, user-approved `state.js skip`.
- Underlying CLI (`scripts/state.js`) retained as recovery and audit interface: used directly when state is abnormal, host interrupted, or evidence needs to be preserved; not forced through intent layer.

## Boundaries

- Intent layer is mapping rules; not an executable parser; not a new subsystem; when uncertain, follow classifier's conservative branch.
- "Just do it" is authorization to skip questions; not to skip stages, logs, Testing, or Review.
- Do not expand authorization scope because intent expression is vague; scope follows actual changes and user confirmation.
