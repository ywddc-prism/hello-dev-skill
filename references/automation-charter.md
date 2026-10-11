# Automation Charter

> One-time delineation: **what can auto-take-effect and what requires manual approval**.
> Actions within the charter can auto-execute; those outside retain independent authorization. This is not discipline in a prompt;
> it must be checked by **protected validation and activation procedures** -- otherwise a candidate executor with equivalent permissions could modify it.

## 1. Why Boundaries Are Needed

Causal relationship: **If the system can modify both the answer and the scoring rules, "score improvement" cannot prove capability improvement.**

Therefore the candidate optimizer must never touch its own scoring criteria. This is not conservatism; it is the premise for evaluation results to have meaning.

## 2. Auto-Effect Boundaries

| Object | Boundary | Effect Condition |
|------|------|----------|
| Memory retrieval ranking, context selection | Yes, can auto | Isolated replay passes + no critical scenario degradation |
| Execution strategies (diagnostic steps, reusable operations) | Yes, can auto, **but with side-effect prerequisite** | See Section 2.1 |
| Experience knowledge (memory entries) | Yes, can auto | Has verifiable `--source`; speculation remains candidate |
| Framework code, scripts | Warning: Only generate candidates | Auto tests pass; **does not auto-overwrite running version** |
| Approval rules, permissions, mandatory test requirements | No, forbidden | Permanently manual |
| Raters, acceptance criteria, protected test sets | No, forbidden | Permanently manual; candidate optimizer has no right to modify |
| Git write operations, deployment, installation copy sync | No, forbidden | Retain existing independent authorization (see git-gate / runtime-adapters) |

### 2.1 Dual Conditions for Execution Strategies

"Object is in whitelist" **is not enough**. Must also satisfy:

> **The strategy does not change trigger conditions for any operation with external side effects.**

Rationale: Even if the strategy file itself is just text, if the behavior it guides carries external side effects
(Git writes, deployment, deletion, installation sync), auto-effect equals delegating **the trigger conditions for side effects**
to the candidate version -- and rollback can only affect subsequent behavior; **it cannot undo already-executed external operations**.

Both must be satisfied simultaneously for auto-effect; missing one requires manual approval.

## 3. Two Gates

### 3.1 Hard Thresholds (Cannot Be Offset by Benefits)

- Do not expand authorization
- Do not skip required Testing / Review
- Do not modify protected rules and scoring criteria
- Do not cause degradation of existing critical scenarios
- Evidence must correspond to **this candidate version**, not old test results

Any unmet condition -> reject, regardless of how large the benefit.

### 3.2 Improvement Evidence (Compared with Old Version)

- Compare old version and candidate version on same scenarios
- Preserve acceptance cases **that did not participate in candidate generation**
- Record model, tool, strategy, environment versions to reduce confounding factors
- Verify mechanisms with deterministic tests; verify Agent behavior with **actual execution traces and results**
- Improvement not clear -> do not auto-promote (keeping old version is also a normal outcome)

**Counter-examples must be preserved.** For example, when optimizing "reduce repeated confirmations", must still preserve
the counter-example "re-confirm when requirements expand" -- otherwise the system might achieve better surface metrics by **no longer confirming correctly**.

## 4. Cost and Budget (Honest Counting)

- Set **candidate count, execution count, time, or cost** limits per round; stop when reached.
- Failures reaching retry limit also stop (consistent with [state-protocol](../modules/core/state-protocol.md) retry limit caliber).
- **Do not auto-collect cost metrics**: [cost-metrics.md](cost-metrics.md) explicitly agrees these numbers are meaningful only when humans look. Budget's **execution count** maintained by program, but **cost attribution and interpretation still go through manual records** (`docs/progress_coding/`); no new telemetry pipeline.
- No new evidence means no repeated optimization; avoid spinning wheels.

## 5. Evidence Tri-Separation (Cannot Be Mixed)

`scripts/memory.js` stores three things separately; no step can substitute for the next:

```text
retrieved   hits      Experience was retrieved -- only indicates it appeared in results
applied     adopted   Experience was actually adopted -- needs --source explaining which step used it
outcome     outcomes  Result after adoption -- improved|regressed|no_effect|unknown; needs --evidence
```

- **Adopted does not equal effective**; **task success does not mean that experience entry contributed to success**.
- `unknown` is a first-class citizen: when unable to judge, explicitly preserve unknown;
  **do not package retrieval counts as confidence**.
- `outcome` must be attributable to a specific `adopt` (`adoptAt`);
  otherwise results cannot be traced, equivalent to invalid evidence.
- New results **append without overwriting** old results -- history cannot be rewritten; evaluator judges by time whether evidence is still valid.

## 6. Versioning and Rollback

- Strategies go into **versioned configuration with field constraints and scope constraints**; do not repeatedly directly overwrite `SKILL.md`.
- Fix `policyVersion` at each task start; in-progress tasks do not accept hot updates.
- New strategies first pass isolated replay, then use for limited-scope new tasks.
- Check baseline version at activation; avoid overwriting manual modifications.
- Clear degradation -> switch back to previous version.
- **Rollback can only affect subsequent behavior; cannot undo already-executed external operations.**
  Therefore auto-effect scope avoids deployment, deletion, permission changes, and other operations with external side effects.

## 7. Real Security Isolation

Whitelist **cannot only be written in prompts**, nor only in this document.

- Checked by **protected validation and activation procedures**.
- If candidate executor has equivalent permissions to modify these procedures, this is still just discipline constraint,
  **not a real security boundary**.
- **Permission domain separation first step (implemented)**: Threshold validation logic (FORBIDDEN_PATTERNS and validate*)
  extracted to independent module `scripts/lib/evolve-guard.js`; `scripts/evolve.js` calls via require.
  Candidate executor can change evolve.js but cannot touch thresholds (unless also able to change guard module).
- **Current state**: Guard module and candidate executor still in same permission domain (filesystem level);
  therefore **still the first fence**. Upgrading to real isolation requires putting guard module where candidate executor
  has no write permission (e.g., read-only mount, separate process, or signature verification); that exceeds this phase's scope.

## 8. Current Phase Status

**Phase 1 = Evaluate only; do not activate (observe mode).**

Completed / in-progress boundaries:

| Capability | Status |
|------|------|
| Evidence collection (retrieved/applied/outcome) | Yes: `scripts/memory.js` `recall`/`adopt`/`outcome` |
| Candidate management, old/candidate comparison evaluation, budget, rejection reasons | Yes: `scripts/evolve.js` (`status`/`candidates`/`budget`/`evaluate`/`reject`) |
| Hard thresholds (reject overstepping candidates) | Yes: `evolve.js` `FORBIDDEN_PATTERNS` + `test-evolve.js` group 1 |
| In-charter auto-activation | No: Not enabled (`mode: observe` is only legal value; `activated` always 0) |
| Auto-rollback | No: Not enabled |

**Current security strength (factual, not exaggerated)**: Hard thresholds are text regex matching, **can be bypassed by wording** --
this limitation is **fixed by assertion** in `test-evolve.js` group 6 (different wording does pass),
and at same location asserts second line of defense still holds (in observe mode `activated` always `false`).
First line is discipline fence, not security boundary (see Section 7).

Although Phase 1 only evaluates, **the ultimate goal is still in-charter auto-running**, not permanent manual approval.

## 9. Related

- State and recovery: [state-protocol](../modules/core/state-protocol.md)
- Cost metrics (not auto-collected): [cost-metrics.md](cost-metrics.md)
- Scenario replay (manual checklist): [scenario-replay.md](scenario-replay.md)
- Git risk: [git-gate](../modules/core/approval/git-gate.md)
