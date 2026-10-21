import { describe, expect, it, vi } from 'vitest';

import { AiProviderError } from '../ai-provider.error.js';
import type { OpenAiClient } from '../openai-client.js';
import { ModerationChecker } from './moderation-checker.js';
import { PromptChecker } from './prompt-checker.js';

const options = { signal: new AbortController().signal };

type Output = { type: string; content?: { type: string; text?: string; refusal?: string }[] }[];

function message(text: string): Output {
  return [{ type: 'message', content: [{ type: 'output_text', text }] }];
}

function setup(
  output: Output | Error,
  moderation: { flagged: boolean; categories: Record<string, boolean> } = {
    flagged: false,
    categories: {},
  },
  state: object = {},
) {
  const respond = vi.fn();
  if (output instanceof Error) respond.mockRejectedValue(output);
  else respond.mockResolvedValue({ output, ...state });
  const moderate = vi.fn().mockResolvedValue({ results: [moderation] });
  const client = { respond, moderate } as unknown as OpenAiClient;
  const logger = { warn: vi.fn(), error: vi.fn() };
  const checker = new PromptChecker(client, new ModerationChecker(client), 'vision-model', logger);
  return { checker, respond, moderate, logger };
}

describe('PromptChecker', () => {
  it('puts the user text in the input as input_text, never in the instructions', async () => {
    const wish = 'tuck the shirt in, UNIQUE-WISH';
    const { checker, respond, moderate } = setup(message('{"allowed":true,"reason":"none"}'));

    await checker.check(wish, options);

    const [body, passed] = respond.mock.calls[0] as [Record<string, unknown>, unknown];
    expect(passed).toBe(options);
    expect(body).toMatchObject({
      model: 'vision-model',
      store: false,
      text: { format: { type: 'json_schema', strict: true } },
      input: [{ role: 'user', content: [{ type: 'input_text', text: wish }] }],
    });
    expect(String(body['instructions'])).not.toContain('UNIQUE-WISH');
    expect(moderate).toHaveBeenCalledWith({ text: wish }, options);
  });

  it('allows a wish the model accepts', async () => {
    const { checker, logger } = setup(message('{"allowed":true,"reason":"none"}'));

    expect(await checker.check('x', options)).toEqual({ allowed: true });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it.each(['other_people', 'nudity', 'minors', 'violence', 'politics', 'unrelated'])(
    'refuses with the reason %s',
    async (reason) => {
      const { checker } = setup(message(JSON.stringify({ allowed: false, reason })));

      expect(await checker.check('x', options)).toEqual({ allowed: false, reason });
    },
  );

  it('lets a flagged moderation win with the reason moderation', async () => {
    const { checker } = setup(message('{"allowed":false,"reason":"politics"}'), {
      flagged: true,
      categories: { hate: true },
    });

    expect(await checker.check('x', options)).toEqual({ allowed: false, reason: 'moderation' });
  });

  it('refuses by moderation when only the top-level flag is set', async () => {
    const { checker } = setup(message('{"allowed":true,"reason":"none"}'), {
      flagged: true,
      categories: {},
    });

    expect(await checker.check('x', options)).toEqual({ allowed: false, reason: 'moderation' });
  });

  it.each([
    ['text that is not JSON', message('nope')],
    ['an unknown reason', message('{"allowed":false,"reason":"spam"}')],
    ['a refusal item', [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }]],
    ['no output', []],
  ] as const)('allows with one warning for %s', async (_name, output) => {
    const { checker, logger } = setup(output as Output);

    expect(await checker.check('x', options)).toEqual({ allowed: true });
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('asks for 200 output tokens', async () => {
    const { checker, respond } = setup(message('{"allowed":true,"reason":"none"}'));

    await checker.check('x', options);

    expect((respond.mock.calls[0] as [Record<string, unknown>])[0]).toMatchObject({
      max_output_tokens: 200,
    });
  });

  it('names an incomplete answer in the warning', async () => {
    const { checker, logger } = setup(
      [],
      { flagged: false, categories: {} },
      { status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } },
    );

    expect(await checker.check('x', options)).toEqual({ allowed: true });
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(String(logger.warn.mock.calls[0]?.[0])).toContain(
      'status=incomplete, reason=max_output_tokens',
    );
  });

  it('names a completed answer and an unknown one in the warning', async () => {
    const completed = setup(
      message('nope'),
      { flagged: false, categories: {} },
      {
        status: 'completed',
      },
    );
    const unknown = setup(message('nope'));

    await completed.checker.check('x', options);
    await unknown.checker.check('x', options);

    expect(String(completed.logger.warn.mock.calls[0]?.[0])).toContain('status=completed');
    expect(String(unknown.logger.warn.mock.calls[0]?.[0])).toContain('status=unknown');
  });

  it('propagates a failed call', async () => {
    const failure = new AiProviderError('respond', 'timeout', null, null, null);
    const { checker } = setup(failure);

    await expect(checker.check('x', options)).rejects.toBe(failure);
  });
});
