import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, describe, it } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { indexFile } from './cli.ts';
import { FakeEmbedder, VOYAGE_MODEL, VOYAGE_URL, type Embedder } from './embed.ts';
import { listTrackedFiles, readBlobs, selectFiles } from './files.ts';
import { updateIndex } from './indexer.ts';
import {
  createServer,
  MAX_LIMIT,
  queryData,
  SNIPPET_LINES,
  STATUS_NAMES,
  type ServerOptions,
} from './server.ts';
import { Store } from './store.ts';

// A hook's git variables would point the commands below at the outer repository.
for (const name of Object.keys(process.env)) if (name.startsWith('GIT_')) delete process.env[name];

const roots: string[] = [];
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

/** The Voyage model's name, so the index matches the server's default settings. */
const fake = new FakeEmbedder({ model: VOYAGE_MODEL });

class Repo {
  readonly root = mkdtempSync(join(tmpdir(), 'code-rag-server-'));

  constructor() {
    roots.push(this.root);
    this.git('init', '-q');
  }

  git(...args: string[]): string {
    return execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], {
      cwd: this.root,
      encoding: 'utf8',
    }).trim();
  }

  write(path: string, text: string): void {
    mkdirSync(dirname(join(this.root, path)), { recursive: true });
    writeFileSync(join(this.root, path), text);
  }

  commit(message: string): string {
    this.git('add', '-A');
    this.git('commit', '-q', '-m', message);
    return this.git('rev-parse', 'HEAD');
  }

  /** Indexes `HEAD` as `rag:index` does, with the fake embedder. */
  async index(embedder: Embedder = fake): Promise<void> {
    const store = new Store(indexFile(this.root), {
      model: embedder.model,
      dimension: embedder.dimension,
    });
    try {
      await updateIndex({
        files: selectFiles(listTrackedFiles(this.root)).included,
        readBlobs: (hashes) => readBlobs(this.root, hashes),
        store,
        embedder,
      });
      store.setIndexed(this.git('rev-parse', 'HEAD'), new Date('2026-10-26T10:00:00Z'));
    } finally {
      store.close();
    }
  }
}

const LONG = Array.from({ length: 70 }, (_, i) => `// line ${i + 1}`).join('\n');

/** A repository with code, a test, a deploy file, specs in progress and done, and a file outside. */
async function indexedRepo(): Promise<Repo> {
  const repo = new Repo();
  repo.write(
    'api/src/storage/redact.ts',
    'export function redactStorageKeys(event: string): string {\n  return event;\n}\n',
  );
  repo.write('api/src/long.ts', `${LONG}\n`);
  repo.write('api/src/storage/redact.spec.ts', "it('redacts storage keys', () => {});\n");
  repo.write('deploy/scripts/deploy.sh', 'echo storage keys\n');
  repo.write('web/src/a.ts', 'export const storage = 1;\n');
  repo.write('specs/0001-a/plan.md', '# Plan\n\nStatus: draft\n\nStorage keys are redacted.\n');
  repo.write('specs/0002-b/plan.md', '# Plan\n\nStatus: done\n\nStorage keys were redacted.\n');
  repo.write('notes.txt', 'storage keys, outside\n');
  repo.commit('start');
  await repo.index();
  return repo;
}

async function connect(options: ServerOptions) {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer(options).connect(serverSide);
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(clientSide);
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args });
  const content = result.content as { type: string; text: string }[];
  return { isError: result.isError === true, text: content.map((item) => item.text).join('\n') };
}

/** A `fetch` that must not be called, or answers `response` and counts. */
function fetchStub(response?: () => Response) {
  const calls: string[] = [];
  const fetch = (url: string | URL | Request) => {
    calls.push(String(url));
    if (!response) throw new Error('fetch must not be called');
    return Promise.resolve(response());
  };
  return { calls, fetch: fetch as typeof globalThis.fetch };
}

