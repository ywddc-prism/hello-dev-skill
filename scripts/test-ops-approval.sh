#!/usr/bin/env bash
# Module B end-to-end: execution intent approval (stepDigest) state gate
set -uo pipefail
CLI="node $(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/state.js"
DIR="$(mktemp -d)"
cd "$DIR" || exit 1
pass=0; fail=0
ck() { # ck <expected exit code> <description> <command...>
 local want="$1" desc="$2"; shift 2
 local out; out=$("$@" 2>&1); local got=$?
 if [ "$got" = "$want" ]; then printf ' %s\n' "$desc"; pass=$((pass+1));
 else printf ' %s (expected exit=%s got %s)\n' "$desc" "$want" "$got"; printf '%s\n' "$out" | sed 's/^/ /'; fail=$((fail+1)); fi
}
ck 0 "init" $CLI init --name "e2e" --type other --path fast

echo "== Environment declaration is required and enum-validated =="
# The environment is a declared enum, not inferred from --target. Inference was measured
# unsound: substring-matching would flag preprod/nonprod and miss payment-cluster. A missing
# or invalid value must be rejected rather than defaulted, otherwise a production step could
# be registered without triggering the interruption-risk obligation.
ck 1 "Missing --env -> rejected" $CLI opsRegister --id noenv --command "systemctl restart nginx" --target "staging/web-01"
ck 1 "Invalid --env value -> rejected" $CLI opsRegister --id badenv --command "systemctl restart nginx" --env "production" --target "staging/web-01"
ck 1 "Free-text env guess (preprod) -> rejected" $CLI opsRegister --id guessenv --command "systemctl restart nginx" --env "preprod" --target "preprod/web-01"

echo "== Registration =="
ck 0 "Read-only step -> approved (auto, no approval needed)" $CLI opsRegister --id inspect --command "kubectl get pods -n payments" --env staging --target "staging/payments"
ck 0 "Write step -> awaiting_approval" $CLI opsRegister --id restart --command "systemctl restart nginx" --cwd /etc/nginx --env staging --target "staging/web-01" --source "runbooks/nginx.md" --source-digest "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" --purpose "Load new config"
ck 0 "Policy-blocked step registration" $CLI opsRegister --id wipe --command "rm -rf /var/lib/data" --env staging --target "staging/db-01"

echo "== Production declaration surfaces the interruption-risk obligation =="
ck 0 "Prod step registers" $CLI opsRegister --id prodstep --command "systemctl restart nginx" --env prod --target "payment-cluster"
OPSHOW_PROD="$($CLI opsShow prodstep)"
if printf '%s' "$OPSHOW_PROD" | grep -q "interruption-risk assessment"; then
  printf ' opsShow flags prod step with the assessment obligation\n'; pass=$((pass+1));
else
  printf ' opsShow does not flag prod step with the assessment obligation\n'; fail=$((fail+1));
fi
if printf '%s' "$OPSHOW_PROD" | grep -q "Environment: prod"; then
  printf ' opsShow displays the declared environment\n'; pass=$((pass+1));
else
  printf ' opsShow does not display the declared environment\n'; fail=$((fail+1));
fi
# A staging step must NOT carry the prod obligation -- an always-on note carries no signal.
if $CLI opsShow restart | grep -q "interruption-risk assessment"; then
  printf ' staging step wrongly carries the prod obligation\n'; fail=$((fail+1));
else
  printf ' staging step does not carry the prod obligation\n'; pass=$((pass+1));
fi

echo "== Declared environment is bound into stepDigest =="
# Changing only the declared environment must void the approval, because the obligation
# that applies to the step has changed even though the command text has not.
DIG_STAGING="$($CLI opsShow restart | awk '/stepDigest/{print $2}')"
ck 0 "Re-register same command with different env" $CLI opsRegister --id restart --command "systemctl restart nginx" --cwd /etc/nginx --env prod --target "staging/web-01" --source "runbooks/nginx.md" --source-digest "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" --purpose "Load new config"
DIG_PROD="$($CLI opsShow restart | awk '/stepDigest/{print $2}')"
if [ -n "$DIG_STAGING" ] && [ "$DIG_STAGING" != "$DIG_PROD" ]; then
  printf ' env change alone changes the stepDigest\n'; pass=$((pass+1));
