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
 * Stages reached only on `--type design --path full`.
 * `initialization` is deliberately NOT here: it is the session's first step on
 * every path (scope survey + coarse decomposition), so it must survive the filter.
 * `prototype` replaces the former sequential `ux-design` + `ui-design` pair
 * with a single interleaved iteration loop that produces a runnable prototype.
 */
const DESIGN_ONLY_STAGES = ['tool-research', 'feature-design', 'architecture', 'prototype'];

/** Stages active for a given state's task type + path. */
function route(s) {
  if (s.task.type === 'design' && s.task.path === 'full') return STAGES;
  return STAGES.filter(x => !DESIGN_ONLY_STAGES.includes(x));
}

module.exports = { STAGES, DESIGN_ONLY_STAGES, route };
