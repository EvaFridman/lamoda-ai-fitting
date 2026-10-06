#!/usr/bin/env bash
# PreToolUse hook for Bash in read-only agents (e.g. .claude/agents/spec-finder.md). Exit 2 blocks
# the command and shows the reason to the agent. Bash is there only to find and search files; reading
# them is the Read tool's job. Nothing that writes, deletes or runs other programs gets through.
set -uo pipefail

cmd=$(jq -r '.tool_input.command // ""')

deny() {
  echo "Blocked by .claude/hooks/read-only-guard.sh: $1" >&2
  echo "Command: $cmd" >&2
  exit 2
}

# Single-quoted text is literal to the shell, so search patterns in '...' may hold | $ or &.
bare=$(sed "s/'[^']*'//g" <<<"$cmd")
[[ "$bare" == *"'"* ]] && deny 'unbalanced single quote'
[[ "$bare" =~ [\;\&\|\<\>\`\$] || "$bare" == *$'\n'* ]] &&
  deny "one plain command per call: no ; & | < > \` \$ or newlines outside single quotes; quote patterns in '...'"

case "$cmd" in
  ls | 'ls '* | 'grep '* | 'rg '*) ;;
  'find '*)
    [[ "$bare" =~ [[:space:]]-(exec|execdir|ok|okdir|delete|fprint|fprint0|fprintf|fls)([[:space:]]|$) ]] &&
      deny 'find may only list files'
    ;;
  'git diff'* | 'git log'* | 'git show'* | 'git status'* | 'git ls-files'* | 'git blame'*)
    [[ "$bare" =~ [[:space:]](--output|-o)([[:space:]=]|$) ]] && deny 'git output to a file'
    [[ "$bare" =~ [[:space:]]--ext-diff([[:space:]]|$) ]] && deny 'external diff programs'
    ;;
  *) deny "allowed: ls, grep, rg, find (no -exec/-delete), git diff|log|show|status|ls-files|blame. Read files with the Read tool." ;;
esac
# rg can run a preprocessor program on each file.
[[ "$cmd" =~ ^rg && "$bare" =~ [[:space:]](--pre|--pre-glob)([[:space:]=]|$) ]] && deny 'rg --pre runs programs'
# Secrets stay unread (settings.json denies Read on them). Claude Code's grep and rg skip git-ignored
# files, so only a direct path or turning that off reaches them.
[[ "$cmd" =~ \.env($|[^.a-zA-Z_]|\.local) || "$cmd" == *vault.yml* ]] && deny 'secret files are not read'
[[ "$bare" =~ [[:space:]](-u+|--no-ignore[a-z-]*)([[:space:]=]|$) ]] && deny 'git-ignored files are not searched'
exit 0
