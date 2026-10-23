import { describe, expect, it } from 'vitest';

import { userPhotoListSchema, userPhotoSchema } from './schemas';

const photo = {
  id: '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b',
  url: 'https://s3.example/keep/users/u/photo.webp?X-Amz-Signature=abc',
  isDefault: false,
  transient: false,
  width: 768,
  height: 1024,
  createdAt: '2026-10-01T12:00:00.000Z',
};

describe('userPhotoSchema url', () => {
  it.each(['https://s3.example/a.webp', 'http://localhost:8333/a.webp?X-Amz-Signature=abc'])(
    'accepts %s',
    (url) => {
      expect(userPhotoSchema.safeParse({ ...photo, url }).success).toBe(true);
    },
  );

  it('accepts null', () => {
    expect(userPhotoSchema.safeParse({ ...photo, url: null }).success).toBe(true);
  });

  it.each([
    'javascript:alert(1)',
    'data:image/png;base64,AAAA',
    'blob:https://site.example/1234',
    'ftp://s3.example/a.webp',
    'not a url',
  ])('refuses %s', (url) => {
    expect(userPhotoSchema.safeParse({ ...photo, url }).success).toBe(false);
  });

  it('refuses a list holding one such photo', () => {
    expect(
      userPhotoListSchema.safeParse([photo, { ...photo, url: 'javascript:alert(1)' }]).success,
    ).toBe(false);
  });
});
