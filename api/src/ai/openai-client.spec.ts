import { describe, expect, it, vi } from 'vitest';

import { AiProviderError } from './ai-provider.error.js';
import {
  answerState,
  MODERATION_MODEL,
  OpenAiClient,
  outputText,
  REGION_BLOCK_CODE,
  type ResponsesAnswer,
} from './openai-client.js';

const KEY = 'sk-secret-key-123';
const signal = () => new AbortController().signal;

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

const moderationBody = { results: [{ flagged: false, categories: { sexual: false } }] };
const responsesBody = {
  output: [{ type: 'message', content: [{ type: 'output_text', text: 'hi' }] }],
};

function setup(fetchImpl: ReturnType<typeof vi.fn>, backoffMs: readonly number[] = [0, 0]) {
  const logger = { warn: vi.fn(), error: vi.fn() };
  let time = 1_000_000;
  const client = new OpenAiClient({
    apiKey: KEY,
    logger,
    fetch: fetchImpl as unknown as typeof globalThis.fetch,
    backoffMs,
    now: () => time,
  });
  return {
    client,
    logger,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

async function failureOf(promise: Promise<unknown>): Promise<AiProviderError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AiProviderError);
    return error as AiProviderError;
  }
  throw new Error('expected a failure');
}

describe('OpenAiClient requests', () => {
  it('posts a responses body as JSON with the bearer key', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(responsesBody));
    const { client } = setup(fetch);

    const answer = await client.respond({ model: 'm', input: 'x' }, { signal: signal() });

    expect(answer).toEqual(responsesBody);
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/responses');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(init.body as string)).toEqual({ model: 'm', input: 'x' });
  });

  it('sends a moderation text as a string', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(moderationBody));
    const { client } = setup(fetch);

    await client.moderate({ text: 'hello' }, { signal: signal() });

    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/moderations');
    expect(JSON.parse(init.body as string)).toEqual({
      model: MODERATION_MODEL,
      input: 'hello',
    });
    expect(MODERATION_MODEL).toBe('omni-moderation-latest');
  });

  it('sends a moderation image as an image_url part', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(moderationBody));
    const { client } = setup(fetch);

    await client.moderate({ imageUrl: 'data:image/png;base64,AAA' }, { signal: signal() });

    const [, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      model: 'omni-moderation-latest',
      input: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } }],
    });
  });

  it('posts a FormData to the edits endpoint without forcing a content type', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ data: [{ b64_json: 'QQ==' }] }));
    const { client } = setup(fetch);
    const form = new FormData();
    form.set('prompt', 'p');

    const answer = await client.editImage(form, { signal: signal() });

    expect(answer.data[0]?.b64_json).toBe('QQ==');
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/images/edits');
    expect(init.body).toBe(form);
    expect(init.headers).toEqual({ Authorization: `Bearer ${KEY}` });
  });

  it('passes the caller signal to fetch', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(moderationBody));
    const { client } = setup(fetch);
    const own = signal();

    await client.moderate({ text: 'x' }, { signal: own });

    expect((fetch.mock.calls[0] as [string, RequestInit])[1].signal).toBe(own);
  });
});

