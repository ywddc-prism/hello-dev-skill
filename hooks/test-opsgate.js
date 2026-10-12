#!/usr/bin/env node
'use strict';

/**
 * opsgate.js unit tests
 * Invoke the hook with real stdin JSON, assert its permission decisions.
 * Run: node hooks/test-opsgate.js
 *
 * Two-value semantics (the gate is cautious-execution, not prohibition):
 *   pass  = no output (use platform default permission, for known safe read-only
 *          or commands outside opsgate's jurisdiction)
 *   ask   = permissionDecision: ask   (state change, pre-execution approval)
 *   DENY  = permissionDecision: deny  (unclassified verb within known ops tool)
 *
 * Local system commands (rm, mkfs, dd, shutdown) are NOT ops commands and pass through.
 */

const { spawnSync } = require('child_process');
const path = require('path');

const HOOK = path.join(__dirname, 'opsgate.js');

// [command, expected decision]
const CASES = [
  // -- auto_read: must pass, otherwise gate becomes a friction source --
  ['kubectl get pods', 'pass'],
  ['kubectl get pods -n payments', 'pass'],
  ['kubectl -n payments get deploy payment-api -o json', 'pass'],
  ['kubectl describe pod x', 'pass'],
  ['kubectl logs deploy/x --tail=100', 'pass'],
  ['kubectl config current-context', 'pass'],
  ['kubectl auth can-i delete pods', 'pass'],
  ['kubectl rollout status deploy/x', 'pass'],
  ['kubectl --context=prod get deploy', 'pass'],
  ['kubectl --context prod get deploy', 'pass'],
  ['systemctl status nginx', 'pass'],
  ['systemctl is-active nginx', 'pass'],
  ['systemctl --no-pager status nginx', 'pass'],
  ['systemctl -u nginx status', 'pass'],
  ['df -h', 'pass'],
  ['free -m', 'pass'],
  ['uptime', 'pass'],
  ['journalctl -u nginx -n 50', 'pass'],
  ['terraform plan', 'pass'],
  ['terraform validate', 'pass'],
  ['helm list', 'pass'],
  ['helm status app', 'pass'],
  ['docker ps', 'pass'],
  ['docker inspect x', 'pass'],

  // -- approval_required: state change, must ask --
  ['kubectl scale deployment/payment-api --replicas=6', 'ask'],
  ['kubectl delete pod payment-api-x', 'ask'],
  ['kubectl apply -f deployment.yaml', 'ask'],
  ['kubectl create ns payments', 'ask'],
  ['kubectl patch deploy x -p "{}"', 'ask'],
  ['kubectl rollout restart deploy/x', 'ask'],
  ['kubectl cordon node-1', 'ask'],
  ['kubectl --context=prod delete pod x', 'ask'],
  ['kubectl -n payments delete pod x', 'ask'],
  ['systemctl restart nginx', 'ask'],
  ['systemctl --no-pager restart nginx', 'ask'],
  ['systemctl stop nginx', 'ask'],
  ['systemctl reload nginx', 'ask'],
  ['sudo systemctl restart nginx', 'ask'],
  ['terraform apply', 'ask'],
  ['terraform destroy', 'ask'],
  ['terraform import x y', 'ask'],   // import rewrites tfstate, state change not unknown
  ['helm upgrade app chart', 'ask'],
  ['helm install app chart', 'ask'],
  // docker / podman are this project's LOCAL DEVELOPMENT toolchain, so they are no longer
  // approval_required -- the two cases that used to live here are re-pointed to 'pass' in
  // the "Local container development" section below (change #128, sub-task o3). They were
  // NOT deleted: deleting them would drop the lock entirely and produce a silent green.
  // `docker push` is the one verb that leaves the machine, so it stays here.
  ['docker push reg/img:1', 'ask'],   // push reaches a remote registry: effect is outside the local box
  // Regression (change #130): the claim that `docker push` was the ONLY
  // container action leaving the local machine (i.e. the only one needing
  // approval) was FALSE as written. `push` is a top-level verb, and the four
  // forms below reach the same remote registry by other matching paths, so
  // they were released as `pass` when the group verbs (image / container /
  // buildx) were pass-listed for the local-development fix. Measured against
  // the pre-fix hook, all four were `deny`; after the fix all four `ask`.
  //   1. `--push` build flag: locateVerb cannot see it. It does not treat
  //      `--push` as option-with-value, so the flag surfaces as the subverb
  //      while the verb stays `build`/`buildx`. Hence the check is a scan over
  //      argv, not a verb test -- see isRegistryEgress in scripts/lib/ops-policy.js.
  //   2. group verb + `push` subverb (`docker image push`, `docker container
  //      push`): the verb is `image` / `container`, which must stay pass-listed
  //      because their other subverbs (`prune`, `ls`) are purely local.
  ['docker build --push -t reg/img:1 .', 'ask'],       // build then publish (locateVerb sees verb 'build')
  ['docker build --push=true -t reg/img:1 .', 'ask'],  // `=` spelling of the same boolean flag
  ['docker buildx build --push -t x .', 'ask'],        // buildx spelling; verb is 'buildx'
  ['docker buildx build --push=true -t x .', 'ask'],   // buildx + `=` spelling
  ['docker container push reg/img:1', 'ask'],          // group verb + standard push subverb
  ['docker image push reg/img:1', 'ask'],              // group verb + standard push subverb
  ['docker image build --push -t x .', 'ask'],         // legacy spelling: verb 'image', subverb 'build'
  ['docker build --output type=registry -t x .', 'ask'], // registry output target, same egress
  // The fix must not be implemented as "image/container/buildx are suspect now":
  // the purely local subverbs of those same groups must keep passing, and so
  // must `--output type=local`. These are the anti-over-tightening rows.
  // (`docker image prune` already has a row in the local-development section
  // above; not repeated here.)
  ['docker image ls', 'pass'],
  ['docker container ls', 'pass'],
  ['docker container prune', 'pass'],
  ['docker buildx build -t x .', 'pass'],
  ['docker build --no-push -t x .', 'pass'],           // distinct flag; must not be read as '--push'
  ['docker build --output type=local,dest=out -t x .', 'pass'],
  ['docker run -it img app.js --push', 'pass'],        // `--push` is the program's arg, not a build flag

  // -- Gap D (change #130): a remote-endpoint qualifier voids the local exemption --
  // Why these rows exist: the local-development exemption above rests on "this acts
  // on the machine running the agent". `docker -H=tcp://prod:2375 rm -f web` removes
  // a container on a PRODUCTION daemon. The qualifier is invisible to locateVerb --
  // `-H` / `--host` are absent from OPTION_TAKES_VALUE and the `=`-form is skipped by
  // its `if (t.includes('='))` branch -- so locateVerb returned ['rm','-f'], byte
  // identical to the local `docker rm web`, and both returned pass. Measured against
  // the pre-change hook all six destructive forms below were ask (or deny for system
  // prune) and had regressed to pass. Fix: dockerRemoteEndpoint() scans the global
  // option prefix. Asserted here so the regression cannot silently return.
  ['docker -H=tcp://prod:2375 rm -f web', 'ask'],
  ['docker -H=tcp://prod:2375 rmi img', 'ask'],
  ['docker -H=tcp://prod:2375 stop web', 'ask'],
  ['docker -H=tcp://prod:2375 kill web', 'ask'],
  ['docker -H=tcp://prod:2375 system prune -a', 'ask'],
  ['docker --host=tcp://prod:2375 rm -f web', 'ask'],
  // The other spellings of the same qualifier, so the fix is not just `-H=`.
  ['docker -Htcp://prod:2375 rm web', 'ask'],          // attached short value
  ['docker --context=prod rm -f web', 'ask'],
  ['docker --context prod rm -f web', 'ask'],
  ['docker -c prod rm -f web', 'ask'],
  ['docker --context=prod build -t app .', 'ask'],     // deny at HEAD, had regressed to pass
  // run/exec keep L5 when a remote endpoint is declared (the qualifier makes the
  // target observable; the arbitrary-program severity was always L5).
  ['docker -H=tcp://prod:2375 run -it ubuntu', 'ask'],
  ['docker -H=tcp://prod:2375 exec -it c sh', 'ask'],
  // The spaced form already hit fail-closed deny via locateVerb landing on the URL;
  // asserted so a future OPTION_TAKES_VALUE edit cannot silently turn it into pass.
  ['docker -H tcp://prod:2375 rm -f web', 'DENY'],
  ['docker --host tcp://prod:2375 rm -f web', 'DENY'],
  // MUST NOT RELAX THE FLOOR: a remote qualifier voids the exemption, it must never
  // upgrade an unknown verb from the fail-closed deny into an ask.
  ['docker -H=tcp://x frobnicate', 'DENY'],
  // Anti-over-tightening: the exemption is voided only when an endpoint is DECLARED.
  // Unqualified local forms keep passing, and `-c` after the verb is docker run's
  // CPU-shares flag, not the context flag -- the prefix-only scan is what separates
  // them. A whole-argv scan for `-c` would re-deny this ordinary local run.
  ['docker rm web', 'pass'],
  ['docker stop web', 'pass'],
  ['docker run -c 512 ubuntu', 'pass'],
  // Read-only queries against a remote daemon stay pass: reading is reading, and
  // their level was pass (L0) at HEAD. Not narrowed by this fix.
  ['docker -H=tcp://prod:2375 ps', 'pass'],
  ['docker --context prod logs c', 'pass'],

  // -- Gap E (change #131): `docker context` is target selection, not local dev --
  // Why these rows exist: `context` had been grouped with the local-development
  // verbs for the same reason as `compose` -- locateVerb(
  // ['docker','context','use','prod']) -> ['context','use'], i.e. the action sits
  // in the SUBVERB, so matching the group verb on its own name released `use`
  // along with `ls`. But the premise that justifies every other entry in that
  // list ("this acts on the machine running the agent") is exactly what `use`
  // gives up: it re-points the CLI at ANOTHER daemon, stickily, for the rest of
  // the shell session. Measured against the pre-change hook, `use` / `create` /
  // `remove` were deny and had regressed to pass. `context` is now a separate
  // target-selection family in ops-policy.js.
  ['docker context use prod', 'ask'],
  ['docker context create c', 'ask'],
  ['docker context remove prod', 'ask'],
  ['docker context rm x', 'ask'],
  ['docker context update x', 'ask'],
  ['docker context import f.zip', 'ask'],
  ['docker context', 'ask'],                          // interactive form: still manages the target
  // Anti-over-tightening: the read-only subverbs of the SAME group must keep
  // passing. This is why the read test is ordered before the ask test inside the
  // branch -- otherwise `docker context ls` would be swept up as a state change.
  ['docker context ls', 'pass'],
  ['docker context inspect x', 'pass'],
  ['docker context show', 'pass'],
  ['docker context export x', 'pass'],
  // Fail-closed floor: an unrecognized context subverb must deny, exactly like
  // any other unknown docker verb. It must not inherit the group's old pass.
  ['docker context frobnicate x', 'DENY'],
  // Floor not relaxed by this change: `ls` / `show` / `export` are real TOP-LEVEL
  // docker verbs too. They were deny before and stay deny -- the context fix
  // deliberately matches on the subverb rather than widening READ_DOCKER_VERBS,
  // which would have turned these three into pass.
  ['docker export x', 'DENY'],
  ['docker ls', 'DENY'],
  ['docker show x', 'DENY'],

  // -- Gap E (change #131): a remote endpoint named by ENVIRONMENT, not by flag --
  // Why these rows exist: `DOCKER_HOST=tcp://prod:2375 docker rm -f web` is the
  // documented way to point the CLI at another daemon and the form most likely to
  // sit in a shell profile, so it reaches production SILENTLY. It regressed for a
  // structural reason: normalize() strips leading `VAR=VAL` assignments and the
  // `env` wrapper before assessCommand runs, so the policy layer received argv
  // byte-identical to the local `docker rm -f web` and could not tell them apart.
  // Fix: the hook scans the RAW segment (hasRemoteEndpointEnv) and passes it as an
  // OPTION; it still does not decide -- the disposition is produced in
  // ops-policy.js, which voids the local exemption exactly as it does for `-H`.
  ['DOCKER_HOST=tcp://prod:2375 docker rm -f web', 'ask'],
  ['env DOCKER_HOST=tcp://prod:2375 docker rm -f web', 'ask'],
  ['sudo DOCKER_HOST=tcp://prod:2375 docker rm -f web', 'ask'],
  ['DOCKER_CONTEXT=prod docker rm -f web', 'ask'],   // context var, same effect
  ['DOCKER_HOST=tcp://prod:2375 docker build -t app .', 'ask'],
  ['DOCKER_HOST=tcp://prod:2375 docker compose up -d', 'ask'],
  ['DOCKER_HOST=tcp://prod:2375 docker run -it ubuntu', 'ask'],   // L5: arbitrary program, remote target
  // Read-only unaffected: reading is reading, and the voiding sits inside the
  // local-exemption branch, which read-only verbs return above.
  ['DOCKER_HOST=tcp://prod:2375 docker ps', 'pass'],
  // An unrelated assignment must NOT trigger the voiding.
  ['FOO=bar docker rm web', 'pass'],
  ['env FOO=bar docker rm web', 'pass'],
  // Prefix discipline, anti-over-tightening: a DOCKER_HOST= appearing AFTER the
  // binary sets the variable inside the container, not the CLI's own target.
  // A whole-segment scan would misread this ordinary local run as remote.
  ['docker run -e DOCKER_HOST=tcp://x img', 'pass'],

  // -- Gap E, round 2 (change #133): the assignment on its OWN line / segment --
  // Why these rows exist: the round-1 fix scanned only a single segment's prefix,
  // so the shell-profile shape -- `export DOCKER_HOST=...` on its own line, with
  // the docker command on the next -- stayed invisible. Measured: all four below
  // were pass after round 1, and `export DOCKER_HOST=...\ndocker rm -f web` was
  // ask against the pre-change hook, i.e. a regression. It was missed twice over:
  // the `export` segment was skipped because its binary is `export` (not an ops
  // token), and the following segment looked byte-identical to the local case.
  // Fix: the finding accumulates across segments (sawRemoteEndpointEnv) and
  // `export` is treated as a wrapper by the prefix scan -- a declaration, not a
  // prefix of the command it affects, yet it selects the daemon for every later
  // command in the same invocation.
  ['export DOCKER_HOST=tcp://prod:2375\ndocker rm -f web', 'ask'],
  ['DOCKER_HOST=tcp://prod:2375\ndocker rm -f web', 'ask'],
  ['export DOCKER_HOST=tcp://prod:2375 && docker rm -f web', 'ask'],
  ['export DOCKER_HOST=tcp://prod:2375\ndocker build -t app .', 'ask'],
  ['export DOCKER_CONTEXT=prod\ndocker rm -f web', 'ask'],   // the context variable, same effect
  // Anti-over-tightening: an unrelated export must NOT arm the gate, and a
  // read-only query is unaffected by an armed remote endpoint (reading is reading).
  ['export FOO=bar\ndocker rm -f web', 'pass'],
  ['export DOCKER_HOST=tcp://prod:2375\ndocker ps', 'pass'],
  ['export DOCKER_HOST=tcp://prod:2375 && docker ps', 'pass'],
  // The ordinary local forms must not have regressed while arming the detection.
  ['docker rm -f web', 'pass'],
  ['FOO=bar docker rm -f web', 'pass'],

  // -- Gap E, round 3 (change #134): nested wrappers (`bash -c "..."`) --
  // Why these rows exist: inside a nested command the segments are the INNER ones
  // (`bash -c "export DOCKER_HOST=...; docker rm -f web"` -> inner segment
  // "export DOCKER_HOST=tcp://prod:2375"), and the round-2 accumulation only ever
  // scanned the OUTER segment, so a declaration inside a wrapper never armed the
  // docker command that followed it. Measured: both spellings below were ask
  // against the pre-change hook and pass before this fix -- a regression relative
  // to HEAD. Fix: the flag is written back from the inner segment BEFORE the
  // isOpsToken test, because a declaration segment is precisely one that IS
  // discarded by that test (`export` is not an ops command), so recording it after
  // the test would mean the segment carrying the finding cannot report it.
  ['bash -c "export DOCKER_HOST=tcp://prod:2375; docker rm -f web"', 'ask'],
  ['sh -c "export DOCKER_HOST=tcp://prod:2375; docker rm -f web"', 'ask'],
  // Anti-over-tightening inside a nested wrapper.
  ['bash -c "export FOO=bar; docker rm -f web"', 'pass'],
  // The in-segment prefix form inside a wrapper was never broken; asserted so the
  // write-back cannot be mistaken for the whole mechanism.
  ['bash -c "DOCKER_HOST=tcp://prod:2375 docker rm -f web"', 'ask'],

  // -- Zero-coverage guard: the wrapper-option step-over path --
  // Why this row exists: mutating `sawWrapper` to false left 204/204 fully green,
  // i.e. NO assertion covered that branch, yet a behaviour probe shows it changes
  // the outcome. Here the first segment (`env -i DOCKER_HOST=... docker rm -f web`)
  // is itself discarded -- `-i` is left at tokens[0] by normalize(), so isOpsToken
  // rejects it (that is the still-open `env -i` gap, ruled out of scope) -- but the
  // scan still sees the assignment behind the wrapper's `-i` and arms the SECOND
  // segment. Without the step-over, `-i` would end the scan, nothing would be
  // armed, and this would pass. Measured: ask now, and ask against HEAD.
  ['env -i DOCKER_HOST=tcp://prod:2375 docker rm -f web\ndocker rm -f web2', 'ask'],

  // -- Over-tightening, asserted so it cannot change silently --
  // Both are stricter than the semantics warrant and both are registered as such
  // in ops-execution.md. They are asserted (not merely described) because an
  // unasserted behaviour is an unnoticed behaviour. Neither is a regression:
  // measured against HEAD, both were ask / deny respectively at HEAD too.
  ['export DOCKER_HOST=tcp://prod:2375\nunset DOCKER_HOST\ndocker rm -f web', 'ask'],
  ['docker context use --help', 'ask'],
  ['docker context --help', 'DENY'],

  // -- Local container development: pass, not a friction source --
  // Judgement: building an image, bringing a compose stack up/down, reading compose logs,
  // pruning local caches, creating a local network, or stopping/removing/restarting a
  // container the developer started are all operations confined to the developer's own
  // machine. They are not operations against remote / production infrastructure, which is
  // what this gate exists to govern, so the gate does not intercept them.
  // Residual risk of this exemption is registered in modules/core/approval/ops-execution.md:
  // `docker exec -it <production container> sh`, `docker run -v /:/host` and
  // `docker run --privileged` are no longer intercepted. That is a known, documented
  // narrowing -- not an oversight -- and it is why these rows are asserted here.
  ['docker run -it ubuntu', 'pass'],   // re-pointed from 'ask' (change #128): case kept, expectation updated
  ['docker stop x', 'pass'],           // re-pointed from 'ask' (change #128): case kept, expectation updated
  ['docker build -t app .', 'pass'],
  ['docker compose up -d', 'pass'],
  ['docker compose logs -f', 'pass'],
  ['docker compose build', 'pass'],
  ['docker compose down', 'pass'],
  ['docker pull nginx', 'pass'],
  ['docker system prune', 'pass'],
  ['docker image prune', 'pass'],
  ['docker volume prune', 'pass'],
  ['docker network create net1', 'pass'],
  ['docker exec -it c sh', 'pass'],
  ['docker rm x', 'pass'],
  ['docker rmi x', 'pass'],
  ['docker kill x', 'pass'],
  ['docker start x', 'pass'],
  ['docker restart x', 'pass'],
  ['podman compose up', 'pass'],
  ['podman build .', 'pass'],

  // -- WSL: classified by ops-policy.js now that wsl is in OPS_BINS --
  // wsl is a local developer VM/container runtime. Read-only queries pass;
  // state changes and arbitrary exec go through approval; unrecognized verb
  // combinations are unclassified (deny-unclassified). The previous suite
  // asserted all-wsl-pass when wsl was NOT in OPS_BINS; adding it flipped
  // the unrecognized-verb cases to deny as designed.
  ['wsl --status', 'pass'],
  ['wsl -e uname -a', 'ask'],
  ['wsl --unregister Ubuntu', 'ask'],
  ['wsl ls /', 'DENY'],
  ['wsl npm install', 'DENY'],
  ['wsl -d Ubuntu ls', 'DENY'],

  // dism: Windows Deployment Image Servicing. Read-only queries (/get-*, /?)
  // pass; state changes go through approval; unrecognized verbs are denied.
  ['dism /get-features /online', 'pass'],
  ['dism /online /enable-feature /featurename:Containers', 'ask'],
  ['dism /online /disable-feature /featurename:Containers', 'ask'],
  ['dism /cleanup-image /restorehealth', 'DENY'],
  // -- L5: consequences uncontrollable, still goes to human approval not mechanical reject --
  // This is NOT a blanket relaxation, and the two families below are deliberately different:
  //   * `kubectl exec/attach/cp` remain approval_required (not block). They run code inside a
  //     pod of a shared cluster -- real ops work against someone else's running system --
  //     and directly denying routine ops work would turn the gate into a blocking source.
  //   * docker's own `run`/`exec` are NOT in this tier any more: change #128 (sub-task o3)
  //     re-drew docker/podman as the local development toolchain, so `docker run -it ubuntu`
  //     and `docker exec -it c sh` are asserted 'pass' in the section above. Their residual
  //     risk is registered in modules/core/approval/ops-execution.md.
  // Do not read these two bullets as one rule: kubectl still asks, docker no longer does.
  ['kubectl exec -it payment-api-x -- sh', 'ask'],
  ['kubectl exec payment-api-x -- ls /', 'ask'],
  ['kubectl attach payment-api-x', 'ask'],
  ['kubectl cp /tmp/f payment-api-x:/tmp/f', 'ask'],

  // -- block: unclassified verbs within known ops tools --
  // Local system commands are NOT ops commands and pass through:
  ['rm -rf /tmp/x', 'pass'],
  ['rm -f /etc/hosts', 'pass'],
  ['dd if=/dev/zero of=/dev/sda', 'pass'],
  ['mkfs', 'pass'],
  ['mkfs.ext4 /dev/sdb1', 'pass'],
  ['mkfs.xfs /dev/sdb1', 'pass'],
  ['shutdown -h now', 'pass'],
  ['reboot', 'pass'],
  ['ssh user@host ls', 'ask'],
  ['scp f user@host:/tmp/', 'ask'],
  ['rsync -avz src/ user@host:/tmp/', 'ask'],
  // rsync/scp are ops commands only when a **remote** target is named.
  // The gate governs ops tools (remote / production infrastructure) -- a
  // local-to-local copy touches only the local filesystem. Regression: this
  // branch used to approve any rsync/scp as L3 "Remote file transfer" without
  // checking for a remote host, so `rsync -a --delete /a/src/ /b/dst/` was
  // intercepted with a reason that contradicted the command.
  ['rsync -a --delete /a/src/ /b/dst/', 'pass'],
  ['rsync -a src/ dst/', 'pass'],
  ['scp -r /a/ /b/', 'pass'],
  // Remote forms must keep asking: host:path, user@host:path, ssh://, --rsh.
  ['rsync -a /a/ ssh://host/b', 'ask'],
  ['rsync -a --rsh=ssh /a/ host:/b/', 'ask'],
  ['scp f host:/tmp/', 'ask'],

  // -- ssh remote command deep analysis --
  // ssh wrapping known ops commands: agent should identify the ops scenario
  ['ssh user@host kubectl get pods', 'ask'],
  ['ssh user@host kubectl delete pod x', 'ask'],
  ['ssh user@host systemctl status nginx', 'ask'],
  ['ssh user@host systemctl restart nginx', 'ask'],
  ['ssh user@host terraform apply', 'ask'],
  ['ssh prod-server docker ps', 'ask'],
  ['ssh -p 22 user@host helm list', 'ask'],
  // ssh with options before host
  ['ssh -o StrictHostKeyChecking=no user@host kubectl delete pod x', 'ask'],
  ['ssh -- user@host kubectl get pods', 'ask'],
  ['kubectl frobnicate pod x', 'DENY'],
  ['kubectl', 'DENY'],
  ['systemctl frobnicate nginx', 'DENY'],
  ['helm template x', 'DENY'],
  // Widening docker's pass set must not open the fail-closed floor: an unrecognized docker
  // verb is still "recognized tool, undeterminable risk" -> deny, not pass. Asserted so a
  // later "docker is local, let it all through" edit cannot silently drop the floor.
  ['docker frobnicate x', 'DENY'],

  // -- Compound commands: ops segments judged independently --
  // rm is not an ops command, so only the kubectl segment matters
  ['kubectl get pods && rm -rf /tmp', 'pass'],
  ['kubectl get pods; systemctl restart nginx', 'ask'],
  ['systemctl status nginx && kubectl get pods', 'pass'],

  // -- Should not false-positive: non-ops commands / text inside quotes --
  ['git status', 'pass'],
  ['npm test', 'pass'],
  ['echo kubectl get pods', 'pass'],
  ['grep -rn "kubectl delete" .', 'pass'],
  ['cat opsgate.js', 'pass'],
  ['unknown-ops-tool --flag', 'pass'],
  ['ls -la', 'pass'],

  // -- heredoc body must be skipped (regression: used to treat commit message body as commands) --
  // splitSegments originally split by newlines, each body line treated as independent command,
  // kubectl/rsync in body falsely intercepted, user forced to reword to commit.
  ['git commit -F - <<EOF\nfeat: add new\n\nkubectl delete with context\n\nuse rsync to sync\nEOF', 'pass'],
  ['cat <<EOF\nkubectl delete pod payment-api\nEOF', 'pass'],
  ['cat <<\x27EOF\x27\nkubectl delete pod\nEOF', 'pass'],
  // Unclosed heredoc: rest of content all treated as body
  ['cat <<EOF\nkubectl delete pod', 'pass'],
  // Real commands after heredoc ends must still be caught (regression: used to merge subsequent commands into previous segment)
  ['cat <<EOF\nbody\nEOF\nkubectl delete pod x', 'ask'],
  ['cat <<EOF\nbody\nEOF\nsystemctl restart nginx', 'ask'],
  // -- heredoc with whitespace before the delimiter must also be skipped --
  // bash permits `<< 'EOF'` and `<<- "EOF"` (space between << and the delimiter).
  // Measured defect from change #119: heredocDelimiterAt returned null for
  // `<< 'EOF'` because it did not skip the whitespace, so the body leaked and
  // was classified as commands -- doc append with `<< 'EOF'\nrm -rf in body\nEOF`
  // triggered a spurious DENY. Fix: skip optional space/tab between << and delimiter.
  ["cat << 'EOF'\nkubectl delete pod x\nEOF", 'pass'],
  ['cat << "EOF"\nkubectl delete pod x\nEOF', 'pass'],
  ["cat <<- 'EOF'\nkubectl delete pod x\nEOF", 'pass'],
  ["cat <<- 'EOF'\nkubectl delete pod x\nEOF\nsystemctl restart nginx", 'ask'],
  // Whitespace-only body still passes
  ["cat << 'EOF'\n\n\nEOF", 'pass'],
  // Bare multiline (no heredoc) still judged by segments
  ['kubectl get pods\nrm -rf /tmp', 'pass'],
  // -- Wrappers and nesting --
  ['sudo kubectl delete pod x', 'ask'],
  ['bash -c "kubectl delete pod x"', 'ask'],
  ['sh -c "kubectl get pods"', 'pass'],
  ['env KUBECONFIG=/x kubectl get pods', 'pass'],
  // `>` is the host shell's redirection, doesn't enter argv, so not in this gate's shell control character check
  ['kubectl get pods > /tmp/out.json', 'pass'],
];

