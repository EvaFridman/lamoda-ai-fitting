import { describe, expect, it, vi } from 'vitest';

import type { OpenAiClient } from '../openai-client.js';
import { ModerationChecker } from './moderation-checker.js';

const image = { bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/png' as const };
const options = { signal: new AbortController().signal };

function checkerWith(categories: Record<string, boolean | null>, flagged = false) {
  const moderate = vi.fn().mockResolvedValue({ results: [{ flagged, categories }] });
  return { checker: new ModerationChecker({ moderate } as unknown as OpenAiClient), moderate };
}

describe('ModerationChecker.checkImage', () => {
  it('sends the image as a data URL with the caller options', async () => {
    const { checker, moderate } = checkerWith({});

    await checker.checkImage(image, options);

    expect(moderate).toHaveBeenCalledWith({ imageUrl: 'data:image/png;base64,AQID' }, options);
  });

  it('flags the sexual, violence and self-harm categories and their sub-categories, sorted', async () => {
    const { checker } = checkerWith({
      violence: true,
      'sexual/minors': true,
      'self-harm/intent': true,
      sexual: true,
      harassment: false,
    });

    expect(await checker.checkImage(image, options)).toEqual({
      flagged: true,
      categories: ['self-harm/intent', 'sexual', 'sexual/minors', 'violence'],
    });
  });

  it('does not flag other categories, even with the top-level flag', async () => {
    const { checker } = checkerWith({ harassment: true, hate: true, illicit: true }, true);

    expect(await checker.checkImage(image, options)).toEqual({ flagged: false, categories: [] });
  });

  it('does not flag a category that only starts with the same letters', async () => {
    const { checker } = checkerWith({ sexuality: true, violenceish: true });

    expect((await checker.checkImage(image, options)).flagged).toBe(false);
  });

  it('passes an image with nothing flagged and null categories', async () => {
    const { checker } = checkerWith({ sexual: false, violence: null });

    expect(await checker.checkImage(image, options)).toEqual({ flagged: false, categories: [] });
  });
});

describe('ModerationChecker.checkText', () => {
  it('sends the text as it is', async () => {
    const { checker, moderate } = checkerWith({});

    await checker.checkText('hello', options);

    expect(moderate).toHaveBeenCalledWith({ text: 'hello' }, options);
  });

  it('flags any category, sorted', async () => {
    const { checker } = checkerWith({ violence: true, harassment: true, hate: false });

    expect(await checker.checkText('x', options)).toEqual({
      flagged: true,
      categories: ['harassment', 'violence'],
    });
  });

  it('flags on flagged: true with no category', async () => {
    const { checker } = checkerWith({}, true);

    expect(await checker.checkText('x', options)).toEqual({ flagged: true, categories: [] });
  });

  it('passes a clean text', async () => {
    const { checker } = checkerWith({ hate: false });

    expect(await checker.checkText('x', options)).toEqual({ flagged: false, categories: [] });
  });

  it('propagates a failed call', async () => {
    const failure = new Error('down');
    const checker = new ModerationChecker({
      moderate: vi.fn().mockRejectedValue(failure),
    } as unknown as OpenAiClient);

    await expect(checker.checkText('x', options)).rejects.toBe(failure);
  });
});
