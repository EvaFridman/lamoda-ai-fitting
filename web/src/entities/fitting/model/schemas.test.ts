import { describe, expect, it } from 'vitest';

import {
  fittingListSchema,
  fittingQuotaSchema,
  fittingSchema,
  isFittingRunning,
  startedFittingSchema,
} from './schemas';

const ID = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';
const PRODUCT = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

const item = {
  productId: PRODUCT,
  name: 'Платье',
  brand: 'Lamoda',
  imageUrl: 'https://s3.example/media/dress.webp',
  price: 5000,
  finalPrice: 4000,
  attributeValueId: ID,
  colour: 'Красный',
  slot: 'top',
};

const fitting = {
  id: ID,
  kind: 'single',
  parentId: null,
  status: 'completed',
  stage: 'done',
  failureCode: null,
  countsAgainstLimit: true,
  regenerationFree: true,
  model: 'gpt-image-2',
  items: [item],
  promptText: 'Свободнее',
  photoId: ID,
  resultUrl: 'https://s3.example/keep/users/u/result.webp?X-Amz-Signature=abc',
  createdAt: '2026-10-01T12:00:00.000Z',
  startedAt: '2026-10-01T12:00:01.000Z',
  finishedAt: '2026-10-01T12:00:40.000Z',
  estimatedSeconds: null,
};

describe('fittingSchema', () => {
  it('accepts a completed fitting', () => {
    expect(fittingSchema.parse(fitting)).toEqual(fitting);
  });

  it('accepts null in every nullable field', () => {
    const bare = {
      ...fitting,
      parentId: null,
      failureCode: null,
      photoId: null,
      resultUrl: null,
      startedAt: null,
      finishedAt: null,
      estimatedSeconds: null,
      promptText: null,
      items: [{ ...item, imageUrl: null, attributeValueId: null, colour: null, slot: null }],
    };
    expect(fittingSchema.safeParse(bare).success).toBe(true);
  });

  it('fails on an unknown slot and on a missing promptText', () => {
    const bad = { ...fitting, items: [{ ...item, slot: 'hat' }] };
    expect(fittingSchema.safeParse(bad).success).toBe(false);
    const { promptText: _promptText, ...rest } = fitting;
    expect(fittingSchema.safeParse(rest).success).toBe(false);
  });

  it.each([
    ['status', 'cancelled'],
    ['stage', 'later'],
    ['failureCode', 'unknown_reason'],
    ['kind', 'outfit'],
  ])('fails on an unknown %s', (field, value) => {
    expect(fittingSchema.safeParse({ ...fitting, [field]: value }).success).toBe(false);
  });

  it('accepts every known failure code', () => {
    for (const failureCode of ['photo_dark', 'moderation', 'model_timeout', 'provider_error']) {
      expect(fittingSchema.safeParse({ ...fitting, failureCode }).success).toBe(true);
    }
  });

  it('fails on a javascript: result link', () => {
    expect(fittingSchema.safeParse({ ...fitting, resultUrl: 'javascript:alert(1)' }).success).toBe(
      false,
    );
  });

  it('fails on a javascript: item image link', () => {
    const bad = { ...fitting, items: [{ ...item, imageUrl: 'javascript:alert(1)' }] };
    expect(fittingSchema.safeParse(bad).success).toBe(false);
  });

  it('fails on a missing field', () => {
    const { id: _id, ...rest } = fitting;
    expect(fittingSchema.safeParse(rest).success).toBe(false);
  });

  it('drops an extra field', () => {
    expect(fittingSchema.parse({ ...fitting, secret: 'x' })).not.toHaveProperty('secret');
  });
});

describe('startedFittingSchema', () => {
  it('requires repeated', () => {
    expect(startedFittingSchema.safeParse(fitting).success).toBe(false);
    expect(startedFittingSchema.safeParse({ ...fitting, repeated: false }).success).toBe(true);
  });
});

describe('fittingListSchema', () => {
  it('accepts a batch with a cursor and the last one with none', () => {
    expect(
      fittingListSchema.safeParse({ items: [fitting], total: 1, nextCursor: 'abc' }).success,
    ).toBe(true);
    expect(
      fittingListSchema.safeParse({ items: [fitting], total: null, nextCursor: null }).success,
    ).toBe(true);
  });
});

describe('fittingQuotaSchema', () => {
  it('accepts the month quota', () => {
    const quota = { limit: 10, used: 3, left: 7, renewsAt: '2026-11-01T00:00:00.000Z' };
    expect(fittingQuotaSchema.parse(quota)).toEqual(quota);
  });
});

describe('isFittingRunning', () => {
  it.each([
    ['pending', true],
    ['processing', true],
    ['completed', false],
    ['failed', false],
  ] as const)('%s is %s', (status, running) => {
    expect(isFittingRunning({ status })).toBe(running);
  });
});
