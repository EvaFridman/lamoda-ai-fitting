// Counts the requests of one catalog visit in nginx's access log (spec 0014 O24, plan §5): the
// owner makes the visit in a browser, then this prints, per nginx location group, the total, the
// peak in one second and in two adjacent ones and the visit's length for that client address. The
// numbers set the page and `/media/` limits of T23 (3x the peak, 3x the photos); the burst comes
// from `peak/2s`, since `$time_local` has whole seconds and a burst across a second's edge is
// split in two.
//
// nginx logs a request when its answer ends: a streamed page counts in its last second, and a
// WebSocket only once it closes. So: start the visit at https://<SITE_DOMAIN>/catalog (the
// redirects of http:// and www. are logged as pages too, the log has no host), close the tab at
// its end, and note both times. Behind a VPN or a shared address other people's requests count
// too: measure without one.
//
// The server has no Node, and nginx's image sends its access log to the container's stdout, so the
// log comes over ssh and the script runs here. The owner runs it, not an agent. The address is the
// one nginx logs for the visitor: find it by the `X-Request-Id` of one of the visit's answers (the
// browser's DevTools), e.g.
//   ssh ai-fitting 'docker logs --since 15m ai-fitting-infra-nginx-1 2>/dev/null | grep -E "request_id=<id>$"'
// then measure between the visit's start and end (RFC 3339 times, e.g. 2026-10-22T14:00:00+03:00).
// awk keeps only that address's lines on the server: other visitors' addresses and paths never
// leave it, and are never saved to a file.
//   ssh ai-fitting 'docker logs --since <start> --until <end> ai-fitting-infra-nginx-1 2>/dev/null \
//     | awk -v a=<address> "\$1 == a"' | node scripts/measure-page-requests.mjs <address>
//
// Usage: node scripts/measure-page-requests.mjs <address> [log-file]   (default: stdin)

import fs from 'node:fs';

// `main_id` of deploy/nginx/templates/default.conf.template: address, user, time, request line,
// status. The request line may be anything a client sent, so only its method and target are read.
const LINE = /^(\S+) - \S+ \[([^\]]+)\] "(?:\S+ (\S+)[^"]*|[^"]*)" (\d{3}) /;
const TIME = /^(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2})$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// The main server's locations, in the order nginx picks them for these paths: `/healthz` and
// `/_next/static/` are apart from the pages because T23 answers the first with 404 and does not
// count the second in the page limit (only its plain GETs: nginx's `$edge_pages_key` counts an
// encoded path, another method or a Range as a page, which this grouping does not tell apart). A request line with no path (garbage nginx answers 400)
// reaches no location.
const GROUPS = [
  ['invalid', (path) => !path.startsWith('/')],
  ['health', (path) => /^\/api\/health/i.test(path)],
  ['socket', (path) => /^\/api\/socket\.io/i.test(path) || path.startsWith('/socket.io/')],
  ['auth', (path) => path.startsWith('/api/auth/')],
  ['api', (path) => path.startsWith('/api/')],
  ['media', (path) => path.startsWith('/media/')],
  ['static', (path) => path.startsWith('/_next/static/')],
  ['healthz', (path) => path === '/healthz'],
  ['pages', () => true],
];

/** Seconds since the epoch of nginx's `$time_local`, or null for another shape. */
function parseTime(text) {
  const m = TIME.exec(text);
  const month = m && MONTHS.indexOf(m[2]);
  if (!m || month < 0) return null;
  const utc = Date.UTC(+m[3], month, +m[1], +m[4], +m[5], +m[6]) / 1000;
  return utc - (m[7] === '+' ? 1 : -1) * (+m[8] * 3600 + +m[9] * 60);
}

function groupOf(path) {
  return GROUPS.find(([, matches]) => matches(path))[0];
}

/**
 * One group's counts, from the seconds of its requests (seconds since the epoch): the peak in one
 * second and in two adjacent ones, since a burst that crosses a second's edge is split in two. A
 * tie goes to the earliest second: nginx's workers may log out of order.
 */