describe('OpenAiClient retries', () => {
  it('makes three attempts for a network error, then fails with reason network', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    const { client } = setup(fetch);

    const error = await failureOf(client.moderate({ text: 'x' }, { signal: signal() }));

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(error.reason).toBe('network');
    expect(error.operation).toBe('moderate');
    expect(error.isTransient).toBe(true);
    expect(error.isTimeout).toBe(false);
  });

  it.each([429, 500, 503])('makes three attempts for a %s', async (status) => {
    const fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(
        jsonResponse({ error: { code: 'busy', message: 'm' } }, status, {
          'x-request-id': 'req_1',
        }),
      ),
    );
    const { client } = setup(fetch);

    const error = await failureOf(client.respond({}, { signal: signal() }));

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(error).toMatchObject({
      reason: 'http',
      status,
      code: 'busy',
      requestId: 'req_1',
      operation: 'respond',
    });
  });

  it('succeeds on a later attempt', async () => {
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(jsonResponse({}, 503))
      .mockResolvedValueOnce(jsonResponse(moderationBody));
    const { client } = setup(fetch);

    await expect(client.moderate({ text: 'x' }, { signal: signal() })).resolves.toEqual(
      moderationBody,
    );
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it.each([400, 401, 403, 404])('does not retry a %s', async (status) => {
    const fetch = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(jsonResponse({ error: { code: 'bad', message: 'm' } }, status)),
      );
    const { client } = setup(fetch);

    const error = await failureOf(client.respond({}, { signal: signal() }));

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(error).toMatchObject({ reason: 'http', status, code: 'bad' });
    expect(error.isTransient).toBe(false);
  });

  it('takes a null code from an error body that is not JSON', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('<html>', { status: 400 }));
    const { client } = setup(fetch);

    const error = await failureOf(client.respond({}, { signal: signal() }));

    expect(error).toMatchObject({ status: 400, code: null, requestId: null });
  });

  it('waits the configured pauses between attempts', async () => {
    vi.useFakeTimers();
    try {
      const fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
      const { client } = setup(fetch, [500, 1500]);
      const result = failureOf(client.respond({}, { signal: signal() }));

      await vi.advanceTimersByTimeAsync(0);
      expect(fetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(500);
      expect(fetch).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1499);
      expect(fetch).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetch).toHaveBeenCalledTimes(3);
      expect((await result).reason).toBe('network');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('OpenAiClient aborts', () => {
  it('ends at once with timeout for a TimeoutError, without a retry', async () => {
    const fetch = vi.fn().mockRejectedValue(new DOMException('t', 'TimeoutError'));
    const { client } = setup(fetch);

    const error = await failureOf(client.respond({}, { signal: signal() }));

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(error.reason).toBe('timeout');
    expect(error.isTimeout).toBe(true);
    expect(error.isTransient).toBe(false);
  });

  it('ends at once with aborted for an AbortError, without a retry', async () => {
    const fetch = vi.fn().mockRejectedValue(new DOMException('a', 'AbortError'));
    const { client } = setup(fetch);

    const error = await failureOf(client.respond({}, { signal: signal() }));

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(error.reason).toBe('aborted');
    expect(error.isTimeout).toBe(false);
  });

  it('ends the pause between attempts when the deadline passes', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    const { client } = setup(fetch, [60_000, 60_000]);

    const error = await failureOf(client.respond({}, { signal: AbortSignal.timeout(20) }));

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(error.reason).toBe('timeout');
  });

  it('ends at once when the caller cancels during a pause', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    const { client } = setup(fetch, [60_000, 60_000]);
    const controller = new AbortController();
    const result = failureOf(client.respond({}, { signal: controller.signal }));

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    controller.abort(new DOMException('stop', 'AbortError'));

    expect((await result).reason).toBe('aborted');
  });

  it('is a timeout when the signal aborts while the body is read', async () => {
    const body = new Response(null, { status: 200 });
    vi.spyOn(body, 'json').mockRejectedValue(new DOMException('t', 'TimeoutError'));
    const fetch = vi.fn().mockResolvedValue(body);
    const { client } = setup(fetch);

    const error = await failureOf(client.respond({}, { signal: signal() }));

    expect(error.reason).toBe('timeout');
  });
});

function cancelledFailure() {
  const error = new Error('activity cancelled');
  error.name = 'CancelledFailure';
  return error;
}

