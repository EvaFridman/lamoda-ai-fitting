// Measures the first request after a deploy against later ones (spec 0018 AC14, plan §5): for
// each path, the time of its first request and the median of five more, and their ratio. AC14
// holds when the ratio is at most 2 for `/catalog` and a category page; the owner reads it, so
// the script exits 0 whatever it measures (2 on bad arguments).
//
// It must be the first visitor after the switch: `cd.yml` and `ci-deploy-check.sh` run it right
// after `deploy.sh` and before `smoke-test.sh`, which requests the same pages (V25). The first
// requests of all paths go before any repeat, so one path's repeats do not warm another's first;
// still, the first `/catalog` warms what pages share (the layout, the header's categories, the
// api's connections), so a later path's first request is partly warm.
//
// A time runs from the connection's end (TLS done) to the end of the body (a page streams after
// its shell): DNS, TCP and TLS are the network's, not the server's, and would pull the ratio
// towards 1. A 200 counts only with a product card (`<article`, as `smoke-test.sh`): an api
// failure renders inside `<Suspense>` after the shell's 200. Requests go one at a time, a second
// apart, so a page's api reads on the visitor's behalf stay under the api's `read` quota per
// second. Certificates are not checked, as `smoke-test.sh -k`: nginx runs on a self-signed one
// locally, in CI and until the real certificate is issued; nothing secret is sent.
//
// Usage: node scripts/measure-first-request.mjs <base-url> <path>...
//   e.g. node scripts/measure-first-request.mjs https://localhost /catalog /catalog/dresses

import http from 'node:http';
import https from 'node:https';
import { setTimeout as sleep } from 'node:timers/promises';

export const REPEATS = 5;
const TIMEOUT_MS = 15_000;
const PAUSE_MS = 1000;

/**
 * One GET of `url` on a new connection: `{ status, ms, data }` once the body ends (`data`: the
 * body holds a product card), or `{ error }` (a network error, or no end in `timeoutMs`).
 */
export function timeRequest(url, { timeoutMs = TIMEOUT_MS } = {}) {
  const secure = url.protocol === 'https:';
  return new Promise((resolve) => {
    let start = performance.now();
    const deadline = setTimeout(
      () => request.destroy(new Error(`no full answer in ${timeoutMs} ms`)),
      timeoutMs,
    );
    const settle = (result) => {
      clearTimeout(deadline);
      resolve(result);
    };
    const request = (secure ? https : http).get(
      url,
      { agent: false, rejectUnauthorized: false },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => (body += chunk));
        response.on('end', () =>
          settle({
            status: response.statusCode,
            ms: performance.now() - start,
            data: body.includes('<article'),
          }),
        );
        response.on('error', (error) => settle({ error: error.message }));
      },
    );
    request.on('socket', (socket) =>
      socket.once(secure ? 'secureConnect' : 'connect', () => (start = performance.now())),
    );
    request.on('error', (error) => settle({ error: error.message }));
  });
}

/** The median of a non-empty list of numbers. */
export function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Every path's first request, then `repeats` rounds over all paths, one request at a time and
 * `pauseMs` apart, and a pause after the last: `[{ path, first, later: [...] }]` with
 * `timeRequest`'s results.
 */
export async function measure(
  base,
  paths,
  { repeats = REPEATS, timeoutMs, pauseMs = PAUSE_MS } = {},
) {
  const results = paths.map((path) => ({ path, first: null, later: [] }));
  let sent = 0;
  const time = async (path) => {
    if (sent++ > 0) await sleep(pauseMs);
    return timeRequest(new URL(path, base), { timeoutMs });
  };
  for (const result of results) result.first = await time(result.path);
  for (let round = 0; round < repeats; round += 1) {
    for (const result of results) result.later.push(await time(result.path));
  }
  // the smoke test comes next from the same address
  await sleep(pauseMs);
  return results;
}

const ok = (result) => result.status === 200 && result.data;
const failure = (result) =>
  result.error ??
  (result.status === 200 ? 'answered 200 with no product' : `answered ${result.status}`);
const ms = (value) => `${Math.round(value)} ms`;

/** The report, one path per line; only 200 answers with a product are timed. */
export function format(results, base) {
  const width = Math.max(4, ...results.map((r) => r.path.length));
  const lines = [
    `First request after a deploy at ${base} (AC14: ratio at most 2)`,
    `${'path'.padEnd(width)}  ${'first'.padStart(9)}  ${'median'.padStart(9)}  ratio`,
  ];
  for (const { path, first, later } of results) {
    const timed = later.filter(ok).map((r) => r.ms);
    const failed = later.filter((r) => !ok(r));
    const firstText = ok(first) ? ms(first.ms) : '-';
    const medianText = timed.length > 0 ? ms(median(timed)) : '-';
    const ratio = ok(first) && timed.length > 0 ? (first.ms / median(timed)).toFixed(2) : '-';
    let line = `${path.padEnd(width)}  ${firstText.padStart(9)}  ${medianText.padStart(9)}  ${ratio}`;
    if (!ok(first)) line += `  (first: ${failure(first)})`;
    if (failed.length > 0) {
      line += `  (${failed.length} of ${later.length} later: ${failure(failed[0])})`;
    }
    lines.push(line);
  }
  return `${lines.join('\n')}\n`;
}

/** The base URL and paths from the arguments, or null when they are not usable. */
export function parseArgs(args) {
  const [baseText, ...paths] = args;
  if (!baseText || paths.length === 0) return null;
  let base;
  try {
    base = new URL(baseText);
  } catch {
    return null;
  }
  if (base.protocol !== 'http:' && base.protocol !== 'https:') return null;
  // The resolved URL, not the text: `//host`, `/\host` and `/\t/host` all leave the base's origin.
  const offPath = (path) => {
    try {
      return !path.startsWith('/') || new URL(path, base).origin !== base.origin;
    } catch {
      return true;
    }
  };
  if (paths.some(offPath)) return null;
  return { base: base.origin, paths };
}

if (import.meta.main) {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed) {
    console.error('Usage: node scripts/measure-first-request.mjs <base-url> <path>...');
    process.exit(2);
  }
  const results = await measure(parsed.base, parsed.paths);
  process.stdout.write(format(results, parsed.base));
}
