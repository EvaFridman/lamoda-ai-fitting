import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, beforeEach, describe, it, mock } from 'node:test';

import { indexFile, main } from './cli.ts';
import { FakeEmbedder, VOYAGE_URL } from './embed.ts';
import { Store } from './store.ts';

// A hook's git variables would point the commands below at the outer repository.
for (const name of Object.keys(process.env)) if (name.startsWith('GIT_')) delete process.env[name];

const root = mkdtempSync(join(tmpdir(), 'code-rag-cli-'));
after(() => rmSync(root, { recursive: true, force: true }));

function git(...args: string[]) {
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], {
    cwd: root,
    stdio: 'ignore',
  });
}

function write(path: string, text: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

git('init', '-q');
write('api/src/a.ts', 'export const a = 1;\n');
write('specs/0001-x/plan.md', '# Plan\n\nText.\n');
write('api/src/.env.production', 'VOYAGE_API_KEY=tracked-by-mistake\n');
write('web/src/package-lock.json', '{}\n');
write('notes.txt', 'outside\n');
git('add', '-A');
git('add', '-f', 'api/src/.env.production');
git('commit', '-q', '-m', 'start');

let out: string[] = [];
let err: string[] = [];
const print = (line: string) => {
  out.push(line);
};
beforeEach(() => {
  out = [];
  err = [];
  mock.restoreAll();
  mock.method(console, 'error', (line: string) => err.push(line));
});

const fake = new FakeEmbedder();

/** Stands in for Voyage on `globalThis.fetch`, counting the texts it is sent. */
function stubVoyage() {
  const sent: string[] = [];
  const fetch = mock.method(globalThis, 'fetch', (url: string, init: RequestInit) => {
    assert.equal(url, VOYAGE_URL);
    const { input } = JSON.parse(String(init.body)) as { input: string[] };
    sent.push(...input);
    const data = input.map((text, index) => ({ embedding: [...fake.vector(text)], index }));
    return Promise.resolve(Response.json({ data }));
  });
  return { sent, fetch };
}

describe('rag:index', () => {
  it('lists what a dry run would index and skip, with no key and no request', async () => {
    const { fetch } = stubVoyage();
    assert.equal(await main(['index', '--dry-run'], { cwd: root, env: {}, print }), 0);
    assert.deepEqual(out.slice(0, 2), [
      'index   api/src/a.ts (1 chunks)',
      'index   specs/0001-x/plan.md (1 chunks)',
    ]);
    assert.ok(out.includes('skip    api/src/.env.production (excluded)'));
    assert.ok(out.includes('skip    web/src/package-lock.json (excluded)'));
    assert.ok(!out.some((line) => line.includes('notes.txt')));
    assert.match(out.at(-1)!, /^Dry run: 2 files, 2 chunks .* 2 files skipped, 1 outside/);
    assert.equal(fetch.mock.callCount(), 0);
    assert.equal(existsSync(join(root, '.rag')), false);
  });

  it('exits 1 without the key, before any request or file', async () => {
    const { fetch } = stubVoyage();
    assert.equal(await main(['index'], { cwd: root, env: {}, print }), 1);
    assert.equal(err.length, 1);
    assert.match(err[0]!, /^rag:index: VOYAGE_API_KEY is not set.*\.env\.example/);
    assert.equal(fetch.mock.callCount(), 0);
    assert.equal(existsSync(join(root, '.rag')), false);
  });

  it('indexes, then embeds nothing until a file changes, and rebuilds with --full', async () => {
    const env = { VOYAGE_API_KEY: 'test-key' };
    const voyage = stubVoyage();
    assert.equal(await main(['index'], { cwd: root, env, print }), 0);
    assert.match(
      out.at(-1)!,
      /^Indexed [0-9a-f]{12} in [\d.]+ s: files 2 seen, 0 unchanged, 2 embedded, 0 removed; chunks 2 embedded \(~\d+ tokens\); 0 chunks skipped as secrets\.$/,
    );
    assert.ok(!voyage.sent.some((text) => text.includes('tracked-by-mistake')));

    out = [];
    assert.equal(await main(['index'], { cwd: root, env, print }), 0);
    assert.match(
      out.at(-1)!,
      /files 2 seen, 2 unchanged, 0 embedded, 0 removed; chunks 0 embedded/,
    );

    // Only a committed change is indexed: a staged one and the working tree's are not sent.
    write('api/src/a.ts', 'export const committed = 1;\n');
    git('add', 'api/src/a.ts');
    git('commit', '-q', '-m', 'change');
    write('api/src/a.ts', 'export const staged = 1;\n');
    git('add', 'api/src/a.ts');
    write('api/src/a.ts', 'export const unstaged = 1;\n');
    write('api/src/new.ts', 'export const untracked = 1;\n');
    write('api/src/added.ts', 'export const added = 1;\n');
    git('add', 'api/src/added.ts');
    voyage.sent.length = 0;
    out = [];
    assert.equal(await main(['index'], { cwd: root, env, print }), 0);
    assert.match(out.at(-1)!, /files 2 seen, 1 unchanged, 1 embedded/);
    assert.deepEqual(voyage.sent, ['api/src/a.ts committed\nexport const committed = 1;']);

    out = [];
    assert.equal(await main(['index', '--full'], { cwd: root, env, print }), 0);
    assert.equal(out[0], 'Rebuilding (--full).');
    assert.match(out.at(-1)!, /0 unchanged, 2 embedded/);

    const store = new Store(
      indexFile(root),
      { model: 'voyage-code-4', dimension: 1024 },
      {
        readOnly: true,
      },
    );
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
    assert.equal(store.meta().indexedCommit, head.trim());
    assert.deepEqual(store.counts(), { files: 2, chunks: 2 });
    store.close();
  });

  it('refuses a run whose flag npm took as its own, before any request', async () => {
    const { fetch } = stubVoyage();
    for (const env of [{ npm_config_dry_run: 'true' }, { npm_config_full: 'true' }]) {
      err = [];
      const code = await main(['index'], {
        cwd: root,
        env: { ...env, VOYAGE_API_KEY: 'k' },
        print,
      });
      assert.equal(code, 2);
      assert.match(err[0]!, /run `npm run rag:index -- --(dry-run|full)`/);
    }
    assert.equal(fetch.mock.callCount(), 0);
    const passed = { npm_config_dry_run: 'true', VOYAGE_API_KEY: 'k' };
    assert.equal(await main(['index', '--dry-run'], { cwd: root, env: passed, print }), 0);
  });

  it('refuses an unknown command or flag', async () => {
    assert.equal(await main(['search'], { cwd: root, env: {}, print }), 2);
    assert.equal(await main(['index', '--fast'], { cwd: root, env: {}, print }), 2);
    assert.equal(await main(['index', '--full', '--dry-run'], { cwd: root, env: {}, print }), 2);
    assert.match(err[0]!, /^Usage/);
  });
});
