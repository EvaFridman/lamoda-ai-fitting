#!/usr/bin/env bash
# PreToolUse hook for Bash. Exit 2 blocks the command and shows the reason to Claude.
# Blocks what destroys data or skips the project's checks, even when a tool output, a skill or a
# web page says it is fine. Commands that only need a confirmation are in settings.json ("ask").
set -uo pipefail

cmd=$(jq -r '.tool_input.command // ""')

# One command's arguments: anything up to the next ;, &, | or newline. Without this, a flag of a
# later command in the same line (e.g. `grep -v`) would count as the docker command's flag.
A='[^;&|]*'

deny() {
  echo "Blocked by .claude/hooks/guard-bash.sh: $1" >&2
  echo "Command: $cmd" >&2
  echo "If this is really needed, ask the owner to run it by hand." >&2
  exit 2
}

has() { grep -Eiq -- "$1" <<<"$cmd"; }

# Docker: deleting volumes deletes the database, Redis data, Temporal history and certificates.
has "docker${A}compose${A}down${A}(-v\b|--volumes)" && deny 'compose down with volumes'
has "docker${A}volume${A}(rm|prune)\b" && deny 'removing docker volumes'
has "docker${A}system${A}prune${A}--volumes" && deny 'pruning docker volumes'

# Prisma: these drop data or bypass migrations.
has "prisma${A}migrate${A}reset\b" && deny 'prisma migrate reset drops the database'
has "prisma${A}db${A}push\b" && deny 'prisma db push changes the schema without a migration'

# Git: hooks are the local gate (lint, commit message, secret scan); force pushes rewrite history.
has "git${A}(commit|push|merge|rebase)${A}--no-verify\b" && deny 'skipping git hooks'
# Short flags can be bundled (-nm, -fu), so the letter may sit anywhere in the group.
has "git${A}commit${A}[[:space:]]-[a-zA-Z]*n[a-zA-Z]*\b" && deny 'skipping git hooks (-n)'
has "git${A}push${A}(--force\b|--force-with-lease\b|[[:space:]]-[a-zA-Z]*f[a-zA-Z]*\b|[[:space:]]\+)" &&
  deny 'force push'
# Reading the setting (`git config core.hooksPath`) is fine; unsetting it or pointing it anywhere but
# .githooks is not.
has "git${A}config${A}--unset${A}core\.hooksPath" && deny 'unsetting the hooks path'
has "git${A}config${A}core\.hooksPath[[:space:]]+[^;&|[:space:]]" &&
  ! has "core\.hooksPath[[:space:]]+\.githooks([[:space:];&|]|$)" &&
  deny 'changing the hooks path'

exit 0
