// Cases for scripts/measure-page-requests.mjs; run by `npm test` with `node --test`.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { format, measure } from './measure-page-requests.mjs';

const SCRIPT = path.join(import.meta.dirname, 'measure-page-requests.mjs');
const VISITOR = '203.0.113.7';

/** One `main_id` line, as nginx writes it. */
function line(address, time, request, status = 200) {
  return (
    `${address} - - [22/Oct/2026:${time} +0300] "${request}" ${status} 512 ` +
    `"https://lamoda-ai-fitting.ru/catalog" "Mozilla/5.0" request_id=0123456789abcdef`
  );
}

const SAMPLE = [
  '/docker-entrypoint.sh: Configuration complete; ready for start up',
  line(VISITOR, '14:00:00', 'GET /catalog HTTP/1.1'),
  line(VISITOR, '14:00:00', 'GET /_next/static/chunks/app.js HTTP/1.1'),
  line(VISITOR, '14:00:00', 'GET /_next/static/css/app.css HTTP/1.1'),
  line(VISITOR, '14:00:01', 'GET /media/products/1.jpg HTTP/1.1'),
  line(VISITOR, '14:00:01', 'GET /media/products/2.jpg HTTP/1.1'),
  line(VISITOR, '14:00:01', 'GET /media/products/3.jpg HTTP/1.1'),
  line(VISITOR, '14:00:02', 'GET /catalog/zhenskoe?_rsc=1a2b3 HTTP/1.1'),
  line(VISITOR, '14:00:02', 'GET /catalog/muzhskoe?_rsc=4c5d6 HTTP/1.1'),
  line(VISITOR, '14:00:05', 'GET /api/products?limit=24&cursor=abc HTTP/1.1'),
  line(VISITOR, '14:00:05', 'GET /api/products/facets HTTP/1.1', 429),
  line(VISITOR, '14:00:06', 'GET /api/auth/get-session HTTP/1.1'),
  line(VISITOR, '14:00:06', 'GET /api/socket.io/?EIO=4&transport=polling HTTP/1.1'),
  line(VISITOR, '14:00:06', 'GET /api/health/ready HTTP/1.1'),
  line(VISITOR, '14:00:07', 'GET /healthz HTTP/1.1'),
  line(VISITOR, '14:00:09', 'GET /catalog/zhenskoe HTTP/1.1'),
  line('198.51.100.1', '14:00:01', 'GET /catalog HTTP/1.1'),
  line('2001:db8::7', '14:00:01', 'GET /media/products/4.jpg HTTP/1.1'),
  `${VISITOR} - - [22/Oct/2026:14:00:03 +0300] "\\x16\\x03\\x01" 400 157 "-" "-" request_id=0`,
  `${VISITOR} - - [not a time] "GET / HTTP/1.1" 200 1 "-" "-" request_id=0`,
  '',
].join('\n');

const byName = (result) => Object.fromEntries(result.groups.map((g) => [g.name, g]));
const at = (time) => Date.UTC(2026, 9, 22, ...time.split(':').map(Number)) / 1000 - 3 * 3600;

