// Cases for scripts/measure-first-request.mjs; run by `npm test` with `node --test`.

import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { format, measure, median, parseArgs, timeRequest } from './measure-first-request.mjs';

const SCRIPT = path.join(import.meta.dirname, 'measure-first-request.mjs');

/** Runs the script to its end; spawnSync would block the test server it talks to. */
function run(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT, ...args]);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

describe('measure-first-request', () => {
  let server;
  let base;
  const log = [];
  const connections = new Set();

  before(async () => {
    const seen = new Set();
    server = http.createServer((req, res) => {
      log.push(req.url);
      const first = !seen.has(req.url);
      seen.add(req.url);
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
      if (req.url === '/no-data') {
        res.writeHead(200, { 'Content-Type': 'text/html' }).end('<html><h1>Каталог</h1></html>');
        return;
      }
      // The first request of a path is slow, and a page streams: its products come after the head.
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.write('<html>');
      setTimeout(() => res.end('<article>Платье</article></html>'), first ? 300 : 10);
    });
    server.on('connection', (socket) => connections.add(socket));
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  });

  after(() => {
    for (const socket of connections) socket.destroy();
    server.close();
  });

  it('times a request to the end of its body, on a new connection', async () => {
    const before = connections.size;
    const result = await timeRequest(new URL('/timed', base));
    assert.equal(result.status, 200);
    assert.equal(result.data, true);
    assert.ok(result.ms >= 290, `${result.ms} ms`);
    await timeRequest(new URL('/timed', base));
    assert.equal(connections.size, before + 2);
  });

  it('tells a page with no product card', async () => {
    const result = await timeRequest(new URL('/no-data', base));
    assert.equal(result.status, 200);
    assert.equal(result.data, false);
  });

  it('reports a network error and a body that never ends instead of throwing', async () => {
    const refused = await timeRequest(new URL('http://127.0.0.1:1/'));
    assert.match(refused.error, /ECONNREFUSED/);
    const hung = await timeRequest(new URL('/hang', base), { timeoutMs: 100 });
    assert.match(hung.error, /no full answer in 100 ms/);
  });

  it('waits between requests', async () => {
    const start = performance.now();
    await measure(base, ['/paced'], { repeats: 2, pauseMs: 100 });
    // the first request's 300 ms, two repeats and a pause before each and after the last
    assert.ok(performance.now() - start >= 590, `${performance.now() - start} ms`);
  });

  it('sends every first request before any repeat', async () => {
    log.length = 0;
    const results = await measure(base, ['/a', '/b'], { repeats: 2, pauseMs: 0 });
    assert.deepEqual(log, ['/a', '/b', '/a', '/b', '/a', '/b']);
    assert.deepEqual(
      results.map((r) => [r.path, r.later.length]),
      [
        ['/a', 2],
        ['/b', 2],
      ],
    );
    for (const r of results) {
      assert.ok(r.first.ms > median(r.later.map((later) => later.ms)), r.path);
    }
  });

  it('takes the median of odd and even counts', () => {
    assert.equal(median([50, 10, 30, 20, 40]), 30);
    assert.equal(median([40, 10, 30, 20]), 25);
    assert.equal(median([7]), 7);
  });

  it('prints the first time, the median of the answers with products and the ratio', () => {
    const later = [100, 120, 110, 90, 400].map((ms) => ({ status: 200, ms, data: true }));
    const report = format(
      [
        { path: '/catalog', first: { status: 200, ms: 550, data: true }, later },
        {
          path: '/catalog/dresses',
          first: { status: 200, ms: 300, data: true },
          later: [
            ...later.slice(0, 3),
            { status: 503, ms: 5 },
            { status: 200, ms: 4, data: false },
          ],
        },
      ],
      'https://localhost',
    );
    assert.match(report, /^First request after a deploy at https:\/\/localhost/);
    assert.match(report, /^\/catalog +550 ms +110 ms +5\.00$/m);
    assert.match(
      report,
      /^\/catalog\/dresses +300 ms +110 ms +2\.73 +\(2 of 5 later: answered 503\)$/m,
    );
  });

  it('does not time a 200 with no product', () => {
    const report = format(
      [
        {
          path: '/catalog',
          first: { status: 200, ms: 40, data: false },
          later: [{ status: 200, ms: 90, data: true }],
        },
      ],
      'https://localhost',
    );
    assert.match(report, /^\/catalog +- +90 ms +- +\(first: answered 200 with no product\)$/m);
  });

  it('prints a failed first request and no 200 later on', () => {
    const report = format(
      [
        {
          path: '/catalog',
          first: { error: 'connect ECONNREFUSED' },
          later: [{ status: 502, ms: 3 }],
        },
      ],
      'https://localhost',
    );
    assert.match(
      report,
      /^\/catalog +- +- +- +\(first: connect ECONNREFUSED\) +\(1 of 1 later: answered 502\)$/m,
    );
  });

  it('takes a base URL and paths that stay on its origin', () => {
    assert.deepEqual(parseArgs(['https://localhost/ignored', '/catalog', '/catalog/dresses']), {
      base: 'https://localhost',
      paths: ['/catalog', '/catalog/dresses'],
    });
    for (const args of [
      [],
      ['https://localhost'],
      ['localhost', '/catalog'],
      ['ftp://localhost', '/catalog'],
      ['https://localhost', 'catalog'],
      ['https://localhost', '//example.com/catalog'],
      ['https://localhost', '/\\example.com/catalog'],
      ['https://localhost', '/\t/example.com/catalog'],
      ['https://localhost', '//localhost:99999/catalog'],
    ]) {
      assert.equal(parseArgs(args), null, args.join(' '));
    }
  });

  // One path: the script waits a second between its six requests.
  it('measures a running site and exits 0 even when a path fails', async () => {
    const result = await run([base, '/missing']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(
      result.stdout,
      /^\/missing .*\(first: answered 404\) +\(5 of 5 later: answered 404\)$/m,
    );
  });

  it('exits 2 with the usage on bad arguments', () => {
    const result = spawnSync(process.execPath, [SCRIPT, 'https://localhost'], { encoding: 'utf8' });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Usage/);
  });
});