let pass = 0;
const failures = [];

function runGate(command, env, cwd) {
  const payload = { tool_name: 'Bash', tool_input: { command } };
  if (cwd) payload.cwd = cwd;
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return { status: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim() };
}
function decision(r) {
  if (!r.out) return 'pass';
  const d = JSON.parse(r.out).hookSpecificOutput.permissionDecision;
  return d === 'deny' ? 'DENY' : d === 'allow' ? 'ALLOW' : 'ask';
}

for (const [command, expected] of CASES) {
  const res = runGate(command);
  const actual = decision(res);
  if (actual === expected) { pass++; }
  else failures.push(`  [FAIL] ${command}\n      expected ${expected} / actual ${actual}${res.err ? ' / stderr: ' + res.err : ''}`);
}

/* ---------- Contract check: never return allow (gate only tightens, never relaxes) ---------- */
const allowRes = runGate('kubectl delete pod x');
if (/"permissionDecision"\s*:\s*"allow"/.test(allowRes.out)) {
  failures.push('  [FAIL] Contract violation: hook returned allow (gate only allows ask / deny or silent pass-through)');
}

/* ---------- Empty / invalid input must silently pass, must not block ---------- */
for (const input of ['', 'not-json', '{}', '{"tool_name":"Edit","tool_input":{}}']) {
  const r = spawnSync(process.execPath, [HOOK], { input, encoding: 'utf8' });
  if (r.status !== 0 || (r.stdout && r.stdout.trim())) {
    failures.push(`  [FAIL] Abnormal input not silently passed: ${JSON.stringify(input)} -> exit=${r.status} out=${(r.stdout || '').slice(0, 80)}`);
  }
}

