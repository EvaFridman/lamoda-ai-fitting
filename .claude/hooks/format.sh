#!/usr/bin/env bash
# PostToolUse hook for Edit/Write: format the changed file the way lint-staged would (the root
# Prettier binary, run from the root, so .prettierrc and .prettierignore apply).
set -uo pipefail

file=$(jq -r '.tool_input.file_path // empty')
root="${CLAUDE_PROJECT_DIR:-$(pwd)}"

# Only existing files inside the project; skip quietly before `npm ci` has run.
[ -n "$file" ] && [ -f "$file" ] || exit 0
case "$file" in "$root"/*) ;; *) exit 0 ;; esac
[ -x "$root/node_modules/.bin/prettier" ] || exit 0

cd "$root" || exit 0
node_modules/.bin/prettier --write --ignore-unknown --log-level warn "$file" >&2 ||
  { echo "format.sh: prettier failed on $file" >&2; exit 1; }
