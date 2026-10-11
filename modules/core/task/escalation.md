# Escalation Criteria and Module-Root Definition

This file is the **single authoritative source** for the escalation criterion and the "spans business modules" module-root definition. All other documents cite this file; they do not define their own thresholds.

## Scope Survey (routing precondition)

Before making any WF-Fast / WF-Standard routing decision, produce four items:

1. Affected file list
2. Number of logical change units
3. Whether the change spans business modules (see definition below)
4. Whether any undecided design point exists

Without a completed scope survey, no fast/standard path decision may be given.

## "Spans business modules" -- a decidable definition

"Spans business modules" is judged mechanically by **module root**, not by impression. Map each landing path to its module root:

- `modules/<subtree>/...` -> module root = `modules/<subtree>` (current subtrees: core, stages, paths, hosts)
- `expert-packages/<host>/<package>/...` -> module root = `expert-packages/<host>/<package>` (an expert package is its own release unit, with its own `plugin.json` and version)
- Any other in-repo top-level directory (`scripts/`, `hooks/`, `templates/`, `references/`, `docs/`, `archive/`, ...) -> module root = that top-level directory
- Loose files directly under `modules/` (e.g. `modules/index.md`) -> module root = `modules`
- Loose files at the repo root (`SKILL.md`, `README.md`, `README.zh-CN.md`, `_quick-reference.md`, `AGENTS.md`, `CONTRIBUTING.md`, `self-check.yml`) -> module root = repo root (all belong to the "skill entry surface")
- Install copies / generated copies outside the repo -> attributed by their **source path** (copy sync never produces its own module root)
- Generated artifacts (whose only legitimate source is a generator, e.g. `modules/index.md` from `scripts/gen-index.js`) -> **do not participate** in module-root counting; they follow the change unit that produced them (otherwise end-of-wave index regeneration would be misclassified as cross-module)

After mapping: landing in >= 2 distinct module roots => spans business modules; all landing in the same module root => does not span business modules.

Rationale: this repository has no independently runnable backend/frontend subsystems; the units that do carry an independent release boundary and lifecycle are `expert-packages/<host>/<package>` (each has its own `plugin.json` and version), and cutting the rest at top-level directories matches the authoritativeness grouping in `modules/index.md`. The rule is pure path-prefix matching, so it can be mechanically re-checked, avoiding subjective expressions like "obviously different modules" that cannot be evidenced.

## Change-complexity checkpoint

Before dispatch, output: estimated affected-file count, number of logical change units, and de-duplicated estimated logical change lines.

**Escalation criterion** (counted by logical change unit, not by touched-file count): escalate to WF-Standard when any of:

- >= 2 logical change units
- spans business modules
- undecided design point exists
- de-duplicated estimated logical change lines > 50

One logical change unit synchronized across N locations counts as one change unit, does not accumulate lines, but all N locations must be listed in the boundary contract. **Cross-module judgment is by module root**: if all N locations fall within the same module root -> not cross-module; if N locations span different module roots -> counted as cross-module per the ">= 2 distinct module roots" rule above; in that case both "N-location sync" and "cross-module" hold simultaneously and do not override each other.

Supplementary (does not add thresholds): "spans business modules" is judged by the decidable definition above (module root); that definition attributes install copies / generated copies outside the repo to the module root of their **source path**, so copy sync never produces a module root of its own -- consistent with "does not count as cross-module", the two do not conflict; touched-file count only serves as the scope survey's lower-bound evidence, not as an independent escalation threshold.

## Escalation criterion vs decomposition criterion

These are **two different questions with two different thresholds**, both consuming the **same** scope-survey output, and their conclusions are **independent** -- escalation != decomposition.

- **Escalation criterion** (this section) answers "should this request take the standard loop", consuming the scope survey's four outputs (affected file list, logical change units, cross-module, undecided design point) plus de-duplicated line count.
- **Decomposition criterion** (the "When Decomposition Is Mandatory" tables in [requirement](../../stages/requirement.md) and [decomposition](decomposition.md)) answers "should this request be split into subtasks", consuming the same scope-survey output, with thresholds: >= 2 logical change units, clear sequential dependencies, de-duplicated estimated > 50 lines.
- **Relationship**: the same scope survey feeds both criteria but conclusions are independent. Valid combinations include "escalate but only 1 change unit so decomposition may be skipped" (e.g. a single change unit with an undecided design point, or landing in 2 module roots) and "decompose without escalating" (e.g. 2 change units, same module, no undecided design point, de-duplicated < 50 lines). When both hold, execute per each conclusion: escalation determines path, decomposition determines granularity and wave scheduling.
