#!/usr/bin/env bash
# Hello Dev restoration. Default read-only; --apply requires separate approval.
# Usage: setup.sh [--check|--apply|--list] [--only=STEP] [--host=HOST]
#        [--settings=/absolute/file] [--skill-dir=/absolute/skill]
# Host/path selection is shared with register-hooks.js, not directory fingerprints.
set -uo pipefail
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APPLY=0; LIST=0; ONLY=''; ONLY_SET=0; SELECT=()
for a in "$@"; do
  case "$a" in
    --apply) APPLY=1 ;;
    --check) if [ "$APPLY" -eq 1 ]; then printf 'Cannot combine --apply and --check\n' >&2; exit 2; fi ;;
    --list) LIST=1 ;;
    --only=*) ONLY="${a#--only=}"; ONLY_SET=1 ;;
    --host=*|--settings=*|--skill-dir=*|--node-bin=*) SELECT+=("$a") ;;
    -h|--help) printf '%s\n' 'Usage: setup.sh [--check|--apply|--list] [--only=repo|symlink|hooks|claude-md|codex] [--host=claude|codebuddy|workbuddy|codex] [--settings=/absolute/file] [--skill-dir=/absolute/skill]' 'Default read-only. No inferred WorkBuddy Desktop settings; no automatic codex apply.'; exit 0 ;;
    *) printf 'Unknown argument: %s\n' "$a" >&2; exit 2 ;;
  esac
done
if [ "$ONLY_SET" -eq 1 ]; then case "$ONLY" in repo|symlink|hooks|claude-md|codex) ;; *) printf 'Unknown step: %s\n' "$ONLY" >&2; exit 2;; esac; fi
CONTRACT="$(node "$SRC/scripts/register-hooks.js" ${SELECT[@]+"${SELECT[@]}"} --describe)" || exit $?
field() { printf '%s' "$CONTRACT" | node -e 'const fs=require("fs");const d=JSON.parse(fs.readFileSync(0,"utf8"));process.stdout.write(d[process.argv[1]]||"");' "$1"; }
HOST="$(field host)"; SKILL_LINK="$(field skillDir)"; SETTINGS="$(field settings)"; REG_STATUS="$(field status)"
want() { [ "$ONLY_SET" -eq 0 ] || [ "$ONLY" = "$1" ]; }
if [ "$LIST" -eq 1 ]; then
  printf 'Host: %s\n' "$HOST"
  printf '%s\n' 'repo       Source readable (read-only)' 'symlink    Selected skill path; preserves existing installs' 'hooks      Explicit selected settings; host loading/acceptance not established' 'claude-md  Memory block for claude/workbuddy only' 'codex      AGENTS.md merge preview only; no automatic apply'
  exit 0
fi
# Preflight before *any* apply: do not write a link then discover unknown hooks.
if [ "$APPLY" -eq 1 ]; then
  if [ -z "$SKILL_LINK" ] && ! [ "$ONLY" = repo ]; then printf 'UNKNOWN: select --host and a skill directory before apply\n' >&2; exit 3; fi
  if want hooks && [ "$REG_STATUS" != SELECTED ]; then printf 'UNKNOWN: no verified selected settings path/interface; no writes\n' >&2; exit 3; fi
  if want hooks && [ ! -f "$SETTINGS" ]; then printf 'UNKNOWN: let selected host create settings first; no writes\n' >&2; exit 3; fi
fi
fail=0; pass=0; unknown=0
ok() { printf 'PASS: %s\n' "$*"; pass=$((pass+1)); }
bad() { printf 'FAIL: %s\n' "$*"; fail=$((fail+1)); }
missing() { printf 'UNKNOWN: %s\n' "$*"; unknown=$((unknown+1)); }
if [ "$APPLY" -eq 0 ]; then printf 'DRY RUN: no files written\n'; fi
printf 'Host: %s; settings: %s; skill: %s\n' "$HOST" "${SETTINGS:-unverified}" "${SKILL_LINK:-unselected}"
if [ -f "$SRC/SKILL.md" ]; then ok "Source readable: $SRC"; else bad 'Source missing'; fi
if want symlink; then
  if [ -z "$SKILL_LINK" ]; then missing 'Skill directory unselected'
  elif [ -L "$SKILL_LINK" ]; then
    if [ "$(cd "$SKILL_LINK" 2>/dev/null && pwd -P)" = "$(cd "$SRC" && pwd -P)" ]; then ok 'Selected symlink resolves to source'; else bad 'Selected symlink points elsewhere; not replaced'; fi
  elif [ -e "$SKILL_LINK" ]; then
    if [ -f "$SKILL_LINK/SKILL.md" ] && grep -qE '^name:[[:space:]]*hello-dev[[:space:]]*$' "$SKILL_LINK/SKILL.md"; then ok 'Existing physical install preserved; content sync not implied'; else bad 'Selected path is not a HelloDev install; not overwritten'; fi
  elif [ "$APPLY" -eq 0 ]; then printf '[dry-run] Would create selected skill symlink\n'
  elif node -e 'const fs=require("fs"),path=require("path");fs.mkdirSync(path.dirname(process.argv[1]),{recursive:true});fs.symlinkSync(process.argv[2],process.argv[1],"dir");' "$SKILL_LINK" "$SRC"; then ok 'Selected symlink created'
  else bad 'Symlink creation failed'; fi
fi
if want hooks; then
  if [ "$REG_STATUS" != SELECTED ]; then missing 'Hook registration interface/path not verified for selected host'
  else
    for name in git-gate.js opsgate.js; do [ -f "$SKILL_LINK/hooks/$name" ] || missing "Selected installed hook missing: $name"; done
    MODE=--dry-run; [ "$APPLY" -eq 0 ] || MODE=--apply
    node "$SRC/scripts/register-hooks.js" --host="$HOST" --skill-dir="$SKILL_LINK" --settings="$SETTINGS" --node-bin="$(field nodeBin)" "$MODE"; rc=$?
    if [ "$rc" -ne 0 ]; then bad 'Hook registration plan/write failed'; elif [ "$APPLY" -eq 1 ]; then
      node "$SRC/scripts/register-hooks.js" --host="$HOST" --skill-dir="$SKILL_LINK" --settings="$SETTINGS" --check; rc=$?
      [ "$rc" -eq 0 ] && ok 'Selected settings registration verified (not host acceptance)' || bad 'Registration re-check failed'
    fi
  fi
fi
if want claude-md; then
  if [ "$HOST" != claude ] && [ "$HOST" != workbuddy ]; then missing 'Global memory patch unsupported for this selected host'
  elif [ "$APPLY" -eq 0 ]; then printf '[dry-run] Would check/append selected host memory block; English-only memory gate language is unchanged\n'
  elif node "$SRC/scripts/patch-claude-md.js" --host="$HOST"; then ok 'Host memory block processed'; else bad 'Host memory block failed'; fi
fi
if want codex; then printf 'Codex AGENTS.md merge not executed; the skill tree is not touched by setup (symlink or physical install is preserved as found); separately approve a sync-to-codex.sh preview and exact apply\n'; fi
printf 'Setup %s: %s passed / %s failed / %s unknown; no host acceptance claim\n' "$([ "$APPLY" -eq 0 ] && printf 'DRY RUN complete' || printf 'operations finished')" "$pass" "$fail" "$unknown"
[ "$fail" -eq 0 ]