/* ---------- HELLODEV_OPSGATE_MODE (policy on classification exception) ---------- */

function check(label, command, env, want, cwd) {
  const got = decision(runGate(command, env, cwd));
  if (got !== want) failures.push(`  [FAIL] ${label}: expected ${want} / actual ${got}`);
}

// This gate's whitelist is the criterion for "confirmed ops tool", not "everything unknown".
// Binaries not in the whitelist don't enter classification, go directly to platform default
// permission flow — isomorphic to git-gate handling only git. Denying all unknown commands
// would lock the entire session (ls / npm test / custom scripts), becoming a blocking source.
check('non-whitelist tool not handled', 'frobnicate-tool x', {}, 'pass');
check('non-whitelist tool not handled', 'frobnicate-tool x', { HELLODEV_OPSGATE_MODE: 'deny-unclassified' }, 'pass');
check('non-whitelist tool not handled', 'frobnicate-tool x', { HELLODEV_OPSGATE_MODE: 'allow-unclassified' }, 'pass');
check('non-whitelist tool not handled', 'frobnicate-tool x', { HELLODEV_OPSGATE_MODE: 'bogus' }, 'pass');

// In whitelist but verb cannot be determined (e.g. `kubectl` without verb) -> unclassified, affected by mode switch
check('deny-unclassified denies kubectl without verb', 'kubectl', { HELLODEV_OPSGATE_MODE: 'deny-unclassified' }, 'DENY');
check('allow-unclassified passes kubectl without verb', 'kubectl', { HELLODEV_OPSGATE_MODE: 'allow-unclassified' }, 'pass');
check('uppercase mode normalization', 'kubectl', { HELLODEV_OPSGATE_MODE: 'ALLOW-UNCLASSIFIED' }, 'pass');
check('invalid mode treated as default', 'kubectl', { HELLODEV_OPSGATE_MODE: 'bogus' }, 'DENY');