function summarize(seconds) {
  const perSecond = new Map();
  for (const second of seconds) perSecond.set(second, (perSecond.get(second) ?? 0) + 1);
  let peak = 0;
  let peakAt = null;
  let peak2s = 0;
  for (const [second, count] of perSecond) {
    if (count > peak || (count === peak && second < peakAt)) [peak, peakAt] = [count, second];
    peak2s = Math.max(peak2s, count + (perSecond.get(second + 1) ?? 0));
  }
  return { total: seconds.length, peak, peakAt, peak2s };
}

/**
 * The visit of `address` in the log's text: per group (in GROUPS' order, only groups with
 * requests) the total, the peak per second and its second, the RSC requests (`_rsc=`) and the
 * 429s; the same for all groups together; the visit's first and last second; and the lines that
 * are not `main_id`.
 */
export function measure(text, address) {
  const seconds = new Map(GROUPS.map(([name]) => [name, []]));
  const rsc = new Map();
  const limited = new Map();
  const all = [];
  let skipped = 0;
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    const m = LINE.exec(line);
    const second = m && parseTime(m[2]);
    if (!m || second === null) {
      skipped += 1;
      continue;
    }
    if (m[1] !== address) continue;
    const target = m[3] ?? '';
    const queryAt = target.indexOf('?');
    const path = queryAt < 0 ? target : target.slice(0, queryAt);
    const group = groupOf(path);
    seconds.get(group).push(second);
    all.push(second);
    if (queryAt >= 0 && /(?:^|&)_rsc=/.test(target.slice(queryAt + 1))) {
      rsc.set(group, (rsc.get(group) ?? 0) + 1);
    }
    if (m[4] === '429') limited.set(group, (limited.get(group) ?? 0) + 1);
  }
  const groups = GROUPS.map(([name]) => name)
    .filter((name) => seconds.get(name).length > 0)
    .map((name) => ({
      name,
      ...summarize(seconds.get(name)),
      rsc: rsc.get(name) ?? 0,
      limited: limited.get(name) ?? 0,
    }));
  const limitedTotal = [...limited.values()].reduce((sum, count) => sum + count, 0);
  return {
    groups,
    total: { ...summarize(all), limited: limitedTotal },
    // a loop, not Math.min(...all): a spread of a long visit overflows the stack
    first: all.reduce((min, second) => (min === null || second < min ? second : min), null),
    last: all.reduce((max, second) => (max === null || second > max ? second : max), null),
    skipped,
  };
}

/** The report the owner reads, one group per line. */
export function format(result, address) {
  const clock = (second) => new Date(second * 1000).toISOString().slice(11, 19);
  const lines = [
    `Requests of ${address}: ${clock(result.first)}–${clock(result.last)} UTC, ` +
      `${result.last - result.first + 1} s`,
    'group     total  peak/s  at (UTC)  peak/2s  rsc  429',
  ];
  const row = (name, g) =>
    `${name.padEnd(8)} ${String(g.total).padStart(6)} ${String(g.peak).padStart(7)}  ` +
    `${clock(g.peakAt)} ${String(g.peak2s).padStart(8)} ${String(g.rsc ?? '').padStart(4)} ` +
    `${String(g.limited).padStart(4)}`;
  for (const g of result.groups) lines.push(row(g.name, g));
  lines.push(row('all', { ...result.total, rsc: '' }));
  if (result.skipped > 0) lines.push(`${result.skipped} lines not in nginx's format, skipped`);
  return `${lines.join('\n')}\n`;
}

if (import.meta.main) {
  const [address, file] = process.argv.slice(2);
  if (!address) {
    console.error('Usage: node scripts/measure-page-requests.mjs <address> [log-file]');
    process.exit(2);
  }
  let text;
  try {
    text = fs.readFileSync(file ?? 0, 'utf8');
  } catch (error) {
    console.error(`measure-page-requests: ${error.message}`);
    process.exit(1);
  }
  const result = measure(text, address);
  if (result.total.total === 0) {
    console.error(`measure-page-requests: no requests of ${address} in the log`);
    process.exit(1);
  }
  process.stdout.write(format(result, address));
}
