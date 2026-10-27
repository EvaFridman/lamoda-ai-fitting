import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { goodPhoto, refusedPhoto } from '../../test/support/photos.js';
import {
  createAiProvider,
  deadlineMs,
  FakeAiProvider,
  OpenAiProvider,
  solidColourReason,
} from './ai-provider.js';
import { AiProviderError } from './ai-provider.error.js';
import type { AiSettings } from './ai-settings.js';
import { OpenAiClient } from './openai-client.js';

const logger = { warn: vi.fn(), error: vi.fn() };
const bytes = (text: string) => ({
  bytes: new TextEncoder().encode(text),
  mimeType: 'image/jpeg' as const,
});

const NO_ITEMS = { items: [] };

const FAKE_SETTINGS = { model: 'gpt-image-2', timeoutSeconds: 180 };
const OPENAI_SETTINGS = { model: 'gpt-image-2', timeoutSeconds: 180 };

const settings: AiSettings = {
  nodeEnv: 'production',
  apiKey: 'test-openai-key_1',
  proxy: null,
  model: 'gpt-image-2',
  visionModel: 'vision',
  timeoutSeconds: 180,
  checkTimeoutMs: 4000,
  monthlyLimit: 10,
  photoMaxBytes: 1000,
};

async function failureOf(promise: Promise<unknown>): Promise<AiProviderError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AiProviderError);
    return error as AiProviderError;
  }
  throw new Error('expected a failure');
}