// Mode switch only affects "risk undetermined", doesn't change known classifications
for (const [cmd, want] of [
  ['kubectl delete pod x', 'ask'],
  ['kubectl get pods', 'pass'],
  ['rm -rf /tmp/x', 'pass'],   // rm is not an ops command, always passes
  ['systemctl restart nginx', 'ask'],
]) {
  check(`deny mode doesn't change known classification ${cmd}`, cmd, { HELLODEV_OPSGATE_MODE: 'deny-unclassified' }, want);
  check(`allow mode doesn't change known classification ${cmd}`, cmd, { HELLODEV_OPSGATE_MODE: 'allow-unclassified' }, want);
}

// User master switch: off means no intervention at all
check('HELLODEV_OPSGATE=off disables', 'kubectl delete pod x', { HELLODEV_OPSGATE: 'off' }, 'pass');

/* ---------- HELLODEV_OPSGATE_SKIP_DIRS (project-level switch) ---------- */
{
  const skipCwd = '/home/user/projects/my-app';
  // cwd in skip list -> silently pass (even for high-risk commands)
  check('SKIP_DIRS matches cwd segment -> pass', 'kubectl delete pod x', { HELLODEV_OPSGATE_SKIP_DIRS: 'my-app' }, 'pass', skipCwd);
  check('SKIP_DIRS multi-value match', 'terraform destroy', { HELLODEV_OPSGATE_SKIP_DIRS: 'node_modules,vendor,my-app' }, 'pass', skipCwd);
  // cwd not in list -> normal interception
  check('SKIP_DIRS no match -> intercept', 'kubectl delete pod x', { HELLODEV_OPSGATE_SKIP_DIRS: 'other-project' }, 'ask', skipCwd);
  // empty SKIP_DIRS -> normal interception
  check('SKIP_DIRS empty -> intercept', 'kubectl delete pod x', { HELLODEV_OPSGATE_SKIP_DIRS: '' }, 'ask', skipCwd);
  // no cwd -> normal interception (runGate defaults to no cwd)
  check('no cwd -> intercept', 'kubectl delete pod x', { HELLODEV_OPSGATE_SKIP_DIRS: 'my-app' }, 'ask');
  // Matching rule: exact segment match
  check('SKIP_DIRS partial match does not trigger', 'kubectl delete pod x', { HELLODEV_OPSGATE_SKIP_DIRS: 'my' }, 'ask', skipCwd);
}

