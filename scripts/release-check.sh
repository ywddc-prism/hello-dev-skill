#!/usr/bin/env bash
# release-check.sh -- read-only source / installed copy / marked runtime evidence.
# PASS = the named check has evidence; FAIL = a demonstrated inconsistency;
# UNKNOWN = missing evidence. Config or trace PASS is not real host acceptance.
# Usage: bash scripts/release-check.sh [--json] [--hook-smoke]
# Host selection: HELLODEV_HOST, HELLODEV_SETTINGS, HELLODEV_SKILL_DIR.
# Exit 0 = no FAIL, 1 = one or more FAIL, 2 = usage error. No sync/registration.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
JSON=0; SMOKE=0
for a in "$@"; do
  case "$a" in
    --json) JSON=1 ;;
    --hook-smoke) SMOKE=1 ;;
    -h|--help) printf '%s\n' 'Usage: release-check.sh [--json] [--hook-smoke]; choose HELLODEV_HOST explicitly. Read-only; UNKNOWN is not PASS.'; exit 0 ;;
    *) printf 'Unknown argument: %s\n' "$a" >&2; exit 2 ;;
  esac
done
SRC_ROOT="$(pwd -P)"; FAIL=0; UNKNOWN=0; ROWS=()
add() {
  ROWS+=("$1|$2|$3|$4")
  case "$1" in FAIL) FAIL=$((FAIL+1));; UNKNOWN) UNKNOWN=$((UNKNOWN+1));; esac
}
read_version() {
  [ -f "$1/SKILL.md" ] || return 0
  awk '/^---[[:space:]]*$/ { n++; if(n>1)exit; next } n==1 && /^(  )?version:[[:space:]]*/ { v=$0; sub(/^(  )?version:[[:space:]]*/,"",v); print v; exit }' "$1/SKILL.md" | tr -d '"\r' | tr -d "'"
}
file_hash() {
  [ -f "$1" ] || { printf '%s' '-'; return; }
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | cut -c1-16
  elif command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -c1-16
  else printf '?'; fi
}
SRC_VER="$(read_version "$SRC_ROOT")"; SRC_HASH="$(file_hash "$SRC_ROOT/SKILL.md")"
[ -n "$SRC_VER" ] || { printf 'Cannot read source version\n' >&2; exit 2; }
if bash -n scripts/release-check.sh; then add PASS source 'release-check.sh syntax' 'bash -n passed'; else add FAIL source 'release-check.sh syntax' 'bash -n failed'; fi
if command -v node >/dev/null 2>&1; then add PASS source 'node runtime' "$(node --version)"; else printf 'Node runtime required\n' >&2; exit 1; fi
# Frontmatter may refer to several hosts or a fallback chain. Verify the actual
# source handlers here, not an arbitrarily extracted suffix of the command.
for name in git-gate.js opsgate.js; do
  if [ -f "$SRC_ROOT/hooks/$name" ]; then
    add PASS source 'hook script exists' "$name in source (not proof of selected install path)"
    if node --check "$SRC_ROOT/hooks/$name" >/dev/null 2>&1; then add PASS source 'hook script usable' "$name syntax passed"; else add FAIL source 'hook script usable' "$name syntax invalid"; fi
  else add FAIL source 'hook script exists' "$name missing in source"; fi
