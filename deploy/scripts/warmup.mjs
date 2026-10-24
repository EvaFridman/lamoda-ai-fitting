// The deploy's warm-up (spec 0018 plan §4, V6, V16): requests every warm-up address from the new
// copy's web, past nginx, before the switch, so its first visitors find the page cache full.
//
// `deploy.sh` pipes it into the target's web container (Node built-ins only, nothing to import):
//   app "$target" "$tag" exec -T web node --input-type=module - < deploy/scripts/warmup.mjs
// It reads the addresses from `/healthz/warmup` (`{ paths, skipped }`, from web's
// `_app/warmup/routes.ts`), then requests each twice: a cold pass, one at a time and at most one a
// second (about three api reads a category page, all under web's own `read` quota, V16), then a
// repeated pass, one at a time with no pause (the warm cache; its time is the page's render time,
// V14) but 250 ms before a product page, whose own reads are never cached (spec 0019 A81). Requests come from `127.0.0.1`, so no visitor's quota is touched (AC13).
//
// Every address answers 200, but `/`, whose redirect is not followed and answers 307. Anything
// else (a 429 too), no full answer in 10 s or the step past 120 s exits 1 and names the address.
// An image from before the list answers 404 at `/healthz/warmup`: only `/` is requested then, so a
// rollback past spec 0018 stays possible. `WARMUP_EXTRA_PATH`, a check's knob (`ci-deploy-check.sh`
// sets an address that answers 404), adds one address to the list; `deploy.sh` passes it to this
// process only (`exec -e`), never into the container's environment.
//
// Output: one line per address and the count of addresses over the bounds on stdout (on a
// failure, the cold pass's times so far); a failure as the last line on stderr,
// `warm-up failed: <address> (<reason>)`. Exit 0, or 1 on a failure.

import { setTimeout as sleep } from 'node:timers/promises';

const BASE = 'http://127.0.0.1:3001';
const LIST_PATH = '/healthz/warmup';
const TIMEOUT_MS = 10_000;
const BUDGET_MS = 120_000;
const PAUSE_MS = 1000;
// Before a product page in the repeated pass (spec 0019 A81): its two reads of `/products/:id` on
// the visitor's behalf are never cached, and the api's `read` tier allows 10 a second per route.
const PRODUCT_PAUSE_MS = 250;
const isProductPage = (path) => path.startsWith('/products/');

class WarmupFailure extends Error {
  constructor(address, reason) {
    super(`${address} (${reason})`);
    this.address = address;
  }
}

/**
 * Whether `path` is an absolute path that stays on `base`'s origin (`//host`, `/\host` do not),
 * in visible ASCII only (a slug comes percent-encoded): the URL parser drops tabs and line breaks,
 * and a line break printed into the deploy's log would start a line of its own.
 */
export function isLocalPath(path, base) {
  if (typeof path !== 'string' || !/^\/[!-~]*$/.test(path)) return false;
  try {
    return new URL(path, base).origin === new URL(base).origin;
  } catch {
    return false;
  }
}

/** The status `path` must answer: `/` is the redirect to the catalog, everything else a page. */
export const expectedStatus = (path) => (path === '/' ? 307 : 200);

/**
 * The steps' shared clock: each request gets its own timeout or what is left of the budget,
 * whichever is shorter, and a request that cannot start in time fails at once.
 */
function makeClock({ timeoutMs, budgetMs }) {
  const deadline = performance.now() + budgetMs;
  return {
    left: () => deadline - performance.now(),
    /** One GET of `path` to the end of its body: `{ status, ms, body }`; throws a WarmupFailure. */
    async get(base, path) {
      const left = this.left();
      if (left <= 0) throw new WarmupFailure(path, `the step's ${budgetMs} ms ran out`);
      const limit = Math.min(timeoutMs, Math.ceil(left));
      const signal = AbortSignal.timeout(limit);
      const start = performance.now();
      try {
        const response = await fetch(new URL(path, base), { redirect: 'manual', signal });
        const body = await response.text();
        return { status: response.status, ms: performance.now() - start, body };
      } catch (error) {
        // fetch's own message is `fetch failed`; the cause says why (ECONNREFUSED, a closed socket)
        if (error.name !== 'TimeoutError') {
          throw new WarmupFailure(path, error.cause?.code || error.cause?.message || error.message);
        }
        throw new WarmupFailure(
          path,
          limit < timeoutMs
            ? `the step's ${budgetMs} ms ran out`
            : `no full answer in ${timeoutMs} ms`,
        );
      }
    },
  };
}