describe('FakeAiProvider', () => {
  const fake = () => new FakeAiProvider({ ...FAKE_SETTINGS, checkTimeoutMs: 20 });

  it('is named fake', () => {
    expect(fake().name).toBe('fake');
  });

  it('passes a photo and a prompt with no marker', async () => {
    expect(await fake().checkPhoto(bytes('plain jpeg'))).toEqual({ ok: true });
    expect(await fake().checkPrompt('tuck it in', NO_ITEMS)).toEqual({ allowed: true });
  });

  it.each(['dark', 'not_full', 'many_people', 'child', 'no_person', 'moderation'])(
    'refuses a photo marked refuse:%s',
    async (reason) => {
      expect(await fake().checkPhoto(bytes(`\u0000\u0001refuse:${reason}\u0002`))).toEqual({
        ok: false,
        reason,
      });
    },
  );

  it('passes a photo marked with an unknown reason, or a prompt reason', async () => {
    expect(await fake().checkPhoto(bytes('refuse:blurry'))).toEqual({ ok: true });
    expect(await fake().checkPhoto(bytes('refuse:politics'))).toEqual({ ok: true });
  });

  it.each(['other_people', 'nudity', 'minors', 'violence', 'politics', 'unrelated', 'moderation'])(
    'refuses a prompt marked refuse:%s',
    async (reason) => {
      expect(await fake().checkPrompt(`please refuse:${reason} now`, NO_ITEMS)).toEqual({
        allowed: false,
        reason,
      });
    },
  );

  it('passes a prompt marked with an unknown reason or a photo reason', async () => {
    expect(await fake().checkPrompt('refuse:spam', NO_ITEMS)).toEqual({
      allowed: true,
    });
    expect(await fake().checkPrompt('refuse:child', NO_ITEMS)).toEqual({ allowed: true });
  });

  it('flags an image only on refuse:moderation', async () => {
    expect(await fake().moderateImage(bytes('refuse:moderation'))).toEqual({
      flagged: true,
      categories: ['sexual'],
    });
    expect(await fake().moderateImage(bytes('refuse:child'))).toEqual({
      flagged: false,
      categories: [],
    });
    expect(await fake().moderateImage(bytes('plain'))).toEqual({ flagged: false, categories: [] });
  });

  it('throws a timeout when delayMs is longer than checkTimeoutMs', async () => {
    const provider = fake();
    provider.delayMs = 200;

    const error = await failureOf(provider.checkPhoto(bytes('plain')));

    expect(error.isTimeout).toBe(true);
  });

  it('waits a delay that fits under the deadline', async () => {
    const provider = new FakeAiProvider({ ...FAKE_SETTINGS, checkTimeoutMs: 1000 });
    provider.delayMs = 5;

    expect(await provider.checkPrompt('plain', NO_ITEMS)).toEqual({ allowed: true });
  });

  it('falls back to checkTimeoutMs for a timeoutMs of 0', async () => {
    const provider = new FakeAiProvider({ ...FAKE_SETTINGS, checkTimeoutMs: 1000 });
    provider.delayMs = 5;

    expect(await provider.checkPrompt('plain', NO_ITEMS, { timeoutMs: 0 })).toEqual({
      allowed: true,
    });
  });

  it('throws aborted for an already aborted caller signal', async () => {
    const controller = new AbortController();
    controller.abort(new DOMException('stop', 'AbortError'));

    for (const call of [
      fake().checkPhoto(bytes('plain'), { signal: controller.signal }),
      fake().checkPrompt('plain', NO_ITEMS, { signal: controller.signal }),
      fake().moderateImage(bytes('plain'), { signal: controller.signal }),
    ]) {
      const error = await failureOf(call);
      expect(error.reason).toBe('aborted');
      expect(error.isTimeout).toBe(false);
    }
  });

  it('throws aborted when the caller cancels during the delay', async () => {
    const provider = new FakeAiProvider({ ...FAKE_SETTINGS, checkTimeoutMs: 5000 });
    provider.delayMs = 5000;
    const controller = new AbortController();
    const result = failureOf(provider.checkPhoto(bytes('plain'), { signal: controller.signal }));

    controller.abort(new DOMException('stop', 'AbortError'));

    expect((await result).reason).toBe('aborted');
  });

  it('is aborted, not timed out, when the caller cancels with a CancelledFailure', async () => {
    const provider = new FakeAiProvider({ ...FAKE_SETTINGS, checkTimeoutMs: 5000 });
    provider.delayMs = 5000;
    const controller = new AbortController();
    const result = failureOf(
      provider.checkPrompt('plain', NO_ITEMS, { signal: controller.signal }),
    );
    const reason = new Error('activity cancelled');
    reason.name = 'CancelledFailure';

    controller.abort(reason);

    const error = await result;
    expect(error.reason).toBe('aborted');
    expect(error.isTimeout).toBe(false);
  });

  it('uses options.timeoutMs instead of the settings deadline', async () => {
    const provider = new FakeAiProvider({ ...FAKE_SETTINGS, checkTimeoutMs: 20 });
    provider.delayMs = 100;

    expect(await provider.checkPhoto(bytes('plain'), { timeoutMs: 500 })).toEqual({ ok: true });
    expect(await provider.checkPrompt('plain', NO_ITEMS, { timeoutMs: 500 })).toEqual({
      allowed: true,
    });
    expect(await provider.moderateImage(bytes('plain'), { timeoutMs: 500 })).toEqual({
      flagged: false,
      categories: [],
    });
  });

  it('times out under a shorter options.timeoutMs than the settings deadline', async () => {
    const provider = new FakeAiProvider({ ...FAKE_SETTINGS, checkTimeoutMs: 500 });
    provider.delayMs = 100;

    for (const call of [
      provider.checkPhoto(bytes('plain'), { timeoutMs: 20 }),
      provider.checkPrompt('plain', NO_ITEMS, { timeoutMs: 20 }),
      provider.moderateImage(bytes('plain'), { timeoutMs: 20 }),
    ]) {
      expect((await failureOf(call)).isTimeout).toBe(true);
    }
  });
});

