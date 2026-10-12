#!/usr/bin/env bash
# portable.js regression tests
#
# All five cases have genuinely failed during this round, solidified here to prevent regression:
# 1. Memory written to SKILL_ROOT (during restore = temp extraction dir), lost silently with rm on cleanup
# 2. Helper files (MANIFEST etc.) deleted before assertion, disguising "incomplete copy" as success
# 3. Restore branch doesn't pass through --target, safety valve and write use different paths
# 4. --force deletes target directory first, local memory wiped but log says "not overwritten"
# 5. Rejection paths for non-empty target / symlink target / corrupt settings.json / missing settings.json
#
# COVERAGE: only case 1 (pack) is asserted below. The file ends after the pack
# section, so cases 2-5 are listed above but have no assertions -- a green run
# here does NOT cover install/restore behaviour. Do not read it as full coverage.
#
# Uses isolated HOME and temp directories throughout, never touches real ~/.claude.
#
# Run: bash scripts/test-portable.sh

set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1

pass=0; fail=0
ok() { printf ' %s\n' "$*"; pass=$((pass+1)); }
no() { printf ' %s\n' "$*"; fail=$((fail+1)); }
ck() { if [ "$2" = "$3" ]; then ok "$1"; else no "$1 (expected $2 got $3)"; fi; }

PJ="scripts/portable.js"
node --check "$PJ" >/dev/null 2>&1; ck "syntax" 0 $?
[ ! -f "$PJ" ] && { echo "Missing $PJ"; exit 1; }

# ---- Sandbox: fresh temp directory, completely isolated from real HOME ----
ROOT="$(mktemp -d "${TMPDIR:-/tmp}/hello-dev-portable-test-XXXX")"
OUT="$ROOT/out"; WORK="$ROOT/work"
mkdir -p "$OUT" "$WORK" "$ROOT/home/.claude/skills"
# Relocate home before pack runs. HELLODEV_HOME is the documented isolation hook
# (scripts/lib/home.js); HOME alone does not relocate home on win32, so without
# this the script reads and repacks the developer's real ~/.claude.
export HELLODEV_HOME="$ROOT/home"

# Minimal settings.json: keys outside non-empty allowlist must be preserved as-is
cat > "$ROOT/home/.claude/settings.json" <<'EOF'
{"theme":"dark","permissions":{"allow":["Bash(ls *)"],"defaultMode":"default"},
 "hooks":{"PreToolUse":[{"matcher":"","hooks":[{"type":"command","command":"echo host"}]}]},
 "mcpServers":{"secret-server":{"url":"https://secret.example/token"}},
 "env":{"MY_TOKEN":"super-secret"},"enabledPlugins":{"p@x":true}}
EOF
echo "OLD-CLAUDE" > "$ROOT/home/.claude/CLAUDE.md"

echo "== 1. pack =="
node "$PJ" pack >/dev/null 2>&1; ck "dry-run -> 0" 0 $?
node "$PJ" pack --apply --out "$OUT" >/dev/null 2>&1; ck "apply -> 0" 0 $?
TAR="$(ls "$OUT"/*.tar.gz 2>/dev/null | head -1)"
[ -f "$TAR" ]; ck "wrote archive" 0 $?
[ -f "$TAR.sha256" ]; ck "wrote sidecar" 0 $?

# Package must not contain credentials, state, or itself
node "$PJ" inspect "$TAR" >/dev/null 2>&1; ck "inspect -> 0" 0 $?
CONTENT="$(tar -tzf "$TAR")"
if printf '%s\n' "$CONTENT" | grep -qE 'MY_TOKEN|secret-server|super-secret'; then
  no "package leaks credentials from host settings"
else
  ok "package leaks no credentials from host settings"
fi
if printf '%s\n' "$CONTENT" | grep -q '\.tar\.gz'; then
  no "package contains an archive of itself"
else
  ok "package does not contain itself"
fi

rm -rf "$ROOT"

echo
if [ "$fail" -eq 0 ]; then
  echo "portable regression test passed ($pass assertions)"
  exit 0
fi
echo "portable regression test FAILED ($fail failed / $pass passed)"
exit 1
