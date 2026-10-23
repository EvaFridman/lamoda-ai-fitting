import { describe, expect, it } from 'vitest';

import { ApiError } from '@/shared/api';

import { MAX_PHOTO_BYTES, uploadErrorText } from './upload-error';

describe('uploadErrorText', () => {
  it("uses the first detail's text", () => {
    const error = new ApiError('failed', {
      kind: 'http',
      template: '/me/photos',
      status: 400,
      code: 'VALIDATION_FAILED',
      details: [{ field: 'photo', code: 'IS_IMAGE', message: 'm' }],
    });
    expect(uploadErrorText(error)).toBe('Нужно изображение JPG, PNG или WebP');
  });

  it("uses the error's text when there is no detail", () => {
    const error = new ApiError('failed', {
      kind: 'http',
      template: '/me/photos',
      status: 409,
      code: 'LIMIT_REACHED',
    });
    expect(uploadErrorText(error)).toBe('Достигнут лимит, больше добавить нельзя');
  });

  it('uses the network text for a network error and the general one for another error', () => {
    expect(uploadErrorText(new ApiError('x', { kind: 'network', template: '/me/photos' }))).toBe(
      'Нет связи с сервером, попробуйте позже',
    );
    expect(uploadErrorText(new Error('boom'))).toBe('Что-то пошло не так, попробуйте позже');
  });
});

describe('MAX_PHOTO_BYTES', () => {
  it('is 20 MiB less 64 KiB for the multipart body, under the api and nginx limits', () => {
    expect(MAX_PHOTO_BYTES).toBe(20 * 1024 * 1024 - 64 * 1024);
    expect(MAX_PHOTO_BYTES).toBeLessThan(20 * 1024 * 1024);
  });
});
