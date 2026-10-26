import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, describe, it } from 'node:test';
import { getLoadablePath } from 'sqlite-vec';

import { chunkFile, embeddedText, type Chunk } from './chunk.ts';
import { FakeEmbedder, type Embedder } from './embed.ts';
import { ftsQuery, IndexMismatchError, SCHEMA_VERSION, Store } from './store.ts';

const dir = mkdtempSync(join(tmpdir(), 'code-rag-store-'));
after(() => rmSync(dir, { recursive: true, force: true }));
let files = 0;
const newFile = () => join(dir, `index-${files++}.sqlite`);

const fake = new FakeEmbedder();
const SETTINGS = { model: fake.model, dimension: fake.dimension };

/** An embedder whose vectors say nothing: every text gets the same one. */
const blind: Embedder = {
  model: fake.model,
  dimension: fake.dimension,
  embed: (texts) => Promise.resolve(texts.map(() => fake.vector('same'))),
};

const SOURCES = [
  {
    path: 'web/sentry.options.ts',
    text: [
      '// Cuts the bucket out of every event before it leaves the browser.',
      'export function redactStorageKeys(event: unknown) {',
      '  return event;',
      '}',
      '',
    ].join('\n'),
  },
  {
    path: 'web/src/widgets/product-grid/grid.tsx',
    text: 'export function ProductGrid() {\n  return renderCatalogRows();\n}\n',
  },
  {
    path: 'api/src/products/products.service.ts',
    text: 'export class ProductsService {\n  list() {\n    return [];\n  }\n}\n',
  },
  {
    path: 'specs/0001-bootstrap/plan.md',
    text: 'Status: done\n\n# Plan\n\nThe monorepo holds api and web.\n',
  },
];

function chunksOf(path: string, text: string, blobHash = 'b1'): Chunk[] {
  return chunkFile({ path, text, blobHash });
}

async function fill(store: Store, embedder: Embedder = fake) {
  for (const { path, text } of SOURCES) {
    const chunks = chunksOf(path, text);
    store.replaceFile(
      path,
      'b1',
      chunks,
      await embedder.embed(chunks.map(embeddedText), 'document'),
    );
  }
}

async function search(store: Store, text: string, embedder: Embedder = fake, extra = {}) {
  const [vector] = await embedder.embed([text], 'query');
  return store.search({ vector: vector!, text, limit: 8, ...extra });
}