done
SYNC_EXCLUDES=()
while IFS= read -r ex; do [ -n "$ex" ] && SYNC_EXCLUDES+=(--exclude="$ex"); done < <(grep -o -- "--exclude='[^']*'" scripts/sync-to-codex.sh | sed "s/--exclude='//; s/'$//" | sort -u)
diff_count() {
  local output rc
  if ! command -v rsync >/dev/null 2>&1; then printf 'unknown'; return; fi
  output="$(rsync -a --delete --dry-run --itemize-changes "${SYNC_EXCLUDES[@]}" --exclude=release-check.sh "$SRC_ROOT/" "$1/" 2>/dev/null)"; rc=$?
  if [ "$rc" -ne 0 ]; then printf 'unknown'; else printf '%s\n' "$output" | grep -cE '^>f|^\*deleting' || true; fi
}
check_install() {
  local label="$1" dir="$2" ver hash count
  # A dangling symlink is a misconfigured install, not an absent one: `-e` follows the
  # link and would report "not installed", hiding the stale entry. Test the link itself
  # first so the condition is named accurately.
  if [ -L "${dir%/}" ] && [ ! -e "$dir" ]; then
    add FAIL install "$label symlink" "dangling symlink: ${dir%/} -> $(readlink "${dir%/}" 2>/dev/null || printf '?')"
    return
  fi
  if [ ! -e "$dir" ]; then add UNKNOWN install "$label" "not installed: $dir"; return; fi
  # Two legitimate install forms. A symlink pointing back at the source is NOT drift --
  # it is the same files by construction, so a content diff is meaningless there
  # (the rsync below would resolve target onto source and report a self-referential zero).
  if [ -L "${dir%/}" ]; then
    local resolved
    resolved="$(cd "$dir" 2>/dev/null && pwd -P || printf '')"
    ver="$(read_version "$dir")"
    if [ -z "$resolved" ]; then add FAIL install "$label symlink" 'broken or unreadable symlink target'
    elif [ "$resolved" = "$SRC_ROOT" ]; then
      if [ "$ver" = "$SRC_VER" ]; then add PASS install "$label symlink" "resolves to source; v$ver by construction"
      else add FAIL install "$label symlink" "resolves to source but version reads v$ver != v$SRC_VER"; fi
    else
      if [ "$ver" = "$SRC_VER" ]; then add PASS install "$label version" "v$ver matches source (foreign symlink target: $resolved)"
      else add FAIL install "$label version" "v$ver != v$SRC_VER (foreign symlink target: $resolved)"; fi
    fi
    return
  fi
  ver="$(read_version "$dir")"
  if [ -z "$ver" ]; then add FAIL install "$label version" 'existing target has no readable version'; return; fi
  if [ "$ver" = "$SRC_VER" ]; then add PASS install "$label version" "v$ver matches source"; else add FAIL install "$label version" "v$ver != v$SRC_VER"; fi
  hash="$(file_hash "$dir/SKILL.md")"; count="$(diff_count "$dir")"
  # Test the entry hash before the rsync-derived diff count. A differing hash is
  # already conclusive drift, and rsync is not present on every platform
  # (git-for-windows ships none), so consulting $count first would downgrade an
  # obvious mismatch to UNKNOWN instead of reporting it.
  if [ "$hash" != "$SRC_HASH" ]; then add FAIL install "$label content" "entry hash $hash != source $SRC_HASH"
  elif [ "$count" = 'unknown' ]; then add UNKNOWN install "$label content" 'entry hash matches; full content comparison unavailable (rsync missing)'
  elif [ "$count" = 0 ]; then add PASS install "$label content" 'entry hash matches; 0 differences'
  else add FAIL install "$label content" "$count differences; entry hash $hash"; fi
}
check_install claude "${HELLODEV_CLAUDE_TARGET:-$HOME/.claude/skills/hello-dev}"
check_install codebuddy "${HELLODEV_CODEBUDDY_TARGET:-$HOME/.codebuddy/skills/hello-dev}"
check_install workbuddy "${HELLODEV_WORKBUDDY_TARGET:-$HOME/.workbuddy/skills/hello-dev}"
check_install codex "${HELLODEV_CODEX_TARGET:-$HOME/.codex/skills/hello-dev}"
if grep -q '^hooks:' SKILL.md && grep -q 'matcher: "Bash"' SKILL.md; then add PASS registration 'Frontmatter declarations' 'declaration present only; injected CodeBuddy CLI skills do not register it'; else add FAIL registration 'Frontmatter declarations' 'missing declaration'; fi
# Reuse exactly the registration CLI selection and inspection contract.
# Do not aggregate unrelated host settings into a single registration PASS.
REG_LINES="$(node -e '
  const fs=require("fs"),path=require("path"),r=require("./scripts/register-hooks");
  let c; try {c=r.resolveHost();}catch(e){console.log("FAIL|host selection|"+e.message);process.exit(0);}
  console.log("INFO|selected host|"+c.host+"; "+c.reason);
  if(c.status!=="SELECTED") {for(const n of ["git-gate.js","opsgate.js"])console.log("UNKNOWN|settings registration("+n+")|"+c.reason);process.exit(0);}
  const explicit=!!process.env.HELLODEV_SETTINGS;
  const files=explicit ? [c.settings] : [c.settings,path.join(process.cwd(),"."+c.host,"settings.json"),path.join(process.cwd(),"."+c.host,"settings.local.json")];
  const found={"git-gate.js":[],"opsgate.js":[]};
  for(const f of files) {
    if(!fs.existsSync(f))continue;
    try {const cfg=r.readConfig(f).cfg; const result=r.inspectConfig(cfg,c);for(const n of Object.keys(found))if(result[n])found[n].push(f);}
    catch(e){console.log("FAIL|settings readable|"+f+": "+e.message);}
  }
  for(const n of Object.keys(found))console.log((found[n].length?"PASS":"UNKNOWN")+"|settings registration("+n+")|"+(found[n].join(", ")||"No selected direct Bash command; config presence does not prove loading"));
