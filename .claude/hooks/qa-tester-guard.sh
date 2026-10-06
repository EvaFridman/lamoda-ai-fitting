#!/usr/bin/env bash
# PreToolUse hook for Bash in the qa-tester agent (.claude/agents/qa-tester.md). Exit 2 blocks the
# command and shows the reason to the agent. The agent tests the local Docker stack: it may send
# requests to it and stop or start its services, nothing else. Stopping and starting a service also
# asks the owner ("ask" rules in .claude/settings.json).
set -uo pipefail

cmd=$(jq -r '.tool_input.command // ""')

deny() {
  echo "Blocked by .claude/hooks/qa-tester-guard.sh: $1" >&2
  echo "Command: $cmd" >&2
  exit 2
}

# Single-quoted text is literal to the shell, so URLs and JSON bodies in '...' may hold & or $.
# Everything outside single quotes must be one plain command.
bare=$(sed "s/'[^']*'//g" <<<"$cmd")
[[ "$bare" == *"'"* ]] && deny 'unbalanced single quote'
[[ "$bare" =~ [\;\&\|\<\>\`\$] || "$bare" == *$'\n'* ]] &&
  deny "one plain command per call: no ; & | < > \` \$ or newlines outside single quotes"

services='(postgres|redis|temporal|temporal-worker|api|web)'

if [[ "$cmd" =~ ^curl[[:space:]] ]]; then
  # Split the arguments the way the shell does, then: every URL or host-like argument is the local
  # stack; no flags that write or read local files, change where requests go, or upload files.
  reason=$(
    python3 - "$cmd" <<'PY'
import re, shlex, sys


def die(msg):
    print(msg)
    sys.exit(1)


local = re.compile(r"^https?://(localhost|127\.0\.0\.1):(3000|3001|8233)(?=[/?#]|$)")
hostlike = re.compile(r"^[\w.-]+\.[a-z]{2,}(:\d+)?([/?#].*)?$", re.I)
banned_long = {
    "--output", "--remote-name", "--remote-name-all", "--output-dir", "--create-dirs",
    "--upload-file", "--config", "--form", "--form-string", "--proxy", "--preproxy",
    "--resolve", "--connect-to", "--unix-socket", "--abstract-unix-socket", "--dump-header",
    "--cookie-jar", "--trace", "--trace-ascii", "--stderr", "--libcurl", "--netrc-file",
    "--cert", "--key", "--url",
}
banned_short = set("oOTKFxDcE")

try:
    args = shlex.split(sys.argv[1])[1:]
except ValueError as e:
    die(f"cannot parse the command: {e}")
urls = 0
for a in args:
    if a.startswith("@") or re.match(r"^-{1,2}[\w-]+=?@", a):
        die("curl may not send a local file (@...)")
    elif a.startswith("--"):
        if a.split("=", 1)[0] in banned_long:
            die(f"curl flag {a} writes or reads files or redirects the request")
    elif re.fullmatch(r"-[a-zA-Z]+", a):
        if banned_short & set(a[1:]):
            die(f"curl flag {a} writes or reads files or redirects the request")
    elif "://" in a or hostlike.match(a):
        if not local.match(a):
            die(f"only http://localhost:3000 (api), :3001 (web), :8233 (Temporal UI), not {a}")
        urls += 1
if urls == 0:
    die("curl needs an explicit http://localhost URL")
PY
  ) || deny "$reason"
  exit 0
fi

[[ "$cmd" =~ ^docker\ compose\ ps(\ .*)?$ ]] && exit 0
[[ "$cmd" =~ ^docker\ compose\ logs(\ --(tail|since)[=\ ][0-9a-z]+|\ --no-color|\ -t)*\ $services(\ $services)*$ ]] && exit 0
[[ "$cmd" =~ ^docker\ compose\ (stop|start|restart)\ $services(\ $services)*$ ]] && exit 0
[[ "$cmd" == 'docker compose up -d --wait' ]] && exit 0

deny "allowed: curl to the local stack, 'docker compose ps', 'docker compose logs [--tail N] <service>', 'docker compose stop|start|restart <service>', 'docker compose up -d --wait'"
