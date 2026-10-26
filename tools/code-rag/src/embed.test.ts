import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import {
  batches,
  DIMENSION,
  EmbeddingError,
  FakeEmbedder,
  MAX_BATCH_TEXTS,
  MIN_REQUEST_INTERVAL_MS,
  MissingKeyError,
  RateLimitError,
  RETRY_DELAYS_MS,
  TOKENS_PER_MINUTE,
  VOYAGE_URL,
  VoyageEmbedder,
  voyageKey,
  words,
} from './embed.ts';

const KEY = 'pa-test-key-not-a-real-one';

function vectorOf(value: number): number[] {
  return Array.from({ length: DIMENSION }, () => value);
}

function answer(count: number, order = (i: number) => i): Response {
  const data = Array.from({ length: count }, (_, i) => ({
    embedding: vectorOf(order(i)),
    index: order(i),
  }));
  return Response.json({ data, usage: { total_tokens: 1 } });
}

interface Call {
  url: string;
  init: RequestInit;
}

/** A `fetch` answering each call from `responses` in turn, recording the calls. */
function fakeFetch(responses: ((body: { input: string[] }) => Response)[]) {
  const calls: Call[] = [];
  const fetch = (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init! });
    const next = responses[Math.min(calls.length - 1, responses.length - 1)]!;
    return Promise.resolve(next(JSON.parse(String(init!.body)) as { input: string[] }));
  };
  return { calls, fetch: fetch as typeof globalThis.fetch };
}

function embedder(responses: ((body: { input: string[] }) => Response)[], retry?: boolean) {
  const sleeps: number[] = [];
  let clock = 1_000_000;
  const fake = fakeFetch(responses);
  const voyage = new VoyageEmbedder({
    apiKey: KEY,
    fetch: fake.fetch,
    ...(retry === undefined ? {} : { retry }),
    sleep: (ms) => {
      sleeps.push(ms);
      clock += ms;
      return Promise.resolve();
    },
    now: () => clock,
  });
  return { voyage, sleeps, calls: fake.calls };
}

const ok = (body: { input: string[] }) => answer(body.input.length);

describe('batches', () => {
  it('puts at most 128 texts into a batch', () => {
    const sizes = batches(Array.from({ length: 300 }, () => 'x')).map((batch) => batch.length);
    assert.deepEqual(sizes, [MAX_BATCH_TEXTS, MAX_BATCH_TEXTS, 44]);
  });

  it('keeps a batch to about 5 k estimated tokens', () => {
    // 3 500 characters are 1 000 estimated tokens.
    const sizes = batches(Array.from({ length: 12 }, () => 'x'.repeat(3_500))).map(
      (batch) => batch.length,
    );
    assert.deepEqual(sizes, [5, 5, 2]);
  });

  it('sends a text over the limit alone', () => {
    const sizes = batches(['a', 'x'.repeat(400_000), 'b']).map((batch) => batch.length);
    assert.deepEqual(sizes, [1, 1, 1]);
  });

  it('answers no batch for no texts', () => {
    assert.deepEqual(batches([]), []);
  });
});