' 2>/dev/null)" || REG_LINES='FAIL|host selection|shared registration inspector unavailable'
while IFS= read -r line; do
  [ -n "$line" ] || continue
  st="${line%%|*}"; rest="${line#*|}"; item="${rest%%|*}"; detail="${rest#*|}"
  add "$st" registration "$item" "$detail"
done <<EOF_REG
$REG_LINES
EOF_REG
for name in git-gate.js opsgate.js; do
  if grep -q "tool_name !== 'Bash'" "hooks/$name" && grep -q 'matcher: "Bash"' SKILL.md; then
    item='Event matches payload'; [ "$name" = git-gate.js ] || item="Event matches payload($name)"; add PASS registration "$item" "$name handles Bash"
  else add FAIL registration "Event matches payload($name)" 'payload mismatch'; fi
  if grep -q "hookEventName: 'PreToolUse'" "hooks/$name" && grep -q '^  PreToolUse:' SKILL.md; then
    item='Hook event names'; [ "$name" = git-gate.js ] || item="Hook event names($name)"; add PASS registration "$item" 'PreToolUse'
  else add FAIL registration "Hook event names($name)" 'event mismatch'; fi
done
START_EPOCH="$(date +%s)"
report_runtime() {
  local result status detail
  result="$(node -e '
    const fs=require("fs"); const [file,gate,source,since]=process.argv.slice(1);
    const now=Date.now(),min=(Number(since)-60)*1000;
    const events=gate==="git-gate"?["inspect","ask","deny-unclassifiable"]:["inspect","ask","deny","pass-readable","deny-unclassifiable"];
    const records=[];let ignored=0;
    try{for(const line of fs.readFileSync(file,"utf8").split("\n")){
      if(!line.trim())continue;let d;try{d=JSON.parse(line);}catch{ignored++;continue;}
      const t=Date.parse(d&&d.at);
      if(!d||d.caller!=="host"||d.gate!=="hello-dev/"+gate||!events.includes(d.event)||!Number.isFinite(t)||t<min||t>now){ignored++;continue;}records.push(d);
    }}catch{console.log("UNKNOWN|no readable trace; host runtime not established");process.exit(0);}
    if(!records.length){console.log("UNKNOWN|no valid recent marked records; ignored "+ignored);process.exit(0);}
    const versions=[...new Set(records.map(d=>d.sourceVersion))];
    const mismatch=versions.filter(v=>typeof v==="string"&&v&&v!=="unknown"&&v!==source);
    const unknown=versions.some(v=>typeof v!=="string"||!v||v==="unknown");
    const status=mismatch.length?"FAIL":unknown?"UNKNOWN":"PASS";
    const detail=mismatch.length?"version mismatch: "+mismatch.join(", ")+" != source "+source:unknown?"valid records lack a known sourceVersion":"source v"+source+" matches all "+records.length+" valid records";
    console.log(status+"|"+detail+"; ignored "+ignored+"; marker is not authenticated host evidence");
  ' "$2" "$1" "$SRC_VER" "$START_EPOCH" 2>/dev/null)" || result='UNKNOWN|trace reader unavailable'
  status="${result%%|*}"; detail="${result#*|}"; add "$status" runtime "$3" "$detail"
}
report_runtime git-gate "${HELLODEV_GIT_GATE_TRACE:-/tmp/hello-dev-git-gate-trace.log}" 'runtime version'
report_runtime opsgate "${HELLODEV_OPSGATE_TRACE:-/tmp/hello-dev-opsgate-trace.log}" 'runtime version(opsgate.js)'
add UNKNOWN runtime 'host approval acceptance' 'Requires real host calls and observed ask/deny consumption for both hooks; not established by config or caller/version records'
probe_writable() {
  local tmpd log
  tmpd="$(mktemp -d)" || { add FAIL runtime "$3" 'cannot create isolated probe'; return; }
  # Node is a native binary, so under Git Bash (MSYS) it resolves a POSIX
  # '/tmp/...' trace path against the current drive (G:\tmp\...) instead of the
  # MSYS mount. The hook's appendFileSync then throws, its catch swallows the
  # error and no trace row appears, which this probe would misreport as the hook
  # being unable to write. Hand Node -- and only Node -- a native path; bash
  # keeps using the POSIX $tmpd for mkdir/cleanup.
  log="$tmpd/t.log"
  if command -v cygpath >/dev/null 2>&1; then log="$(cygpath -m "$log")"; fi
  # Scrub the inherited gate switches in a subshell instead of via `env -u`.
  # bash can unset and assign natively, and `env` is not reliably coreutils:
  # uv's installer has users create a ~/.local/bin/env PATH snippet, which
  # shadows /usr/bin/env and silently discards all of its arguments, so the
  # hook would never run at all. Both forms are identical where env is sane.
  if printf '%s' '{"tool_name":"Bash","tool_input":{"command":"git status"}}' | (
        unset HELLODEV_GIT_GATE HELLODEV_OPSGATE HELLODEV_GIT_GATE_SKIP_DIRS HELLODEV_OPSGATE_SKIP_DIRS
        export "${2}_TRACE=$log" "${2}_CALLER=release-check"
        node "$SRC_ROOT/hooks/$1"
      ) >/dev/null 2>&1 && node -e 'const fs=require("fs");const rows=fs.readFileSync(process.argv[1],"utf8").trim().split("\n").map(JSON.parse);if(!rows.some(d=>d.caller==="release-check"&&d.gate===process.argv[2]&&d.event==="inspect"))process.exit(1);' "$log" "hello-dev/${1%.js}" >/dev/null 2>&1; then
    add PASS runtime "$3" 'Isolated direct probe only; not a host call'
  else add FAIL runtime "$3" 'isolated direct probe failed'; fi
  rm -rf "$tmpd"
}
probe_writable git-gate.js HELLODEV_GIT_GATE 'Probe writable'
probe_writable opsgate.js HELLODEV_OPSGATE 'Probe writable(opsgate.js)'
for prefix in HELLODEV_GIT_GATE HELLODEV_OPSGATE; do
  key="${prefix}_MODE"; value="${!key:-fail-open}"; item='exception policy'; [ "$prefix" = HELLODEV_GIT_GATE ] || item='exception policy(opsgate.js)'
  case "$value" in fail-open|fail-closed) add PASS runtime "$item" "$key=$value";; *) add FAIL runtime "$item" "$key invalid: $value";; esac
