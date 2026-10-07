// Rules for Bash and the browser (Playwright MCP) in the qa-tester agent.
//
// The agent tests the local Docker stack and nothing else: curl to the api, web and Temporal UI
// with an allowlist of flags (no files written or read, no redirects, no proxies), and docker
// compose ps, logs, stop/start/restart of one service and `up -d --wait`. Stop, start and restart
// also ask the owner ("ask" rules in .claude/settings.json). Browser tools are allowlisted too: none
// that reads or writes local files or runs code outside the page.

import { Blocked, isSecret, words } from './guard-lib.mjs';

// api, web and Temporal UI of the default stack and of a second copy (README, "Вторая копия
// стека"). The agent's --allowed-origins lists the same ports (checked by guards.test.mjs).
export const PORTS = ['3000', '3001', '8233', '4000', '4001', '8234'];
const LOCAL_URL = new RegExp(
  `^https?://(localhost|127\\.0\\.0\\.1):(${PORTS.join('|')})([/?#].*)?$`,
);
const ALLOWED = `only http://localhost on ports ${PORTS.join(', ')}`;
const SERVICES = new Set(['postgres', 'redis', 'temporal', 'temporal-worker', 'api', 'web']);

// curl flags without a value; short ones may be bundled (-si).
const CURL_BOOL_LONG = new Set([
  '--silent',
  '--show-error',
  '--include',
  '--head',
  '--verbose',
  '--fail',
  '--fail-with-body',
  '--get',
  '--parallel',
  '--compressed',
  '--http1.1',
  '--http2',
  '--no-buffer',
]);
const CURL_BOOL_SHORT = 'sSiIvfGZN';

// curl flags with a value (next word, or after = for long ones): each returns a problem or null.
const NO_FILE = 'a value starting with @ reads a local file';
const anyValue = () => null;
const noFileValue = (v) => (v.startsWith('@') ? NO_FILE : null);
// -w @file reads the format from a file and prints it; %output{...} writes a file.
const writeOutValue = (v) =>
  noFileValue(v) ?? (v.includes('%output') ? '-w %output writes a file' : null);
const CURL_VALUE = {
  '-X': anyValue,
  '--request': anyValue,
  '-H': noFileValue,
  '--header': noFileValue,
  '-d': noFileValue,
  '--data': noFileValue,
  '--data-ascii': noFileValue,
  '--json': noFileValue,
  '--data-raw': anyValue,
  '--data-urlencode': (v) =>
    v.includes('@') ? '--data-urlencode with @ reads a local file' : null,
  '-m': anyValue,
  '--max-time': anyValue,
  '--connect-timeout': anyValue,
  '-w': writeOutValue,
  '--write-out': writeOutValue,
  '--parallel-max': anyValue,
  '-A': anyValue,
  '--user-agent': anyValue,
  '-e': anyValue,
  '--referer': anyValue,
  '-b': (v) => (v.includes('=') ? null : '-b without name=value reads a cookie file'),
  '--cookie': (v) => (v.includes('=') ? null : '-b without name=value reads a cookie file'),
};
const hasValue = (flag) => Object.hasOwn(CURL_VALUE, flag);

function checkCurl(args) {
  let urls = 0;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    let problem = null;
    if (a.startsWith('--') && a.includes('=')) {
      const [flag, ...rest] = a.split('=');
      if (!hasValue(flag)) throw new Blocked(`curl flag ${flag} is not allowed`);
      problem = CURL_VALUE[flag](rest.join('='));
    } else if (hasValue(a)) {
      if (i + 1 >= args.length) throw new Blocked(`curl flag ${a} needs a value`);
      problem = CURL_VALUE[a](args[++i]);
    } else if (CURL_BOOL_LONG.has(a)) {
      // allowed
    } else if (a.startsWith('-') && a.length > 1) {
      if (a.startsWith('--') || ![...a.slice(1)].every((c) => CURL_BOOL_SHORT.includes(c))) {
        throw new Blocked(
          `curl flag ${a} is not allowed (values go in the next word, e.g. -X POST; ` +
            'allowed short flags: -s -S -i -I -v -f -G -Z -N)',
        );
      }
    } else if (LOCAL_URL.test(a)) {
      urls++;
    } else {
      throw new Blocked(`${ALLOWED}, not ${JSON.stringify(a)}`);
    }
    if (problem) throw new Blocked(problem);
  }
  if (urls === 0) throw new Blocked('curl needs an explicit http://localhost URL');
}