describe('VoyageEmbedder', () => {
  it("posts Voyage's request and answers the vectors in the texts' order", async () => {
    const { voyage, calls } = embedder([(body) => answer(body.input.length, (i) => 2 - i)]);
    const vectors = await voyage.embed(['a', 'b', 'c'], 'query');

    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, VOYAGE_URL);
    assert.equal(calls[0]!.init.method, 'POST');
    assert.deepEqual(calls[0]!.init.headers, {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
    });
    assert.deepEqual(JSON.parse(String(calls[0]!.init.body)), {
      input: ['a', 'b', 'c'],
      model: 'voyage-code-4',
      input_type: 'query',
      truncation: true,
      output_dimension: 1024,
    });
    assert.deepEqual(
      vectors.map((vector) => vector[0]),
      [0, 1, 2],
    );
    assert.ok(vectors.every((vector) => vector instanceof Float32Array && vector.length === 1024));
  });

  it("keeps the free tier's pace: 20 s at least, longer for the tokens Voyage counted", async () => {
    const counted = [100, 4500, undefined];
    let call = 0;
    const { voyage, sleeps } = embedder([
      (body) => {
        const tokens = counted[call++];
        const data = body.input.map((_, index) => ({ embedding: vectorOf(0), index }));
        return Response.json(
          tokens === undefined ? { data } : { data, usage: { total_tokens: tokens } },
        );
      },
    ]);
    await voyage.embed(['a'], 'document');
    assert.deepEqual(sleeps, []);
    await voyage.embed(['b'], 'document');
    // 100 tokens: the 20 s floor.
    assert.deepEqual(sleeps, [MIN_REQUEST_INTERVAL_MS]);
    await voyage.embed(['c'], 'document');
    // 4 500 tokens at 9 000 a minute: 30 s.
    assert.deepEqual(sleeps, [MIN_REQUEST_INTERVAL_MS, (4500 / TOKENS_PER_MINUTE) * 60_000]);
    // No count: the estimate of 28 000 characters, 8 000 tokens, takes 53.3 s.
    await voyage.embed(['x'.repeat(28_000)], 'document');
    await voyage.embed(['d'], 'document');
    assert.ok(Math.abs(sleeps.at(-1)! - (8000 / TOKENS_PER_MINUTE) * 60_000) < 1);
  });

  it('sends one request per batch', async () => {
    const { voyage, calls } = embedder([ok]);
    const vectors = await voyage.embed(
      Array.from({ length: 130 }, (_, i) => `text ${i}`),
      'document',
    );
    assert.equal(vectors.length, 130);
    assert.deepEqual(
      calls.map((call) => (JSON.parse(String(call.init.body)) as { input: string[] }).input.length),
      [128, 2],
    );
  });

  it('retries a 429 and a 5xx with backoff', async () => {
    const { voyage, calls, sleeps } = embedder([
      () => new Response('slow down', { status: 429 }),
      () => new Response('down', { status: 503 }),
      ok,
    ]);
    const vectors = await voyage.embed(['a'], 'document');
    assert.equal(vectors.length, 1);
    assert.equal(calls.length, 3);
    assert.deepEqual(sleeps, RETRY_DELAYS_MS.slice(0, 2));
  });

  it('splits a batch refused twice for the rate, down to what Voyage takes', async () => {
    // Voyage takes at most two texts a request here.
    const { voyage, calls, sleeps } = embedder([
      (body) => (body.input.length > 2 ? new Response('rate limited', { status: 429 }) : ok(body)),
    ]);
    const vectors = await voyage.embed(['a', 'b', 'c', 'd', 'e'], 'document');

    assert.equal(vectors.length, 5);
    assert.deepEqual(
      calls.map((call) => (JSON.parse(String(call.init.body)) as { input: string[] }).input),
      [
        ['a', 'b', 'c', 'd', 'e'],
        ['a', 'b', 'c', 'd', 'e'],
        ['a', 'b', 'c'],
        ['a', 'b', 'c'],
        ['a', 'b'],
        ['c'],
        ['d', 'e'],
      ],
    );
    // Every request but the first waited the pace's floor, a split half's after a 429 too.
    assert.equal(sleeps.length, calls.length - 1);
    assert.ok(sleeps.every((ms) => ms >= MIN_REQUEST_INTERVAL_MS));
  });

  it('gives a single text all five tries, then fails with a RateLimitError', async () => {
    const { voyage, calls } = embedder([() => new Response('rate limited', { status: 429 })]);
    await assert.rejects(voyage.embed(['a'], 'document'), (error: Error) => {
      assert.ok(error instanceof RateLimitError);
      assert.match(error.message, /^Voyage answered 429: rate limited$/);
      return true;
    });
    assert.equal(calls.length, 5);
  });

  it('fails after five tries', async () => {
    const { voyage, calls, sleeps } = embedder([() => new Response('down', { status: 500 })]);
    await assert.rejects(voyage.embed(['a'], 'document'), (error: Error) => {
      assert.ok(error instanceof EmbeddingError);
      assert.match(error.message, /Voyage answered 500: down/);
      return true;
    });
    assert.equal(calls.length, 5);
    assert.deepEqual(sleeps, RETRY_DELAYS_MS);
  });

  it('keeps the key out of the message should Voyage echo it', async () => {
    const { voyage } = embedder([() => new Response(`bad key ${KEY}`, { status: 401 })]);
    await assert.rejects(voyage.embed(['a'], 'query'), (error: Error) => {
      assert.equal(error.message, 'Voyage answered 401: bad key <key>');
      return true;
    });
  });

  describe('with retry: false (the server)', () => {
    it('answers a 429 at once with a RateLimitError, one request and no wait', async () => {
      const { voyage, calls, sleeps } = embedder(
        [() => new Response('rate limited', { status: 429 })],
        false,
      );
      await assert.rejects(voyage.embed(['a', 'b'], 'query'), RateLimitError);
      assert.equal(calls.length, 1);
      assert.deepEqual(sleeps, []);
    });

    it('answers a 5xx at once', async () => {
      const { voyage, calls, sleeps } = embedder(
        [() => new Response('down', { status: 503 })],
        false,
      );
      await assert.rejects(voyage.embed(['a'], 'query'), /Voyage answered 503: down/);
      assert.equal(calls.length, 1);
      assert.deepEqual(sleeps, []);
    });

    it('keeps no pace between requests', async () => {
      const { voyage, calls, sleeps } = embedder([ok], false);
      await voyage.embed(['a'], 'query');
      await voyage.embed(['b'], 'query');
      assert.equal(calls.length, 2);
      assert.deepEqual(sleeps, []);
    });
  });

  it('fails at once on another status, without the key in the message', async () => {
    const { voyage, calls } = embedder([
      () => new Response('{"detail":"bad request"}', { status: 400 }),
    ]);
    await assert.rejects(voyage.embed(['a'], 'document'), (error: Error) => {
      assert.ok(error instanceof EmbeddingError);
      assert.match(error.message, /400/);
      assert.ok(!error.message.includes(KEY));
      return true;
    });
    assert.equal(calls.length, 1);
  });

  it('refuses an answer of the wrong shape or count', async () => {
    for (const bad of [
      () => Response.json({ data: [{ embedding: [1, 2], index: 0 }] }),
      () => Response.json({ data: [] }),
      () => Response.json({ data: [{ embedding: vectorOf(1), index: 0 }] }),
      () => Response.json({}),
    ]) {
      const { voyage } = embedder([bad]);
      await assert.rejects(voyage.embed(['a', 'b'], 'document'), EmbeddingError);
    }
  });

  it('refuses repeated or out-of-range indexes', async () => {
    const vector = vectorOf(1);
    for (const indexes of [
      [0, 0],
      [0, 2],
      [0, 1.5],
      [-1, 0],
    ]) {
      const { voyage } = embedder([
        () => Response.json({ data: indexes.map((index) => ({ embedding: vector, index })) }),
      ]);
      await assert.rejects(voyage.embed(['a', 'b'], 'document'), EmbeddingError, String(indexes));
    }
  });

  it('fails a request that does not get through, naming only the error', async () => {
    const voyage = new VoyageEmbedder({
      apiKey: KEY,
      fetch: () => Promise.reject(new TypeError(`invalid header value: Bearer ${KEY}`)),
    });
    await assert.rejects(voyage.embed(['a'], 'document'), (error: Error) => {
      assert.ok(error instanceof EmbeddingError);
      assert.equal(error.message, 'The request to Voyage failed (TypeError)');
      return true;
    });
  });

  it('gives each request a time limit', async () => {
    const { voyage, calls } = embedder([ok]);
    await voyage.embed(['a'], 'document');
    assert.ok(calls[0]!.init.signal instanceof AbortSignal);
  });

  it('sends nothing for no texts', async () => {
    const { voyage, calls } = embedder([ok]);
    assert.deepEqual(await voyage.embed([], 'document'), []);
    assert.equal(calls.length, 0);
  });
});

