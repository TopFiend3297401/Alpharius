#!/usr/bin/env bash
# Gather everything needed to write a grounded AGENTS.md, in one call.
#
# Exists because OpenCode command templates do NOT expand backtick shell
# substitution (verified 1.18.19, 2026-08-23) — so the facts cannot be baked
# into the prompt and must be fetched by a single, fixed tool call instead.
#
# One call, no arguments, same output shape every time: nothing for a small
# model to get wrong.
#
# Install: see projects/opencode-configs/README.md. The tool inventory path can
# be overridden with ALPHARIUS_INVENTORY; by default it is the file installed
# next to this script.

set -uo pipefail

INVENTORY="${ALPHARIUS_INVENTORY:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/tool-inventory.md}"

cd "${1:-.}" || exit 1

section() { printf '\n===== %s =====\n' "$1"; }

section "PROJECT ROOT"
pwd

section "GIT"
git remote -v 2>/dev/null | head -2 || true
printf 'branch: '
git branch --show-current 2>/dev/null || echo "(not a git repository)"

section "TOP LEVEL"
ls -A 2>/dev/null | head -40

section "TRACKED FILES (first 200)"
git ls-files 2>/dev/null | head -200 || echo "(not a git repository)"

section "DIRECTORIES (2 deep)"
find . -maxdepth 2 -type d \
  -not -path '*/.git*' -not -path '*/node_modules*' -not -path '*/.venv*' \
  2>/dev/null | head -40

section "MANIFEST"
if   [ -f package.json ];   then cat package.json
elif [ -f pyproject.toml ]; then cat pyproject.toml
elif [ -f Cargo.toml ];     then cat Cargo.toml
elif [ -f go.mod ];         then cat go.mod
else echo "(no manifest found)"
fi

section "EXISTING AGENTS.md"
cat AGENTS.md 2>/dev/null || echo "(none - you are writing the first one)"

section "README (first 60 lines)"
head -60 README.md 2>/dev/null || echo "(no README)"

section "TOOL INVENTORY - COPY THIS BLOCK VERBATIM"
cat "$INVENTORY" 2>/dev/null || echo "(tool inventory not found at $INVENTORY - write 'not established' for the tools section)"

section "END"