/* ---------- Per-command deny escape via opsApprove credentials ---------- */
{
  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  // Create a temporary fixture directory with .hello-dev/state.json
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opsgate-escape-'));
  const helloDevDir = path.join(fixtureDir, '.hello-dev');
  fs.mkdirSync(helloDevDir);

  // Helper: write a state.json with given ops section
  function writeFixture(ops) {
    const state = { ops };
    fs.writeFileSync(path.join(helloDevDir, 'state.json'), JSON.stringify(state));
  }

  // Future expiry (valid credential)
  const futureExpiry = new Date(Date.now() + 600_000).toISOString();
  const pastApprovedAt = new Date(Date.now() - 10_000).toISOString();

  // 1. Valid credential matching the command -> pass instead of deny
  writeFixture({
    steps: {
      'wsl-ls': { command: 'wsl ls /', digest: 'a'.repeat(64), approvalMode: 'pre_execution', status: 'approved' },
    },
    approvals: [{
      stepDigest: 'a'.repeat(64),
      approvedBy: 'user',
      approvedAt: pastApprovedAt,
      expiresAt: futureExpiry,
      intent: { command: 'wsl ls /' },
    }],
  });
  check('opsApprove credential -> pass denied command', 'wsl ls /', {}, 'pass', fixtureDir);

  // 2. Different command, same credential -> still denied
  check('opsApprove credential wrong command -> deny', 'wsl npm install', {}, 'DENY', fixtureDir);

  // 3. Expired credential -> still denied
  const pastExpiry = new Date(Date.now() - 1000).toISOString();
  writeFixture({
    steps: {
      'wsl-ls': { command: 'wsl ls /', digest: 'b'.repeat(64), approvalMode: 'pre_execution', status: 'approved' },
    },
    approvals: [{
      stepDigest: 'b'.repeat(64),
      approvedBy: 'user',
      approvedAt: pastApprovedAt,
      expiresAt: pastExpiry,
      intent: { command: 'wsl ls /' },
    }],
  });
  check('expired opsApprove credential -> deny', 'wsl ls /', {}, 'DENY', fixtureDir);

  // 4. Empty ops section -> normal deny
  writeFixture({ steps: {}, approvals: [] });
  check('empty ops section -> normal deny', 'wsl ls /', {}, 'DENY', fixtureDir);

  // 5. No state.json at all -> normal deny (no cwd with state)
  const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opsgate-nostate-'));
  check('no state.json -> normal deny', 'wsl ls /', {}, 'DENY', emptyDir);

  // 6. ask commands not affected by this mechanism (only deny escapes)
  writeFixture({
    steps: {
      'wsl-e': { command: 'wsl -e uname -a', digest: 'c'.repeat(64), approvalMode: 'pre_execution', status: 'approved' },
    },
    approvals: [{
      stepDigest: 'c'.repeat(64),
      approvedBy: 'user',
      approvedAt: pastApprovedAt,
      expiresAt: futureExpiry,
      intent: { command: 'wsl -e uname -a' },
    }],
  });
  // ask is ask — the credential escape only applies to deny (unclassified), not ask
  check('opsApprove does not bypass ask', 'wsl -e uname -a', {}, 'ask', fixtureDir);

  // Cleanup
  fs.rmSync(fixtureDir, { recursive: true, force: true });
  fs.rmSync(emptyDir, { recursive: true, force: true });
}

