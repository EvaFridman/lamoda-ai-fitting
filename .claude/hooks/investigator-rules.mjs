// Rules for Bash in the investigator agent (spec 0021 plan §6, Q3, Q17).
//
// Everything the read-only agents may run, plus one shape: `ssh ai-fitting <remote>`, optionally
// piped into one `rg` or `grep` that filters it. The remote command is one of a few read-only
// shapes on production: `docker logs` of a named container with a bound, the deploy state and
// the compose projects' list. Every ssh also asks the owner (`Bash(ssh:*)` in settings' `ask`).

import { Blocked, allowFlags, isSecret, splitPipeline, words } from './guard-lib.mjs';
import { GREP, RG, check as readOnly } from './read-only-rules.mjs';

export const HOST = 'ai-fitting';
const NGINX = 'ai-fitting-infra-nginx-1';
export const CONTAINERS = [
  'ai-fitting-blue-api-1',
  'ai-fitting-green-api-1',
  'ai-fitting-blue-web-1',
  'ai-fitting-green-web-1',
  'ai-fitting-worker-temporal-worker-1',
  'ai-fitting-backup-backup-1',
  NGINX,
];
const MAX_TAIL = 5000;
const DURATION = /^\d+[smh]$/;
const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
// nginx logs its own $request_id (32 hex) at the end of the line; a uuid or a bare id could be
// part of a path or query, and match every visitor's requests for it (Q22).
const NGINX_REQUEST_ID = /^request_id=[0-9a-f]{32}$/;
// nginx's error log is its container's stderr, which a pipe does not see (Q17).
const MERGE_STDERR = ' 2>&1';

const ALLOWED =
  `allowed: what read-only agents run, and ssh ${HOST} 'docker logs --tail <n> [--since <d>] ` +
  `[--until <d>] [-t] <container>' | 'cat /opt/ai-fitting/.deploy-state' | ` +
  `'docker compose ls', optionally piped into one rg or grep`;

/** `docker logs` flags and container; returns the container. */
function checkDockerLogs(args) {
  const seen = new Set();
  let container = null;
  for (let i = 0; i < args.length; i++) {
    let [flag, value] = args[i].split(/=(.*)/s);
    if (flag === '-t' || flag === '--timestamps') {
      if (value !== undefined) throw new Blocked(`${flag} takes no value`);
    } else if (['--since', '--until', '--tail'].includes(flag)) {
      if (value === undefined) {
        if (i + 1 >= args.length) throw new Blocked(`docker logs ${flag} needs a value`);
        value = args[++i];
      }
      if (flag === '--tail') {
        if (!/^\d+$/.test(value) || Number(value) > MAX_TAIL) {
          throw new Blocked(`docker logs --tail is a number up to ${MAX_TAIL}`);
        }
      } else if (!DURATION.test(value) && !STAMP.test(value)) {
        throw new Blocked(`docker logs ${flag} is a duration (10m) or an RFC 3339 stamp`);
      }
    } else if (flag.startsWith('-')) {
      throw new Blocked(
        `docker logs flag ${flag} is not allowed; allowed: --since --until --tail -t`,
      );
    } else {
      if (container !== null) throw new Blocked('docker logs takes one container');
      if (!CONTAINERS.includes(args[i])) {
        throw new Blocked(
          `unknown container ${JSON.stringify(args[i])}; allowed: ${CONTAINERS.join(', ')}`,
        );
      }
      container = args[i];
      continue;
    }
    if (seen.has(flag === '-t' ? '--timestamps' : flag)) throw new Blocked(`${flag} twice`);
    seen.add(flag === '-t' ? '--timestamps' : flag);
  }
  if (container === null) throw new Blocked('docker logs needs a container');
  // --since alone could bring the whole log (Q22): --tail is the bound, the times narrow it.
  if (!seen.has('--tail')) throw new Blocked(`docker logs needs --tail (at most ${MAX_TAIL})`);
  return container;
}

/** The ssh stage; returns the container whose logs it reads, or null. */
function checkSsh(args) {
  if (args[0] !== HOST) {
    throw new Blocked(`ssh: exactly ssh ${HOST} <command>, no options and no other host`);
  }
  if (args.length < 2) throw new Blocked(`ssh ${HOST} needs a command`);
  // ssh joins the words after the host with spaces and the remote shell parses them again, so
  // they are checked as a command of their own. OpenSSH parses options after the host too
  // (`ssh host -o …`); every allowed remote command starts with a plain word, so none gets there.
  let remote = args.slice(1).join(' ');
  const merged = remote.endsWith(MERGE_STDERR);
  if (merged) remote = remote.slice(0, -MERGE_STDERR.length);
  const argv = words(remote);
  if (argv.some(isSecret)) throw new Blocked('secret files are not read');

  let container = null;
  const shape = argv.join(' ');
  if (argv[0] === 'docker' && argv[1] === 'logs') {
    container = checkDockerLogs(argv.slice(2));
  } else if (shape !== 'cat /opt/ai-fitting/.deploy-state' && shape !== 'docker compose ls') {
    throw new Blocked(ALLOWED);
  }
  if (merged !== (container === NGINX)) {
    throw new Blocked(`only ${NGINX}'s logs, and they always, end in exactly 2>&1`);
  }
  return container;
}

/** The filter stage: rg or grep with one pattern, reading the pipe. */
function checkFilter(argv, container) {
  const [prog, ...args] = argv;
  if (container === NGINX) {
    // Q17, Q22: only the lines of one request, so -v, context and other flags are refused.
    if (
      !['rg', 'grep'].includes(prog) ||
      args.length !== 2 ||
      !['-F', '--fixed-strings'].includes(args[0]) ||
      !NGINX_REQUEST_ID.test(args[1])
    ) {
      throw new Blocked(`${NGINX}'s logs only through rg -F or grep -F 'request_id=<32 hex>'`);
    }
    return;
  }
  if (prog !== 'rg' && prog !== 'grep') throw new Blocked('a pipe goes only into rg or grep');
  const lists = prog === 'rg' ? RG : GREP;
  // No -e (the one positional is the pattern) and no --files (it lists paths, not the pipe).
  const positional = allowFlags(prog, args, {
    ...lists,
    long: (lists.long ?? []).filter((flag) => flag !== '--files'),
    withValue: lists.withValue.filter((flag) => flag !== '-e'),
  });
  if (positional.length !== 1) {
    throw new Blocked(`${prog} in a pipe takes one pattern and no files`);
  }
}

export function check(tool, input) {
  if (tool !== 'Bash') throw new Blocked(`unexpected tool ${JSON.stringify(tool)}`);
  const stages = splitPipeline(input.command, 2);
  const first = words(stages[0]);
  if (first.some(isSecret)) throw new Blocked('secret files are not read');

  if (first[0] !== 'ssh') {
    if (stages.length > 1) throw new Blocked('only ssh may be piped');
    readOnly(tool, input);
    return;
  }
  const container = checkSsh(first.slice(1));
  if (stages.length === 1) {
    if (container === NGINX) throw new Blocked(`${NGINX}'s logs only through a filter`);
    return;
  }
  const filter = words(stages[1]);
  if (filter.some(isSecret)) throw new Blocked('secret files are not read');
  checkFilter(filter, container);
}
