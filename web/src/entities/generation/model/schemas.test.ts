import { describe, expect, it } from 'vitest';

import { generationSchema, generationStatusSchema } from './schemas';

const generation = {
  id: '3f0c1d52-8a4e-4b7e-9c55-0d2d6a8f1a11',
  sessionId: '6b1e2c34-1f5a-4d0e-8a77-2c9d4e5f6a22',
  productIds: ['9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c33'],
  userImageKey: 'user/a.jpg',
  userImageUrl: 'http://storage.example/bucket/user/a.jpg?X-Amz-Signature=abc',
  resultImageKey: null,
  resultImageUrl: null,
  status: 'pending',
  aiProvider: 'provider',
  aiModel: 'model',
  errorMessage: null,
  createdAt: '2026-10-15T08:00:00.000Z',
  updatedAt: '2026-10-15T08:00:00.000Z',
};

describe('generationStatusSchema', () => {
  it.each(['pending', 'processing', 'completed', 'failed'])('accepts %s', (status) => {
    expect(generationStatusSchema.safeParse(status).success).toBe(true);
  });

  it('refuses a status web does not know', () => {
    expect(generationStatusSchema.safeParse('cancelled').success).toBe(false);
  });
});

describe('generationSchema', () => {
  it('accepts a generation and keeps dates as ISO strings', () => {
    expect(generationSchema.parse(generation)).toEqual(generation);
  });

  it('accepts a result link and refuses links that are not URLs or a missing input link', () => {
    const resultImageUrl = 'http://storage.example/bucket/r.webp?X-Amz-Signature=abc';
    const { userImageUrl: _link, ...withoutInput } = generation;

    expect(generationSchema.parse({ ...generation, resultImageUrl })).toMatchObject({
      resultImageUrl,
    });
    expect(generationSchema.safeParse({ ...generation, resultImageUrl: 'x' }).success).toBe(false);
    expect(generationSchema.safeParse({ ...generation, userImageUrl: 'x' }).success).toBe(false);
    expect(generationSchema.safeParse(withoutInput).success).toBe(false);
  });

  it('accepts a null input link, as the api sends for a key outside the owner folder', () => {
    expect(generationSchema.parse({ ...generation, userImageUrl: null })).toEqual({
      ...generation,
      userImageUrl: null,
    });
  });

  it('accepts a null user image key, as the api sends for a fitting that used a photo', () => {
    const fitting = { ...generation, userImageKey: null, userImageUrl: null };

    expect(generationSchema.parse(fitting)).toEqual(fitting);
  });

  it('fails on an unknown status', () => {
    expect(generationSchema.safeParse({ ...generation, status: 'cancelled' }).success).toBe(false);
  });

  it('drops an unknown extra field', () => {
    const parsed = generationSchema.parse({ ...generation, surprise: 1 });

    expect(parsed).toEqual(generation);
    expect(parsed).not.toHaveProperty('surprise');
  });

  it('refuses a date that is not an ISO string', () => {
    expect(generationSchema.safeParse({ ...generation, createdAt: 1760515200000 }).success).toBe(
      false,
    );
  });
});
