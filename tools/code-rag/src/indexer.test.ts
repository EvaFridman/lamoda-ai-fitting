import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';

import { FakeEmbedder, MAX_BATCH_TEXTS, type Embedder } from './embed.ts';
import type { TrackedFile } from './files.ts';
import { describeSecret, prepareFile, updateIndex } from './indexer.ts';
import { Store } from './store.ts';

const AWS_KEY = ['AKIA', 'ABCDEFGHIJKLMNOP'].join('');

/** A repository of files by path, with blobs by their hash, as `git` would give them. */
function repository(contents: Record<string, string>) {
  const blobs = new Map<string, string>();
  const files: TrackedFile[] = Object.entries(contents).map(([path, text]) => {
    const blobHash = createHash('sha1').update(text).digest('hex');
    blobs.set(blobHash, text);
    return { path, mode: '100644', blobHash, size: text.length, stage: 0 };
  });
  const read: string[][] = [];
  const readBlobs = (hashes: string[]) => {
    read.push(hashes);
    return new Map(hashes.map((hash) => [hash, blobs.get(hash)!]));
  };
  return { files, readBlobs, read };
}

function setup() {
  const embedder = new FakeEmbedder();
  const store = new Store(':memory:', { model: embedder.model, dimension: embedder.dimension });
  const logs: string[] = [];
  const run = (contents: Record<string, string>) => {
    embedder.calls = [];
    const repo = repository(contents);
    return updateIndex({ ...repo, store, embedder, log: (line) => logs.push(line) }).then(
      (summary) => ({ summary, read: repo.read }),
    );
  };
  return { embedder, store, logs, run };
}

const embeddedPaths = (embedder: FakeEmbedder) =>
  new Set(embedder.calls.flatMap((call) => call.texts.map((text) => text.split(' ')[0])));

const START = {
  'api/src/a.ts': 'export const a = 1;\n\nexport function b() {}\n',
  'api/src/c.ts': 'export class C {}\n',
  'specs/x.md': '# X\n\nText.\n',
};

