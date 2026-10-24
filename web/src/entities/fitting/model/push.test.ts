import { describe, expect, it } from 'vitest';

import { fittingFinishedEvent } from './push';

const GEN = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';
const push = { generationId: GEN, kind: 'single', status: 'completed' };

describe('fittingFinishedEvent', () => {
  it("is the api's fitting:finished push, keyed by the generation", () => {
    expect(fittingFinishedEvent.name).toBe('fitting:finished');
    expect(fittingFinishedEvent.key!(push as never)).toBe(GEN);
  });

  it('parses a push of either status and kind', () => {
    expect(fittingFinishedEvent.parse(push)).toEqual(push);
    const failed = { ...push, kind: 'look', status: 'failed' };
    expect(fittingFinishedEvent.parse(failed)).toEqual(failed);
  });

  it('drops extra fields, so no link or text is carried', () => {
    expect(fittingFinishedEvent.parse({ ...push, resultUrl: 'https://x.example/a' })).toEqual(push);
  });

  it.each([
    ['an unknown status', { ...push, status: 'processing' }],
    ['an unknown kind', { ...push, kind: 'outfit' }],
    ['a non-uuid id', { ...push, generationId: 'not-a-uuid' }],
    ['a string payload', JSON.stringify(push)],
    ['null', null],
    ['a missing field', { generationId: GEN }],
  ])('gives null for %s', (_name, raw) => {
    expect(fittingFinishedEvent.parse(raw)).toBeNull();
  });
});
