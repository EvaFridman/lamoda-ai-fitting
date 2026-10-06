#!/usr/bin/env bash
# PreToolUse hook for the test-writer agent (.claude/agents/test-writer.md). Exit 2 blocks the call
# and shows the reason to the agent. The agent may only write api test files and run the api tests,
# typecheck and ESLint: it must not change the code under test or run anything else.
set -uo pipefail

input=$(cat)
tool=$(jq -r '.tool_name // ""' <<<"$input")

deny() {
  echo "Blocked by .claude/hooks/test-writer-guard.sh: $1" >&2
  exit 2
}

case "$tool" in
  Edit | Write)
    path=$(jq -r '.tool_input.file_path // ""' <<<"$input")
    rel=${path#"$CLAUDE_PROJECT_DIR"/}
    [[ "$rel" == *..* ]] && deny "path with '..': $path"
    [[ "$rel" =~ ^api/src/.+\.spec\.ts$ || "$rel" =~ ^api/test/.+\.e2e-spec\.ts$ ]] ||
      deny "only api/src/**/*.spec.ts and api/test/**/*.e2e-spec.ts may be written, not $rel. Report bugs in the code instead of changing it."
    ;;
  Bash)
    cmd=$(jq -r '.tool_input.command // ""' <<<"$input")
    # No chaining, redirection or substitution: one allowed command per call.
    [[ "$cmd" =~ [\;\&\|\<\>\`\$] ]] && deny "one plain command per call, no ; & | < > \` or \$: $cmd"
    [[ "$cmd" =~ ^npm\ --prefix\ api\ (test|run\ test)(\ --\ .*)?$ ||
      "$cmd" == "npm --prefix api run typecheck" ||
      "$cmd" =~ ^npx\ eslint\ --max-warnings=0\ api/[^[:space:]]+(\ api/[^[:space:]]+)*$ ]] ||
      deny "allowed: 'npm --prefix api test [-- <vitest args>]', 'npm --prefix api run typecheck', 'npx eslint --max-warnings=0 api/<files>'. Got: $cmd"
    ;;
esac
exit 0
