// Cases for scripts/check-web-shells.mjs; run by `npm test` with `node --test`.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { findBlockedScripts, scriptHash } from './check-web-shells.mjs';

const TIMING = 'requestAnimationFrame(function(){$RT=performance.now()});';

let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-web-shells-'));
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

describe('check-web-shells', () => {
  it('names a hash as a CSP source does', () => {
    // React's script, as the browser reports its hash in a violation.
    assert.equal(scriptHash(TIMING), 'sha256-7mu4H06fwDCjmnxxr/xNHyuQC6pLTHr4M2E4jXw5WZs=');
  });

  it('passes listed inline scripts, scripts with src and scripts with a nonce', () => {
    put(
      'catalog.html',
      `<script src="/_next/static/chunks/a.js" async=""></script><script>${TIMING}</script>` +
        '<script nonce="abc">self.__next_f.push([1])</script>',
    );
    put('customer/account.html', `<script>${TIMING}</script>`);
    assert.deepEqual(findBlockedScripts(dir, [scriptHash(TIMING)]), []);
  });

  it('reports an inline script whose hash is not listed, in a nested shell too', () => {
    put('catalog.html', `<script>${TIMING}</script>`);
    put('customer/account.html', '<script >alert(1)</script>');
    const blocked = findBlockedScripts(dir, [scriptHash(TIMING)]);
    assert.deepEqual(
      blocked.map(({ file, hash }) => [path.relative(dir, file), hash]),
      [[path.join('customer', 'account.html'), scriptHash('alert(1)')]],
    );
  });

  it('reports a script with an empty nonce or only a data-src or data-nonce', () => {
    put(
      'catalog.html',
      '<script nonce="">a()</script><script data-src="/x.js">b()</script>' +
        '<script data-nonce="abc">c()</script>',
    );
    assert.deepEqual(
      findBlockedScripts(dir, []).map(({ hash }) => hash),
      [scriptHash('a()'), scriptHash('b()'), scriptHash('c()')],
    );
  });

  it('skips the global error page', () => {
    put('catalog.html', `<script>${TIMING}</script>`);
    put('_global-error.html', '<script>self.__next_f.push([0])</script>');
    assert.deepEqual(findBlockedScripts(dir, [scriptHash(TIMING)]), []);
  });

  it('fails without a build', () => {
    assert.throws(() => findBlockedScripts(path.join(dir, 'missing'), []), /build web first/);
    put('catalog.rsc', '');
    assert.throws(() => findBlockedScripts(dir, []), /no page shell/);
  });
});