done
parse_row() { local rest="$1"; P_ST="${rest%%|*}"; rest="${rest#*|}"; P_ZONE="${rest%%|*}"; rest="${rest#*|}"; P_ITEM="${rest%%|*}"; P_DETAIL="${rest#*|}"; }
if [ "$JSON" -eq 1 ]; then
  # JSON.stringify handles control characters in paths/reasons, not only quotes.
  printf '%s\n' "${ROWS[@]}" | node -e 'const fs=require("fs");const checks=fs.readFileSync(0,"utf8").trimEnd().split("\n").filter(Boolean).map(line=>{const [status,zone,item,...detail]=line.split("|");return{status,zone,item,detail:detail.join("|")};});console.log(JSON.stringify({source:process.argv[1],sourceVersion:process.argv[2],fail:checks.filter(r=>r.status==="FAIL").length,unknown:checks.filter(r=>r.status==="UNKNOWN").length,checks}));' "$SRC_ROOT" "$SRC_VER"
else
  printf 'Source v%s (%s)\n' "$SRC_VER" "$SRC_HASH"
  for row in "${ROWS[@]}"; do parse_row "$row"; printf '  %-7s [%-12s] %-34s %s\n' "$P_ST" "$P_ZONE" "$P_ITEM" "$P_DETAIL"; done
  printf '\nNo sync or host registration performed. Preview separately: bash scripts/sync-to-codex.sh\n'
  if [ "$SMOKE" -eq 1 ]; then
    printf '%s\n' 'Use only an approved documented host registration interface; confirm edited config in the host panel if required.' 'Default injected CodeBuddy CLI Skill frontmatter does not register hooks; do not silently enable untrusted hooks.' 'Collect real host call IDs and observed ask/deny handling for both hooks using harmless fixtures; caller=host is not authentication.' 'WorkBuddy Desktop loading remains UNKNOWN until its actual interface and consumed decisions are demonstrated.'
  fi
  if [ "$FAIL" -eq 0 ]; then printf 'WARN No FAIL, but %s UNKNOWN items (missing evidence, not a pass)\n' "$UNKNOWN"; else printf 'FAIL has %s FAIL items, plus %s UNKNOWN items\n' "$FAIL" "$UNKNOWN"; fi
fi
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
