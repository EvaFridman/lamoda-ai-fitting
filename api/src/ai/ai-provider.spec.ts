import { describe, expect, it, vi } from 'vitest';

import { createAiProvider, deadlineMs, FakeAiProvider, OpenAiProvider } from './ai-provider.js';
import { AiProviderError } from './ai-provider.error.js';
import type { AiSettings } from './ai-settings.js';
import { OpenAiClient } from './openai-client.js';

const logger = { warn: vi.fn(), error: vi.fn() };
const bytes = (text: string) => ({
  bytes: new TextEncoder().encode(text),
  mimeType: 'image/jpeg' as const,
});

const settings: AiSettings = {
  nodeEnv: 'production',
  apiKey: 'test-openai-key_1',
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
  const fake = () => new FakeAiProvider({ checkTimeoutMs: 20 });

  it('is named fake', () => {
    expect(fake().name).toBe('fake');
  });

  it('passes a photo and a prompt with no marker', async () => {
    expect(await fake().checkPhoto(bytes('plain jpeg'))).toEqual({ ok: true });
    expect(await fake().checkPrompt('tuck it in')).toEqual({ allowed: true });
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
      expect(await fake().checkPrompt(`please refuse:${reason} now`)).toEqual({
        allowed: false,
        reason,
      });
    },
  );

  it('passes a prompt marked with an unknown reason or a photo reason', async () => {
    expect(await fake().checkPrompt('refuse:spam')).toEqual({ allowed: true });
    expect(await fake().checkPrompt('refuse:child')).toEqual({ allowed: true });
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
    const provider = new FakeAiProvider({ checkTimeoutMs: 1000 });
    provider.delayMs = 5;

    expect(await provider.checkPrompt('plain')).toEqual({ allowed: true });
  });

  it('falls back to checkTimeoutMs for a timeoutMs of 0', async () => {
    const provider = new FakeAiProvider({ checkTimeoutMs: 1000 });
    provider.delayMs = 5;

    expect(await provider.checkPrompt('plain', { timeoutMs: 0 })).toEqual({ allowed: true });
  });

  it('throws aborted for an already aborted caller signal', async () => {
    const controller = new AbortController();
    controller.abort(new DOMException('stop', 'AbortError'));

    for (const call of [
      fake().checkPhoto(bytes('plain'), { signal: controller.signal }),
      fake().checkPrompt('plain', { signal: controller.signal }),
      fake().moderateImage(bytes('plain'), { signal: controller.signal }),
    ]) {
      const error = await failureOf(call);
      expect(error.reason).toBe('aborted');
      expect(error.isTimeout).toBe(false);
    }
  });

  it('throws aborted when the caller cancels during the delay', async () => {
    const provider = new FakeAiProvider({ checkTimeoutMs: 5000 });
    provider.delayMs = 5000;
    const controller = new AbortController();
    const result = failureOf(provider.checkPhoto(bytes('plain'), { signal: controller.signal }));

    controller.abort(new DOMException('stop', 'AbortError'));

    expect((await result).reason).toBe('aborted');
  });

  it('is aborted, not timed out, when the caller cancels with a CancelledFailure', async () => {
    const provider = new FakeAiProvider({ checkTimeoutMs: 5000 });
    provider.delayMs = 5000;
    const controller = new AbortController();
    const result = failureOf(provider.checkPrompt('plain', { signal: controller.signal }));
    const reason = new Error('activity cancelled');
    reason.name = 'CancelledFailure';

    controller.abort(reason);

    const error = await result;
    expect(error.reason).toBe('aborted');
    expect(error.isTimeout).toBe(false);
  });

  it('uses options.timeoutMs instead of the settings deadline', async () => {
    const provider = new FakeAiProvider({ checkTimeoutMs: 20 });
    provider.delayMs = 100;

    expect(await provider.checkPhoto(bytes('plain'), { timeoutMs: 500 })).toEqual({ ok: true });
    expect(await provider.checkPrompt('plain', { timeoutMs: 500 })).toEqual({ allowed: true });
    expect(await provider.moderateImage(bytes('plain'), { timeoutMs: 500 })).toEqual({
      flagged: false,
      categories: [],
    });
  });

  it('times out under a shorter options.timeoutMs than the settings deadline', async () => {
    const provider = new FakeAiProvider({ checkTimeoutMs: 500 });
    provider.delayMs = 100;

    for (const call of [
      provider.checkPhoto(bytes('plain'), { timeoutMs: 20 }),
      provider.checkPrompt('plain', { timeoutMs: 20 }),
      provider.moderateImage(bytes('plain'), { timeoutMs: 20 }),
    ]) {
      expect((await failureOf(call)).isTimeout).toBe(true);
    }
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
    return new OpenAiProvider(client, { visionModel: 'vision', checkTimeoutMs }, logger);
  }

  it('is named openai', () => {
    expect(provider(hangingFetch()).name).toBe('openai');
  });

  describe('retry option', () => {
    const unavailable = () => vi.fn(() => Promise.resolve(new Response('{}', { status: 503 })));

    it('makes one attempt per parallel call with retry false', async () => {
      const fetch = unavailable();
      const openai = provider(fetch as unknown as ReturnType<typeof hangingFetch>, 4000);

      const error = await failureOf(openai.checkPrompt('plain', { retry: false }));

      expect(error).toMatchObject({ reason: 'http', status: 503 });
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('makes three attempts per parallel call without retry', async () => {
      const fetch = unavailable();
      const openai = provider(fetch as unknown as ReturnType<typeof hangingFetch>, 4000);

      await failureOf(openai.checkPrompt('plain'));

      // The check fails when the first of the two calls does; the other may still be retrying.
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(6));
    });
  });

  it('times out each call under checkTimeoutMs', async () => {
    const fetch = hangingFetch();
    const openai = provider(fetch);

    for (const call of [
      openai.checkPhoto(bytes('plain')),
      openai.checkPrompt('plain'),
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

    expect(await openai.checkPrompt('plain', { timeoutMs: 2000 })).toEqual({ allowed: true });
  });

  it('times out under a shorter options.timeoutMs than the settings deadline', async () => {
    const openai = provider(hangingFetch(), 60_000);

    for (const call of [
      openai.checkPhoto(bytes('plain'), { timeoutMs: 20 }),
      openai.checkPrompt('plain', { timeoutMs: 20 }),
      openai.moderateImage(bytes('plain'), { timeoutMs: 20 }),
    ]) {
      expect((await failureOf(call)).isTimeout).toBe(true);
    }
  });

  it('is aborted when the caller cancels with a CancelledFailure', async () => {
    const openai = provider(hangingFetch(), 60_000);
    const controller = new AbortController();
    const result = failureOf(openai.checkPrompt('plain', { signal: controller.signal }));
    const reason = new Error('activity cancelled');
    reason.name = 'CancelledFailure';

    controller.abort(reason);

    expect((await result).reason).toBe('aborted');
  });

  it('ends a call at once when the caller cancels', async () => {
    const openai = provider(hangingFetch(), 60_000);
    const controller = new AbortController();
    const result = failureOf(openai.checkPrompt('plain', { signal: controller.signal }));

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
      { visionModel: 'vision', checkTimeoutMs: 4000 },
      logger,
    );

    expect(await openai.checkPhoto(bytes('plain'))).toEqual({ ok: false, reason: 'dark' });
  });
});

describe('deadlineMs', () => {
  it.each([undefined, 0, -5, Number.NaN, Number.POSITIVE_INFINITY, 0.5])(
    'falls back to checkTimeoutMs for a timeoutMs of %s',
    (timeoutMs) => {
      expect(deadlineMs({ timeoutMs }, { checkTimeoutMs: 4000 })).toBe(4000);
    },
  );

  it.each([1, 2500])('uses a timeoutMs of %s', (timeoutMs) => {
    expect(deadlineMs({ timeoutMs }, { checkTimeoutMs: 4000 })).toBe(timeoutMs);
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
