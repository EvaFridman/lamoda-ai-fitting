// Cases for scripts/check-web-bundle.mjs; run by `npm test` with `node --test`.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

const SCRIPT = path.join(import.meta.dirname, 'check-web-bundle.mjs');

let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-web-bundle-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

/** Writes a file under the temporary directory, creating its folders. */
function put(relative, content) {
  const file = path.join(dir, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function check(target = dir) {
  return spawnSync(process.execPath, [SCRIPT, target], { encoding: 'utf8' });
}

describe('check-web-bundle', () => {
  it('passes a bundle without server secret names', () => {
    put('chunks/app.js', 'fetch("/api/products",{headers:{"x-request-id":"1"}})');
    put('css/app.css', '.a{color:red}');
    const result = check();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /no server secret names/);
  });

  for (const header of ['x-proxy-secret', 'X-Proxy-Secret', 'X-PROXY-SECRET']) {
    it(`fails on the header ${header} in a nested client file and names the file`, () => {
      put('chunks/app.js', 'ok');
      put('chunks/pages/deep/client.js', `h.set("${header}",s)`);
      const result = check();
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /deep[/\\]client\.js: /);
      assert.ok(result.stderr.includes(header), result.stderr);
      assert.doesNotMatch(result.stderr, /app\.js/);
    });
  }

  it('fails on the env name PROXY_SECRET', () => {
    put('chunks/app.js', 'process.env.PROXY_SECRET');
    const result = check();
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /app\.js: PROXY_SECRET/);
  });

  for (const name of ['S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY']) {
    it(`fails on the env name ${name}`, () => {
      put('chunks/app.js', `process.env.${name}`);
      const result = check();
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, new RegExp(`app\\.js: ${name}`));
    });
  }

  it('passes the other storage settings', () => {
    put('chunks/app.js', 'process.env.S3_BUCKET+process.env.S3_PUBLIC_ENDPOINT');
    const result = check();
    assert.equal(result.status, 0, result.stderr);
  });

  it('searches binary files too', () => {
    put(
      'media/font.woff2',
      Buffer.concat([Buffer.from([0, 255, 128]), Buffer.from('PROXY_SECRET')]),
    );
    const result = check();
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /font\.woff2: PROXY_SECRET/);
  });

  it('fails when the directory is missing', () => {
    const result = check(path.join(dir, 'missing'));
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /does not exist: build web first/);
  });

  it('fails when the directory holds no files', () => {
    fs.mkdirSync(path.join(dir, 'chunks'));
    const result = check();
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /holds no files: build web first/);
  });

  it('fails on a symbolic link instead of skipping it', () => {
    put('chunks/app.js', 'ok');
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'check-web-bundle-outside-'));
    try {
      fs.writeFileSync(path.join(outside, 'leak.js'), 'x-proxy-secret');
      fs.symlinkSync(outside, path.join(dir, 'chunks', 'linked'));
      const result = check();
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /linked is a symbolic link, not searched/);
    } finally {
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });
});