describe('solidColourReason and the colour refusals', () => {
  const REASONS = ['dark', 'not_full', 'many_people', 'child', 'no_person', 'moderation'] as const;
  const image = (buffer: Buffer, mimeType: 'image/jpeg' | 'image/webp' = 'image/jpeg') => ({
    bytes: new Uint8Array(buffer),
    mimeType,
  });
  const fake = () => new FakeAiProvider({ ...FAKE_SETTINGS, checkTimeoutMs: 1000 });

  it.each(REASONS)('names the reason of a solid %s image', async (reason) => {
    expect(await solidColourReason(await refusedPhoto(reason))).toBe(reason);
  });

  it.each(['jpeg', 'png', 'webp'] as const)('reads a solid image in %s', async (format) => {
    expect(await solidColourReason(await refusedPhoto('child', { format }))).toBe('child');
  });

  it('reads a solid image after a lossy WebP re-encode', async () => {
    const webp = await sharp(await refusedPhoto('many_people'))
      .webp({ quality: 60 })
      .toBuffer();

    expect(await solidColourReason(webp)).toBe('many_people');
  });

  it('answers null for a noisy photo, in every format', async () => {
    for (const format of ['jpeg', 'png', 'webp'] as const) {
      expect(await solidColourReason(await goodPhoto({ format }))).toBeNull();
    }
  });

  it('answers null for a solid image of another colour', async () => {
    const grey = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 128, g: 128, b: 128 } },
    })
      .png()
      .toBuffer();

    expect(await solidColourReason(grey)).toBeNull();
  });

  it('answers null for bytes that are not an image', async () => {
    expect(await solidColourReason(new TextEncoder().encode('refuse:dark'))).toBeNull();
    expect(await solidColourReason(new Uint8Array())).toBeNull();
  });

  it.each(REASONS)('checkPhoto refuses a solid %s image', async (reason) => {
    expect(await fake().checkPhoto(image(await refusedPhoto(reason)))).toEqual({
      ok: false,
      reason,
    });
  });

  it('checkPhoto accepts a noisy photo', async () => {
    expect(await fake().checkPhoto(image(await goodPhoto()))).toEqual({ ok: true });
  });

  it('checkPhoto still refuses by the byte marker', async () => {
    expect(await fake().checkPhoto(bytes('refuse:dark'))).toEqual({ ok: false, reason: 'dark' });
  });

  it('moderateImage flags only the magenta image', async () => {
    expect(await fake().moderateImage(image(await refusedPhoto('moderation')))).toEqual({
      flagged: true,
      categories: ['sexual'],
    });
    expect(await fake().moderateImage(image(await refusedPhoto('child')))).toEqual({
      flagged: false,
      categories: [],
    });
    expect(await fake().moderateImage(image(await goodPhoto()))).toEqual({
      flagged: false,
      categories: [],
    });
  });
});

