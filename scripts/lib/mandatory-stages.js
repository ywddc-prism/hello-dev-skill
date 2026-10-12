#!/usr/bin/env node
'use strict';

/**
 * Hello Dev — Semantics of the mandatory post-delivery stages.
 *
 * Why this exists: `scripts/check-stage-order.js` verifies that every stage CHAIN and stage
 * COUNT matches `scripts/lib/stages.js`, but it never inspects the modal claim attached to
 * those stages. Measured defect: SKILL.md, SKILL.zh-CN.md and modules/stages/ship.md each
 * listed the chain correctly in one part of the file while another line called
 * `learn`/`evolution`/`reflection`/`archive` "optional", "not a delivery threshold" and
 * "do not block delivery". The guard was green and the framework still told its readers the
 * four stages could be skipped. Chain membership and modal status are different dimensions;
 * a check on one is silent about the other.
 *
 * The defect is a sentence, so the unit of inspection is a line. Detection requires BOTH a
 * stage reference AND an optionality marker on the same line: "optional" alone is everywhere
 * in this repository (optional plugins, optional technology selection) and would fire on
 * unrelated text.
 */

const { STAGES } = require('./stages');

/** The four stages that run after `ship` and are mandatory on every path. */
const MANDATORY_STAGES = ['learn', 'evolution', 'reflection', 'archive'];

/**
 * Stems, so "learning", "reflections" and "archived" still count.
 * Chinese stage names are included because the Chinese documents (`SKILL.zh-CN.md`) are a
 * delivered surface and previously matched no stem at all -- the Chinese variants of the defect
 * were silently invisible to an English-only detector.
 * Chosen so that no OTHER stage name collides: `archiv` does not match `Architecture`
 * (which is `archit`), and 归档 does not match 架构, so an optionality mention about
 * architecture or technology selection cannot be mistaken for a claim about Archive.
 */
const STAGE_STEM = /(?:learn|evolution|reflect|archiv|学习|反思|进化|归档)/i;

const OPTIONAL_MARKERS = [
  /\boptional\b/i,
  /\bnot a delivery threshold\b/i,
  /\bdo not block delivery\b/i,
  /\bexpanded only when\b/i,
  /仅(?:在|当).{0,20}需要时/,
  /可选/,
];

/**
 * Remove negated forms before matching. A sentence that says the stages are "not optional"
 * asserts the OPPOSITE of the defect, and the corrected documents contain exactly that
 * phrasing — without this step the guard would fire on its own remedy.
 *
 * The Chinese negation is `不是可选` / `非可选` / `不…可选`. Only the first two are listed as
 * whole phrases: a bare `不.{0,4}可选` would also erase a genuinely defective line such as
 * `学习和反思不是必须的,可选执行`, which is an assertion of optionality, not a negation of it.
 * Narrowing the pattern keeps the detector on the side of firing.
 */
function stripNegation(line) {
  let out = line;
  // English: an optionality word preceded by a negator within four tokens is a denial.
  for (let i = 0; i < 3; i++) {
    const next = out
      .replace(/\b(?:not|never|no longer|none of (?:it|them) (?:is|are))\s+(?:\w+\s+){0,3}option\w*/gi, '')
      .replace(/\bnone of (?:it|them) (?:is|are)\b/gi, '');
    if (next === out) break;
    out = next;
  }
  return out
    .replace(/不是可选/g, '')
    .replace(/非可选/g, '')
    .replace(/不属(?:于)?可选/g, '');
}

/** Lines that both reference a mandatory stage and call it optional. */
function optionalClaims(lines) {
  const out = [];
  lines.forEach((line, i) => {
    const probe = stripNegation(line);
    if (!STAGE_STEM.test(probe)) return;
    if (!OPTIONAL_MARKERS.some(re => re.test(probe))) return;
    out.push({ line: i + 1, text: line.trim() });
  });
  return out;
}

/**
 * Stage chains wrapped across two lines escape the per-line comparison in
 * `check-stage-order.js`: its claim regex needs `bootstrap` and an arrow on the SAME line, and
 * it discards any candidate with fewer than four parts. A chain broken after three stages is
 * therefore not flagged — it is silently unvalidated. This is the exact shape of the historical
 * defect (the old `loop-concept.md` chain was wrapped and had lost the last four stages), so it
 * is checked structurally rather than by comparison.
 */
function wrappedChains(lines) {
  const titles = STAGES.map(s => (s === 'ux-design' ? 'UX Design'
    : s === 'ui-design' ? 'UI Design'
      : s.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')));
  const startsWithStage = new RegExp(`^\\s*(?:${titles.join('|')}|${STAGES.join('|')})(?![a-z-])`, 'i');
  const out = [];
  for (let i = 0; i < lines.length - 1; i++) {
    if (!/->\s*$/.test(lines[i].trim())) continue;
    if (!startsWithStage.test(lines[i + 1])) continue;
    out.push({ line: i + 1, text: lines[i].trim() });
  }
  return out;
}

/** A document that names the four stages must state they are mandatory, not merely list them. */
const MANDATORY_CLAIM = [
  /\bmandatory on every (?:execution )?path\b/i,
  /在全部执行路径上均为强制阶段/,
];

module.exports = { MANDATORY_STAGES, STAGE_STEM, optionalClaims, wrappedChains, MANDATORY_CLAIM };