describe('OpenAiClient cancellation by a reason that is neither fetch error', () => {
  it('is aborted, without a retry, when fetch rejects with the signal reason', async () => {
    const reason = cancelledFailure();
    const controller = new AbortController();
    controller.abort(reason);
    const fetch = vi.fn().mockRejectedValue(reason);
    const { client } = setup(fetch);

    const error = await failureOf(client.respond({}, { signal: controller.signal }));

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(error.reason).toBe('aborted');
    expect(error.isTransient).toBe(false);
  });

  it('is aborted when the body read rejects after the abort', async () => {
    const reason = cancelledFailure();
    const controller = new AbortController();
    const body = new Response(null, { status: 200 });
    vi.spyOn(body, 'json').mockImplementation(() => {
      controller.abort(reason);
      return Promise.reject(reason);
    });
    const fetch = vi.fn().mockResolvedValue(body);
    const { client } = setup(fetch);

    const error = await failureOf(client.respond({}, { signal: controller.signal }));

    expect(error.reason).toBe('aborted');
  });

  it('is aborted when an error answer is cut by the abort', async () => {
    const reason = cancelledFailure();
    const controller = new AbortController();
    const body = new Response(null, { status: 503 });
    vi.spyOn(body, 'json').mockImplementation(() => {
      controller.abort(reason);
      return Promise.reject(reason);
    });
    const fetch = vi.fn().mockResolvedValue(body);
    const { client } = setup(fetch);

    const error = await failureOf(client.respond({}, { signal: controller.signal }));

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(error.reason).toBe('aborted');
  });

  it('is aborted when the cancellation comes during a backoff pause', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    const { client } = setup(fetch, [60_000, 60_000]);
    const controller = new AbortController();
    const result = failureOf(client.respond({}, { signal: controller.signal }));

    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    controller.abort(cancelledFailure());

    expect((await result).reason).toBe('aborted');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('OpenAiClient request details', () => {
  it('refuses redirects', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(moderationBody));
    const { client } = setup(fetch);

    await client.moderate({ text: 'x' }, { signal: signal() });

    expect((fetch.mock.calls[0] as [string, RequestInit])[1].redirect).toBe('error');
  });

  it('makes one attempt for a network error with retry false', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    const { client } = setup(fetch);

    const error = await failureOf(client.respond({}, { signal: signal(), retry: false }));

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(error.reason).toBe('network');
  });

  it.each([429, 500, 503])('makes one attempt for a %s with retry false', async (status) => {
    const fetch = vi
      .fn()
      .mockImplementation(() => Promise.resolve(jsonResponse({ error: { code: 'busy' } }, status)));
    const { client } = setup(fetch);

    const error = await failureOf(client.respond({}, { signal: signal(), retry: false }));

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(error).toMatchObject({ reason: 'http', status });
  });

  it('does not retry a 429 of an exhausted quota', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(jsonResponse({ error: { code: 'insufficient_quota' } }, 429)),
      );
    const { client } = setup(fetch);

    const error = await failureOf(client.respond({}, { signal: signal() }));

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(error).toMatchObject({ status: 429, code: 'insufficient_quota' });
    expect(error.isTransient).toBe(false);
  });

  it('still retries a 429 of the rate limit', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(jsonResponse({ error: { code: 'rate_limit_exceeded' } }, 429)),
      );
    const { client } = setup(fetch);

    const error = await failureOf(client.respond({}, { signal: signal() }));

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(error.isTransient).toBe(true);
  });

  it.each([
    ['a 70-character code', 'a'.repeat(70)],
    ['a code with spaces', 'rate limit'],
    ['a code with <', '<script>'],
  ])('takes a null code for %s', async (_name, code) => {
    const fetch = vi
      .fn()
      .mockImplementation(() => Promise.resolve(jsonResponse({ error: { code } }, 400)));
    const { client } = setup(fetch);

    const error = await failureOf(client.respond({}, { signal: signal() }));

    expect(error.code).toBeNull();
    expect(error.message).not.toContain(code);
  });

  it('keeps a code of 64 characters in OpenAI shape', async () => {
    const code = 'A_b.c-1'.padEnd(64, 'x');
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ error: { code } }, 400));
    const { client } = setup(fetch);

    expect((await failureOf(client.respond({}, { signal: signal() }))).code).toBe(code);
  });

  it('cuts a request id to 64 characters and takes null for an empty one', async () => {
    const long = 'r'.repeat(100);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({}, 400, { 'x-request-id': long }))
      .mockResolvedValueOnce(jsonResponse({}, 400, { 'x-request-id': '' }));
    const { client } = setup(fetch);

    const first = await failureOf(client.respond({}, { signal: signal() }));
    const second = await failureOf(client.respond({}, { signal: signal() }));

    expect(first.requestId).toBe('r'.repeat(64));
    expect(second.requestId).toBeNull();
  });
});

describe('answerState', () => {
  it('is completed when nothing says the answer is incomplete', () => {
    expect(answerState({ status: 'completed', output: [] })).toBe('status=completed');
    expect(answerState({ status: 'completed', incomplete_details: null, output: [] })).toBe(
      'status=completed',
    );
  });

  it('names the reason of an incomplete answer', () => {
    expect(
      answerState({
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
        output: [],
      }),
    ).toBe('status=incomplete, reason=max_output_tokens');
  });

  it('is unknown without a status', () => {
    expect(answerState({ output: [] })).toBe('status=unknown');
  });

  it('writes unknown for a status not in OpenAI shape', () => {
    expect(answerState({ status: 'Bad <script>', output: [] })).toBe('status=unknown');
  });

  it.each([
    ['max output tokens!', 'unknown'],
    ['a'.repeat(33), 'unknown'],
    ['a'.repeat(32), 'a'.repeat(32)],
  ])('keeps a reason only in OpenAI shape: %s', (reason, kept) => {
    expect(answerState({ status: 'incomplete', incomplete_details: { reason }, output: [] })).toBe(
      `status=incomplete, reason=${kept}`,
    );
  });
});

