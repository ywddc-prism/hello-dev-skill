# Stage 6: Testing - Layered Verification

> Test conclusions must come from actual execution; inapplicable items need explanation; inability to execute does not equal pass.

## List Risks First, Then Choose Verification Layers

Four-layer verification answers "what was run"; risk matrix answers "what was covered". **First identify risks introduced by this change, then decide which layers to prove them** -- otherwise four layers degrade into checkbox actions.

| This Change Involves | Must Verify | Evidence Form |
|--------------|----------|----------|
| State changes | Legal transitions, illegal transitions, rollback, recovery | State assertions + state unchanged on rejection |
| External API | Response format, timeout, permissions, retry | Real call or isolated substitute's return and error semantics |
| Concurrent writes | Locks, conflicts, data loss | Two writers actually compete; observe who takes effect |
| File operations | Empty files, bad format, permission failures | Construct abnormal input; confirm behavior and error messages |
| Git operations | Wrappers, abnormal input, unknown commands | Gate unit tests + classification consistency check |
| UI changes | Interaction, keyboard, error states, responsive | Real browser operation; not screenshots |

Write "not applicable this time" with reason for irrelevant lines; do not fabricate verification to fill the table.
Risk rows are **this stage's input**: they determine which of the four layers to execute; not backfilled afterwards.

## Four-Layer Verification

| Layer | Execution Content | This Repository Examples |
|------|----------|------------|
| 1. Build | Frontend/backend compile/build; fix failures first; do not continue with errors | JS `node --check`, shell `bash -n`; no bundler build in this repo |
| 2. Regression | Existing cases for affected modules; do not pad with irrelevant full tests | State CLI behavior tests, Git hook regressions |
| 3. Behavior | API/CLI response, state, side effects, permissions, and error semantics | Isolated project executes real CLI; check state unchanged on rejection |
| 4. Boundary | Null/default, limits, abnormal format; verify conflicts if concurrent risk exists | Stage jumping, retry limits, lock conflicts, bad JSON |

For new logic, prefer failure regression to reproduce defect, then implement and re-verify. Tests target behavior; do not substitute semantic assertions with keyword presence.

Conclusions write not "what commands were run" but "what risks were introduced and what evidence exists for each".
Risk rows and four-layer results correspond in checkpoint reason, e.g.:
`Risk: state rollback -> Layer 2 state assertions passed; Risk: hook abnormal input -> Layer 4 22 items passed`.
Pure documentation tasks verify links, command executability, examples consistent with implementation; do not require non-existent backend/API/browser.

## Frontend Conditional Verification

Only conduct browser or platform real interaction verification when actual UI changes are involved: layout breakpoints, input/load/error states, keyboard accessibility, readability, and related performance. Adopt project's existing acceptance criteria; do not arbitrarily require all projects to have first screen under a fixed number of seconds.
Clearly state limitations when real browser verification capability is unavailable; screenshots cannot substitute for behavior verification. CLI-only changes do not fabricate UI tests.

## Result Recording (Connecting Evidence Pipeline)

For adopted L3/L4 entries, record outcome after testing completes to close the evidence chain:

```bash
# Testing validates this pattern is effective
node scripts/memory.js outcome --id <entry-id> --result improved --evidence "Tests passed; pattern is effective"
# Testing validates this pattern causes issues
node scripts/memory.js outcome --id <entry-id> --result regressed --evidence "Tests failed; pattern causes issues"
```

Skip outcome for entries not adopted. Also record `no_effect` results (to prevent evolve from misjudging as effective).

## Results and Rework

Record commands, applicable scope, results, failure reasons, and untested items. Use [test template](../../templates/test-report-template.md) when formal reports are needed.

```bash
node scripts/state.js checkpoint "Testing" pass --reason "Actual verification commands and their results, pasted from this run"
node scripts/state.js stage testing completed
node scripts/state.js stage review in_progress
```

Record failures as fail; when fix requires implementation changes, first rolled_back, then re-implement and verify per path. Old-round pass cannot be reused. Only rerunning this round's failed checks can append same-named pass; history preserved. Only record test pass when all applicable verifications pass.
