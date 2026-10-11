# Self Review

> Compare requirements against actual behavior; do not substitute judgment with checking many irrelevant items.

## Before Implementation

Confirm scope and authorization, related source code/documentation, user's existing changes, minimal reversible approach, failure reproduction and verification methods. Confirm first when there are pending key issues; do not secretly make decisions for the user during implementation.

## During Implementation

Check inputs/outputs, error handling, boundaries and side effects; log immediately after modifications. Co-update when finding documentation drift; do not expand to irrelevant formatting and abstractions.

## After Implementation / Review

- Requirements: Does actual implementation match with exclusions?
- Correctness: Do tests cover this round's risks; is any behavioral error hidden by string matching?
- Authorization: Was task approval mistaken for Git/release/installation sync permissions?
- Evidence: Are test, approval, and completion records real and belonging to the current round?
- Documentation: Are call examples, state transitions, and trust boundaries consistent with implementation?
- Recovery: Do failure rejections preserve state; does rollback revalidate?

Normal checks can be recorded via checkpoint with scope and results. Review stage must have `Review` pass and must not cover unresolved issues through records.
When rework is needed, use rolled_back implementation and redo Testing/Review. See [State Protocol](state-protocol.md), [Review](../stages/review.md).
