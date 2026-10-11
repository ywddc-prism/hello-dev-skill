# Ops Execution - Operations Execution & Approval Gate

> Document-driven operations governance: safe read-only transparent execution, state changes approved step-by-step before execution.
> This file is the **authoritative definition** of the opsgate risk table and must
> match [hooks/opsgate.js](../../../hooks/opsgate.js), with regression by
> [check-opsgate-consistency.js](../../../scripts/check-opsgate-consistency.js).

This module replaces the historical status of `modules/automation/` -- that layer was v9-v13 design drafts, never implemented.
The operations execution layer lands here: command risk classification (hook) + execution intent approval (stepDigest) + state consolidation (`.hello-dev/state.json`).

## 1. Why Operations Commands Need an Independent Gate

git-gate only parses git. Beyond it, `kubectl delete pod`, `systemctl restart nginx`,
`terraform apply` are **completely unknown** to HelloDev; `fail-open` would pass them directly.

The cost of operations commands and git subcommands differs: git's unknown subcommands mostly only touch repository metadata,
while operations commands' unknown semantics may act directly on production. Therefore opsgate takes a different default --
**deny when risk cannot be determined** (for unclassified verbs within known ops tools), not git-gate's fail-open.

**This gate only manages ops tools** (kubectl, systemctl, terraform, helm, docker, ssh, etc.).
Local system commands (`rm`, `mkfs`, `dd`, `shutdown`, etc.) are NOT ops commands and are left
to the platform's default permission flow. The gate is cautious-execution, not prohibition:
every recognized ops command can proceed after user confirmation with risk disclosure and rollback plan.

### Jurisdiction Criterion: Local Development vs. Remote/Production Infrastructure

**The criterion this gate applies is not a literal implementation of the original request.** It is
recorded here explicitly, because the difference is a deliberate substitution and not an oversight.

The request that triggered this boundary re-drawing was, literally: *"only commands operated through
`ssh` are ops commands; git operations need confirmation; that is all" (*only operations via ssh commands are*
*ops commands, then git operations need confirmation, that is all*). Read verbatim, that criterion is **narrower in scope and
wider in effect** than what shipped:

- Narrower: only `ssh`-mediated commands would be governed, so `kubectl` / `systemctl` / `terraform` /
  `helm` — which act on clusters and hosts directly, without `ssh` — would fall out of the gate entirely.
- Wider in effect: dropping them is a **net relaxation**, not a simplification. `kubectl delete pod`,
  `terraform apply`, `terraform destroy` and `systemctl restart nginx` would all pass unexamined, and
  `terraform destroy` in particular is not recoverable by retrying.

The criterion actually adopted, after confirmation, is **"does the command act on remote / production
infrastructure or on the local development machine"** — the same jurisdiction test stated at the top of
this section. Consequences of that substitution:

- `ssh` / `scp` / `rsync` with a remote target stay behind approval (the original request's concern).
- `kubectl` / `systemctl` / `terraform` / `helm` keep their **write** operations behind approval, because
  they act on remote/production infrastructure whether or not `ssh` is involved.
- Local development tooling — `docker` / `podman` local actions, `wsl` / `dism` (read-only queries),
  local `rsync` / `scp` copies — leaves the gate, which is what the original complaint (availability)
  was actually about. `wsl` and `dism` are now in `OPS_BINS` with their own classification branches;
  unrecognized verb combinations deny rather than pass, but all read-only queries still pass.

In one sentence: **this is a confirmed criterion substitution, not a verbatim implementation of the
user's wording.** Anyone auditing the delivery against the literal request will find a difference here;
this paragraph is where it is declared rather than left implicit. The decision itself belongs to the
user; recording the divergence is what keeps the document from silently misrepresenting it.

**Container tooling is judged by jurisdiction, not by binary.** `docker` / `podman` sit in the gate's
whitelist, but the great majority of what they do — build, compose, pull, run, exec, prune — acts on the
**local** machine and touches no remote or production infrastructure, so it is not an ops action and is
not intercepted. Two consequences are deliberate:

- The container actions kept behind approval are the ones that **publish an image to a remote
  registry** — the actions that leave the local machine. That is `docker push` **and** the same
  egress expressed through other matching paths: the BuildKit `--push` flag
  (`docker build --push ...`, `docker buildx build --push ...`, and the `--push=true` spelling), the
  standard push subverb of a pass-listed group (`docker image push`, `docker container push`,
  `docker compose push`), and the registry output target (`docker build --output type=registry ...`).
  An earlier revision of this section claimed `docker push` was the **only** container action leaving
  the local machine; that was **false as measured** — the four non-top-level forms were released as
  `pass`, because `push` is a top-level verb while the others are reached through the group verbs
  (`image` / `container` / `buildx`) that the local-development pass list has to name. The check is
  now a property test over argv (`isRegistryEgress`) that runs *before* the pass list, so the purely
  local subverbs of those same groups (`image prune`, `image ls`, `container ls`) keep passing.
- `docker run` / `docker exec` now pass like their local counterparts. The gate is a pure function keyed
  by verb and cannot see whether the target is a local container or a production host, so
  `docker exec -it <production container> sh`, `docker run -v /:/host` and `docker run --privileged` are
  no longer intercepted. Treating every `run` / `exec` as remote-backed would re-deny the ordinary local
  case, which is the availability defect this boundary exists to fix. Their inherent severity is unchanged
  and stays visible as L5 in the table below.
  This exemption applies to the **unqualified** forms only. When the command line *names* a remote
  endpoint (`-H` / `--host` / `--context` / `-c`), the gate no longer has to guess and the exemption is
  voided — see [Remote daemon targets](#state-changes-ask-approve-before-execution). The relevant
  qualifiers are visible in the option prefix even though `locateVerb` cannot see them.

**`wsl` is now classified by this gate** — `wsl` is in OPS_BINS. Read-only queries (`--status`,
`--list`, `--version`) pass; state changes (`--install`, `--shutdown`, `--terminate`, etc.)
require approval; arbitrary exec (`-e`/`--exec`) is L5; `--unregister` is L4. See the risk table
below for the full classification.

**File transfer is conditional.** `scp` and `rsync` are managed only when the transfer actually
names a **remote** target (`host:path`, `user@host:path`, `host::module`, `ssh://` / `rsync://` /
`sftp://`, or a remote-shell option such as `-e` / `--rsh=ssh`). A local-to-local copy
(`rsync -a --delete /a/src/ /b/dst/`) touches only the local filesystem, so it is not an ops
action and goes to the platform's default permission flow — the same treatment `rm` / `mkfs` / `dd`
receive. The criterion is "is a remote host named", not "is the binary rsync/scp".
Two consequences are accepted deliberately: `rsync -a src/ dst/` (relative paths with no host, and
no cwd available to the pure hook) falls outside the gate; and a local name that happens to look
like a hostname (`src:1/`) is treated as remote, erring toward asking.

## 2. Division of Labor Between Two Gates

| | git-gate | opsgate |
|---|---|---|
| Jurisdiction | Only `git` | Whitelisted ops tools |
| Unknown command | fail-open pass | **deny-unclassified (for unclassifiable verbs within known ops tools)** |
| Classification result | LOW / MED / HIGH -> silent / ask | pass / ask |
| Unknown binary | Does not take over (not git) | Does not take over (not whitelisted) |
| Risk table | [git-gate.md](git-gate.md) | This file |

**Both gates only do classification**: do not execute commands, do not write state, do not record final approval results, never return `allow`.
Whether the host-registered `PreToolUse/Bash` hook is actually loaded must be verified in the actual environment; unit tests cannot infer it.

### Whitelist Boundary

opsgate judges "**confirmed this is an ops tool**", not "everything unrecognized".
Binaries not on the whitelist (custom scripts, `npm` ecosystem tools, local system commands
like `rm` / `mkfs` / `dd` / `shutdown`) are handed to the platform's default permission flow.
If everything unknown is denied, this gate would lock down `ls`, `npm test`, and all custom
scripts in the entire session, becoming a blocking source -- exactly the trap git-gate
deliberately avoids with `fail-open`.

### Project-Level Bypass: `HELLODEV_OPSGATE_SKIP_DIRS`

The gate's scope is ops tools (remote/production infrastructure). For projects that are purely
local development — not interacting with production infrastructure at all — the entire gate can
be bypassed via `HELLODEV_OPSGATE_SKIP_DIRS`. This is a comma-separated list of directory names;
when any path segment of the current working directory matches a name in the list, the gate
silently passes (no interception, no trace write).

This is a **project-level decision**, not a per-command decision. The matching is by exact
directory segment (not substring):

| cwd | SKIP_DIRS | Result |
|---|---|---|
| `/home/user/projects/my-app` | `my-app` | pass (segment equals) |
| `/home/user/projects/my-app` | `my` | intercept (not exact match) |
| `/home/user/projects/my-app` | `node_modules,my-app` | pass (one segment matches) |

For this project (Hello Dev itself), set `HELLODEV_OPSGATE_SKIP_DIRS=hello-dev` in your
shell profile to bypass the gate entirely when working in the project directory. The gate is
designed for ops sessions targeting remote infrastructure; local development of Hello Dev's
own scripts does not involve production ops and should not be gated.

Note: the hook is a pure function with no file I/O for config. The bypass is opt-in via the
environment variable — the hook does not silently detect project type or apply defaults.

## 3. Risk Table (Authoritative)

Format: `| Command | Risk Level | Expected Decision | Description |`

### Read-Only (pass, not intercepted)

Read-only operations must pass; otherwise the gate degrades into a friction source -- blocking `kubectl get` would make users bypass the entire flow.

| Command | Risk | Decision | Description |
|------|------|------|------|
| `kubectl get pods` | L0 | pass | Read-only query |
| `kubectl -n payments get deploy x -o json` | L0 | pass | Read-only query with value option |
| `kubectl describe pod x` | L0 | pass | Read-only query |
| `kubectl logs deploy/x --tail=100` | L0 | pass | Read-only logs |
| `kubectl config current-context` | L0 | pass | Read-only context query |
| `kubectl auth can-i delete pods` | L0 | pass | Read-only permission query |
| `kubectl rollout status deploy/x` | L0 | pass | Read-only rollout status |
| `kubectl --context=prod get deploy` | L0 | pass | Flag precedes; verb located correctly |
| `systemctl status nginx` | L0 | pass | Read-only service status |
| `systemctl --no-pager status nginx` | L0 | pass | Boolean flag; does not swallow verb |
| `df -h` | L0 | pass | Read-only system query |
| `journalctl -u nginx -n 50` | L1 | pass | Read-only logs; needs output and timeout limits |
| `terraform plan` | L1 | pass | Read-only/compute |
| `terraform validate` | L1 | pass | Read-only validation |
| `helm list` | L0 | pass | Read-only query |
| `docker ps` | L0 | pass | Read-only container query |
| `docker inspect x` | L0 | pass | Read-only container query |
| `docker images` | L0 | pass | Read-only image listing |
| `docker logs c` | L0 | pass | Read-only container logs |
| `docker version` | L0 | pass | Read-only version query |
| `docker info` | L0 | pass | Read-only daemon info |
| `docker top c` | L0 | pass | Read-only process listing |
| `docker context ls` | L0 | pass | Read-only context listing; `context` is a target-selection family, its read subverbs stay L0 |
| `docker context inspect x` | L0 | pass | Read-only context query |
| `docker context show` | L0 | pass | Read-only context query |
| `docker context export x` | L0 | pass | Read-only context export |
| `DOCKER_HOST=tcp://prod:2375 docker ps` | L0 | pass | Read-only query against a remote daemon; reading is reading |
| `export DOCKER_HOST=tcp://prod:2375 && docker ps` | L0 | pass | Read-only query after a cross-segment declaration; still only a query |
| `export FOO=bar && docker rm -f web` | L0 | pass | Anti-over-tightening: an unrelated `export` must not arm the gate |

### Local Container Development (pass, NOT intercepted)

`docker` / `podman` are whitelisted binaries, but the actions below act on the **local** machine and
touch no remote or production infrastructure — see [section 1](#1-why-operations-commands-need-an-independent-gate).
They are outside opsgate's jurisdiction and go to the platform's default permission flow.

These commands used to be **denied** ("Not in Docker allowlist"), which was the availability defect this
boundary re-drawing fixes. Note the group verbs: `locateVerb` returns only the first non-option token, so
`docker compose up -d` yields verb `compose` (not `up`) and `docker system prune` yields verb `system`
(not `prune`). The groups are therefore matched on their own names, which is why `compose` / `system` /
`image` / `volume` / `network` / `container` / `builder` / `buildx` all appear below. `context` does
**not**: it was grouped with them at first and was removed again in change #131, because a group entry
releases the group's *write* subverbs along with its read-only ones, and `context use` does not act on
the local machine at all — it decides which machine later commands act on. See
[Remote daemon targets](#remote-daemon-targets--gated-not-released).

**The cost of that grouping, paid back explicitly.** Matching a group on its own name also releases the
group's *egress* subverbs — `docker image push`, `docker container push`, `docker compose push` reach the
same remote registry as `docker push`. Those are not local development and are pulled back behind approval
by an explicit egress check that runs **before** this pass list (see
[State Changes](#state-changes-ask-approve-before-execution) for the rows). The check tests the egress
property rather than re-listing verbs, which is what keeps the purely local subverbs of the same groups —
`image prune`, `image ls`, `container ls`, `compose up`, `compose build` — passing.

| Command | Risk | Decision | Description |
|------|------|------|------|
| `docker build -t app .` | L2 | pass | Builds a local image |
| `docker compose up -d` | L2 | pass | Group verb `compose`; starts local compose stack |
| `docker compose logs -f` | L2 | pass | Group verb `compose`; local logs |
| `docker compose build` | L2 | pass | Group verb `compose`; local build |
| `docker compose down` | L2 | pass | Group verb `compose`; tears down local stack |
| `docker pull nginx` | L2 | pass | Fetches an image to the local machine |
| `docker system prune` | L2 | pass | Group verb `system`; prunes local unused data |
| `docker image prune` | L2 | pass | Group verb `image`; prunes local images |
| `docker volume prune` | L2 | pass | Group verb `volume`; prunes local volumes |
| `docker network create net1` | L2 | pass | Group verb `network`; creates a local network |
| `docker stop x` | L2 | pass | Stops a local container |
| `docker rm x` | L2 | pass | Removes a local container |
| `docker rmi x` | L2 | pass | Removes a local image |
| `docker kill x` | L2 | pass | Kills a local container |
| `docker start x` | L2 | pass | Starts a local container |
| `docker restart x` | L2 | pass | Restarts a local container |
| `docker run -it ubuntu` | L5 | pass | Runs an arbitrary program; local by jurisdiction (see below) |
| `docker exec -it c sh` | L5 | pass | Runs an arbitrary program; local by jurisdiction (see below) |
| `podman compose up` | L2 | pass | `podman` shares this branch with `docker` |

`run` / `exec` keep **L5** — only the jurisdiction changed, not the semantics. The residual risk is
explicit: because the hook is a pure function keyed by verb and cannot see the target, these forms are
**no longer intercepted**:

- `docker exec -it <production container> sh`
- `docker run -v /:/host ...` (host filesystem mounted read-write)
- `docker run --privileged ...`

Re-denying them would re-deny the ordinary local case, which is the defect being fixed.

**Remote daemon targets — gated, not released.** An earlier revision of this section described the
`docker context` / `-H` surface as a deliberate release, on the argument that the hook is a pure
function keyed by verb and cannot tell a local daemon from a production one. That conclusion was
wrong and has been reversed. The argument assumed the qualifier was unobservable; it is observable —
just not by `locateVerb`. `-H` / `--host` are absent from its `OPTION_TAKES_VALUE` table, and the
`=`-form is skipped outright by its `if (t.includes('='))` branch, so
`locateVerb(['docker','-H=tcp://prod:2375','rm','-f','web'])` → `['rm','-f']`: **byte-identical to the
local `docker rm web`**. The verb genuinely cannot distinguish them. An **argv scan over the option
prefix** can, and now does — see `dockerRemoteEndpoint()` in
[ops-policy.js](../../../scripts/lib/ops-policy.js). The criterion is: *a remote endpoint qualifier
voids the local-development exemption*, because there is nothing local about removing a container on a
production daemon.

Measured against the pre-change hook, the write side had regressed from intercepted to pass; it is
asked again. Read-only queries are deliberately untouched (they answer for a remote daemon but still
only read):

| Command | Pre-change | Was released to | Now |
|---|---|---|---|
| `docker -H=tcp://prod:2375 rm -f web` | ask | pass | **ask L3** |
| `docker -H=tcp://prod:2375 rmi img` | ask | pass | **ask L3** |
| `docker -H=tcp://prod:2375 stop web` | ask | pass | **ask L3** |
| `docker -H=tcp://prod:2375 kill web` | ask | pass | **ask L3** |
| `docker -H=tcp://prod:2375 system prune -a` | deny | pass | **ask L3** |
| `docker --host=tcp://prod:2375 rm -f web` | ask | pass | **ask L3** |
| `docker --context=prod rm -f web` | ask | pass | **ask L3** |
| `docker --context prod rm -f web` | ask | pass | **ask L3** |
| `docker -c prod rm -f web` | ask | pass | **ask L3** |
| `docker -H=tcp://prod:2375 run -it ubuntu` | ask L5 | pass | **ask L5** |
| `docker -H=tcp://prod:2375 exec -it c sh` | ask L5 | pass | **ask L5** |
| `docker --context=prod build -t app .` | deny | pass | **ask L3** |
| `docker --context prod compose up -d` | deny | pass | **ask L3** |
| `docker --context prod pull nginx` | deny | pass | **ask L3** |
| `docker --context prod ps` / `logs` / `inspect` | pass L0 | pass | pass L0 (unchanged — read-only) |

The generic `run` / `exec` exemption is NOT reversed: `docker run -it ubuntu` and
`docker exec -it c sh` still pass, because for those the gate still cannot see the target. Only the
forms that *declare* a remote endpoint are gated. The two decisions are consistent — what is
observable is gated, what is not stays as before — and the residual (unobservable) surface remains
registered in [Local Container Development](#local-container-development-pass-not-intercepted).

**These gaps were closed in change #131 — with the arc, not just the endpoint.** The three forms
below were registered here as unclosed after change #130: each names a remote daemon and each had been
released to pass. They are now gated again. The middle column is kept deliberately, because a register
showing only the current state hides that the release ever happened and invites repeating it:

| Command | Pre-change | Was released to | Now | How it was closed |
|---|---|---|---|---|
| `DOCKER_HOST=tcp://prod:2375 docker rm -f web` | ask | pass | **ask L3** | The opsgate hook now scans the **raw** segment for a `DOCKER_HOST=` / `DOCKER_CONTEXT=` assignment *before* `normalize()` strips it, and hands the finding to `assessCommand` as `remoteEndpointEnv`. The hook only detects; the voiding of the local exemption is produced in ops-policy.js, identically to `-H`. |
| `env DOCKER_HOST=tcp://prod:2375 docker rm -f web` | ask | pass | **ask L3** | Same scan: `env` is a recognized wrapper, so it is skipped while walking the prefix and the assignment behind it is found. |
| `docker context use prod` | deny | pass | **ask L3** | `context` was taken out of the local-development pass list and made its own **target-selection** family: read subverbs (`ls` / `show` / `inspect` / `export`) stay L0, the other **known** subverbs (`use` / `create` / `remove` / `rm` / `update` / `import`) and the bare `docker context` ask L3, and an **unknown** subverb falls through to the fail-closed deny L4 — it is not swept into the ask, because an unrecognized subverb is exactly the case the floor exists for. The read test is ordered before the ask test so `docker context ls` is not swept up with it. |

**The round-1 fix was incomplete, and the remainder was the worst of the three forms.** Closing the
bare `DOCKER_HOST=... docker rm -f web` shape left the shape that actually lives in a shell profile —
`export DOCKER_HOST=...` on its own line, with the docker command on the next. Measured: it was `ask`
against the pre-change hook, `pass` after round 1, and is `ask L3` now (change #133). It escaped round 1
for two reasons at once: the `export` segment was skipped because its binary is `export`, which is not an
ops token, so the assignment was never scanned; and the following `docker rm -f web` segment is
byte-identical to the local case. The finding now **accumulates across segments**, and `export` is treated
by the prefix scan as a wrapper — it is a declaration rather than a prefix of the command it affects,
which is exactly why `normalize()` (correctly, for its own purposes) leaves it in place.

The scan still matches only `DOCKER_HOST` / `DOCKER_CONTEXT`. `export FOO=bar` must stay `pass`, and does.

The accumulation reaches **inside nested wrappers** too (change #134). `bash -c "export DOCKER_HOST=tcp://prod:2375;
docker rm -f web"` was `ask` at HEAD and `pass` before that fix, because inside a wrapper the segments are
the inner ones and only the outer segment was ever scanned. The flag is now written back from the inner
segment *before* the ops-token test — which matters, because a declaration segment is exactly one that test
discards (`export` is not an ops command), so recording it afterwards would mean the only segment carrying
the finding is the one that cannot report it.

**Two statements in the previous version of this table were wrong, and are corrected rather than
deleted.** Recording the corrections matters more than the corrections themselves, because both were
believable when written:

- It said closing the `DOCKER_HOST` forms "needs the lexer to surface stripped environment assignments,
  **not a policy change**". Both halves were false as implemented.
  [bash-lex.js](../../../scripts/lib/bash-lex.js) was **not** touched — it is inlined into and shared
  with `hooks/git-gate.js`, so changing it would have spilled into the git gate, which is out of scope
  and would have changed confirmation behavior the user asked to keep. The detection lives in the
  opsgate hook's own prefix scan of the raw segment, and the disposition *is* a policy change. The
  observation behind the old claim was right (`normalize()` does strip the assignment, and the policy
  layer does therefore never see it in argv); the conclusion drawn from it was not, because argv is not
  the only place the fact can be read from.
- `docker context use prod` was annotated "a pre-existing regression from the boundary re-drawing, not
  caused by the push fix". The causal attribution stands — but it was used to justify leaving the gap
  open, and the fix is a reclassification, not a redesign.

`DOCKER_HOST` remains the most serious of the three: it is the documented way to point the CLI at
another daemon, and it is the form a user is most likely to have in a shell profile.

**Known over-tightening, stated rather than implied.** `DOCKER_HOST=unix:///var/run/docker.sock docker rm web`
now asks, although that socket is local: the gate does not distinguish the unix-socket form from a TCP
endpoint and errs toward asking. The opposite error is guarded as well — `docker run -e DOCKER_HOST=tcp://x img`
is **not** matched, because that assignment applies inside the container and does not move the CLI's own
target. Both are consequences of scanning only the environment prefix, which is the same positional
discipline `dockerRemoteEndpoint()` uses for `-H`.

Further cases where the gate is stricter than the semantics warrant, registered for the same reason.
Each row carries the **full arc** (HEAD / after the #127 boundary re-drawing / now), because a two-column
"before / after" here is what produced the direction errors of earlier rounds:

| Command | HEAD | After #127 | Now | Why it is stricter than necessary |
|---|---|---|---|---|
| `DOCKER_HOST= docker rm web` | ask | pass | **ask** | An empty value means "use the default local socket" — the opposite of a remote target — but the scan matches on the variable name and never inspects the value |
| `docker context --help` / `-h` | deny | pass | **deny** | `--help` is not a known context subverb, so it hits the fail-closed floor. Help is not a state change; the deny is the floor treating an unrecognized token as unknown. **Not a new tightening**: HEAD was deny too |
| `docker context use --help` / `use -h` | deny | pass | **ask** | `use` is a known target subverb, so the `--help` flag is not considered and the command asks. **Not a tightening relative to HEAD** — HEAD was `deny`, so this is a relaxation; it is listed because asking for a help screen is still stricter than warranted |
| `export DOCKER_HOST=…` / `unset DOCKER_HOST` / `docker rm -f web` | ask | ask | **ask** | The `unset` cancels the export, so the docker command targets the local daemon — but the flag is armed by the declaration and is never disarmed. Same value as HEAD, so not a regression |

None of these touches the floor in the dangerous direction — all err toward intercepting — and all are left
as they are because distinguishing them would mean value inspection, a help-flag special case, or tracking
`unset` respectively. The `unset` row is the one to watch: it is the only case where the gate knows a
variable was set and does not notice it was cleared.

**Still open, and not a docker defect: an option after a wrapper hides the whole command.**
`env -i DOCKER_HOST=tcp://prod:2375 docker rm -f web` still **passes** (measured), as does the bare
`env -i docker rm -f web`. The cause is upstream of the endpoint scan and upstream of this fix:
`normalize()` strips the `env` wrapper but leaves its option in place, so the first token is `-i`,
which is not an ops token, and the segment is discarded before any assessment happens. It is therefore a
general bypass, not a docker one — `env -i kubectl delete pod x` and `env -i terraform apply` also pass,
and the same applies to any value-taking wrapper option (`env -u FOO ...`, `sudo -u root ...`).

It is registered rather than fixed because it is **not a regression and not docker-specific**: measured
against the pre-change hook all of those were `pass` too, so this change neither caused nor widened them.
Closing it needs the lexer to skip a wrapper's options — a `bash-lex.js` change, which is out of the
authorised file set (it is inlined into `hooks/git-gate.js`) — or a hook-side pre-pass that would
duplicate lexer knowledge and add a second place to keep in sync. **No document here claims this form is
covered.** The rows below deliberately do not include it.

### State Changes (ask, approve before execution)

| Command | Risk | Decision | Description |
|------|------|------|------|
| `kubectl scale deployment/x --replicas=6` | L3 | ask | Changes replica count |
| `kubectl delete pod x` | L3 | ask | Deletes resource |
| `kubectl apply -f deployment.yaml` | L3 | ask | Applies configuration |
| `kubectl create ns payments` | L3 | ask | Creates resource |
| `kubectl rollout restart deploy/x` | L3 | ask | Triggers rolling restart |
| `kubectl --context=prod delete pod x` | L3 | ask | Flag precedes; still judged as write |
| `systemctl restart nginx` | L3 | ask | Service state change |
| `systemctl stop nginx` | L3 | ask | Service state change |
| `sudo systemctl restart nginx` | L3 | ask | Wrapper stripped before classification |
| `terraform apply` | L4 | ask | Changes infrastructure |
| `terraform destroy` | L4 | ask | Destroys infrastructure |
| `terraform import x y` | L4 | ask | Rewrites tfstate |
| `helm upgrade app chart` | L3 | ask | Changes release |
| `docker push reg/img:1` | L3 | ask | Publishes an image to a remote registry — the top-level form of container egress. NOT the only such form; the rows below are the same egress via other matching paths |
| `docker build --push -t reg/img:1 .` | L3 | ask | BuildKit `--push`: builds **and** publishes to a registry. locateVerb cannot see the flag (it is not in its option-takes-value table), so this is caught by an argv scan, not a verb test |
| `docker build --push=true -t reg/img:1 .` | L3 | ask | `=` spelling of the same boolean flag |
| `docker buildx build --push -t x .` | L3 | ask | buildx spelling of the same egress; verb is `buildx` |
| `docker buildx build --push=true -t x .` | L3 | ask | buildx + `=` spelling |
| `docker container push reg/img:1` | L3 | ask | Group verb `container` + standard push subverb |
| `docker image push reg/img:1` | L3 | ask | Group verb `image` + standard push subverb |
| `docker image build --push -t x .` | L3 | ask | Legacy `build` spelling: verb `image`, subverb `build` |
| `docker compose push` | L3 | ask | Group verb `compose` + standard push subverb |
| `docker build --output type=registry -t x .` | L3 | ask | Registry output target: same egress expressed as an output spec |
| `docker -H=tcp://prod:2375 rm -f web` | L3 | ask | Remote daemon target: the qualifier voids the local-development exemption |
| `docker -H=tcp://prod:2375 rmi img` | L3 | ask | Same; removes an image on another daemon |
| `docker -H=tcp://prod:2375 stop web` | L3 | ask | Same |
| `docker -H=tcp://prod:2375 kill web` | L3 | ask | Same |
| `docker -H=tcp://prod:2375 system prune -a` | L3 | ask | Same; mass-prunes another daemon's data |
| `docker --host=tcp://prod:2375 rm -f web` | L3 | ask | Long-form spelling of the same qualifier |
| `docker -Htcp://prod:2375 rm web` | L3 | ask | Attached short value (`-H<url>`) |
| `docker context use prod` | L3 | ask | Switches the **active** daemon target — sticky for the rest of the shell session, so every later docker call inherits it |
| `docker context create c` | L3 | ask | Creates a context entry, which can name a remote daemon |
| `docker context remove prod` | L3 | ask | Removes a context entry |
| `DOCKER_HOST=tcp://prod:2375 docker rm -f web` | L3 | ask | Remote endpoint named by **environment**. `normalize()` strips the `VAR=VAL` prefix before `assessCommand`, so the hook scans the raw segment and reports it; the exemption is voided in ops-policy.js |
| `env DOCKER_HOST=tcp://prod:2375 docker rm -f web` | L3 | ask | Same, behind the `env` wrapper (a recognized wrapper, skipped while scanning the prefix) |
| `export DOCKER_HOST=tcp://prod:2375 && docker rm -f web` | L3 | ask | Declaration on its own segment; the finding accumulates across segments, so the docker command that follows is judged against a remote daemon |
| `export DOCKER_HOST=tcp://prod:2375 && docker compose up -d` | L3 | ask | Same; a stack brought up on another daemon |
| `bash -c "export DOCKER_HOST=tcp://prod:2375; docker rm -f web"` | L3 | ask | Declaration inside a nested wrapper; the flag is written back from the inner segment, so the docker command after it is judged against a remote daemon |
| `docker context use --help` | L3 | ask | `use` is a known target subverb and `--help` is not considered. Registered under Known over-tightening — a help screen is not a state change |
| `DOCKER_HOST=tcp://prod:2375 docker build -t app .` | L3 | ask | Same voiding; builds on another daemon |
| `DOCKER_HOST=tcp://prod:2375 docker compose up -d` | L3 | ask | Same voiding; starts a stack on another daemon |
| `docker --context=prod rm -f web` | L3 | ask | `=`-form context qualifier |
| `docker --context prod rm -f web` | L3 | ask | Spaced context qualifier |
| `docker -c prod rm -f web` | L3 | ask | Short context qualifier |
| `docker --context=prod build -t app .` | L3 | ask | Building against another daemon's context |
| `docker -H=tcp://prod:2375 run -it ubuntu` | L5 | ask | Arbitrary program on a remote daemon (L5, as for any `run`) |
| `docker -H=tcp://prod:2375 exec -it c sh` | L5 | ask | Arbitrary shell inside a remote daemon's container |

### Uncontrollable Consequences (ask, must be approved by human oversight)

This tier uses `ask` not `deny`. `kubectl exec` is a **daily legitimate operation**;
mechanical rejection would block normal operations; its risk lies precisely in "consequences not determined by verb but by the
unknown command inside the container", so it needs human oversight approval, not being blocked by rules. This is consistent with OpsLoop's original classification
(`exec` belongs to `approval_required`, not `block`).

`kubectl` acts on a cluster, which is remote/production by construction, so it stays here. `docker run` /
`docker exec` moved to [Local Container Development](#local-container-development-pass-not-intercepted):
their blast radius is determined by whether the target is a local container or a production one, and the
hook — a pure function keyed by verb — cannot observe that. They keep L5 there so the severity stays visible.

| Command | Risk | Decision | Description |
|------|------|------|------|
| `kubectl exec -it x -- sh` | L5 | ask | Can execute arbitrary programs inside container |
| `kubectl exec x -- ls /` | L5 | ask | Can execute arbitrary programs inside container |
| `kubectl attach x` | L5 | ask | Can attach to container process |
| `kubectl cp /tmp/f x:/tmp/f` | L5 | ask | Can write arbitrary files to container |

### Remote Execution (ask, must be approved by human oversight)

`ssh` performs deep analysis: the remote command after the host is extracted and recursively
assessed against the same risk table. The ssh wrapping escalates the remote command's risk
by one tier (L0/L1/L2 -> L3, L3/L4/L5 stay), because remote execution adds blast radius.

`scp` / `rsync` are file transfer commands, but they are ops actions **only when a remote target
is named** — see [section 1](#1-why-operations-commands-need-an-independent-gate). A remote
transfer is L3; a local-to-local copy is not an ops action and is not managed here.

| Command | Risk | Decision | Description |
|------|------|------|------|
| `ssh user@host ls` | L4 | ask | Remote execution of an unknown command: `ls` is not an ops tool, so the remote argv classifies as unclassified L4, which `escalateRisk` leaves at L4 and ssh wrapping turns into ask |
| `ssh user@host kubectl get pods` | L3 | ask | Remote kubectl read-only (L0 escalated to L3 by ssh wrapping) |
| `ssh user@host kubectl delete pod x` | L3 | ask | Remote kubectl state change |
| `ssh user@host terraform apply` | L4 | ask | Remote terraform state change |
| `ssh -p 22 user@host helm list` | L3 | ask | Remote helm read-only (L0 escalated by ssh) |
| `scp f user@host:/tmp/` | L3 | ask | Remote file transfer |
| `scp f host:/tmp/` | L3 | ask | Remote file transfer (`host:path` without user) |
| `rsync -avz src/ user@host:/tmp/` | L3 | ask | Remote file sync |
| `rsync -a --rsh=ssh /a/ host:/b/` | L3 | ask | Remote transfer forced by the remote-shell option |

### Local File Transfer (NOT managed by opsgate)

A copy where neither side names a remote host. Outside opsgate's jurisdiction, handled by the
platform's default permission flow:

| Command | Risk | Decision | Description |
|------|------|------|------|
| `rsync -a --delete /a/src/ /b/dst/` | L0 | pass | Local-to-local copy, no remote target |
| `scp -r /a/ /b/` | L0 | pass | Local-to-local copy, no remote target |

### Local System Commands (NOT managed by opsgate)

The following are local system commands, not ops tools. They are outside opsgate's jurisdiction
and handled by the platform's default permission flow:

`rm`, `mkfs`, `mkfs.ext4`, `dd`, `shutdown`, `reboot`, `halt`, `poweroff`, `mkswap`

### Local Development Environments (managed by opsgate since 2026-10-11)

`wsl` (Windows Subsystem for Linux) and `dism` (Deployment Image Servicing and Management) configure the
**local** development environment. They do not act on remote or production infrastructure, but they are
now in the hook's `OPS_BINS` so that `scripts/lib/ops-policy.js`'s classification branches are reachable
from the hook path. Prior to this change, `wsl`/`dism` had classification logic in `ops-policy.js` but
were absent from `OPS_BINS`, making those branches dead code and the hook passing them by accident.

`wsl` classification (in `ops-policy.js`):

| Command | Risk | Decision | Description |
|------|------|------|------|
| `wsl --status` | L0 | pass | Read-only WSL query |
| `wsl -e uname -a` | L5 | ask | Arbitrary command execution inside a distro |
| `wsl --unregister Ubuntu` | L4 | ask | Destroys a distro filesystem |
| `wsl ls /` | L4 | deny | Unrecognized verb combination; not in WSL read-only allowlist |
| `wsl npm install` | L4 | deny | Unrecognized verb combination; not in WSL read-only allowlist |
| `wsl -d Ubuntu ls` | L4 | deny | `-d` is read-only but `ls` is not in the read-only set |

`dism` classification:

| Command | Risk | Decision | Description |
|------|------|------|------|
| `dism /get-features /online` | L0 | pass | Read-only DISM query |
| `dism /online /enable-feature /featurename:Containers` | L2 | ask | State change |
| `dism /online /disable-feature /featurename:Containers` | L2 | ask | State change |
| `dism /cleanup-image /restorehealth` | L4 | deny | Not in DISM allowlist |

**Reading the Decision column honestly:** unrecognized verb combinations within `wsl`/`dism` now
produce `deny` (unclassified), exactly like `kubectl frobnicate` or `docker frobnicate`. Read-only
queries pass; state changes ask; unrecognized verbs deny. The gate is cautious-execution, not
prohibition: every denied command can be executed after setting `HELLODEV_OPSGATE_MODE=allow-unclassified`
or adding the project directory to `HELLODEV_OPSGATE_SKIP_DIRS`.

### Risk Undetermined (deny-unclassified, governed by mode switch)

Only applies to verbs within known ops tools that cannot be classified. Not to be confused with
risk-based prohibition -- this is "cannot determine what this command does", not "determined it
is dangerous".

| Command | Risk | Decision | Description |
|------|------|------|------|
| `kubectl` | L4 | deny | No verb; cannot determine intent |
| `kubectl frobnicate pod x` | L4 | deny | Verb not in allowlist |
| `docker frobnicate x` | L4 | deny | Unknown container verb; fail-closed fallthrough preserved after the boundary re-drawing |
| `docker -H tcp://prod:2375 rm -f web` | L4 | deny | Spaced `-H <value>`: `locateVerb` lands on the URL as the verb, so the verb is unrecognized and the fail-closed floor catches it. Not an ask — asserted so a future `OPTION_TAKES_VALUE` edit cannot silently turn it into pass |
| `docker --host tcp://prod:2375 rm -f web` | L4 | deny | Same, long-form spelling |
| `docker -H=tcp://x frobnicate` | L4 | deny | A remote qualifier must **never** upgrade an unknown verb from deny to ask: the qualifier only voids the local exemption, it does not classify the verb |
| `docker context frobnicate x` | L4 | deny | Unknown `context` subverb. `context` is no longer pass-listed as a group, so an unrecognized subverb reaches the fail-closed floor instead of inheriting a pass — the same treatment as `docker frobnicate x` |
| `docker context --help` | L4 | deny | `deny`, not `pass`: `--help` is not a known context subverb. Registered under Known over-tightening — help is not a state change, and this was `pass` before the reclassification |
| `systemctl frobnicate nginx` | L4 | deny | Verb not in allowlist |
| `helm template x` | L4 | deny | Verb not in allowlist |
| `terraform unknown-cmd` | L4 | deny | Verb not in allowlist |

Default `deny-unclassified`, from OpsLoop hard constraint "unknown operations blocked by default; not auto-treated as read-only".
User can set `HELLODEV_OPSGATE_MODE=allow-unclassified` in shell or settings to fall back to pass-through.
**Agent must not set or modify this variable** -- same constraint as `HELLODEV_GIT_GATE_MODE`.

## 3.1 After Interception: Pause and Request Authorization (Authoritative)

When opsgate returns `ask` or `deny`, the agent's behavior is not discretionary. Both decisions
mean **the operation has not been authorized**; `deny` means "cannot classify this command" and
`ask` means "state change requires confirmation". In both cases the agent must pause and ask the user.

| Situation | Gate decision | Required agent behavior |
|---|---|---|
| Recognized state change or uncontrollable-consequence command | `ask` | Pause; report; request authorization; wait |
| Command within known ops tool but verb unclassifiable | `deny` | Pause; report; request authorization; wait |

**Important**: `deny` in opsgate means "cannot determine risk", not "prohibited". If the user
approves, the operation may proceed. The gate is cautious-execution, not prohibition.

The required sequence is:

1. **Pause.** Do not continue the remaining steps of the operation. Do not run other commands
   whose only purpose is to achieve what was just refused.
2. **Report.** State the exact intercepted command and the gate's reason, verbatim enough that the
   user can see which command and which rule triggered it. Do not paraphrase away the command.
3. **Request authorization.** Ask the user explicitly whether to authorize executing that operation.
4. **Wait** for the user's explicit confirmation. Proceed only after it arrives.
5. **If declined**, stop and say plainly what was not done.

For state-changing commands (`ask`), step 3 is not a bare "may I run this". See [3.2](#32-interruption-risk-assessment-authoritative):
the authorization request must carry an interruption-risk assessment whenever the target is production or a
stateful service.

Silence, timeout, an unanswered question, or the absence of a rejection are **not** authorization
(see [runtime boundaries](../../../references/runtime-adapters.md) on approval accounting).

The following are bypass attempts and are prohibited:

- Re-issuing the command through another tool, wrapper, nested shell, alias, or script.
- Rewording, reordering, splitting, or re-encoding the command to change the classification.
- Substituting a different command to produce the same effect while approval is pending.
- Modifying `HELLODEV_OPSGATE`, `HELLODEV_OPSGATE_MODE`, `HELLODEV_OPSGATE_SKIP_DIRS`, or the hook
  registration to make the interception stop.
- Any indirect route to the same effect, including delegating it to a sub-agent
  (sub-agents do not ask the user; see [Task Decomposition](../task/decomposition.md)).

Reading state to understand the situation is allowed and is not a bypass: a read-only query that
is genuinely a query, and that the gate classifies as read-only, is the correct way to gather
missing facts **for the report**. It is not a substitute for the refused write, and it does not
discharge the obligation to pause the refused operation and ask.

The user's own shell is outside this gate: the user may execute the exact command directly if they
choose. That is the user's decision, not the agent's substitute for approval.

The displayed `Command:` line is bounded at 200 characters so an oversized command cannot flood the
host interface. When it is bounded the message adds an explicit note, because the instruction above
it asks the agent to report the *exact* command: reporting a silently truncated string as if it were
complete would misrepresent what was stopped. The agent issued the command, so it can always
reproduce it in full.

The user-facing text emitted by `emitDeny` and `emitAsk` in [hooks/opsgate.js](../../../hooks/opsgate.js)
must carry this same instruction; regression assertions in [hooks/test-opsgate.js](../../../hooks/test-opsgate.js)
lock those elements so the runtime message cannot silently revert to encouraging a workaround.

## 3.2 Interruption-Risk Assessment (Authoritative)

> The ops gate is a **cautious-execution** gate, not a prohibition gate. Requesting authorization is the
> normal path for a state change; what must be earned is not silence but a plan that is safe to execute.

First, the distinction this section depends on. The decisions do **not** mean the same thing:

| Decision | Means | Has an authorization exit? |
|---|---|---|
| `pass` | Known read-only | Not applicable |
| `ask` | State change, not yet authorized | **Yes** -- after approval it may be executed |
| `deny` (unclassified) | Recognized ops tool, verb unclassifiable | **Yes** -- per-command escape via `opsApprove` credential; fallback: `HELLODEV_OPSGATE_MODE` or directory skip |

There is no risk-based prohibition in opsgate. Every recognized ops command can be executed
after user confirmation. Local system commands (`rm`, `dd`, `mkfs`, `shutdown`) are not ops
commands and are outside this gate's jurisdiction.

**Escaping `deny` after user approval**: when the hook would deny an unclassified command,
it first checks whether `.hello-dev/state.json` contains a valid, non-expired `opsApprove`
credential whose `intent.command` exactly matches the command. If found, the command **passes**
instead of being denied. This is the per-command in-band escape. The credential is created
by `state.js opsRegister` + `opsApprove`, which binds the approval to the exact command,
working directory, environment, and source document via `stepDigest`. Any change invalidates
the credential. Expired credentials (past `expiresAt`) are silently skipped. If no valid
credential exists, the two environment-variable exits below remain available:
1. Set `HELLODEV_OPSGATE_MODE=allow-unclassified` for that single invocation (or for the session).
2. Set `HELLODEV_OPSGATE_SKIP_DIRS=<dir-name>` to skip the gate entirely for the project directory.

### Trigger

The assessment is required **only** when the target is production **or** a stateful service. For any
other target the ordinary authorization request is sufficient — an assessment is not demanded for a
state change that cannot interrupt anything.

**Production is declared, not inferred.** `opsRegister` requires `--env <prod|staging|dev>`, and that
declared value is bound into `stepDigest`. So the first test is mechanical:

1. The step's declared `--env` is `prod` (visible as `Environment: prod` in `opsShow`).
   `opsRegister` prints an explicit `[PROD]` notice when this is the case, so a production step cannot
   be registered without the obligation having been surfaced at least once.

Why a declaration rather than a guess: inferring production from the free-text `--target` was measured
to be unsound. Substring-matching would classify `preprod`, `nonprod` and `prod-clone-dev` as
production, while missing a genuine production target named `payment-cluster` or `payments-blue`. A
wrong "not production" silently skips the assessment, which is the failure mode this section exists to
prevent — so the environment is stated by the registrant and the tool refuses rather than defaults:
`--env` is a closed enum, and a missing or unknown value is rejected instead of coerced.

The remaining tests cover what a declaration cannot capture:

2. The live cluster context is production (`kubectl config current-context` resolves to a production
   context). This is a read-only query and is `pass`, so gathering it is not a bypass.
3. The user says the target is production.
4. The operation touches a **stateful service** regardless of declared environment — see the
   definition below. A `staging` declaration does not exempt a step from this test.

"Stateful service" is satisfied when the operation touches anything whose continuity of data or
identity is not reproducible from a declarative source: databases and their storage, message queues,
persistent volumes, stateful sets, singletons that hold session or lock state, or a service whose
restart is the operation itself.

**If the environment cannot be determined, treat the trigger as met and say so.** An explicit
"unknown, therefore assessed" is honest; an unstated assumption of "probably not production" is not.
This mirrors the gate's own fail-closed default at the classification layer, applied at the
authorization layer.

Note what the declaration does and does not buy. It makes the *production* trigger mechanical and
auditable for registered steps, and it makes an environment change invalidate the approval (because
`env` is part of `stepDigest`). It does **not** verify that the declaration is true, and it does
**not** cover a `staging` step that happens to touch a stateful service — tests 2–4 above remain
judgment calls at the pause point.

### Required content of the authorization request

When the trigger is met, the request in step 3 of section 3.1 must state all three of:

1. **Interruption surface** — what stops serving, for how long, and who notices.
2. **Why it will not interrupt, or what the interruption is** — the specific reason the impact is
   contained: replica surplus, `maxUnavailable` / `maxSurge`, a PodDisruptionBudget, leader election,
   a drain before restart, or a maintenance window. Naming the mechanism is the point; "should be fine"
   is not a reason.
3. **Rollback point** — what restores the previous state and how long that takes. A change with no
   rollback point is a change that cannot be authorized at this layer.

If the impact cannot be bounded, do not present the operation as safe. State that the impact is
unbounded, say what fact is missing, and let the user decide with that in view.

### Where this binds, and what is deliberately not added

- **Hook message.** The text emitted by `emitAsk` in [hooks/opsgate.js](../../../hooks/opsgate.js)
  carries this obligation, because that text is the only instruction the agent receives at the moment
  it is stopped. The obligation is emitted unconditionally rather than conditioned on production:
  the hook cannot observe the target, so it also cannot decide which message variant to emit. The
  conditional lives in the agent's judgment at the pause point, where the target is knowable.
- **Not a fourth classification layer.** `opsgate` is a pure function by design (no network, no
  filesystem reads — see its header constraint 1). It cannot see replica surplus, PDBs, or whether
  the command is aimed at production, so a "would this interrupt service" rule placed *inside* the
  hook could only guess. A guessed `pass` is worse than an explicit `unknown`.
- **The declared environment is a bound field, not a display hint.** `--env` is required by
  `opsRegister`, validated against a closed enum in
  [scripts/lib/ops-approval.js](../../../scripts/lib/ops-approval.js) (`ENVIRONMENTS`), and written
  into the execution intent, so it participates in `stepDigest`. Consequence, accepted deliberately:
  changing only the declared environment invalidates an existing approval. That is correct —
  a step declared `prod` carries a different obligation than the same command declared `staging`, so
  the earlier approval must not carry over. `opsShow` prints the declared environment, and
  `opsStatus` verifies credentials against the digest that includes it.
  This is the **one** ops field added to state; it is read by `opsShow`/`opsStatus` and by
  `check-state-fields`' criterion, so it is not a declared-but-unused capability.
- **Explicitly not added: no env-derived branch inside the hook.** The hook still emits the same
  message regardless of environment, because it cannot see the registered step at all.

### Explicit limitations

- This is a **discipline constraint with one enforced foothold, not a complete machine check.**
  What the code enforces: `--env` must be present and must be one of `prod|staging|dev`, and the
  declared value binds into `stepDigest` (so an environment change voids the approval). What it does
  **not** enforce: that the declaration is true, that the assessment was actually produced, and the
  stateful-service test. Nothing prevents an agent from declaring `staging` for a production target.
  The runtime message elements are asserted in
  [hooks/test-opsgate.js](../../../hooks/test-opsgate.js) so the text cannot silently lose them.
- The risk table is keyed by **verb**, not by blast radius. `kubectl apply -f` and
  `kubectl rollout restart` are both L3; `kubectl get pods` is L0 against any cluster. A verb-keyed
  table cannot represent "is this target production", which is why the trigger above lives at the
  authorization layer instead of in the table.
- Consistent with section 7: without an Environment Observer and an Evidence Store, observations made
  at approval time cannot be compared with the conditions at execution time. This section therefore
  requires the assessment to be *stated*, and does not claim it is *verified*.

## 4. Execution Intent Approval (stepDigest)

Risk gate solves "should it be blocked"; stepDigest solves "exactly which operation was approved".

HelloDev's existing `gitdec` bookkeeping only writes `{at, decision, reason, stage}` -- does not bind command,
does not bind digest; logs can be rewritten to anything. OpsLoop's `stepDigest` binds **immutable execution intent**:

- SHA-256 of source runbook and source line number
- Target environment and resource, execution identity
- argv, working directory, environment variables, timeout
- Success criteria, failure strategy, rollback reference
- Policy Engine's risk conclusion

Any field change immediately invalidates the approval. Rollback, retry, cleanup are all **new write steps** requiring new approval.

**Agent must not create approval basis on behalf of user**, and must not interpret task-level consent as specific step approval.

## 5. Stage Mapping

Operations runbook follows `other` path:

| HelloDev Stage | Actual Meaning for Ops Tasks |
|---|---|
| Bootstrap | Find runbook; confirm target environment and execution identity |
| Requirement | User confirms what to change and to what extent |
| Implementation | Compile runbook -> policy classification -> step-by-step approval -> generate plan |
| Testing | Verification step: auto-verify success criteria |
| Review | Runbook and actual target consistency review |
| Ship | Results, verification evidence, limitations |

`execution` / `recovery` are not independent stages; they belong to Implementation's internal per-step execution protocol.

## 6. State Consolidation

Approval state stored in **one place**: `ops` section of `.hello-dev/state.json` (schema 1, coexisting with existing fields).
No `.opsloop/` or second state CLI maintained -- HelloDev's state protocol explicitly requires single active state file.

| Concern | Landing Point |
|--------|------|
| Command risk classification | `hooks/opsgate.js` + `scripts/lib/ops-policy.js` (shares risk table with runbook validation) |
| Execution intent summary and credentials | `scripts/lib/ops-approval.js` |
| Approval and gate state | `ops` section of `.hello-dev/state.json`, via `scripts/state.js opsRegister/opsApprove/opsStatus` |
| Runtime state progression | `stage` section of `.hello-dev/state.json` (existing mechanism; no separate system) |

State is leaner than upstream implementation: does not preset `drift_detected` / `approval_expired` type **dead states with no outgoing edges**;
expiration and invalidation determined in real-time by `opsStatus` at the gate -- avoids "state shows approved but credentials have expired".

## 7. Explicit Limitations

- Currently `executionSupported=false`: does not connect to servers, manage credentials, or execute any infrastructure commands.
- Hook only parses Bash tool's command text; aliases, wrappers, indirect execution are not provably covered.
- Whether the host actually registered and loaded opsgate must be verified in actual runtime environment; unit tests cannot infer.
- `opsStatus` validates credential authenticity but **does not authenticate user identity**: CLI cannot determine whether
  "approved" in conversation came from the actual person. The real identity boundary is in the host's permission flow.
- Before having Environment Observer (drift detection) and Evidence Store (execution evidence retention),
  "observations at approval time" and "actual conditions at execution time" cannot be compared -- this is a prerequisite for real execution.

```bash
node scripts/inline-hooks.js --check
node hooks/test-opsgate.js
node scripts/check-opsgate-consistency.js
node scripts/test-ops-approval.js
bash scripts/test-ops-approval.sh
```

`inline-hooks.js --check` is **not optional** and belongs first, because it is the only check that
protects the source modules. `hooks/opsgate.js` is a **generated copy**: `scripts/inline-hooks.js`
inlines `scripts/lib/bash-lex.js` + `scripts/lib/ops-policy.js` into it between marker comments, and
`hooks/test-opsgate.js` exercises the *generated* artifact. Running `test-opsgate.js` alone therefore
**does not protect the source module at all** — editing only `scripts/lib/ops-policy.js` (the file that
holds the risk table) leaves the hook running the old inlined logic, and the suite stays green. That was
measured, not assumed: a mutation to the source module alone kept `test-opsgate.js` at a full green
(132/132 at the time). The consistency of the two files is guaranteed by `inline-hooks.js --check`
**and by nothing else**, so the verification entry point must run it.

These commands verify classification behavior and documentation consistency; they do not verify host
installation. See [runtime-adapters.md](../../../references/runtime-adapters.md) for host capability
boundaries.
