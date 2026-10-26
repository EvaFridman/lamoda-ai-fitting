// Embeddings for the index (spec 0021 plan §3.4, Q5): Voyage's API through Node's `fetch`, and a
// stand-in for the tests. The key is read by `voyageKey()` only.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

export type InputType = 'document' | 'query';

export interface Embedder {
  readonly model: string;
  readonly dimension: number;
  /** One vector per text, in the texts' order. */
  embed(texts: string[], inputType: InputType): Promise<Float32Array[]>;
}

export const VOYAGE_URL = 'https://api.voyageai.com/v1/embeddings';
export const VOYAGE_MODEL = 'voyage-code-4';
export const DIMENSION = 1024;
export const MAX_BATCH_TEXTS = 128;
// Voyage's free tier without a payment method: 3 requests and 10 K tokens a minute (Q18). A batch
// stays well under the minute's tokens, since the estimate falls short of Voyage's count: 8 K
// estimated tokens were refused for Russian specs on the first run.
export const MAX_BATCH_TOKENS = 5_000;
/** The pace kept: a pause after each request of at least this… */
export const MIN_REQUEST_INTERVAL_MS = 20_000;
/** …and as long as the tokens Voyage counted take at this many a minute. */
export const TOKENS_PER_MINUTE = 9_000;
/** Waits between tries: five tries in all, long enough for the minute's limits to pass. */
export const RETRY_DELAYS_MS = [20_000, 40_000, 60_000, 60_000];
/** Tries of a batch of several texts before a 429 splits it. */
export const SPLIT_AFTER_ATTEMPTS = 2;
/** One request's limit; a network failure or a timeout is not retried (plan §3.4). */
export const REQUEST_TIMEOUT_MS = 60_000;
const KEY_NAME = 'VOYAGE_API_KEY';

export class MissingKeyError extends Error {
  constructor() {
    super(
      `${KEY_NAME} is not set: put a Voyage AI key into the repository's .env (see .env.example) ` +
        'or the environment.',
    );
    this.name = 'MissingKeyError';
  }
}

export class EmbeddingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmbeddingError';
  }
}

/** Voyage kept answering 429. */
export class RateLimitError extends EmbeddingError {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}

/** Voyage counts tokens itself; this estimate only sizes batches and the CLI's summary. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

/** Splits texts into batches of at most `MAX_BATCH_TEXTS` and about `MAX_BATCH_TOKENS`. */
export function batches(texts: string[]): string[][] {
  const result: string[][] = [];
  let batch: string[] = [];
  let tokens = 0;
  for (const text of texts) {
    const size = estimateTokens(text);
    if (
      batch.length > 0 &&
      (batch.length === MAX_BATCH_TEXTS || tokens + size > MAX_BATCH_TOKENS)
    ) {
      result.push(batch);
      batch = [];
      tokens = 0;
    }
    batch.push(text);
    tokens += size;
  }
  if (batch.length > 0) result.push(batch);
  return result;
}

/**
 * The key from the environment, else from the repository's `.env`: only that one variable is
 * taken from the file, and nothing of it enters `process.env`.
 */
export function voyageKey(root: string, env: NodeJS.ProcessEnv = process.env): string {
  let key = env[KEY_NAME]?.trim();
  const file = join(root, '.env');
  if (!key && existsSync(file)) key = parseEnv(readFileSync(file, 'utf8'))[KEY_NAME]?.trim();
  if (!key) throw new MissingKeyError();
  // A control character would make `fetch` refuse the header with the header's value, the key, in
  // its message.
  if (!/^[!-~]+$/.test(key)) {
    throw new EmbeddingError(`${KEY_NAME} holds characters a key cannot: check its value`);
  }
  return key;
}

interface VoyageAnswer {
  data?: { embedding?: unknown; index?: unknown }[];
  usage?: { total_tokens?: unknown };
}

export interface VoyageOptions {
  apiKey: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Milliseconds of a clock `sleep` moves. */
  now?: () => number;
  /**
   * `false`: one attempt, no pace and no split, so a refusal answers at once (the server, which
   * shares the minute's limits with a running index).
   */
  retry?: boolean;
}

export class VoyageEmbedder implements Embedder {
  readonly model = VOYAGE_MODEL;
  readonly dimension = DIMENSION;
  readonly #apiKey: string;
  readonly #fetch: typeof fetch;
  readonly #sleep: (ms: number) => Promise<void>;
  readonly #now: () => number;
  readonly #retry: boolean;
  /** When the next request may go, on `#now`'s clock. */
  #nextAt = 0;

  constructor(options: VoyageOptions) {
    this.#apiKey = options.apiKey;
    this.#fetch = options.fetch ?? fetch;
    this.#sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.#now = options.now ?? (() => performance.now());
    this.#retry = options.retry ?? true;
  }

  /** Waits for the pace after the last request. */
  async #paced(): Promise<void> {
    if (!this.#retry) return;
    const wait = this.#nextAt - this.#now();
    if (wait > 0) await this.#sleep(wait);
  }