else
  printf ' env change did not change the stepDigest (staging=%s prod=%s)\n' "$DIG_STAGING" "$DIG_PROD"; fail=$((fail+1));
fi
# Restore staging so the following approval-flow assertions exercise a normal step.
ck 0 "Restore staging declaration" $CLI opsRegister --id restart --command "systemctl restart nginx" --cwd /etc/nginx --env staging --target "staging/web-01" --source "runbooks/nginx.md" --source-digest "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" --purpose "Load new config"

echo "== Gate (unapproved must reject) =="
ck 1 "Gate check without approval -> exit!=0" $CLI opsStatus restart
ck 0 "Read-only step gate check passes" $CLI opsStatus inspect
ck 1 "Policy-blocked step -> exit!=0" $CLI opsStatus wipe

echo "== Approval Validation =="
ck 1 "Digest mismatch -> rejected" $CLI opsApprove --id restart --approved-by larry --confirm-digest 0000000000000000000000000000000000000000000000000000000000000000
ck 1 "Read-only step does not allow approval" $CLI opsApprove --id inspect --approved-by larry --confirm-digest aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
ck 1 "Policy-blocked step cannot be approved" $CLI opsApprove --id wipe --approved-by larry --confirm-digest aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa

DIGEST="$($CLI opsShow restart | awk '/stepDigest/{print $2}')"
if [ -n "$DIGEST" ]; then printf ' opsShow outputs stepDigest\n'; pass=$((pass+1)); else printf ' opsShow did not output stepDigest\n'; fail=$((fail+1)); fi

# The approval command printed by opsShow must be directly executable -- it once printed
# ops-approve (hyphenated) while the actual command is opsApprove; user copy-paste would fail.
# This line is exactly to catch that regression.
if $CLI opsShow restart | grep -q "state.js opsApprove "; then
 printf ' opsShow printed approval command is executable\n'; pass=$((pass+1));
else
 printf ' opsShow printed approval command is not actual command name\n'; fail=$((fail+1));
fi
ck 0 "Correct digest -> approval passed" $CLI opsApprove --id restart --approved-by larry --confirm-digest "$DIGEST"
ck 0 "Post-approval gate -> exit 0" $CLI opsStatus restart

echo "== Invalidation (content changed after approval) =="
ck 0 "Re-register with changed command (old approval should be voided)" $CLI opsRegister --id restart --command "systemctl stop nginx" --cwd /etc/nginx --env staging --target "staging/web-01"
ck 1 "Post-content-change gate -> exit!=0" $CLI opsStatus restart

echo "== Target change invalidates approval =="
D2="$($CLI opsShow restart | awk '/stepDigest/{print $2}')"
ck 0 "Re-approve new command" $CLI opsApprove --id restart --approved-by larry --confirm-digest "$D2"
ck 0 "Approval passed" $CLI opsStatus restart
ck 0 "Re-register with changed target" $CLI opsRegister --id restart --command "systemctl stop nginx" --cwd /etc/nginx --env prod --target "prod/web-01"
ck 1 "Post-target-change gate -> exit!=0" $CLI opsStatus restart

echo "== Rejection =="
ck 0 "opsReject records rejection" $CLI opsReject --id restart --reason "Wrong timing"
ck 1 "Post-rejection gate -> exit!=0" $CLI opsStatus restart

echo "== show list =="
ck 0 "opsShow with no args lists all" $CLI opsShow

echo
echo "Result: $pass passed / $fail failed"
rm -rf "$DIR"
[ "$fail" -eq 0 ]