/** The addresses from `/healthz/warmup`: `{ paths, skipped, predates }`; throws a WarmupFailure. */
async function readList(base, clock) {
  const { status, body } = await clock.get(base, LIST_PATH);
  if (status === 404) return { paths: ['/'], skipped: 0, predates: true };
  if (status !== 200) throw new WarmupFailure(LIST_PATH, `answered ${status}`);
  let list;
  try {
    list = JSON.parse(body);
  } catch {
    throw new WarmupFailure(LIST_PATH, 'answered no JSON');
  }
  const { paths, skipped } = list ?? {};
  if (
    !Array.isArray(paths) ||
    paths.length === 0 ||
    !paths.every((path) => isLocalPath(path, base)) ||
    !Number.isInteger(skipped) ||
    skipped < 0
  ) {
    throw new WarmupFailure(LIST_PATH, 'answered no { paths, skipped }');
  }
  return { paths, skipped, predates: false };
}

const ms = (value) => `${Math.round(value)} ms`;

/**
 * The whole step. `out` and `err` take one line each. Returns the exit code: 0 when every address
 * answered as expected in both passes, else 1 after naming the first that did not.
 */
export async function warmup({
  base = BASE,
  extraPath,
  timeoutMs = TIMEOUT_MS,
  budgetMs = BUDGET_MS,
  pauseMs = PAUSE_MS,
  productPauseMs = PRODUCT_PAUSE_MS,
  out = (line) => process.stdout.write(`${line}\n`),
  err = (line) => process.stderr.write(`${line}\n`),
} = {}) {
  const clock = makeClock({ timeoutMs, budgetMs });
  // The cold pass's results in order, printed on a failure too: which pages were slow.
  const first = [];
  try {
    if (extraPath && !isLocalPath(extraPath, base)) {
      throw new WarmupFailure('WARMUP_EXTRA_PATH', 'not a path on this site');
    }
    const list = await readList(base, clock);
    const paths =
      extraPath && !list.paths.includes(extraPath) ? [...list.paths, extraPath] : list.paths;
    if (list.predates) {
      out(`warm-up: ${LIST_PATH} answered 404, the image predates the list: requesting / only`);
    }
    out(`warm-up: ${paths.length} addresses, ${list.skipped} over the bounds skipped`);

    const check = (path, result) => {
      if (result.status !== expectedStatus(path)) {
        throw new WarmupFailure(path, `answered ${result.status}`);
      }
    };
    let lastStart = -Infinity;
    for (const path of paths) {
      const wait = lastStart + pauseMs - performance.now();
      if (wait > 0) {
        if (wait >= clock.left()) {
          throw new WarmupFailure(path, `the step's ${budgetMs} ms ran out`);
        }
        await sleep(wait);
      }
      lastStart = performance.now();
      const result = await clock.get(base, path);
      check(path, result);
      first.push({ path, ...result });
    }
    while (first.length > 0) {
      const { path, ms: firstMs } = first[0];
      if (isProductPage(path) && productPauseMs > 0) {
        if (productPauseMs >= clock.left()) {
          throw new WarmupFailure(path, `the step's ${budgetMs} ms ran out`);
        }
        await sleep(productPauseMs);
      }
      const result = await clock.get(base, path);
      check(path, result);
      first.shift();
      out(`warm-up: ${path} ${result.status}, first ${ms(firstMs)}, repeated ${ms(result.ms)}`);
    }
    return 0;
  } catch (error) {
    for (const { path, status, ms: firstMs } of first) {
      out(`warm-up: ${path} ${status}, first ${ms(firstMs)}`);
    }
    // The last line keeps its shape whatever failed: `deploy.sh` names the address from it.
    err(
      error instanceof WarmupFailure
        ? `warm-up failed: ${error.message}`
        : `warm-up failed: the script (${error.message})`,
    );
    return 1;
  }
}

if (import.meta.main) {
  process.exitCode = await warmup({ extraPath: process.env.WARMUP_EXTRA_PATH || undefined });
}