  #spent(tokens: number): void {
    const pause = Math.max(MIN_REQUEST_INTERVAL_MS, (tokens / TOKENS_PER_MINUTE) * 60_000);
    this.#nextAt = this.#now() + pause;
  }

  async embed(texts: string[], inputType: InputType): Promise<Float32Array[]> {
    const vectors: Float32Array[] = [];
    for (const batch of batches(texts)) vectors.push(...(await this.#send(batch, inputType)));
    return vectors;
  }

  /**
   * A batch refused twice for the rate is split in halves: the estimate can fall far short of
   * Voyage's count (SVG paths), and a batch over the minute's tokens is refused every time. One
   * chunk (at most 6000 characters) always fits.
   */
  async #send(input: string[], inputType: InputType): Promise<Float32Array[]> {
    try {
      return await this.#embedBatch(input, inputType, this.#retry && input.length > 1);
    } catch (error) {
      if (!(error instanceof RateLimitError) || !this.#retry || input.length < 2) throw error;
      const half = Math.ceil(input.length / 2);
      return [
        ...(await this.#send(input.slice(0, half), inputType)),
        ...(await this.#send(input.slice(half), inputType)),
      ];
    }
  }

  async #embedBatch(
    input: string[],
    inputType: InputType,
    splittable: boolean,
  ): Promise<Float32Array[]> {
    const body = JSON.stringify({
      input,
      model: this.model,
      input_type: inputType,
      truncation: true,
      output_dimension: this.dimension,
    });
    for (let attempt = 0; ; attempt++) {
      await this.#paced();
      let response: Response;
      try {
        response = await this.#fetch(VOYAGE_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.#apiKey}`, 'Content-Type': 'application/json' },
          body,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (error) {
        // Only the error's name: a refused header's message would hold the key.
        const name = error instanceof Error ? error.name : 'Error';
        throw new EmbeddingError(`The request to Voyage failed (${name})`);
      }
      if (response.ok) {
        const answer = (await response.json()) as VoyageAnswer;
        // Voyage's own count; the estimate when the answer has none.
        const counted = answer.usage?.total_tokens;
        this.#spent(
          typeof counted === 'number' && counted >= 0
            ? counted
            : input.reduce((sum, text) => sum + estimateTokens(text), 0),
        );
        return this.#vectors(answer, input.length);
      }
      // A refused request counts against the minute too: the next one, a split half's included,
      // waits the pace's floor.
      if (response.status === 429) this.#nextAt = this.#now() + MIN_REQUEST_INTERVAL_MS;
      const retryable = response.status === 429 || response.status >= 500;
      const delay = this.#retry ? RETRY_DELAYS_MS[attempt] : undefined;
      const split = splittable && response.status === 429 && attempt >= SPLIT_AFTER_ATTEMPTS - 1;
      if (!retryable || delay === undefined || split) {
        // The body goes into the server's tool answer: never the key, should Voyage echo it.
        const body = (await response.text()).replaceAll(this.#apiKey, '<key>').slice(0, 200);
        const message = `Voyage answered ${response.status}: ${body}`;
        throw response.status === 429 ? new RateLimitError(message) : new EmbeddingError(message);
      }
      await response.body?.cancel();
      await this.#sleep(delay);
    }
  }

  #vectors(answer: VoyageAnswer, count: number): Float32Array[] {
    if (answer.data?.length !== count) {
      throw new EmbeddingError(`Voyage answered ${answer.data?.length ?? 0} of ${count} vectors`);
    }
    const vectors: (Float32Array | undefined)[] = Array.from({ length: count }, () => undefined);
    for (const { embedding, index } of answer.data) {
      if (
        !Number.isInteger(index) ||
        (index as number) < 0 ||
        (index as number) >= count ||
        vectors[index as number] ||
        !Array.isArray(embedding) ||
        embedding.length !== this.dimension ||
        !embedding.every((value) => typeof value === 'number' && Number.isFinite(value))
      ) {
        throw new EmbeddingError('Voyage answered an unexpected shape');
      }
      vectors[index as number] = Float32Array.from(embedding as number[]);
    }
    // `count` items at distinct indexes below `count` fill every place.
    return vectors as Float32Array[];
  }
}

/** Words of a text, an identifier split into its parts: `redactStorageKeys` is three. */
export function words(text: string): string[] {
  return (text.match(/[\p{L}\p{N}]+/gu) ?? []).flatMap((word) =>
    word
      .split(/(?<=\p{Ll})(?=\p{Lu})|(?<=\p{L})(?=\p{N})|(?<=\p{N})(?=\p{L})/u)
      .map((part) => part.toLowerCase()),
  );
}

/**
 * The tests' embedder: a vector of word counts hashed into the dimension, normalized, so equal
 * texts are equal, texts sharing words are near and others far. No network.
 */
export class FakeEmbedder implements Embedder {
  readonly model: string;
  readonly dimension: number;
  calls: { texts: string[]; inputType: InputType }[] = [];

  constructor(options: { model?: string; dimension?: number } = {}) {
    this.model = options.model ?? 'fake';
    this.dimension = options.dimension ?? DIMENSION;
  }

  embed(texts: string[], inputType: InputType): Promise<Float32Array[]> {
    this.calls.push({ texts, inputType });
    return Promise.resolve(texts.map((text) => this.vector(text)));
  }

  vector(text: string): Float32Array {
    const vector = new Float32Array(this.dimension);
    for (const word of words(text)) {
      const hash = createHash('sha256').update(word).digest();
      vector[hash.readUInt32BE(0) % this.dimension]! += hash[4]! & 1 ? 1 : -1;
    }
    const norm = Math.hypot(...vector);
    if (norm > 0) for (let i = 0; i < vector.length; i++) vector[i]! /= norm;
    return vector;
  }
}
