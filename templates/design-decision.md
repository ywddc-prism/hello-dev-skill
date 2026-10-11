# Design Decision Record

> Each major design decision answers five questions. Not adding fields for format, but ensuring decisions can withstand review.
> Used for module submission in [design-flow.md](../modules/core/approval/design-flow.md); lightweight decisions can answer only first two questions; architecture-level decisions need all five.

## Structured Record

```json
{
  "decision": "approved",
  "scope": "Scope covered by this decision (files, interfaces, data models)",
  "problem": "What problem to solve",
  "alternatives": ["Candidate A", "Candidate B"],
  "chosen": "Chosen approach",
  "why": "Why this was chosen",
  "tradeoffs": ["What cost was accepted", "What capability was given up"],
  "rejectedReasons": ["Why candidate B was rejected"],
  "acceptanceCriteria": ["How to prove it is right later"],
  "rollback": "If wrong, how to roll back"
}
```

## Five Must-Answer Questions

| # | Question | Corresponding Field | Judgment Standard |
|---|------|----------|----------|
| 1 | What problem to solve? | `problem` | Not restating the approach, but clarifying the original pain point |
| 2 | Why choose this approach? | `chosen` + `why` | Can compare candidates; not "relatively suitable" |
| 3 | What was given up? | `tradeoffs` + `rejectedReasons` | Has real costs; do not write "none" |
| 4 | How to prove it is right later? | `acceptanceCriteria` | Verifiable, regressable; not subjective feeling |
| 5 | If wrong, how to roll back? | `rollback` | Specific steps; not "just roll back" |

## When to Write

- **When submitting design module** (`node scripts/state.js module <id> submitted`): Attach problem, candidates, recommendation, costs.
- **When approving** (`approved --reason "..."`): Complete `acceptanceCriteria` and `rollback`.
- **When rejecting** (`reject <id> --reason "..."`): Record `rejectedReasons`; becomes input for retry.

Reference this record in approval reasons, rather than stuffing all content into one line of `--reason`.

## Relationship with Existing Flow

- No new CLI subcommands; no new state fields -- decision record is approval's **content quality**, not state machine's **structure**.
- Module IDs and stages follow [design-flow.md](../modules/core/approval/design-flow.md): feature-api / arch-storage; two stages not mixed.
- Design approval still does not equal release authorization; Git, sync, deployment, deletion confirmed separately per their own protocols.