describe('OpenAiClient malformed answers', () => {
  it('fails with malformed_answer for a 200 that is not JSON, without a retry', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response('not json', { status: 200, headers: { 'x-request-id': 'req_9' } }),
      );
    const { client } = setup(fetch);

    const error = await failureOf(client.respond({}, { signal: signal() }));

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(error).toMatchObject({
      reason: 'http',
      status: 200,
      code: 'malformed_answer',
      requestId: 'req_9',
    });
    expect(error.isTransient).toBe(false);
  });

  it.each([
    ['respond', {}, { nothing: true }],
    ['moderate', { text: 'x' }, { results: [] }],
    ['moderate', { text: 'x' }, { results: [{ flagged: 'yes', categories: {} }] }],
  ] as const)('fails with malformed_answer when %s gets a wrong shape', async (op, input, body) => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse(body));
    const { client } = setup(fetch);

    const call =
      op === 'respond'
        ? client.respond(input, { signal: signal() })
        : client.moderate({ text: 'x' }, { signal: signal() });

    expect(await failureOf(call)).toMatchObject({ code: 'malformed_answer', status: 200 });
  });

  it('fails with malformed_answer when the images answer has no data array', async () => {
    const fetch = vi.fn().mockResolvedValue(jsonResponse({ created: 1 }));
    const { client } = setup(fetch);

    const error = await failureOf(client.editImage(new FormData(), { signal: signal() }));

    expect(error.code).toBe('malformed_answer');
  });
});

describe('OpenAiClient error messages', () => {
  it('never contain the key or the request body', async () => {
    const secretText = 'my-private-wish-text';
    const fetch = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          jsonResponse(
            { error: { code: 'bad', message: `Incorrect API key ${KEY} for ${secretText}` } },
            401,
            { 'x-request-id': 'req_2' },
          ),
        ),
      );
    const { client } = setup(fetch);

    const error = await failureOf(client.respond({ input: secretText }, { signal: signal() }));

    expect(error.message).not.toContain(KEY);
    expect(error.message).not.toContain(secretText);
    expect(error.message).toContain('req_2');
    expect(error.message).toContain('401');
  });

  it('do not contain them after a network failure either', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError(`fetch failed ${KEY}`));
    const { client } = setup(fetch);

    const error = await failureOf(client.respond({ input: 'secret' }, { signal: signal() }));

    expect(error.message).not.toContain(KEY);
    expect(error.message).not.toContain('secret');
  });
});

describe('OpenAiClient region block', () => {
  const blocked = () =>
    jsonResponse({ error: { code: REGION_BLOCK_CODE, message: 'no' } }, 403, {
      'x-request-id': 'req_3',
    });

  it('logs through logger.error once per minute, and never logs the key', async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(blocked()));
    const { client, logger, advance } = setup(fetch);

    const error = await failureOf(client.respond({}, { signal: signal() }));
    await failureOf(client.respond({}, { signal: signal() }));

    expect(error).toMatchObject({ status: 403, code: REGION_BLOCK_CODE });
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(String(logger.error.mock.calls[0]?.[0])).toContain(REGION_BLOCK_CODE);
    expect(String(logger.error.mock.calls[0]?.[0])).not.toContain(KEY);

    advance(59_000);
    await failureOf(client.respond({}, { signal: signal() }));
    expect(logger.error).toHaveBeenCalledTimes(1);

    advance(1000);
    await failureOf(client.respond({}, { signal: signal() }));
    expect(logger.error).toHaveBeenCalledTimes(2);
  });

  it('logs nothing for another 403', async () => {
    const fetch = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(jsonResponse({ error: { code: 'other', message: 'm' } }, 403)),
      );
    const { client, logger } = setup(fetch);

    await failureOf(client.respond({}, { signal: signal() }));

    expect(logger.error).not.toHaveBeenCalled();
  });
});

describe('outputText', () => {
  const answer = (output: ResponsesAnswer['output']): ResponsesAnswer => ({ output });

  it('returns the first output_text of a message item', () => {
    expect(
      outputText(
        answer([
          { type: 'reasoning' },
          {
            type: 'message',
            content: [
              { type: 'refusal', refusal: 'no' },
              { type: 'output_text', text: 'first' },
              { type: 'output_text', text: 'second' },
            ],
          },
        ]),
      ),
    ).toBe('first');
  });

  it('is null for no message, a refusal only or no content', () => {
    expect(outputText(answer([]))).toBeNull();
    expect(
      outputText(answer([{ type: 'reasoning', content: [{ type: 'output_text', text: 'x' }] }])),
    ).toBeNull();
    expect(
      outputText(answer([{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }])),
    ).toBeNull();
    expect(outputText(answer([{ type: 'message' }]))).toBeNull();
  });
});