describe('voyageKey', () => {
  const root = mkdtempSync(join(tmpdir(), 'code-rag-key-'));
  after(() => rmSync(root, { recursive: true, force: true }));

  it('takes the environment first', () => {
    writeFileSync(join(root, '.env'), 'VOYAGE_API_KEY=from-file\n');
    assert.equal(voyageKey(root, { VOYAGE_API_KEY: 'from-env' }), 'from-env');
  });

  it("takes only that one variable from the repository's .env", () => {
    writeFileSync(
      join(root, '.env'),
      [
        'DATABASE_URL=postgres://user:password1@db/app',
        '# a comment',
        'VOYAGE_API_KEY="from-file"',
        'BETTER_AUTH_SECRET=other-variable',
        '',
      ].join('\n'),
    );
    const before = { ...process.env };
    const env: NodeJS.ProcessEnv = { VOYAGE_API_KEY: '' };
    assert.equal(voyageKey(root, env), 'from-file');
    assert.deepEqual(env, { VOYAGE_API_KEY: '' });
    // Compared by keys only, so a failure never prints the environment's values.
    assert.deepEqual(Object.keys(process.env).sort(), Object.keys(before).sort());
    assert.equal(process.env.DATABASE_URL, before.DATABASE_URL);
    assert.equal(process.env.BETTER_AUTH_SECRET, before.BETTER_AUTH_SECRET);
    assert.equal(process.env.VOYAGE_API_KEY, before.VOYAGE_API_KEY);
  });

  it('throws MissingKeyError, naming .env.example, without a key anywhere', () => {
    writeFileSync(join(root, '.env'), 'OTHER=1\nVOYAGE_API_KEY=\n');
    assert.throws(
      () => voyageKey(root, {}),
      (error: Error) => {
        assert.ok(error instanceof MissingKeyError);
        assert.match(error.message, /VOYAGE_API_KEY/);
        assert.match(error.message, /\.env\.example/);
        return true;
      },
    );
    rmSync(join(root, '.env'));
    assert.throws(() => voyageKey(root, {}), MissingKeyError);
  });

  it('refuses a key with a control character, without the key in the message', () => {
    for (const key of ['pa-abc\u0001def', 'pa-abc\rdef', 'pa abc']) {
      assert.throws(
        () => voyageKey(root, { VOYAGE_API_KEY: key }),
        (error: Error) => {
          assert.ok(error instanceof EmbeddingError);
          assert.ok(!error.message.includes('abc'));
          return true;
        },
      );
    }
  });
});