/* ---------- Boundary with git-gate: must not handle git ---------- */
check('git commands not handled by this gate', 'git reset --hard', {}, 'pass');
check('git commands not handled by this gate', 'git push --force', {}, 'pass');

/* ---------- Post-interception contract in the runtime message ---------- */
//
// Why this is locked down: the message emitted on deny/ask is the ONLY instruction the
// agent receives at the moment it is stopped. The original deny text told the agent to
// "use equivalent read-only command" as the resolution -- i.e. it actively pointed at a
// workaround. The required contract is now: pause, report the exact command and reason,
// ask the user whether to authorize, and wait for explicit confirmation. These elements
// are asserted individually so a future text edit cannot silently drop one.
{
  const CONTRACT_ELEMENTS = [
    'pause this operation',
    'report the exact',
    'to the user',
    'ask whether to authorize',
    'Wait for explicit user confirmation before continuing',
  ];
  // Phrasing that reads as "find another way around the gate". Must not come back.
  const BYPASS_PHRASING = [
    'equivalent read-only command',
    'read-only approach',
    'Resolution:',
  ];
  const TRUNCATION_NOTE = 'truncated for display only';

  function reasonOf(command) {
    const out = runGate(command).out;
    if (!out) return null;
    return JSON.parse(out).hookSpecificOutput.permissionDecisionReason;
  }

  for (const [label, command, wantCmd] of [
    ['deny (unclassified)', 'kubectl frobnicate pod x', 'kubectl frobnicate pod x'],
    ['ask', 'kubectl delete pod x', 'kubectl delete pod x'],
  ]) {
    const reason = reasonOf(command);
    if (reason === null) {
      failures.push(`  [FAIL] post-interception contract (${label}): expected an intercepted decision for "${command}", got pass-through`);
      continue;
    }
    for (const element of CONTRACT_ELEMENTS) {
      if (!reason.includes(element)) {
        failures.push(`  [FAIL] post-interception contract (${label}): message lacks required element "${element}"`);
      }
    }
    // The user must be able to see which exact command was stopped.
    if (!reason.includes(`Command: ${wantCmd}`)) {
      failures.push(`  [FAIL] post-interception contract (${label}): message does not quote the intercepted command "${wantCmd}"`);
    }
    for (const bad of BYPASS_PHRASING) {
      if (reason.includes(bad)) {
        failures.push(`  [FAIL] post-interception contract (${label}): message still encourages a workaround via "${bad}"`);
      }
    }
  }

  // The message tells the agent to report the exact command, but the display line is bounded.
  // If it is bounded, the message must say so -- otherwise the agent would report a silently
  // truncated command as if it were complete. Regression: clip() used to be applied by the
  // caller *and* compared inside the emit function, so the two sides were always equal and the
  // disclosure never appeared for any input.
  const LONG_DENY = `kubectl frobnicate ${'a/'.repeat(100)}pod-x`;
  const LONG_ASK = `kubectl delete pod ${'b'.repeat(250)}`;
  const LONG_UNCLASSIFIED = `kubectl frobnicate ${'c'.repeat(250)}`;

  for (const [label, command] of [
    ['unclassified deny', LONG_DENY],
    ['ask', LONG_ASK],
    ['unclassified deny long', LONG_UNCLASSIFIED],
  ]) {
    const reason = reasonOf(command);
    if (reason === null) {
      failures.push(`  [FAIL] truncation disclosure (${label}): expected an intercepted decision, got pass-through`);
      continue;
    }
    if (!reason.includes(TRUNCATION_NOTE)) {
      failures.push(`  [FAIL] truncation disclosure (${label}): long command was clipped but the message does not say so`);
    }
  }

  // A short command must not carry the disclosure -- a note that is always present carries no signal.
  for (const [label, command] of [['deny (unclassified)', 'kubectl frobnicate x'], ['ask', 'kubectl delete pod x']]) {
    const reason = reasonOf(command);
    if (reason !== null && reason.includes(TRUNCATION_NOTE)) {
      failures.push(`  [FAIL] truncation disclosure (${label}): short command should not be reported as truncated`);
    }
  }

  // Interruption-risk assessment obligation. The gate is a cautious-execution gate, not a
  // prohibition gate: on ask the agent must not read "not yet authorized" as "forbidden",
  // and for a production / stateful target the authorization request must carry an
  // interruption-risk assessment. The hook cannot observe the target, so the obligation is
  // emitted unconditionally and the production/stateful test happens in the agent's judgment.
  // Elements are asserted individually so a future text edit cannot silently drop one.
  {
    const ASK_ASSESSMENT_ELEMENTS = [
      'production or a stateful service',
      'interruption-risk assessment',
      'rollback point',
      'cannot be determined',
      'may be executed',
    ];
    const reason = reasonOf('kubectl delete pod x');
    if (reason === null) {
      failures.push('  [FAIL] interruption-risk assessment (ask): expected an intercepted decision for "kubectl delete pod x", got pass-through');
    } else {
      for (const element of ASK_ASSESSMENT_ELEMENTS) {
        if (!reason.includes(element)) {
          failures.push(`  [FAIL] interruption-risk assessment (ask): message lacks required element "${element}"`);
        }
      }
    }
  }
}

console.log(`  Command cases: ${pass}/${CASES.length}`);
if (failures.length) {
  console.error(`\n[FAIL] ${failures.length} failures:`);
  failures.forEach(f => console.error(f));
  process.exit(1);
}
console.log('[OK] opsgate classification, contract, abnormal input, mode switch, and git boundary tests passed');
