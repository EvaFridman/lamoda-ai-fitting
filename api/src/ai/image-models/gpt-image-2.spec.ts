import { describe, expect, it, vi } from 'vitest';

import { AiProviderError, type AiOperation } from '../ai-provider.error.js';
import { type ImagesAnswer, OpenAiClient } from '../openai-client.js';
import { fittingPrompt } from '../prompts.js';
import { gptImage2 } from './gpt-image-2.js';
import type { FittingJob } from './image-model.js';

// A recorded-style answer, read the way the client reads it (its zod schema).
async function imagesAnswerOf(body: unknown): Promise<ImagesAnswer> {
  const client = new OpenAiClient({
    apiKey: 'test-openai-key_1',
    logger: { warn: vi.fn(), error: vi.fn() },
    fetch: vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify(body), { status: 200 })),
    ) as unknown as typeof globalThis.fetch,
  });
  return (await client.editImage(new FormData(), { signal: new AbortController().signal })).answer;
}

const job: FittingJob = {
  person: { bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/jpeg' },
  items: [
    {
      name: 'Linen shirt',
      category: 'Shirts',
      colour: 'White',
      image: { bytes: new Uint8Array([4, 5]), mimeType: 'image/png' },
    },
    {
      name: 'Straight jeans',
      category: 'Jeans',
      colour: null,
      image: { bytes: new Uint8Array([6]), mimeType: 'image/webp' },
    },
  ],
  wishes: 'tuck it in',
  reasons: ['face'],
};

describe('gptImage2 buildRequest', () => {
  it.each(['gpt-image-2', 'gpt-image-2.5-sunburst'])('sends model %s', (name) => {
    const model = gptImage2(name);

    expect(model.name).toBe(name);
    expect(model.buildRequest(job).get('model')).toBe(name);
  });

  it('sends exactly the fields of the edits request', () => {
    const form = gptImage2('gpt-image-2').buildRequest(job);

    expect([...new Set(form.keys())].sort()).toEqual(
      ['image[]', 'model', 'n', 'output_format', 'prompt', 'quality', 'size'].sort(),
    );
    expect(form.get('quality')).toBe('medium');
    expect(form.get('size')).toBe('1024x1536');
    expect(form.get('output_format')).toBe('webp');
    expect(form.get('n')).toBe('1');
    expect(form.has('moderation')).toBe(false);
    expect(form.has('input_fidelity')).toBe(false);
  });

  it('sends the prompt of the job', () => {
    const form = gptImage2('gpt-image-2').buildRequest(job);

    expect(form.get('prompt')).toBe(fittingPrompt(job));
  });

  it('sends the person first, then the items in order, typed by their MIME type', async () => {
    const files = gptImage2('gpt-image-2').buildRequest(job).getAll('image[]') as File[];

    expect(files.map((file) => [file.name, file.type])).toEqual([
      ['person.jpg', 'image/jpeg'],
      ['item-1.png', 'image/png'],
      ['item-2.webp', 'image/webp'],
    ]);
    const contents = await Promise.all(
      files.map(async (file) => [...new Uint8Array(await file.arrayBuffer())]),
    );
    expect(contents).toEqual([[1, 2, 3], [4, 5], [6]]);
  });

  const [firstItem] = job.items;
  const itemsOf = (count: number) =>
    Array.from({ length: count }, () => firstItem as NonNullable<typeof firstItem>);

  it('throws for a job with no items', () => {
    expect(() => gptImage2('gpt-image-2').buildRequest({ ...job, items: [] })).toThrow(
      'A fitting takes 1 to 5 items, got 0',
    );
  });

  it('throws for six items', () => {
    expect(() => gptImage2('gpt-image-2').buildRequest({ ...job, items: itemsOf(6) })).toThrow(
      'A fitting takes 1 to 5 items, got 6',
    );
  });

  it('builds a request for exactly five items', () => {
    const form = gptImage2('gpt-image-2').buildRequest({ ...job, items: itemsOf(5) });

    expect(form.getAll('image[]')).toHaveLength(6);
  });
});

describe('gptImage2 parseAnswer', () => {
  const model = gptImage2('gpt-image-2');

  it('decodes the base64 picture of a recorded answer', async () => {
    const answer = await imagesAnswerOf({
      created: 1_761_000_000,
      data: [{ b64_json: Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 255]).toString('base64') }],
      output_format: 'webp',
      quality: 'medium',
      size: '1024x1536',
      usage: { input_tokens: 4000, output_tokens: 1500, total_tokens: 5500 },
    });

    expect(model.parseAnswer(answer)).toEqual(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 255]));
  });

  it('answers null for no data', async () => {
    expect(model.parseAnswer(await imagesAnswerOf({ created: 1, data: [] }))).toBeNull();
  });

  it('answers null for an entry with no b64_json', async () => {
    expect(model.parseAnswer(await imagesAnswerOf({ data: [{}] }))).toBeNull();
    expect(model.parseAnswer(await imagesAnswerOf({ data: [{ revised_prompt: 'x' }] }))).toBeNull();
  });

  it('answers null for an empty b64_json', async () => {
    expect(model.parseAnswer(await imagesAnswerOf({ data: [{ b64_json: '' }] }))).toBeNull();
  });
});

describe('gptImage2 isRefusal', () => {
  const model = gptImage2('gpt-image-2');
  const error = (
    operation: AiOperation,
    status: number | null,
    code: string | null,
    reason: 'http' | 'network' = 'http',
  ) => new AiProviderError(operation, reason, status, code, 'req_1');

  it.each(['moderation_blocked', 'content_policy_violation'])(
    'is a refusal on a 400 %s of edit_image',
    (code) => {
      expect(model.isRefusal(error('edit_image', 400, code))).toBe(true);
    },
  );

  it.each([
    ['another code', error('edit_image', 400, 'invalid_value')],
    ['no code', error('edit_image', 400, null)],
    ['a 500', error('edit_image', 500, 'moderation_blocked')],
    ['a 429', error('edit_image', 429, 'moderation_blocked')],
    ['a 403', error('edit_image', 403, 'content_policy_violation')],
    ['another operation', error('moderate', 400, 'moderation_blocked')],
    ['a respond', error('respond', 400, 'content_policy_violation')],
    ['no status', error('edit_image', null, 'moderation_blocked', 'network')],
  ])('is not a refusal on %s', (_name, failure) => {
    expect(model.isRefusal(failure)).toBe(false);
  });
});