function checkCompose(args) {
  const [sub, ...rest] = args;
  if (
    sub === 'ps' &&
    (rest.length === 0 || (rest.length === 1 && ['-a', '--all'].includes(rest[0])))
  ) {
    return;
  }
  if (['stop', 'start', 'restart'].includes(sub)) {
    if (rest.length === 1 && SERVICES.has(rest[0])) return;
    throw new Blocked(
      `docker compose ${sub} takes exactly one service: ${[...SERVICES].join(', ')}`,
    );
  }
  if (sub === 'up') {
    if (rest.length === 2 && rest.includes('-d') && rest.includes('--wait')) return;
    throw new Blocked("only 'docker compose up -d --wait' (no --build, no services)");
  }
  if (sub === 'logs') {
    let services = 0;
    for (let i = 0; i < rest.length; i++) {
      const a = rest[i];
      if (['--no-color', '-t', '--timestamps'].includes(a)) continue;
      if (['--tail', '--since'].includes(a) && /^[0-9a-z]+$/.test(rest[i + 1] ?? '')) {
        i++;
        continue;
      }
      if (/^--(tail|since)=[0-9a-z]+$/.test(a)) continue;
      if (SERVICES.has(a)) {
        services++;
        continue;
      }
      throw new Blocked(`docker compose logs: unexpected ${JSON.stringify(a)}`);
    }
    if (services > 0) return;
    throw new Blocked('docker compose logs needs a service');
  }
  throw new Blocked(
    'docker compose: ps, logs [--tail N] <service>, stop|start|restart <service>, up -d --wait',
  );
}

// Playwright MCP tools the agent may use; the same list is in `tools:` of .claude/agents/qa-tester.md.
// Left out on purpose: browser_run_code_unsafe (runs code in the server's Node process),
// browser_file_upload and browser_set_storage_state (read local files), browser_storage_state,
// browser_pdf_save, tracing, video and recording (write files), and debugging/config tools.
export const BROWSER_TOOLS = [
  'navigate',
  'navigate_back',
  'navigate_forward',
  'reload',
  'tabs',
  'close',
  'resize',
  'wait_for',
  'snapshot',
  'take_screenshot',
  'find',
  'generate_locator',
  'highlight',
  'hide_highlight',
  'click',
  'hover',
  'type',
  'press_key',
  'press_sequentially',
  'keydown',
  'keyup',
  'fill_form',
  'select_option',
  'check',
  'uncheck',
  'drag',
  'drop',
  'handle_dialog',
  'mouse_click_xy',
  'mouse_down',
  'mouse_up',
  'mouse_move_xy',
  'mouse_drag_xy',
  'mouse_wheel',
  'evaluate',
  'console_messages',
  'console_clear',
  'network_requests',
  'network_request',
  'network_clear',
  'network_state_set',
  'route',
  'route_list',
  'unroute',
  'emulate_media',
  'cookie_list',
  'cookie_get',
  'cookie_set',
  'cookie_delete',
  'cookie_clear',
  'localstorage_list',
  'localstorage_get',
  'localstorage_set',
  'localstorage_delete',
  'localstorage_clear',
  'sessionstorage_list',
  'sessionstorage_get',
  'sessionstorage_set',
  'sessionstorage_delete',
  'sessionstorage_clear',
  'verify_element_visible',
  'verify_list_visible',
  'verify_text_visible',
  'verify_value',
].map((t) => `mcp__playwright__browser_${t}`);

const FILE_KEYS = [
  'filename',
  'paths',
  'file',
  'files',
  'dir',
  'directory',
  'outputdir',
  'outputfile',
];

function checkBrowser(tool, input) {
  if (!BROWSER_TOOLS.includes(tool)) throw new Blocked(`browser tool ${tool} is not allowed`);
  // An explicit file name is resolved against the project root: it could overwrite any file.
  // Screenshots and snapshots without one go to .playwright-mcp/.
  // (`path` is not here: browser_cookie_set uses it for the cookie path.)
  const fileKey = Object.keys(input).find((k) => FILE_KEYS.includes(k.toLowerCase()));
  if (fileKey)
    throw new Blocked(`no ${fileKey}: files are named automatically in .playwright-mcp/`);
  // Every tool that takes a url (navigate, tabs) stays on the local stack.
  const urls = Object.entries(input)
    .filter(([k]) => k.toLowerCase() === 'url')
    .map(([, v]) => v);
  if (tool.endsWith('_navigate') && urls.length === 0) urls.push(undefined);
  for (const url of urls) {
    if (typeof url !== 'string' || !LOCAL_URL.test(url)) {
      throw new Blocked(`${ALLOWED}, not ${JSON.stringify(url)}`);
    }
  }
}

export function check(tool, input) {
  if (tool.startsWith('mcp__playwright__')) return checkBrowser(tool, input);
  if (tool !== 'Bash') throw new Blocked(`unexpected tool ${JSON.stringify(tool)}`);
  const argv = words(input.command);
  if (argv.some(isSecret)) throw new Blocked('secret files are not read');
  if (argv[0] === 'curl') return checkCurl(argv.slice(1));
  if (argv[0] === 'docker' && argv[1] === 'compose') return checkCompose(argv.slice(2));
  throw new Blocked(
    'allowed: curl to the local stack and docker compose ps|logs|stop|start|restart|up -d --wait',
  );
}