describe('measure-page-requests', () => {
  it('counts only the address given, per location group', () => {
    const groups = byName(measure(SAMPLE, VISITOR));
    assert.deepEqual(
      Object.fromEntries(Object.entries(groups).map(([name, g]) => [name, g.total])),
      {
        invalid: 1,
        health: 1,
        socket: 1,
        auth: 1,
        api: 2,
        media: 3,
        static: 2,
        healthz: 1,
        pages: 4,
      },
    );
  });

  it('keeps the groups in the order of nginx locations', () => {
    assert.deepEqual(
      measure(SAMPLE, VISITOR).groups.map((g) => g.name),
      ['invalid', 'health', 'socket', 'auth', 'api', 'media', 'static', 'healthz', 'pages'],
    );
  });

  it('counts a request line with no path apart from the pages', () => {
    const result = measure(SAMPLE, VISITOR);
    assert.equal(byName(result).invalid.total, 1);
    assert.equal(byName(result).pages.total, 4);
    assert.equal(result.total.total, 16);
  });

  it('takes the peak per second and its second, in UTC', () => {
    const result = measure(SAMPLE, VISITOR);
    const { media, pages } = byName(result);
    assert.equal(media.peak, 3);
    assert.equal(media.peakAt, at('14:00:01'));
    assert.equal(pages.peak, 2);
    assert.equal(pages.peakAt, at('14:00:02'));
    // 14:00:00 and 14:00:01 both have 3: the earlier second is the peak's
    assert.equal(result.total.peak, 3);
    assert.equal(result.total.peakAt, at('14:00:00'));
    assert.equal(result.first, at('14:00:00'));
    assert.equal(result.last, at('14:00:09'));
  });

  it('takes the peak in two adjacent seconds, for a burst across a second’s edge', () => {
    const result = measure(SAMPLE, VISITOR);
    const { media, pages } = byName(result);
    assert.equal(result.total.peak2s, 6);
    assert.equal(media.peak2s, 3);
    assert.equal(pages.peak2s, 2);
  });

  it('gives a tie to the earliest second, whatever the order of the lines', () => {
    const log = [
      line(VISITOR, '14:00:04', 'GET /a HTTP/1.1'),
      line(VISITOR, '14:00:04', 'GET /b HTTP/1.1'),
      line(VISITOR, '14:00:02', 'GET /c HTTP/1.1'),
      line(VISITOR, '14:00:02', 'GET /d HTTP/1.1'),
    ].join('\n');
    const result = measure(log, VISITOR);
    assert.equal(result.total.peakAt, at('14:00:02'));
    assert.equal(result.total.peak2s, 2);
    assert.equal(result.first, at('14:00:02'));
    assert.equal(result.last, at('14:00:04'));
  });

  it('counts RSC requests and 429s per group', () => {
    const result = measure(SAMPLE, VISITOR);
    const { pages, api } = byName(result);
    assert.equal(pages.rsc, 2);
    assert.equal(api.rsc, 0);
    assert.equal(api.limited, 1);
    assert.equal(result.total.limited, 1);
  });

  it('reads the time zone of $time_local', () => {
    const utc = line(VISITOR, '14:00:00', 'GET / HTTP/1.1').replace('+0300', '+0000');
    const west = line(VISITOR, '14:00:00', 'GET / HTTP/1.1').replace('+0300', '-0130');
    assert.equal(measure(utc, VISITOR).first, at('17:00:00'));
    // 14:00 at -01:30 is 15:30 UTC, the sample's 18:30 at +03:00
    assert.equal(measure(west, VISITOR).first, at('18:30:00'));
  });

  it('measures a visit too long to spread into Math.min', () => {
    const long = Array.from({ length: 200_000 }, () =>
      line(VISITOR, '14:00:00', 'GET /media/products/1.jpg HTTP/1.1'),
    ).join('\n');
    const result = measure(long, VISITOR);
    assert.equal(result.total.total, 200_000);
    assert.equal(result.first, at('14:00:00'));
    assert.equal(result.last, at('14:00:00'));
  });

  it('matches the address exactly, an IPv6 one too', () => {
    assert.equal(measure(SAMPLE, '203.0.113.70').total.total, 0);
    assert.equal(measure(SAMPLE, '2001:db8::7').total.total, 1);
  });

  it('skips the lines that are not in nginx format, of any address', () => {
    assert.equal(measure(SAMPLE, VISITOR).skipped, 2);
  });

  it('formats one line per group and the total', () => {
    const report = format(measure(SAMPLE, VISITOR), VISITOR);
    assert.match(report, /^Requests of 203\.0\.113\.7: 11:00:00–11:00:09 UTC, 10 s$/m);
    assert.match(report, /^media\s+3\s+3\s+11:00:01\s+3\s+0\s+0$/m);
    assert.match(report, /^pages\s+4\s+2\s+11:00:02\s+2\s+2\s+0$/m);
    assert.match(report, /^all\s+16\s+3\s+11:00:00\s+6\s+1$/m);
    assert.match(report, /^2 lines not in nginx's format, skipped$/m);
  });

  it('reads the log from stdin and prints the report', () => {
    const result = spawnSync(process.execPath, [SCRIPT, VISITOR], {
      input: SAMPLE,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /^pages\s+4/m);
  });

  it('reads the log from a file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'measure-page-requests-'));
    try {
      const file = path.join(dir, 'access.log');
      fs.writeFileSync(file, SAMPLE);
      const result = spawnSync(process.execPath, [SCRIPT, VISITOR, file], { encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /^media\s+3/m);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fails when the address made no requests', () => {
    const result = spawnSync(process.execPath, [SCRIPT, '192.0.2.1'], {
      input: SAMPLE,
      encoding: 'utf8',
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /no requests of 192\.0\.2\.1/);
  });

  it('fails on a missing file and without an address', () => {
    const missing = spawnSync(process.execPath, [SCRIPT, VISITOR, '/nonexistent/access.log'], {
      encoding: 'utf8',
    });
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /ENOENT/);
    const usage = spawnSync(process.execPath, [SCRIPT], { input: '', encoding: 'utf8' });
    assert.equal(usage.status, 2);
    assert.match(usage.stderr, /Usage/);
  });
});