describe('the code index server', () => {
  it('serves three tools, the searches with a bounded limit', async () => {
    const repo = await indexedRepo();
    const client = await connect({ root: repo.root, embedder: fake });
    const { tools } = await client.listTools();

    assert.deepEqual(tools.map((tool) => tool.name).sort(), [
      'index_status',
      'search_code',
      'search_docs',
    ]);
    const byName = new Map(tools.map((tool) => [tool.name, tool]));
    const code = byName.get('search_code')!.inputSchema.properties!;
    assert.deepEqual(Object.keys(code).sort(), ['kinds', 'limit', 'pathPrefix', 'query']);
    assert.deepEqual(code.limit, {
      type: 'integer',
      minimum: 1,
      maximum: MAX_LIMIT,
      default: 8,
    });
    assert.deepEqual((code.kinds as { items: { enum: string[] } }).items.enum, [
      'code',
      'test',
      'deploy',
    ]);
    assert.deepEqual(byName.get('search_code')!.inputSchema.required, ['query']);
    const docs = byName.get('search_docs')!.inputSchema.properties!;
    assert.deepEqual(Object.keys(docs).sort(), ['limit', 'query']);
    // The query leaves the machine: its description says so.
    assert.match(JSON.stringify(code.query), /sent to Voyage AI/);
    for (const tool of tools) assert.equal(tool.annotations?.readOnlyHint, true, tool.name);
  });

  it('refuses a limit above the bound and an empty query', async () => {
    const repo = await indexedRepo();
    const client = await connect({ root: repo.root, embedder: fake });

    const over = await call(client, 'search_code', { query: 'storage', limit: MAX_LIMIT + 1 });
    assert.ok(over.isError);
    assert.match(over.text, /limit/);
    const blank = await call(client, 'search_docs', { query: '   ' });
    assert.ok(blank.isError);
    assert.match(blank.text, /The query is empty/);
    assert.equal(fake.calls.filter((c) => c.texts[0] === '   ').length, 0);
  });

  it('finds a symbol by its name, with the status line and the result line (AC4, AC5)', async () => {
    const repo = await indexedRepo();
    const head = repo.git('rev-parse', 'HEAD');
    const client = await connect({ root: repo.root, embedder: fake });
    const { isError, text } = await call(client, 'search_code', { query: 'redactStorageKeys' });

    assert.equal(isError, false);
    const [status, , first, ...rest] = text.split('\n');
    assert.equal(
      status,
      `Index: built on ${head.slice(0, 12)} at 2026-10-26T10:00:00.000Z; no files changed since.`,
    );
    assert.match(
      first!,
      /^1\. api\/src\/storage\/redact\.ts:1-3 · redactStorageKeys · code · \d\.\d{4}$/,
    );
    assert.equal(rest[0], '     1  export function redactStorageKeys(event: string): string {');
    assert.ok(
      fake.calls.some((c) => c.inputType === 'query' && c.texts[0] === 'redactStorageKeys'),
    );
  });

  it('keeps search_code to code, tests and deploy files, filtered by kind and path', async () => {
    const repo = await indexedRepo();
    const client = await connect({ root: repo.root, embedder: fake });
    const paths = (text: string) =>
      [...new Set([...text.matchAll(/^\d+\. ([^:]+):/gm)].map((match) => match[1]))].sort();

    const all = await call(client, 'search_code', { query: 'storage keys', limit: MAX_LIMIT });
    assert.deepEqual(paths(all.text), [
      'api/src/long.ts',
      'api/src/storage/redact.spec.ts',
      'api/src/storage/redact.ts',
      'deploy/scripts/deploy.sh',
      'web/src/a.ts',
    ]);
    const tests = await call(client, 'search_code', { query: 'storage keys', kinds: ['test'] });
    assert.deepEqual(paths(tests.text), ['api/src/storage/redact.spec.ts']);
    assert.match(tests.text, / · test · /);
    const web = await call(client, 'search_code', { query: 'storage', pathPrefix: 'web/' });
    assert.deepEqual(paths(web.text), ['web/src/a.ts']);
    const none = await call(client, 'search_code', { query: 'storage', pathPrefix: 'nowhere/' });
    assert.match(none.text, /\n\nNo results\.$/);
  });

  it("keeps search_docs to specs and Markdown, each spec's status shown", async () => {
    const repo = await indexedRepo();
    const client = await connect({ root: repo.root, embedder: fake });
    const { text } = await call(client, 'search_docs', { query: 'storage keys redacted' });

    assert.match(text, /specs\/0001-a\/plan\.md:\d+-\d+ · .* · spec\/binding · /);
    assert.match(text, /specs\/0002-b\/plan\.md:\d+-\d+ · .* · spec\/history · /);
    assert.doesNotMatch(text, /api\/src|deploy\//);
  });

  it(`cuts a snippet at ${SNIPPET_LINES} lines`, async () => {
    const repo = await indexedRepo();
    const client = await connect({ root: repo.root, embedder: fake });
    const { text } = await call(client, 'search_code', {
      query: 'line',
      pathPrefix: 'api/src/long.ts',
      limit: 1,
    });
    const lines = text.split('\n').slice(3);
    // The window holds 60 of the file's lines.
    assert.equal(lines.length, SNIPPET_LINES + 1);
    assert.equal(lines[SNIPPET_LINES - 1], '    40  // line 40');
    assert.equal(lines[SNIPPET_LINES], '        … 20 more lines');
  });

  it('names every indexable file changed since the indexed commit, committed or not (AC5)', async () => {
    const repo = await indexedRepo();
    const indexed = repo.git('rev-parse', 'HEAD');
    repo.write('web/src/committed.ts', 'export const c = 1;\n');
    repo.commit('later');
    repo.write('api/src/storage/redact.ts', 'export const edited = 1;\n');
    repo.write('api/src/a.spec.ts', "it('staged', () => {});\n");
    repo.git('add', 'api/src/a.spec.ts');
    repo.write('specs/0001-a/new/untracked.md', '# New\n');
    rmSync(join(repo.root, 'deploy/scripts/deploy.sh'));
    repo.write('notes.txt', 'outside, edited\n');
    repo.write('web/src/logo.png', 'not text');
    const client = await connect({ root: repo.root, embedder: fake });

    const stale = [
      'api/src/a.spec.ts',
      'api/src/storage/redact.ts',
      'deploy/scripts/deploy.sh',
      'specs/0001-a/new/untracked.md',
      'web/src/committed.ts',
    ];
    const status = await call(client, 'index_status');
    assert.equal(status.isError, false);
    assert.equal(
      status.text,
      [
        `Index: built on ${indexed.slice(0, 12)} at 2026-10-26T10:00:00.000Z; 5 changed since, ` +
          `not in the index (read them directly, or run \`npm run rag:index\`): ${stale.join(', ')}.`,
        `Model: ${VOYAGE_MODEL}, 1024 dimensions.`,
        // `long.ts` is two windows.
        'Indexed: 7 files, 8 chunks.',
        'Changed since:',
        ...stale.map((path) => `- ${path}`),
      ].join('\n'),
    );
    const search = await call(client, 'search_code', { query: 'storage' });
    assert.equal(search.text.split('\n')[0], status.text.split('\n')[0]);
  });

  it(`names at most ${STATUS_NAMES} stale files in the status line, all in index_status`, async () => {
    const repo = await indexedRepo();
    for (let i = 0; i < STATUS_NAMES + 2; i++)
      repo.write(`api/src/new-${String(i).padStart(2, '0')}.ts`, '1\n');
    const client = await connect({ root: repo.root, embedder: fake });

    const { text } = await call(client, 'index_status');
    const [line, ...rest] = text.split('\n');
    assert.match(
      line!,
      /; 12 changed since, .*: api\/src\/new-00\.ts, .*api\/src\/new-09\.ts and 2 more\.$/,
    );
    assert.doesNotMatch(line!, /new-10/);
    assert.equal(rest.filter((entry) => entry.startsWith('- ')).length, 12);
  });

  it('says so when the indexed commit is not in this history (a rebase)', async () => {
    const repo = await indexedRepo();
    const indexed = repo.git('rev-parse', 'HEAD');
    repo.write('api/src/b.ts', 'export const b = 1;\n');
    repo.git('add', '-A');
    repo.git('commit', '-q', '--amend', '-m', 'rewritten');
    const client = await connect({ root: repo.root, embedder: fake });

    const { isError, text } = await call(client, 'index_status');
    assert.equal(isError, false);
    assert.equal(
      text.split('\n')[0],
      `Index: built on ${indexed.slice(0, 12)}, a commit not in this history, run \`npm run rag:index\`.`,
    );
  });

  it('says no run has finished for an index without a commit, or with a malformed one', async () => {
    const repo = await indexedRepo();
    for (const set of [
      (store: Store) => store.clearIndexed(),
      (store: Store) => store.setIndexed('--output=/tmp/x', new Date()),
    ]) {
      const store = new Store(indexFile(repo.root), {
        model: fake.model,
        dimension: fake.dimension,
      });
      set(store);
      store.close();
      const client = await connect({ root: repo.root, embedder: fake });
      const { isError, text } = await call(client, 'search_code', { query: 'storage' });
      assert.equal(isError, false);
      assert.equal(text.split('\n')[0], 'Index: no run has finished, run `npm run rag:index`.');
    }
  });

  it('names both paths of a rename', async () => {
    const repo = await indexedRepo();
    repo.git('mv', 'web/src/a.ts', 'web/src/b.ts');
    const client = await connect({ root: repo.root, embedder: fake });
    const { text } = await call(client, 'index_status');
    assert.match(text.split('\n')[0]!, /: web\/src\/a\.ts, web\/src\/b\.ts\.$/);
  });

  it("never writes git's index (a commit made at the same time would fail)", async () => {
    const repo = await indexedRepo();
    // The same content with another mtime: a plain `git status` would refresh `.git/index`.
    const past = new Date('2020-01-01T00:00:00Z');
    utimesSync(join(repo.root, 'api/src/storage/redact.ts'), past, past);
    const gitIndex = join(repo.root, '.git/index');
    const before = readFileSync(gitIndex);
    const client = await connect({ root: repo.root, embedder: fake });
    await call(client, 'index_status');
    await call(client, 'search_code', { query: 'storage' });
    assert.deepEqual(readFileSync(gitIndex), before);
  });

  it('answers an index being written with "search again", not "run rag:index"', async () => {
    const repo = await indexedRepo();
    const writer = new DatabaseSync(indexFile(repo.root));
    writer.exec('begin exclusive');
    try {
      const client = await connect({ root: repo.root, embedder: fake });
      const { isError, text } = await call(client, 'index_status');
      assert.ok(isError);
      assert.equal(text, '`npm run rag:index` is writing the index: search again shortly.');
    } finally {
      writer.exec('rollback');
      writer.close();
    }
  });

  it('answers an index it cannot read as a tool error that says to rebuild', async () => {
    const repo = await indexedRepo();
    writeFileSync(
      indexFile(repo.root),
      'not a database, but long enough to look like a file header',
    );
    const client = await connect({ root: repo.root, embedder: fake });
    const { isError, text } = await call(client, 'index_status');
    assert.ok(isError);
    assert.match(text, /^The index cannot be read \(.+\): run `npm run rag:index`$/);
  });

  it('refuses a query that looks like data, sending nothing (Q20)', async () => {
    const repo = await indexedRepo();
    const { calls, fetch } = fetchStub();
    const client = await connect({
      root: repo.root,
      env: { VOYAGE_API_KEY: 'pa-test-key-not-a-real-one' },
      fetch,
    });
    for (const [query, what] of [
      ['upload failed for anna.ivanova@example.com', 'an email'],
      ['fitting 3f2b8c1e-9a4d-4e7b-8c2a-1b2c3d4e5f60 not found', 'a uuid'],
      ['phone 79161234567 refused', 'a run of 10 or more digits'],
      ['GET /photo.webp?X-Amz-Signature=abc 403', 'a signed link'],
      ['keep/users/u1/photos/a.webp missing', "a user's storage key"],
      ['Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0', 'a secret'],
    ]) {
      for (const name of ['search_code', 'search_docs']) {
        const { isError, text } = await call(client, name, { query });
        assert.ok(isError, `${name}: ${query}`);
        assert.match(
          text,
          new RegExp(`^The query looks like it holds ${what}, .*nothing was sent`),
        );
      }
    }
    assert.deepEqual(calls, []);
  });

  it('lets a query of code terms, dates and error codes through', () => {
    for (const query of [
      'where are storage paths cut out of Sentry events',
      'PHOTO_REFUSED 400 on POST /me/photos after 2026-10-26',
      'redactStorageKeys sentry.options.ts',
      'fitting timeout 120000 ms',
    ]) {
      assert.equal(queryData(query), null, query);
    }
  });

  it('answers a missing index as a tool error and creates nothing (AC6)', async () => {
    const repo = new Repo();
    repo.write('api/src/a.ts', 'export const a = 1;\n');
    repo.commit('start');
    const client = await connect({ root: repo.root, embedder: fake });

    for (const [name, args] of [
      ['index_status', {}],
      ['search_code', { query: 'a' }],
      ['search_docs', { query: 'a' }],
    ] as const) {
      const { isError, text } = await call(client, name, args);
      assert.ok(isError, name);
      assert.equal(text, 'The index is empty: run `npm run rag:index`', name);
    }
    assert.equal(existsSync(join(repo.root, '.rag')), false);
  });

  it('answers an index of another model as a tool error and leaves it as it is', async () => {
    const repo = await indexedRepo();
    const before = readFileSync(indexFile(repo.root));
    const client = await connect({
      root: repo.root,
      embedder: new FakeEmbedder({ model: 'other' }),
    });

    const { isError, text } = await call(client, 'index_status');
    assert.ok(isError);
    assert.equal(
      text,
      `The index was built with the model ${VOYAGE_MODEL}, the code's is other: run \`npm run rag:index\``,
    );
    assert.deepEqual(readFileSync(indexFile(repo.root)), before);
  });

  it('answers a missing key as a tool error with no request, the status still served (AC6)', async () => {
    const repo = await indexedRepo();
    const { calls, fetch } = fetchStub();
    const client = await connect({ root: repo.root, env: {}, fetch });

    const search = await call(client, 'search_code', { query: 'storage' });
    assert.ok(search.isError);
    assert.match(search.text, /^VOYAGE_API_KEY is not set: .*\.env\.example/);
    assert.deepEqual(calls, []);
    const status = await call(client, 'index_status');
    assert.equal(status.isError, false);
  });

  it('answers a 429 at once with one request, as a tool error that says to wait', async () => {
    const repo = await indexedRepo();
    const { calls, fetch } = fetchStub(() => new Response('rate limited', { status: 429 }));
    const client = await connect({
      root: repo.root,
      env: { VOYAGE_API_KEY: 'pa-test-key-not-a-real-one' },
      fetch,
    });

    const started = performance.now();
    const { isError, text } = await call(client, 'search_docs', { query: 'storage' });
    assert.ok(isError);
    assert.match(text, /^Voyage answered 429: rate limited\n.*search again in a minute/);
    assert.deepEqual(calls, [VOYAGE_URL]);
    assert.ok(performance.now() - started < 5000);
  });

  it('answers another failure as a tool error, not a crash', async () => {
    const repo = await indexedRepo();
    const broken: Embedder = {
      model: fake.model,
      dimension: fake.dimension,
      embed: () => Promise.reject(new TypeError('boom')),
    };
    const client = await connect({ root: repo.root, embedder: broken });

    const first = await call(client, 'search_code', { query: 'storage' });
    assert.ok(first.isError);
    assert.equal(first.text, 'code-rag failed: TypeError: boom');
    // The server still answers.
    assert.equal((await call(client, 'index_status')).isError, false);
  });
});
