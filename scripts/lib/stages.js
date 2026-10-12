#!/usr/bin/env node
'use strict';

/**
 * Hello Dev — Stage order: the single source of truth.
 *
 * Origin: the stage list was restated in five places and they drifted in five
 * different directions. `scripts/check-collaboration-matrix.js` kept a local
 * 8-stage copy and used it as a regex vocabulary, so it validated the document
 * against itself: a row for `learn` (absent from that vocabulary) passed, and
 * deleting the rows for stages that DO exist also passed. README,
 * loop-concept.md, workbuddy.md, codex.md and the team-lead SOP each held their
 * own copy, each with a different omission.
 *
 * Consumers must not restate the list. Require this module, and
 * `scripts/check-stage-order.js` will fail any document that does.
 */

/** Every stage the state machine knows, in execution order. */
const STAGES = [
  'bootstrap',
  'initialization',
  'requirement',
  'tool-research',
  'feature-design',
  'architecture',
  'prototype',
  'implementation',
  'testing',
  'review',
  'ship',
  'learn',
  'evolution',
  'reflection',
  'archive',
];

/**
 * Design-only stages. These are also the **only** stages a stage-skip may remove
 * (see `state.js skip`): authorization gates (bootstrap, initialization,
 * requirement), evidence gates (testing, review), delivery (ship) and the four
 * post-delivery retrospectives (learn/evolution/reflection/archive) are never
 * skippable.
 */
const DESIGN_ONLY_STAGES = ['tool-research', 'feature-design', 'architecture', 'prototype'];

/**
 * Stages active for a state.
 *
 * Two readings, split by whether the state carries the `skipped` field (every
 * state created by the current `init` writes `skipped: []`):
 *
 * - **Current states** (`skipped` present): the route is ALWAYS the full 15-stage
 *   chain minus the stages the user has explicitly approved to skip (written by
 *   `state.js skip` with a mandatory reason quoting the user's approval). Task
 *   type and path no longer filter: any reduction is a recorded, user-approved
 *   skip — not a silent routing decision.
 * - **Legacy states** (`skipped` absent): created under the old contract where
 *   only `type=design && path=full` received design stages; the others never
 *   scheduled them. Reading such a state as the full chain would demand design
 *   work the task never scheduled, so the old filter is preserved verbatim.
 */
function route(s) {
  if (!Array.isArray(s.skipped)) {
    if (s.task.type === 'design' && s.task.path === 'full') return STAGES;
    return STAGES.filter(stage => !DESIGN_ONLY_STAGES.includes(stage));
  }
  const skipped = new Set(s.skipped.map(x => x && x.stage));
  return STAGES.filter(stage => !skipped.has(stage));
}

module.exports = { STAGES, DESIGN_ONLY_STAGES, route };
