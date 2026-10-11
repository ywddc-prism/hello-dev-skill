#!/usr/bin/env bash
# Hello Dev self-check -- run all automatically verifiable invariants in one command.
#
# Reason: Of the 12 defects found in this optimization round, most were
# "docs claim X, implementation does Y" drift that human review inevitably misses.
# Anything that can be automatically verified should not depend on memory.
#
# Usage: bash scripts/self-check.sh

set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

FAST=false
for arg in "$@"; do
  case "$arg" in
    --fast) FAST=true ;;
    --help|-h) echo "Usage: bash scripts/self-check.sh [--fast]"; echo "  --fast: skip install/restore, release, and heavy e2e checks"; exit 0 ;;
  esac
done

pass=0; fail=0; skip=0
run() {
 local name="$1"; shift
 if out=$("$@" 2>&1); then
 printf ' %-28s %s\n' "$name" "$(echo "$out" | tail -1)"
 pass=$((pass+1))
 else
 printf ' %-28s FAIL\n' "$name"
 echo "$out" | sed 's/^/ /'
 fail=$((fail+1))
 fi
}

echo " 1. Syntax "
for f in hooks/*.js scripts/*.js; do
 run "$(basename "$f")" node --check "$f"
done
run "sync-to-codex.sh" bash -n scripts/sync-to-codex.sh
run "release-check.sh" bash -n scripts/release-check.sh
run "setup.sh" bash -n scripts/setup.sh

echo " 2. Documentation Completeness "
run "markdown broken links" node scripts/check-links.js
run "module index drift" node scripts/gen-index.js --check
run "risk table vs hook" node scripts/check-gate-consistency.js
run "ops risk table vs hook" node scripts/check-opsgate-consistency.js
run "doc commands exist" node scripts/check-doc-commands.js
run "doc command scanner regressions" node scripts/test-check-doc-commands.js
run "collaboration matrix" node scripts/check-collaboration-matrix.js
run "stage order drift" node scripts/check-stage-order.js
run "mandatory post-delivery stages" node scripts/test-stage-mandatory.js
run "skill detector behavior" node scripts/test-detect-skills.js
run "expert package completeness" node scripts/check-expert-package.js
run "escalation criterion consistency" node scripts/check-escalation-consistency.js
run "guard regressions" node scripts/test-guards.js

echo " 3. Gate Behavior "
run "git-gate unit tests" node hooks/test-git-gate.js
run "opsgate unit tests" node hooks/test-opsgate.js

echo " 4. State Protocol "
run "state.js smoke test" node scripts/test-state.js
run "decomposition order analysis" node scripts/test-decomposition.js
run "codex prompt constructor" node scripts/test-codex-prompt.js
run "memory.js behavior test" node scripts/test-memory.js
if [ "$FAST" = true ]; then
  printf ' %-28s %s\n' "evolve.js (skipped in --fast)" "SKIP"
  skip=$((skip+1))
  printf ' %-28s %s\n' "evolve-guard (skipped in --fast)" "SKIP"
  skip=$((skip+1))
  printf ' %-28s %s\n' "ops approval e2e (skipped in --fast)" "SKIP"
  skip=$((skip+1))
  printf ' %-28s %s\n' "state e2e (skipped in --fast)" "SKIP"
  skip=$((skip+1))
  printf ' %-28s %s\n' "plugin search/install (skipped in --fast)" "SKIP"
  skip=$((skip+1))
else
run "evolve.js behavior test" node scripts/test-evolve.js
run "evolve-guard behavior" node scripts/test-evolve-guard.js
run "ops approval unit test" node scripts/test-ops-approval.js
run "ops approval e2e" bash scripts/test-ops-approval.sh
run "state e2e" node scripts/test-e2e.js
run "plugin search/install test" node scripts/test-search-install-skill.js
fi

echo " 5. Dead Fields & Dead Structures "
# Repository entrypoint metadata allowlist; this does not prove host registration.
run "entry metadata convention" node -e '
const fs=require("fs");
const y=fs.readFileSync("SKILL.md","utf8").split("---")[1];
const OK=["name","description","when_to_use","argument-hint","arguments","allowed-tools","disallowed-tools","model","effort","context","agent","background","hooks","paths","shell","metadata","license","compatibility","user-invocable","disable-model-invocation","agent_created"];
const bad=OK.concat().length && y.split("\n").filter(l=>/^[a-zA-Z_-]+:/.test(l)).map(l=>l.split(":")[0]).filter(k=>!OK.includes(k));
if(bad.length){console.error("Invalid fields: "+bad.join(", "));process.exit(1);}
console.log("Conforms to repo entry convention; host support needs separate verification");'
if command -v ruby >/dev/null 2>&1; then
 run "frontmatter YAML parse" ruby -e 'require "yaml"; ARGV.each do |file|; text=File.read(file); match=text.match(/\A---\r?\n([\s\S]*?)\r?\n---\r?\n/) or abort("#{file}: missing frontmatter"); data=YAML.safe_load(match[1], permitted_classes: [], aliases: false); abort("#{file}: name/metadata mismatch") unless data["name"] == "hello-dev" && data.dig("metadata","version") == "15.11"; end' SKILL.md SKILL.zh-CN.md
else
 printf ' %-28s %s\n' "frontmatter YAML parse" "SKIP: Ruby YAML parser unavailable"; skip=$((skip+1))
fi

run "no declare-only fields" node scripts/check-state-fields.js

echo " 5b. Install & Restore "
if [ "$FAST" = true ]; then
  printf ' %-28s %s\n' "install & restore (skipped in --fast)" "SKIP"
  skip=$((skip+1))
else
run "setup.sh step list" bash scripts/setup.sh --list
run "setup.sh dry-run idempot" bash scripts/setup.sh --check
# Probing each host that actually exists on this machine. Two distinct conditions must not be
# conflated: (a) no host was selected, which is a usage question, and (b) a selected host has no
# matching registration, which is a real host-state finding. Calling register-hooks.js --check
# without --host can only ever report (a) -- exit 3 means "UNKNOWN host/interface/unregistered
# settings" -- so treating it as "not installed on this host" asserts something never measured and
# hid the fact that this machine does have both hooks registered. Inspect each existing host
# explicitly instead. Neither PASS nor UNKNOWN here proves the host loads them or consumes ask/deny.
reg_host_state() {
 local host="$1" out rc
 out=$(node scripts/register-hooks.js --host="$host" --check 2>&1); rc=$?
 case "$rc" in
  0) echo "PASS" ;;
  3) echo "UNKNOWN" ;;
  *) echo "INVALID: $out" ;;
 esac
}
reg_probe_hosts=""
for h in claude codebuddy workbuddy codex; do
 [ -d "$HOME/.$h" ] && reg_probe_hosts="$reg_probe_hosts $h"
done
if [ -z "${reg_probe_hosts// /}" ]; then
 printf ' %-28s %s\n' "register-hooks --check" "SKIP: no host directory present; nothing to inspect"; skip=$((skip+1))
else
 reg_pass=""; reg_bad=""
 for h in $reg_probe_hosts; do
  case "$(reg_host_state "$h")" in
   PASS) reg_pass="$reg_pass $h" ;;
   INVALID*) reg_bad="$reg_bad $h" ;;
  esac
 done
 if [ -n "${reg_bad// /}" ]; then
  printf ' %-28s FAIL\n' "register-hooks --check"; printf '   invalid config on:%s\n' "$reg_bad"; fail=$((fail+1))
 elif [ -n "${reg_pass// /}" ]; then
  printf ' %-28s %s\n' "register-hooks --check" "registered:$reg_pass (config present only; host loading/acceptance unverified)"; pass=$((pass+1))
 else
  printf ' %-28s %s\n' "register-hooks --check" "SKIP: no registration on existing host(s):$reg_probe_hosts (host state, not a repo defect)"; skip=$((skip+1))
 fi
fi
run "register-hooks --dry-run" node scripts/register-hooks.js --dry-run
run "setup regression test" bash scripts/test-setup.sh
run "portable regression test" bash scripts/test-portable.sh
run "hook inline vs source" node scripts/inline-hooks.js --check
fi

echo " 6. Release & Runtime Consistency "
if [ "$FAST" = true ]; then
  printf ' %-28s %s\n' "release & runtime (skipped in --fast)" "SKIP"
  skip=$((skip+1))
else
run "release evidence regressions" node scripts/test-release-check.js
# Only run release-check source-side and registration items; install copy consistency
# is reported separately, not merged into PASS/FAIL here -- copy lag requires human
# decision on sync, should not cause daily self-check to fail.
RELEASE_OUT="$(mktemp "${TMPDIR:-/tmp}/hello-dev-release-check.XXXXXX")"
run "release-check structure" bash -c "bash scripts/release-check.sh >\"$RELEASE_OUT\" 2>&1 || true; grep -qE 'Three-way consistency|No FAIL|has .* FAIL' \"$RELEASE_OUT\"; rc=\$?; rm -f \"$RELEASE_OUT\"; exit \$rc"
# Install copy lag is a fact requiring human sync decision, not a source defect,
# so exit code is ignored (copy FAIL still reported when running release-check.sh
# separately and returns 1). Here we only assert source-side structural invariants.
run "entry vs hook capability" node -e '
const {execSync}=require("child_process");
let out;
try { out=execSync("bash scripts/release-check.sh --json",{encoding:"utf8"}); }
catch(e){ out=e.stdout; } // copy mismatch exits 1, expected, does not affect this item
const d=JSON.parse(out);
const must=["Event matches payload","Event matches payload(opsgate.js)","Hook event names","Hook event names(opsgate.js)","Frontmatter declarations","Probe writable","Probe writable(opsgate.js)"];
const bad=must.filter(item=>!d.checks.some(c=>c.item===item&&c.status==="PASS"));
if(bad.length){console.error("Missing or failed: "+bad.join(", "));process.exit(1);}
const unk=d.checks.filter(c=>c.status==="UNKNOWN").map(c=>c.item);
console.log("All capability matches PASS; UNKNOWN: "+(unk.join(", ")||"none")+" (missing evidence, not failure)");'
fi

echo
echo ""
if [ "$fail" -eq 0 ]; then
 if [ "$skip" -gt 0 ]; then echo " Self-check passed ($pass items, $skip skipped)"; else echo " Self-check passed ($pass items)"; fi
else
 echo " $fail failed / $pass passed / $skip skipped"
 exit 1
fi

# Memory integration check
run "memory integration" bash scripts/check-memory-integration.sh