describe('OpenAiProvider', () => {
  // A network that never answers: it fails only when the call's signal aborts.
  function hangingFetch() {
    return vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
        }),
    );
  }

  function provider(fetchImpl: ReturnType<typeof hangingFetch>, checkTimeoutMs = 20) {
    const client = new OpenAiClient({
      apiKey: 'test-openai-key_1',
      logger,
      fetch: fetchImpl as unknown as typeof globalThis.fetch,
      backoffMs: [0, 0],
    });
    return new OpenAiProvider(
      client,
      { ...OPENAI_SETTINGS, visionModel: 'vision', checkTimeoutMs },
      logger,
    );
  }

  it('is named openai', () => {
    expect(provider(hangingFetch()).name).toBe('openai');
  });

  describe('retry option', () => {
    const unavailable = () => vi.fn(() => Promise.resolve(new Response('{}', { status: 503 })));

    it('makes one attempt per parallel call with retry false', async () => {
      const fetch = unavailable();
      const openai = provider(fetch as unknown as ReturnType<typeof hangingFetch>, 4000);

      const error = await failureOf(openai.checkPrompt('plain', NO_ITEMS, { retry: false }));

      expect(error).toMatchObject({ reason: 'http', status: 503 });
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('makes three attempts per parallel call without retry', async () => {
      const fetch = unavailable();
      const openai = provider(fetch as unknown as ReturnType<typeof hangingFetch>, 4000);

      await failureOf(openai.checkPrompt('plain', NO_ITEMS));

      // The check fails when the first of the two calls does; the other may still be retrying.
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(6));
    });
  });

  it('times out each call under checkTimeoutMs', async () => {
    const fetch = hangingFetch();
    const openai = provider(fetch);

    for (const call of [
      openai.checkPhoto(bytes('plain')),
      openai.checkPrompt('plain', NO_ITEMS),
      openai.moderateImage(bytes('plain')),
    ]) {
      const error = await failureOf(call);
      expect(error.isTimeout).toBe(true);
    }
    expect(fetch).toHaveBeenCalled();
  });

  it('uses options.timeoutMs instead of the settings deadline', async () => {
    const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 100));
    const answering = vi.fn((url: string, _init: RequestInit) =>
      pause().then(
        () =>
          new Response(
            JSON.stringify(
              url.endsWith('/v1/moderations')
                ? { results: [{ flagged: false, categories: {} }] }
                : {
                    output: [
                      {
                        type: 'message',
                        content: [
                          { type: 'output_text', text: '{"allowed":true,"reason":"none"}' },
                        ],
                      },
                    ],
                  },
            ),
            { status: 200 },
          ),
      ),
    );
    const openai = provider(answering as unknown as ReturnType<typeof hangingFetch>, 20);

    expect(await openai.checkPrompt('plain', NO_ITEMS, { timeoutMs: 2000 })).toEqual({
      allowed: true,
    });
  });

  it('sends the chosen items in the text check instructions', async () => {
    const bodies: string[] = [];
    const fetch = vi.fn((url: string, init: RequestInit) => {
      if (url.endsWith('/v1/responses')) bodies.push(String(init.body));
      return Promise.resolve(
        new Response(
          JSON.stringify(
            url.endsWith('/v1/moderations')
              ? { results: [{ flagged: false, categories: {} }] }
              : {
                  output: [
                    {
                      type: 'message',
                      content: [{ type: 'output_text', text: '{"allowed":true,"reason":"none"}' }],
                    },
                  ],
                },
          ),
          { status: 200 },
        ),
      );
    });
    const openai = provider(fetch as unknown as ReturnType<typeof hangingFetch>, 4000);

    await openai.checkPrompt('x', { items: [{ name: 'Linen shirt', category: 'Shirts' }] });

    const body = JSON.parse(bodies[0] ?? '{}') as { instructions: string };
    expect(body.instructions).toContain('- "Linen shirt", category "Shirts"');
  });

  it('times out under a shorter options.timeoutMs than the settings deadline', async () => {
    const openai = provider(hangingFetch(), 60_000);

    for (const call of [
      openai.checkPhoto(bytes('plain'), { timeoutMs: 20 }),
      openai.checkPrompt('plain', NO_ITEMS, { timeoutMs: 20 }),
      openai.moderateImage(bytes('plain'), { timeoutMs: 20 }),
    ]) {
      expect((await failureOf(call)).isTimeout).toBe(true);
    }
  });

  it('is aborted when the caller cancels with a CancelledFailure', async () => {
    const openai = provider(hangingFetch(), 60_000);
    const controller = new AbortController();
    const result = failureOf(openai.checkPrompt('plain', NO_ITEMS, { signal: controller.signal }));
    const reason = new Error('activity cancelled');
    reason.name = 'CancelledFailure';

    controller.abort(reason);

    expect((await result).reason).toBe('aborted');
  });

  it('ends a call at once when the caller cancels', async () => {
    const openai = provider(hangingFetch(), 60_000);
    const controller = new AbortController();
    const result = failureOf(openai.checkPrompt('plain', NO_ITEMS, { signal: controller.signal }));

    controller.abort(new DOMException('stop', 'AbortError'));

    expect((await result).reason).toBe('aborted');
  });

  it('answers a photo check from the model and the moderation', async () => {
    const fetch = vi.fn((url: string) =>
      Promise.resolve(
        new Response(
          JSON.stringify(
            url.endsWith('/v1/moderations')
              ? { results: [{ flagged: false, categories: {} }] }
              : {
                  output: [
                    {
                      type: 'message',
                      content: [{ type: 'output_text', text: '{"ok":false,"reason":"dark"}' }],
                    },
                  ],
                },
          ),
          { status: 200 },
        ),
      ),
    );
    const client = new OpenAiClient({
      apiKey: 'test-openai-key_1',
      logger,
      fetch: fetch as unknown as typeof globalThis.fetch,
    });
    const openai = new OpenAiProvider(
      client,
      { ...OPENAI_SETTINGS, visionModel: 'vision', checkTimeoutMs: 4000 },
      logger,
    );

    expect(await openai.checkPhoto(bytes('plain'))).toEqual({ ok: false, reason: 'dark' });
  });
});

