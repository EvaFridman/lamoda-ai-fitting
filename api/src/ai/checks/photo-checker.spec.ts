import { describe, expect, it, vi } from 'vitest';

import { AiProviderError } from '../ai-provider.error.js';
import type { OpenAiClient } from '../openai-client.js';
import { ModerationChecker } from './moderation-checker.js';
import { PhotoChecker } from './photo-checker.js';

const image = { bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/jpeg' as const };
const options = { signal: new AbortController().signal };

type Output = { type: string; content?: { type: string; text?: string; refusal?: string }[] }[];

function message(text: string): Output {
  return [{ type: 'message', content: [{ type: 'output_text', text }] }];
}

function setup(
  output: Output | Error,
  flaggedCategories: Record<string, boolean> = {},
  state: object = {},
) {
  const respond = vi.fn();
  if (output instanceof Error) respond.mockRejectedValue(output);
  else respond.mockResolvedValue({ output, ...state });
  const moderate = vi.fn().mockResolvedValue({
    results: [
      { flagged: Object.values(flaggedCategories).some(Boolean), categories: flaggedCategories },
    ],
  });
  const client = { respond, moderate } as unknown as OpenAiClient;
  const logger = { warn: vi.fn(), error: vi.fn() };
  const checker = new PhotoChecker(client, new ModerationChecker(client), 'vision-model', logger);
  return { checker, respond, moderate, logger };
}

describe('PhotoChecker', () => {
  it('calls the vision model with the image as a data URL and nothing stored', async () => {
    const { checker, respond, moderate } = setup(message('{"ok":true,"reason":"none"}'));

    await checker.check(image, options);

    expect(respond).toHaveBeenCalledTimes(1);
    const [body, passed] = respond.mock.calls[0] as [Record<string, unknown>, unknown];
    expect(passed).toBe(options);
    expect(body).toMatchObject({
      model: 'vision-model',
      store: false,
      text: { format: { type: 'json_schema', strict: true } },
    });
    const part = (body['input'] as { content: Record<string, unknown>[] }[])[0]?.content[0];
    expect(part).toMatchObject({
      type: 'input_image',
      image_url: 'data:image/jpeg;base64,AQID',
    });
    expect(moderate).toHaveBeenCalledWith({ imageUrl: 'data:image/jpeg;base64,AQID' }, options);
  });

  it('passes a photo with ok true and reason none', async () => {
    const { checker, logger } = setup(message('{"ok":true,"reason":"none"}'));

    expect(await checker.check(image, options)).toEqual({ ok: true });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it.each(['dark', 'not_full', 'many_people', 'child', 'no_person'])(
    'refuses with the reason %s',
    async (reason) => {
      const { checker } = setup(message(JSON.stringify({ ok: false, reason })));

      expect(await checker.check(image, options)).toEqual({ ok: false, reason });
    },
  );

  it('lets moderation win over the vision verdict', async () => {
    const { checker } = setup(message('{"ok":false,"reason":"child"}'), { sexual: true });

    expect(await checker.check(image, options)).toEqual({
      ok: false,
      reason: 'moderation:sexual',
    });
  });

  it('refuses by moderation when the vision verdict is ok', async () => {
    const { checker } = setup(message('{"ok":true,"reason":"none"}'), { violence: true });

    expect(await checker.check(image, options)).toEqual({
      ok: false,
      reason: 'moderation:violence',
    });
  });

  it.each([
    [{ 'sexual/minors': true, sexual: true }, 'moderation:minors'],
    [{ 'self-harm': true }, 'moderation:self_harm'],
    [{ 'violence/graphic': true }, 'moderation:violence'],
  ])('names the category of the flagged %j', async (flagged, reason) => {
    const { checker } = setup(message('{"ok":true,"reason":"none"}'), flagged);

    expect(await checker.check(image, options)).toEqual({ ok: false, reason });
  });

  it.each([
    ['text that is not JSON', message('sorry')],
    ['an unknown reason', message('{"ok":false,"reason":"blurry"}')],
    ['a missing field', message('{"ok":false}')],
    ['a refusal item', [{ type: 'message', content: [{ type: 'refusal', refusal: 'no' }] }]],
    ['no output', []],
  ] as const)('passes the photo with one warning for %s', async (_name, output) => {
    const { checker, logger } = setup(output as Output);

    expect(await checker.check(image, options)).toEqual({ ok: true });
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });

  it('asks for 200 output tokens', async () => {
    const { checker, respond } = setup(message('{"ok":true,"reason":"none"}'));

    await checker.check(image, options);

    expect((respond.mock.calls[0] as [Record<string, unknown>])[0]).toMatchObject({
      max_output_tokens: 200,
    });
  });

  it('names an incomplete answer in the warning', async () => {
    const { checker, logger } = setup(
      [],
      {},
      {
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
      },
    );

    expect(await checker.check(image, options)).toEqual({ ok: true });
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(String(logger.warn.mock.calls[0]?.[0])).toContain(
      'status=incomplete, reason=max_output_tokens',
    );
  });

  it('names a completed answer and an unknown one in the warning', async () => {
    const completed = setup(message('sorry'), {}, { status: 'completed' });
    const unknown = setup(message('sorry'));

    await completed.checker.check(image, options);
    await unknown.checker.check(image, options);

    expect(String(completed.logger.warn.mock.calls[0]?.[0])).toContain('status=completed');
    expect(String(unknown.logger.warn.mock.calls[0]?.[0])).toContain('status=unknown');
  });

  it('propagates a failed vision call', async () => {
    const failure = new AiProviderError('respond', 'http', 500, null, null);
    const { checker } = setup(failure);

    await expect(checker.check(image, options)).rejects.toBe(failure);
  });

  it('propagates a failed moderation call', async () => {
    const { checker, moderate } = setup(message('{"ok":true,"reason":"none"}'));
    const failure = new AiProviderError('moderate', 'network', null, null, null);
    moderate.mockRejectedValue(failure);

    await expect(checker.check(image, options)).rejects.toBe(failure);
  });
});
