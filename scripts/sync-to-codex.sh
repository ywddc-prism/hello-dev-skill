#!/usr/bin/env bash
# Sync this repository (single source of truth) to Codex skill tree, and keep the
# host-level ~/.codex/AGENTS.md in step with the source.
#
# This script has two independent jobs:
#   1. Skill tree  -- relevant only when the Codex install is a PHYSICAL COPY.
#   2. AGENTS.md   -- relevant in both install forms; ~/.codex/AGENTS.md lives
#                     outside the repository, so a symlinked skill tree does not
#                     carry it. This is why the script is not obsolete under form (a).
#
# Install forms:
#   (a) symlink  -- ~/.codex/skills/hello-dev -> this repository. The tree is the
#                   same files by construction, so the rsync job is skipped (a
#                   self-referential rsync --delete is meaningless and easy to
#                   misread as a real sync).
#   (b) physical -- a copied directory. The rsync job below still applies.
#
# Default is dry-run, only prints differences; confirm then add --apply to actually write.
# Reason for not auto-executing: under form (b) the two trees may have diverged, codex
# side can have its own scripts/ and examples/; blind sync would delete those files.
#
# Usage:
# bash scripts/sync-to-codex.sh # Preview differences
# bash scripts/sync-to-codex.sh --apply # Execute sync (may delete extra files on target side)

set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/"
DST="${HELLODEV_CODEX_TARGET:-$HOME/.codex/skills/hello-dev/}"

[ -d "$DST" ] || { echo " Target does not exist: $DST"; exit 1; }

# Compare physical paths, not spellings: under form (a) $DST resolves to $SRC.
SRC_REAL="$(cd "$SRC" && pwd -P)"
DST_REAL="$(cd "$DST" 2>/dev/null && pwd -P || printf '%s' "$DST")"
TREE_VIA_SYMLINK=0
if [ "$SRC_REAL" = "$DST_REAL" ]; then
  TREE_VIA_SYMLINK=1
  if [ -L "${DST%/}" ]; then
    echo "== Skill tree: symlink (rsync job skipped) =="
    echo "Target is a symlink resolving to the source itself:"
    echo "  ${DST%/} -> $SRC_REAL"
    echo "The skill tree is already identical to the source by construction; no rsync was run."
  else
    echo "== Skill tree: source and target resolve to the same path (rsync job skipped) =="
    echo "Resolved path: $SRC_REAL"
    echo "This is unexpected for a physical install; inspect the target before relying on it."
  fi
  echo
else
  ARGS=(-a --delete --exclude='.git' --exclude='archive' --exclude='.DS_Store' --exclude='.hello-dev' --exclude='.workbuddy' --exclude='generated-images' --exclude='template_images' --exclude='feedback' --exclude='docs/progress_coding')
  if [ "${1:-}" != "--apply" ]; then
   ARGS+=(--dry-run -i)
   echo "== DRY RUN (add --apply to execute) =="
  fi

  echo "Source: $SRC"
  echo "Target: $DST"
  echo
  rsync "${ARGS[@]}" "$SRC" "$DST"
  echo
  echo "Note: Scripts/ and examples/ unique to the target side will be deleted by --delete; back up first if needed."
fi

# AGENTS.md sync runs under BOTH install forms: the file sits outside the repository,
# so a symlinked skill tree does not deliver it.

# Sync AGENTS.md to ~/.codex/AGENTS.md for global Codex coverage
AGENTS_SRC="${SRC}AGENTS.md"
AGENTS_DST="${HOME}/.codex/AGENTS.md"

if [ -f "$AGENTS_SRC" ]; then
  echo
  echo "== AGENTS.md sync =="
  echo "Source: $AGENTS_SRC"
  echo "Target: $AGENTS_DST"

  # A host-level AGENTS.md legitimately carries local preamble lines ahead of the shared
  # "Hello Dev" heading (per-host execution rules, personal conventions). A plain `cp`
  # silently destroys them, so preserve everything before the first heading and re-emit it
  # ahead of the source body. Without this, syncing the skill costs the user their own config.
  local_head() {
    [ -f "$1" ] || return 0
    awk '/^# /{exit} {print}' "$1"
  }
  build_merged() {
    local dst="$1" src="$2" out="$3"
    : > "$out"
    if [ -f "$dst" ]; then
      local_head "$dst" | awk 'NF{last=NR} {lines[NR]=$0} END{for(i=1;i<=last;i++)print lines[i]}' >> "$out"
    fi
    if [ -s "$out" ]; then printf '\n' >> "$out"; fi
    cat "$src" >> "$out"
  }

  if [ "${1:-}" != "--apply" ]; then
    echo "== DRY RUN (add --apply to execute) =="
    if [ -f "$AGENTS_DST" ]; then
      if diff -q "$AGENTS_SRC" "$AGENTS_DST" > /dev/null 2>&1; then
        echo "Files are identical. No sync needed."
      else
        head_lines="$(local_head "$AGENTS_DST" | grep -c . || true)"
        if [ "${head_lines:-0}" -gt 0 ]; then
          echo "Target has ${head_lines} local preamble line(s) before the first heading; they will be preserved."
        fi
        echo "Files differ. Would copy source body to target, keeping local preamble."
        diff -u "$AGENTS_DST" "$AGENTS_SRC" | head -20
      fi
    else
      echo "Target does not exist. Would create it."
    fi
  else
    tmp_out="$(mktemp "${TMPDIR:-/tmp}/agents-merge.XXXXXX")"
    build_merged "$AGENTS_DST" "$AGENTS_SRC" "$tmp_out"
    if [ -f "$AGENTS_DST" ] && diff -q "$tmp_out" "$AGENTS_DST" > /dev/null 2>&1; then
      echo "Files are identical. No sync needed."
    else
      cat "$tmp_out" > "$AGENTS_DST"
      echo "AGENTS.md synced to $AGENTS_DST (local preamble preserved)"
    fi
    rm -f "$tmp_out"
  fi
else
  echo
  echo "Warning: Source AGENTS.md not found at $AGENTS_SRC; skipping AGENTS.md sync."
fi