describe('OpenAiProvider generate', () => {
  const PICTURE = new Uint8Array([9, 8, 7, 6]);
  const job = {
    person: bytes('person'),
    items: [
      { ...bytes('item'), name: 'Shirt', category: 'Shirts', colour: null, image: bytes('i') },
    ],
  };

  function answering(response: () => Response) {
    return vi.fn((_url: string, _init: RequestInit) => Promise.resolve(response()));
  }

  function generator(fetchImpl: ReturnType<typeof answering>, checkTimeoutMs = 20) {
    return new OpenAiProvider(
      new OpenAiClient({
        apiKey: 'test-openai-key_1',
        logger,
        fetch: fetchImpl as unknown as typeof globalThis.fetch,
        backoffMs: [0, 0],
      }),
      { ...OPENAI_SETTINGS, visionModel: 'vision', checkTimeoutMs },
      logger,
    );
  }

  const picture = () =>
    new Response(
      JSON.stringify({ data: [{ b64_json: Buffer.from(PICTURE).toString('base64') }] }),
      {
        status: 200,
        headers: { 'x-request-id': 'req_gen_1' },
      },
    );
  const failure = (status: number, code: string | null, requestId = 'req_err_1') =>
    new Response(JSON.stringify({ error: { code, message: 'm' } }), {
      status,
      headers: { 'x-request-id': requestId },
    });

  it('names the setting model', () => {
    const openai = new OpenAiProvider(
      new OpenAiClient({ apiKey: 'test-openai-key_1', logger }),
      { ...OPENAI_SETTINGS, model: 'gpt-image-2.5-sunburst', visionModel: 'v', checkTimeoutMs: 1 },
      logger,
    );

    expect(openai.model).toBe('gpt-image-2.5-sunburst');
  });

  it('returns the picture and the request id, posting to the edits endpoint', async () => {
    const fetch = answering(picture);

    const result = await generator(fetch).generate(job);

    expect(result).toEqual({ ok: true, image: PICTURE, requestId: 'req_gen_1' });
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/images/edits');
    expect((init.body as FormData).get('model')).toBe('gpt-image-2');
  });

  it('counts an answer with no picture as moderation, with the request id', async () => {
    const fetch = answering(
      () => new Response('{"data":[]}', { status: 200, headers: { 'x-request-id': 'req_empty' } }),
    );

    expect(await generator(fetch).generate(job)).toEqual({
      ok: false,
      reason: 'moderation',
      requestId: 'req_empty',
    });
  });

  it('counts a 400 moderation_blocked as moderation, with the error request id', async () => {
    const fetch = answering(() => failure(400, 'moderation_blocked', 'req_blocked'));

    expect(await generator(fetch).generate(job)).toEqual({
      ok: false,
      reason: 'moderation',
      requestId: 'req_blocked',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('throws another 400 as an error', async () => {
    const fetch = answering(() => failure(400, 'invalid_value'));

    expect(await failureOf(generator(fetch).generate(job))).toMatchObject({
      operation: 'edit_image',
      status: 400,
      code: 'invalid_value',
    });
  });

  it('makes one attempt of a 500 by default', async () => {
    const fetch = answering(() => failure(500, 'server_error'));

    const error = await failureOf(generator(fetch).generate(job));

    expect(error).toMatchObject({ operation: 'edit_image', reason: 'http', status: 500 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('makes one attempt with retry false', async () => {
    const fetch = answering(() => failure(503, null));

    await failureOf(generator(fetch).generate(job, { retry: false }));

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('makes one attempt of a 500 even with retry true', async () => {
    const fetch = answering(() => failure(500, 'server_error'));

    await failureOf(generator(fetch).generate(job, { retry: true }));

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  describe('repeating a failure that never reached OpenAI', () => {
    const sequence = (...steps: (Response | Error)[]) => {
      const fetch = vi.fn();
      for (const step of steps) {
        fetch.mockImplementationOnce(() =>
          step instanceof Error ? Promise.reject(step) : Promise.resolve(step),
        );
      }
      return fetch as unknown as ReturnType<typeof answering>;
    };
    const refused = (code: string) =>
      new TypeError('fetch failed', { cause: Object.assign(new Error('connect'), { code }) });

    it('tries a 429 rate limit again, then returns the picture', async () => {
      const fetch = sequence(failure(429, 'rate_limit_exceeded'), picture());

      expect(await generator(fetch).generate(job)).toEqual({
        ok: true,
        image: PICTURE,
        requestId: 'req_gen_1',
      });
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('tries a refused connection again, then returns the picture', async () => {
      const fetch = sequence(refused('ECONNREFUSED'), picture());

      expect((await generator(fetch).generate(job)).ok).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('fails at once on a connection reset, as a network error', async () => {
      const fetch = sequence(refused('ECONNRESET'), picture());

      const error = await failureOf(generator(fetch).generate(job));

      expect(error).toMatchObject({ operation: 'edit_image', reason: 'network' });
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('does not repeat a 429 of insufficient_quota', async () => {
      const fetch = sequence(failure(429, 'insufficient_quota'), picture());

      await failureOf(generator(fetch).generate(job));

      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('does not repeat a 500 whatever retry the caller passes', async () => {
      for (const retry of [undefined, false, true]) {
        const fetch = sequence(failure(500, 'server_error'), picture());

        await failureOf(generator(fetch).generate(job, { retry }));

        expect(fetch).toHaveBeenCalledTimes(1);
      }
    });

    it('repeats a 429 even when the caller passes retry false', async () => {
      const fetch = sequence(failure(429, 'rate_limit_exceeded'), picture());

      expect((await generator(fetch).generate(job, { retry: false })).ok).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('deadline', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('is timeoutSeconds, not checkTimeoutMs, without timeoutMs', async () => {
      const timeout = vi.spyOn(AbortSignal, 'timeout');

      await generator(answering(picture), 20).generate(job);

      expect(timeout).toHaveBeenCalledWith(180_000);
      expect(timeout).not.toHaveBeenCalledWith(20);
    });

    it('is the caller timeoutMs when it is given', async () => {
      const timeout = vi.spyOn(AbortSignal, 'timeout');

      await generator(answering(picture), 20).generate(job, { timeoutMs: 90_000 });

      expect(timeout).toHaveBeenCalledWith(90_000);
      expect(timeout).not.toHaveBeenCalledWith(180_000);
    });

    it('times out a hanging request at timeoutMs', async () => {
      const error = await failureOf(
        provider(hangingFetch(), 60_000).generate(job, { timeoutMs: 20 }),
      );

      expect(error).toMatchObject({ operation: 'edit_image', reason: 'timeout' });
      expect(error.isTimeout).toBe(true);
    });

    it('is aborted when the caller cancels', async () => {
      const controller = new AbortController();
      const result = failureOf(
        provider(hangingFetch(), 60_000).generate(job, { signal: controller.signal }),
      );

      controller.abort(new DOMException('stop', 'AbortError'));

      const error = await result;
      expect(error).toMatchObject({ operation: 'edit_image', reason: 'aborted' });
      expect(error.isTimeout).toBe(false);
    });
  });

  // A network that never answers: it fails only when the call's signal aborts.
  function hangingFetch() {
    return vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
        }),
    );
  }

  function provider(fetchImpl: ReturnType<typeof hangingFetch>, checkTimeoutMs: number) {
    return generator(fetchImpl as unknown as ReturnType<typeof answering>, checkTimeoutMs);
  }
});

describe('FakeAiProvider generate', () => {
  const fake = (checkTimeoutMs = 20) => new FakeAiProvider({ ...FAKE_SETTINGS, checkTimeoutMs });
  const item = {
    name: 'Shirt',
    category: 'Shirts',
    colour: null,
    image: bytes('item'),
  };
  const jobOf = async (wishes?: string, itemCount = 1) => ({
    person: { bytes: new Uint8Array(await goodPhoto()), mimeType: 'image/jpeg' as const },
    items: Array.from({ length: itemCount }, () => item),
    wishes,
  });

  it('names the setting model', () => {
    expect(fake().model).toBe('gpt-image-2');
  });

  it.each([0, 6])('throws a plain Error for %i items, before any delay', async (count) => {
    const provider = fake();
    provider.delayMs = 5000;

    const promise = provider.generate(await jobOf(undefined, count));

    await expect(promise).rejects.toThrow(`A fitting takes 1 to 5 items, got ${count}`);
    await expect(promise).rejects.not.toBeInstanceOf(AiProviderError);
  });

  it('accepts five items', async () => {
    expect((await fake().generate(await jobOf(undefined, 5))).ok).toBe(true);
  });

  it('answers a 1024x1536 WebP made from the photo', async () => {
    const result = await fake().generate(await jobOf());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.requestId).toBeNull();
    const meta = await sharp(Buffer.from(result.image)).metadata();
    expect(meta).toMatchObject({ format: 'webp', width: 1024, height: 1536 });
  });

  it('answers the same bytes for the same input', async () => {
    const job = await jobOf('hello');

    const [first, second] = [await fake().generate(job), await fake().generate(job)];

    expect(first).toEqual(second);
  });

  it('refuses on fail:moderation in the wishes', async () => {
    expect(await fake().generate(await jobOf('please fail:moderation'))).toEqual({
      ok: false,
      reason: 'moderation',
      requestId: null,
    });
  });

  it('throws a transient 500 on fail:provider_error', async () => {
    const error = await failureOf(fake().generate(await jobOf('fail:provider_error')));

    expect(error).toMatchObject({ operation: 'edit_image', reason: 'http', status: 500 });
    expect(error.isTransient).toBe(true);
  });

  it('throws a timeout on fail:timeout', async () => {
    const error = await failureOf(fake().generate(await jobOf('fail:timeout')));

    expect(error.isTimeout).toBe(true);
    expect(error.operation).toBe('edit_image');
  });

  it('reads a failure marker from the regeneration comment too', async () => {
    const job = { ...(await jobOf()), comment: 'fail:moderation' };

    expect(await fake().generate(job)).toEqual({
      ok: false,
      reason: 'moderation',
      requestId: null,
    });
    const error = await failureOf(fake().generate({ ...job, comment: 'fail:provider_error' }));
    expect(error.status).toBe(500);
  });

  it('ignores an unknown failure marker', async () => {
    expect((await fake().generate(await jobOf('fail:whatever'))).ok).toBe(true);
  });

  it('times out when delayMs is past timeoutMs', async () => {
    const provider = fake();
    provider.delayMs = 200;

    const error = await failureOf(provider.generate(await jobOf(), { timeoutMs: 20 }));

    expect(error.isTimeout).toBe(true);
    expect(error.operation).toBe('edit_image');
  });

  it('waits under timeoutSeconds, not checkTimeoutMs', async () => {
    const provider = fake(20);
    provider.delayMs = 100;

    expect((await provider.generate(await jobOf())).ok).toBe(true);
  });

  it('throws aborted for an already aborted caller signal', async () => {
    const controller = new AbortController();
    controller.abort(new DOMException('stop', 'AbortError'));

    const error = await failureOf(fake().generate(await jobOf(), { signal: controller.signal }));

    expect(error).toMatchObject({ operation: 'edit_image', reason: 'aborted' });
  });
});

describe('deadlineMs', () => {
  it.each([undefined, 0, -5, Number.NaN, Number.POSITIVE_INFINITY, 0.5])(
    'falls back to checkTimeoutMs for a timeoutMs of %s',
    (timeoutMs) => {
      expect(deadlineMs({ timeoutMs }, 4000)).toBe(4000);
    },
  );

  it.each([1, 2500])('uses a timeoutMs of %s', (timeoutMs) => {
    expect(deadlineMs({ timeoutMs }, 4000)).toBe(timeoutMs);
  });
});

describe('createAiProvider', () => {
  it.each(['production', 'development', 'test'] as const)(
    'gives the fake provider without a key under NODE_ENV=%s',
    (nodeEnv) => {
      expect(createAiProvider({ ...settings, nodeEnv, apiKey: '' }, logger)).toBeInstanceOf(
        FakeAiProvider,
      );
    },
  );

  it.each(['development', 'test'] as const)(
    'gives the fake provider under NODE_ENV=%s even with a key (A49)',
    (nodeEnv) => {
      const provider = createAiProvider({ ...settings, nodeEnv }, logger);

      expect(provider).toBeInstanceOf(FakeAiProvider);
      expect(provider.name).toBe('fake');
    },
  );

  it('gives the OpenAI provider only in production with a key', () => {
    const provider = createAiProvider({ ...settings, nodeEnv: 'production' }, logger);

    expect(provider).toBeInstanceOf(OpenAiProvider);
    expect(provider.name).toBe('openai');
  });
});