describe('Store', () => {
  it('stores chunks and answers them with their fields', async () => {
    const store = new Store(newFile(), SETTINGS);
    assert.equal(store.rebuildReason, null);
    await fill(store);

    // The plan is two chunks: its status line and its section.
    assert.deepEqual(store.counts(), { files: 4, chunks: 5 });
    assert.equal(store.fileHashes().get('web/sentry.options.ts'), 'b1');
    const [first] = await search(store, 'ProductsService');
    assert.deepEqual(
      { ...first!, score: undefined },
      {
        id: chunksOf(SOURCES[2]!.path, SOURCES[2]!.text)[0]!.id,
        path: 'api/src/products/products.service.ts',
        startLine: 1,
        endLine: 5,
        kind: 'code',
        symbol: 'ProductsService',
        specStatus: null,
        text: SOURCES[2]!.text.trimEnd(),
        score: undefined,
      },
    );
    assert.ok(first!.score > 0);
    store.close();
  });

  it('finds an exact symbol name through FTS', async () => {
    const store = new Store(newFile(), SETTINGS);
    // The vectors are all the same, so only the words can rank the definition first.
    await fill(store, blind);
    const results = await search(store, 'redactStorageKeys', blind);
    assert.equal(results[0]!.path, 'web/sentry.options.ts');
    assert.equal(results[0]!.symbol, 'redactStorageKeys');
    store.close();
  });

  it('finds a paraphrase through the vectors', async () => {
    const store = new Store(newFile(), SETTINGS);
    await fill(store);
    // FTS5 keeps `redactStorageKeys` one token, and no chunk holds these words alone.
    const results = await search(store, 'redact storage keys');
    assert.equal(results[0]!.path, 'web/sentry.options.ts');
    store.close();
  });

  it('filters by kind and path prefix, and cuts to the limit', async () => {
    const store = new Store(newFile(), SETTINGS);
    await fill(store);
    const specs = await search(store, 'monorepo api web', fake, { kinds: ['spec'] });
    assert.deepEqual(
      specs.map((result) => [result.path, result.specStatus]),
      [
        ['specs/0001-bootstrap/plan.md', 'history'],
        ['specs/0001-bootstrap/plan.md', 'history'],
      ],
    );
    assert.match(specs[0]!.text, /monorepo/);
    const web = await search(store, 'export function', fake, { pathPrefix: 'web/' });
    assert.ok(web.length > 0 && web.every((result) => result.path.startsWith('web/')));
    const one = await search(store, 'export function', fake, { limit: 1 });
    assert.equal(one.length, 1);
    store.close();
  });

  it("replaces a file's chunks and removes a file", async () => {
    const store = new Store(newFile(), SETTINGS);
    await fill(store);
    const path = 'web/sentry.options.ts';
    const changed = chunksOf(path, 'export const sentryOptions = {};\n', 'b2');
    store.replaceFile(path, 'b2', changed, await fake.embed(changed.map(embeddedText), 'document'));

    assert.equal(store.fileHashes().get(path), 'b2');
    assert.deepEqual(store.counts(), { files: 4, chunks: 5 });
    const old = await search(store, 'redactStorageKeys', blind);
    assert.ok(old.every((result) => result.symbol !== 'redactStorageKeys'));

    store.removeFile(path);
    assert.equal(store.fileHashes().has(path), false);
    assert.deepEqual(store.counts(), { files: 3, chunks: 4 });
    const gone = await search(store, 'sentryOptions');
    assert.ok(gone.every((result) => result.path !== path));
    store.close();
  });

  it('keeps a file of no chunks, so it counts as indexed', () => {
    const store = new Store(newFile(), SETTINGS);
    store.replaceFile('specs/empty.md', 'b0', [], []);
    assert.equal(store.fileHashes().get('specs/empty.md'), 'b0');
    store.close();
  });

  it('refuses vectors that do not match the chunks', () => {
    const store = new Store(newFile(), SETTINGS);
    const chunks = chunksOf('a.ts', 'export const a = 1;\n');
    assert.throws(() => store.replaceFile('a.ts', 'b1', chunks, []));
    assert.throws(() => store.replaceFile('a.ts', 'b1', chunks, [new Float32Array(3)]));
    assert.deepEqual(store.counts(), { files: 0, chunks: 0 });
    store.close();
  });

  it('keeps the indexed commit and time', () => {
    const file = newFile();
    const store = new Store(file, SETTINGS);
    assert.deepEqual(store.meta(), {
      schemaVersion: SCHEMA_VERSION,
      ...SETTINGS,
      indexedCommit: null,
      indexedAt: null,
    });
    store.setIndexed('abc123', new Date('2026-10-26T10:00:00Z'));
    store.setIndexed('def456', new Date('2026-10-26T11:00:00Z'));
    store.close();
    const again = new Store(file, SETTINGS, { readOnly: true });
    assert.equal(again.meta().indexedCommit, 'def456');
    assert.equal(again.meta().indexedAt, '2026-10-26T11:00:00.000Z');
    again.close();
  });

  it('rebuilds an index of another model or dimension', async () => {
    const file = newFile();
    const store = new Store(file, SETTINGS);
    await fill(store);
    store.close();

    const otherModel = new Store(file, { ...SETTINGS, model: 'voyage-code-5' });
    assert.match(otherModel.rebuildReason!, /model fake.*voyage-code-5/);
    assert.deepEqual(otherModel.counts(), { files: 0, chunks: 0 });
    otherModel.close();

    const otherDimension = new Store(file, { model: 'voyage-code-5', dimension: 256 });
    assert.match(otherDimension.rebuildReason!, /1024 dimensions/);
    otherDimension.replaceFile('a.ts', 'b1', chunksOf('a.ts', 'export const a = 1;\n'), [
      new Float32Array(256).fill(0.0625),
    ]);
    assert.deepEqual(otherDimension.counts(), { files: 1, chunks: 1 });
    otherDimension.close();
  });

  it('empties the index on clear', async () => {
    const store = new Store(newFile(), SETTINGS);
    await fill(store);
    store.setIndexed('abc', new Date());
    store.clear();
    assert.deepEqual(store.counts(), { files: 0, chunks: 0 });
    assert.equal(store.meta().indexedCommit, null);
    store.close();
  });

  it('opened read-only, refuses a mismatched index and leaves it as it was', async () => {
    const file = newFile();
    const store = new Store(file, SETTINGS);
    await fill(store);
    store.close();

    assert.throws(
      () => new Store(file, { ...SETTINGS, model: 'other' }, { readOnly: true }),
      (error: Error) =>
        error instanceof IndexMismatchError && /built with the model fake/.test(error.message),
    );
    const reader = new Store(file, SETTINGS, { readOnly: true });
    assert.deepEqual(reader.counts(), { files: 4, chunks: 5 });
    assert.ok((await search(reader, 'redactStorageKeys')).length > 0);
    assert.throws(() => reader.removeFile('web/sentry.options.ts'), /readonly/);
    reader.close();
  });

  it('opened read-only, says a missing index file is empty and creates none', () => {
    const file = join(dir, 'missing', 'index.sqlite');
    assert.throws(
      () => new Store(file, SETTINGS, { readOnly: true }),
      (error: Error) =>
        error instanceof IndexMismatchError && /index is empty.*rag:index/.test(error.message),
    );
    assert.equal(existsSync(file), false);
  });

  it('rebuilds an index of another schema version', async () => {
    const file = newFile();
    const store = new Store(file, SETTINGS);
    await fill(store);
    store.close();
    const db = new DatabaseSync(file);
    db.prepare("update meta set value = '0' where key = 'schemaVersion'").run();
    db.close();

    const again = new Store(file, SETTINGS);
    assert.equal(again.rebuildReason, `with schema 0, the code's is ${SCHEMA_VERSION}`);
    assert.deepEqual(again.counts(), { files: 0, chunks: 0 });
    assert.equal(again.meta().schemaVersion, SCHEMA_VERSION);
    again.close();
  });

  it('leaves no vector or FTS5 row behind a replaced or removed file', async () => {
    const file = newFile();
    const store = new Store(file, SETTINGS);
    await fill(store);
    const changed = chunksOf('web/sentry.options.ts', 'export const a = 1;\n', 'b2');
    store.replaceFile('web/sentry.options.ts', 'b2', changed, [fake.vector('a')]);
    store.removeFile('specs/0001-bootstrap/plan.md');
    store.close();

    const db = new DatabaseSync(file, { allowExtension: true, readOnly: true });
    db.loadExtension(getLoadablePath());
    const count = (table: string) =>
      (db.prepare(`select count(*) as n from ${table}`).get() as { n: number }).n;
    assert.deepEqual(['chunks', 'chunks_vec', 'chunks_fts'].map(count), [3, 3, 3]);
    const orphans = db
      .prepare(
        'select count(*) as n from chunks_fts f left join chunks c on c.seq = f.rowid where c.id is null or c.id != f.id',
      )
      .get() as { n: number };
    assert.equal(orphans.n, 0);
    db.close();
  });

  it('fills the limit from the filtered kind even when others are nearer by far', async () => {
    const store = new Store(newFile(), SETTINGS);
    // 300 code chunks that match the query better than the one spec.
    for (let i = 0; i < 300; i++) {
      const path = `api/src/m${i}.ts`;
      const chunks = chunksOf(path, `export const storageKey${i} = 'storage key cut';\n`);
      store.replaceFile(path, 'b1', chunks, await fake.embed(chunks.map(embeddedText), 'document'));
    }
    const spec = chunksOf('specs/0011-x/plan.md', '# Keys\n\nStorage keys are cut by keys.ts.\n');
    store.replaceFile(
      'specs/0011-x/plan.md',
      'b1',
      spec,
      await fake.embed(spec.map(embeddedText), 'document'),
    );
    const vectorsOnly = await search(store, 'storagekey', fake, { kinds: ['spec'], limit: 1 });
    assert.deepEqual(
      vectorsOnly.map((result) => result.path),
      ['specs/0011-x/plan.md'],
    );
    const byPrefix = await search(store, 'storage key cut', fake, {
      pathPrefix: 'api/src/m29',
      limit: 8,
    });
    // Eleven files start so (m29, m290–m299) among 301 chunks: the limit is filled from them.
    assert.equal(byPrefix.length, 8);
    assert.ok(byPrefix.every((result) => result.path.startsWith('api/src/m29')));
    store.close();
  });

  it('refuses a limit below one or not whole, and answers nothing for no kinds', async () => {
    const store = new Store(newFile(), SETTINGS);
    await fill(store);
    for (const limit of [0, -1, 1.5]) {
      assert.throws(
        () => store.search({ vector: fake.vector('a'), text: 'a', limit }),
        /Bad limit/,
      );
    }
    assert.deepEqual(await search(store, 'export', fake, { kinds: [] }), []);
    assert.ok((await search(store, 'export', fake, { limit: 10_000 })).length > 0);
    store.close();
  });

  it('opened read-only, says an index file without tables is empty', async () => {
    const { DatabaseSync } = await import('node:sqlite');
    const file = newFile();
    new DatabaseSync(file).close();
    assert.throws(
      () => new Store(file, SETTINGS, { readOnly: true }),
      (error: Error) =>
        error instanceof IndexMismatchError && /index is empty.*rag:index/.test(error.message),
    );
  });
});

describe('ftsQuery', () => {
  it('quotes each word and joins them by OR', () => {
    assert.equal(
      ftsQuery('where is "S3_ENDPOINT" cut?'),
      '"where" OR "is" OR "S3_ENDPOINT" OR "cut"',
    );
  });

  it('answers null for a query of no words', () => {
    assert.equal(ftsQuery(' -- ?! '), null);
  });

  it('keeps FTS5 operators as words', async () => {
    const store = new Store(newFile(), SETTINGS);
    await fill(store);
    await assert.doesNotReject(search(store, 'NOT AND OR NEAR( * ^ redact'));
    store.close();
  });
});
