// Cases for deploy/scripts/warmup.mjs; run by `npm test` with `node --test`.

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { expectedStatus, isLocalPath, warmup } from './warmup.mjs';

const SOURCE = readFileSync(path.join(import.meta.dirname, 'warmup.mjs'), 'utf8');

describe('warmup', () => {
  let server;
  let base;
  // What `/healthz/warmup` answers: a list, or a bare status.
  let list;
  let log;
  const connections = new Set();

  before(async () => {
    server = http.createServer((req, res) => {
      log.push({ url: req.url, at: performance.now() });
      if (req.url === '/healthz/warmup') {
        if (typeof list === 'number') res.writeHead(list).end();
        else if (typeof list === 'string') res.writeHead(200).end(list);
        else res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(list));
        return;
      }
      if (req.url === '/' || req.url === '/moved') {
        res.writeHead(307, { Location: '/catalog' }).end();
        return;
      }
      if (req.url === '/fail') {
        res.writeHead(500).end();
        return;
      }
      // Answers its first request, fails the repeated one.
      if (req.url === '/flaky' && log.filter((entry) => entry.url === '/flaky').length > 1) {
        res.writeHead(500).end();
        return;
      }
      if (req.url === '/busy') {
        res.writeHead(429).end();
        return;
      }
      if (req.url === '/missing') {
        res.writeHead(404).end();
        return;
      }
      // A shell whose body never ends.
      if (req.url === '/hang') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.write('<html>');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.write('<html>');
      setTimeout(() => res.end('<article>Платье</article></html>'), 5);
    });
    server.on('connection', (socket) => connections.add(socket));
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    for (const socket of connections) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    list = { paths: ['/', '/catalog', '/catalog/dresses'], skipped: 0 };
    log = [];
  });

  /** Runs the step against the test server, collecting its lines. */
  async function run(options = {}) {
    const out = [];
    const err = [];
    const code = await warmup({
      base,
      pauseMs: 0,
      productPauseMs: 0,
      out: (line) => out.push(line),
      err: (line) => err.push(line),
      ...options,
    });
    return { code, out, err };
  }
  const pages = () => log.map((entry) => entry.url).filter((url) => url !== '/healthz/warmup');

  it('requests every address twice and prints a line for each', async () => {
    const { code, out, err } = await run();
    assert.equal(code, 0);
    assert.deepEqual(err, []);
    assert.deepEqual(pages(), [
      '/',
      '/catalog',
      '/catalog/dresses',
      '/',
      '/catalog',
      '/catalog/dresses',
    ]);
    assert.equal(out[0], 'warm-up: 3 addresses, 0 over the bounds skipped');
    assert.match(out[1], /^warm-up: \/ 307, first \d+ ms, repeated \d+ ms$/);
    assert.match(out[2], /^warm-up: \/catalog 200, first \d+ ms, repeated \d+ ms$/);
    assert.match(out[3], /^warm-up: \/catalog\/dresses 200, first \d+ ms, repeated \d+ ms$/);
    assert.equal(out.length, 4);
  });

  it('expects the 307 of / and does not follow it', async () => {
    list = { paths: ['/'], skipped: 0 };
    const { code } = await run();
    assert.equal(code, 0);
    assert.deepEqual(pages(), ['/', '/']);
    assert.equal(expectedStatus('/'), 307);
    assert.equal(expectedStatus('/catalog'), 200);
  });

  it('fails on a 307 of another address', async () => {
    list = { paths: ['/catalog', '/moved'], skipped: 0 };
    const { code, err } = await run();
    assert.equal(code, 1);
    assert.deepEqual(err, ['warm-up failed: /moved (answered 307)']);
  });

  it('spaces the cold pass a pause apart and repeats with none', async () => {
    list = { paths: ['/a', '/b', '/c'], skipped: 0 };
    const { code } = await run({ pauseMs: 500 });
    assert.equal(code, 0);
    const starts = log.filter((entry) => entry.url !== '/healthz/warmup').map((entry) => entry.at);
    const gaps = starts.slice(1).map((at, i) => at - starts[i]);
    // Arrival times at the server, not the client's starts: room for delivery and a busy runner.
    for (const gap of gaps.slice(0, 2)) assert.ok(gap >= 450, `cold gap ${gap}`);
    for (const gap of gaps.slice(2)) assert.ok(gap < 250, `repeated gap ${gap}`);
  });

  it('pauses before each product page of the repeated pass only', async () => {
    list = { paths: ['/a', '/products/p1', '/products/p2', '/b'], skipped: 0 };
    const { code } = await run({ productPauseMs: 300 });
    assert.equal(code, 0);
    const starts = log.filter((entry) => entry.url !== '/healthz/warmup').map((entry) => entry.at);
    const gaps = starts.slice(1).map((at, i) => at - starts[i]);
    // Cold: no pause at all. Repeated: /a after the cold /b, then a pause before each product page,
    // none before /b.
    for (const gap of gaps.slice(0, 3)) assert.ok(gap < 250, `cold gap ${gap}`);
    assert.ok(gaps[3] < 250, `repeated /a gap ${gaps[3]}`);
    assert.ok(gaps[4] >= 250, `repeated product gap ${gaps[4]}`);
    assert.ok(gaps[5] >= 250, `repeated product gap ${gaps[5]}`);
    assert.ok(gaps[6] < 250, `repeated /b gap ${gaps[6]}`);
  });

  it('stops when a product pause would pass the budget', async () => {
    list = { paths: ['/products/p1'], skipped: 0 };
    const { code, err } = await run({ productPauseMs: 1000, budgetMs: 500 });
    assert.equal(code, 1);
    assert.deepEqual(err, ["warm-up failed: /products/p1 (the step's 500 ms ran out)"]);
  });

  it('stops at a 500 and names the address', async () => {
    list = { paths: ['/catalog', '/fail', '/privacy'], skipped: 0 };
    const { code, out, err } = await run();
    assert.equal(code, 1);
    assert.deepEqual(err, ['warm-up failed: /fail (answered 500)']);
    assert.deepEqual(pages(), ['/catalog', '/fail']);
    // the cold pass's times so far, to see what was slow
    assert.equal(out.length, 2);
    assert.match(out[1], /^warm-up: \/catalog 200, first \d+ ms$/);
  });

  it('stops at a failure of the repeated pass, printing each address once', async () => {
    list = { paths: ['/catalog', '/flaky', '/privacy'], skipped: 0 };
    const { code, out, err } = await run();
    assert.equal(code, 1);
    assert.deepEqual(err, ['warm-up failed: /flaky (answered 500)']);
    assert.deepEqual(pages(), ['/catalog', '/flaky', '/privacy', '/catalog', '/flaky']);
    assert.match(out[1], /^warm-up: \/catalog 200, first \d+ ms, repeated \d+ ms$/);
    assert.match(out[2], /^warm-up: \/flaky 200, first \d+ ms$/);
    assert.match(out[3], /^warm-up: \/privacy 200, first \d+ ms$/);
    assert.equal(out.length, 4);
  });

  it('stops at a 429: the quota is not waited out', async () => {
    list = { paths: ['/busy'], skipped: 0 };
    const { code, err } = await run();
    assert.equal(code, 1);
    assert.deepEqual(err, ['warm-up failed: /busy (answered 429)']);
  });

  it('stops at an answer whose body does not end in time', async () => {
    list = { paths: ['/catalog', '/hang'], skipped: 0 };
    const { code, err } = await run({ timeoutMs: 200 });
    assert.equal(code, 1);
    assert.deepEqual(err, ['warm-up failed: /hang (no full answer in 200 ms)']);
  });

  it('stops when the step runs past its budget', async () => {
    list = { paths: ['/a', '/b', '/c', '/d'], skipped: 0 };
    const { code, err } = await run({ pauseMs: 200, budgetMs: 500 });
    assert.equal(code, 1);
    assert.match(err[0], /^warm-up failed: \/[a-d] \(the step's 500 ms ran out\)$/);
    assert.ok(pages().length < 4);
  });

  it('cuts a request short by what is left of the budget', async () => {
    list = { paths: ['/hang'], skipped: 0 };
    const start = performance.now();
    const { code, err } = await run({ timeoutMs: 10_000, budgetMs: 300 });
    assert.equal(code, 1);
    assert.deepEqual(err, ["warm-up failed: /hang (the step's 300 ms ran out)"]);
    assert.ok(performance.now() - start < 2000);
  });

  it('requests only / when the image predates the list', async () => {
    list = 404;
    const { code, out } = await run();
    assert.equal(code, 0);
    assert.deepEqual(pages(), ['/', '/']);
    assert.equal(
      out[0],
      'warm-up: /healthz/warmup answered 404, the image predates the list: requesting / only',
    );
    assert.equal(out[1], 'warm-up: 1 addresses, 0 over the bounds skipped');
  });

  it('fails on a list that answers neither 200 nor 404', async () => {
    list = 500;
    const { code, err } = await run();
    assert.equal(code, 1);
    assert.deepEqual(err, ['warm-up failed: /healthz/warmup (answered 500)']);
    assert.deepEqual(pages(), []);
  });

  for (const [name, body] of [
    ['no JSON', '<html>'],
    ['no paths', { skipped: 0 }],
    ['an empty list', { paths: [], skipped: 0 }],
    ['a path off the site', { paths: ['//evil.example/'], skipped: 0 }],
    ['a relative path', { paths: ['catalog'], skipped: 0 }],
    ['no skipped count', { paths: ['/catalog'] }],
    ['a negative skipped count', { paths: ['/catalog'], skipped: -1 }],
  ]) {
    it(`fails on a list with ${name}`, async () => {
      list = body;
      const { code, err } = await run();
      assert.equal(code, 1);
      assert.match(err[0], /^warm-up failed: \/healthz\/warmup \(answered no/);
      assert.deepEqual(pages(), []);
    });
  }

  it('warms up 50 categories and prints the count of the skipped ones', async () => {
    const categories = Array.from({ length: 50 }, (_, i) => `/catalog/c${i}`);
    list = { paths: ['/', '/catalog', ...categories, '/privacy'], skipped: 3 };
    const { code, out } = await run();
    assert.equal(code, 0);
    assert.equal(out[0], 'warm-up: 53 addresses, 3 over the bounds skipped');
    assert.equal(out.length, 54);
    for (const category of categories) {
      assert.equal(pages().filter((url) => url === category).length, 2, category);
    }
  });

  it('adds WARMUP_EXTRA_PATH to the list and stops at its 404', async () => {
    const { code, err } = await run({ extraPath: '/missing' });
    assert.equal(code, 1);
    assert.deepEqual(err, ['warm-up failed: /missing (answered 404)']);
    assert.deepEqual(pages(), ['/', '/catalog', '/catalog/dresses', '/missing']);
  });

  it('does not add a WARMUP_EXTRA_PATH the list already holds', async () => {
    const { code, out } = await run({ extraPath: '/catalog' });
    assert.equal(code, 0);
    assert.equal(out[0], 'warm-up: 3 addresses, 0 over the bounds skipped');
    assert.equal(pages().filter((url) => url === '/catalog').length, 2);
  });

  it('refuses a WARMUP_EXTRA_PATH off the site before any request', async () => {
    const { code, err } = await run({ extraPath: 'https://evil.example/' });
    assert.equal(code, 1);
    assert.deepEqual(err, ['warm-up failed: WARMUP_EXTRA_PATH (not a path on this site)']);
    assert.deepEqual(log, []);
  });

  it('fails when web does not answer at all', async () => {
    const closed = http.createServer();
    await new Promise((resolve) => closed.listen(0, '127.0.0.1', resolve));
    const { port } = closed.address();
    await new Promise((resolve) => closed.close(resolve));
    const { code, err } = await run({ base: `http://127.0.0.1:${port}` });
    assert.equal(code, 1);
    assert.deepEqual(err, ['warm-up failed: /healthz/warmup (ECONNREFUSED)']);
  });

  // As `deploy.sh` runs it: the source on stdin, so `import.meta.main` must hold there too. The
  // base is swapped for the test server's (3001 may be a local stack's web), the pause for none.
  it('runs from stdin and passes WARMUP_EXTRA_PATH from its environment', async () => {
    const source = SOURCE.replace(
      "const BASE = 'http://127.0.0.1:3001';",
      `const BASE = '${base}';`,
    ).replace('const PAUSE_MS = 1000;', 'const PAUSE_MS = 0;');
    assert.equal(source.includes(base) && source.includes('PAUSE_MS = 0;'), true);
    const child = spawn(process.execPath, ['--input-type=module', '-'], {
      env: { ...process.env, WARMUP_EXTRA_PATH: '/missing' },
    });
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.stdin.end(source);
    const status = await new Promise((resolve) => child.on('close', resolve));
    assert.equal(status, 1);
    assert.match(stdout, /^warm-up: 4 addresses, 0 over the bounds skipped\n/);
    assert.equal(stderr, 'warm-up failed: /missing (answered 404)\n');
  });
});

describe('isLocalPath', () => {
  const base = 'http://127.0.0.1:3001';
  it('takes a path on the site', () => {
    assert.ok(isLocalPath('/catalog/%D0%BF', base));
    assert.ok(isLocalPath('/', base));
  });
  it('refuses anything that leaves it', () => {
    for (const path of [
      '//evil.example',
      '/\\evil.example',
      '/\t/evil.example',
      '/a\n::warning::x',
      '/catalog/платья',
      'catalog',
      '',
      5,
      null,
    ]) {
      assert.equal(isLocalPath(path, base), false, String(path));
    }
  });
});

describe('warmup.mjs source', () => {
  // `deploy.sh` pipes it into the web container: a relative or package import would not resolve.
  it('imports only Node built-ins', () => {
    const specifiers = [...SOURCE.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
    assert.ok(specifiers.length > 0);
    for (const specifier of specifiers) assert.match(specifier, /^node:/);
  });
});