describe('words', () => {
  it('splits identifiers into their parts, lower case', () => {
    assert.deepEqual(words('redactStorageKeys(S3_ENDPOINT) Хранилище v2'), [
      'redact',
      'storage',
      'keys',
      's',
      '3',
      'endpoint',
      'хранилище',
      'v',
      '2',
    ]);
  });
});

describe('FakeEmbedder', () => {
  const fake = new FakeEmbedder();
  const cosine = (a: Float32Array, b: Float32Array) => a.reduce((sum, x, i) => sum + x * b[i]!, 0);

  it('gives equal texts equal unit vectors of the dimension', async () => {
    const [a, b] = await fake.embed(['the storage keys', 'the storage keys'], 'document');
    assert.equal(a!.length, DIMENSION);
    assert.deepEqual(a, b);
    assert.ok(Math.abs(cosine(a!, a!) - 1) < 1e-5);
  });

  it('puts texts sharing words nearer than others', () => {
    const query = fake.vector('redact storage keys');
    const near = fake.vector('function redactStorageKeys(event) {}');
    const far = fake.vector('render the catalog grid');
    assert.ok(cosine(query, near) > 0.5);
    assert.ok(cosine(query, near) > cosine(query, far) + 0.3);
  });

  it('records its calls', async () => {
    const recording = new FakeEmbedder();
    await recording.embed(['a'], 'query');
    assert.deepEqual(recording.calls, [{ texts: ['a'], inputType: 'query' }]);
  });
});