describe('updateIndex', () => {
  it('embeds every file the first time, then nothing while nothing changes', async () => {
    const { embedder, store, run } = setup();
    const first = await run(START);
    assert.deepEqual(first.summary, {
      seen: 3,
      unchanged: 0,
      embedded: 3,
      removed: 0,
      chunks: 4,
      tokens: first.summary.tokens,
      secrets: 0,
    });
    assert.ok(first.summary.tokens > 0);
    assert.deepEqual(store.counts(), { files: 3, chunks: 4 });
    assert.ok(embedder.calls.every((call) => call.inputType === 'document'));

    const second = await run(START);
    assert.deepEqual(second.summary, {
      seen: 3,
      unchanged: 3,
      embedded: 0,
      removed: 0,
      chunks: 0,
      tokens: 0,
      secrets: 0,
    });
    assert.equal(embedder.calls.length, 0);
    assert.deepEqual(second.read, [[]]);
    store.close();
  });

  it("embeds only a changed file's chunks and replaces its old ones", async () => {
    const { embedder, store, run } = setup();
    await run(START);
    const { summary, read } = await run({ ...START, 'api/src/c.ts': 'export class D {}\n' });

    assert.equal(summary.embedded, 1);
    assert.equal(summary.chunks, 1);
    assert.deepEqual(embeddedPaths(embedder), new Set(['api/src/c.ts']));
    assert.equal(read[0]!.length, 1);
    assert.deepEqual(store.counts(), { files: 3, chunks: 4 });
    const [vector] = await embedder.embed(['C'], 'query');
    const results = store.search({ vector: vector!, text: 'C D', limit: 8 });
    assert.deepEqual(
      results.filter((result) => result.path === 'api/src/c.ts').map((result) => result.symbol),
      ['D'],
    );
    store.close();
  });

  it('deletes a removed file', async () => {
    const { store, run } = setup();
    await run(START);
    const { 'api/src/c.ts': _removed, ...rest } = START;
    const { summary } = await run(rest);
    assert.equal(summary.removed, 1);
    assert.equal(summary.embedded, 0);
    assert.equal(store.fileHashes().has('api/src/c.ts'), false);
    assert.deepEqual(store.counts(), { files: 2, chunks: 3 });
    store.close();
  });

  it('never sends a chunk that looks like a secret, and names it', async () => {
    const { embedder, store, logs, run } = setup();
    const { summary } = await run({
      'api/src/keys.spec.ts': `export const fine = 1;\n\nexport const key = '${AWS_KEY}';\n`,
    });
    assert.equal(summary.secrets, 1);
    assert.equal(summary.chunks, 1);
    const sent = embedder.calls.flatMap((call) => call.texts).join('\n');
    assert.ok(!sent.includes(AWS_KEY));
    assert.ok(
      logs.includes('api/src/keys.spec.ts:3-3 looks like it holds a secret (line 3): not indexed'),
    );
    // The file is indexed with its other chunk, so the next run leaves it alone.
    assert.equal(store.fileHashes().size, 1);
    store.close();
  });

  it('sends the chunks in requests of at most 128 texts, writing each group once embedded', async () => {
    const { embedder, store, run } = setup();
    const many = Object.fromEntries(
      Array.from({ length: 300 }, (_, i) => [`api/src/f${i}.ts`, `export const v${i} = ${i};\n`]),
    );
    const { summary } = await run(many);
    assert.equal(summary.embedded, 300);
    assert.ok(embedder.calls.length >= 3);
    assert.ok(embedder.calls.every((call) => call.texts.length <= MAX_BATCH_TEXTS));
    assert.deepEqual(store.counts(), { files: 300, chunks: 300 });
    store.close();
  });

  it('keeps the groups written before a failed request', async () => {
    const fake = new FakeEmbedder();
    let calls = 0;
    const failing: Embedder = {
      model: fake.model,
      dimension: fake.dimension,
      embed: (texts, inputType) =>
        ++calls === 2 ? Promise.reject(new Error('Voyage down')) : fake.embed(texts, inputType),
    };
    const store = new Store(':memory:', { model: fake.model, dimension: fake.dimension });
    const many = Object.fromEntries(
      Array.from({ length: 200 }, (_, i) => [`api/src/f${i}.ts`, `export const v${i} = ${i};\n`]),
    );
    const repo = repository(many);
    await assert.rejects(updateIndex({ ...repo, store, embedder: failing }), /Voyage down/);
    assert.equal(store.counts().files, MAX_BATCH_TEXTS);
    store.close();
  });
});

describe('prepareFile', () => {
  it("checks the embedded text's path and symbol too", () => {
    // The child section's text holds no secret, but its symbol carries the parent's heading.
    const token = ['sk-', 'abcdefghijklmnopqrstuvwx1234'].join('');
    const prepared = prepareFile(
      'specs/notes.md',
      'b1',
      `# ${token}\n\nOne.\n\n## Child\n\nTwo.\n`,
    );
    assert.deepEqual(
      prepared.secrets.map((skip) => [skip.startLine, skip.endLine, skip.line]),
      [
        [1, 4, null],
        [5, 7, null],
      ],
    );
    assert.equal(prepared.chunks.length, 0);
    assert.equal(
      describeSecret(prepared.secrets[1]!),
      'specs/notes.md:5-7 looks like it holds a secret (its path or symbol): not indexed',
    );
  });

  it('checks the path', () => {
    const prepared = prepareFile(`specs/${AWS_KEY}.md`, 'b1', 'Plain text.\n');
    assert.equal(prepared.chunks.length, 0);
    assert.equal(prepared.secrets[0]!.line, null);
  });

  it('counts the estimated tokens of what it would send', () => {
    const prepared = prepareFile('api/src/a.ts', 'b1', 'export const a = 1;\n');
    assert.equal(prepared.tokens, Math.ceil('api/src/a.ts a\nexport const a = 1;'.length / 3.5));
  });
});
