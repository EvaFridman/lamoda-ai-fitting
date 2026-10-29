import { describe, expect, it } from 'vitest';

import { ApiError } from '@/shared/api';

import {
  HEIC_FAILED_TEXT,
  MAX_PHOTO_BYTES,
  photoAccept,
  photoFormat,
  uploadErrorText,
  WRONG_TYPE_TEXT,
} from './upload-error';

describe('uploadErrorText', () => {
  it("uses the first detail's text", () => {
    const error = new ApiError('failed', {
      kind: 'http',
      template: '/me/photos',
      status: 400,
      code: 'VALIDATION_FAILED',
      details: [{ field: 'photo', code: 'IS_IMAGE', message: 'm' }],
    });
    expect(uploadErrorText(error)).toBe('Нужно изображение JPG, PNG, WebP или HEIC');
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

describe('photoAccept', () => {
  it('names HEIC with a mouse only (AC27)', () => {
    expect(photoAccept(true)).toBe(
      'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif',
    );
    expect(photoAccept(false)).toBe('image/jpeg,image/png,image/webp');
  });
});

describe('photoFormat', () => {
  const file = (name: string, type: string) => new File(['x'], name, { type });

  it.each([
    ['image/jpeg', 'jpeg'],
    ['image/png', 'png'],
    ['image/webp', 'webp'],
    ['image/heic', 'heic'],
    ['image/heif', 'heic'],
  ])('names %s by its type as %s', (type, format) => {
    expect(photoFormat(file('a.bin', type))).toBe(format);
  });

  it.each([
    ['a.JPG', 'jpeg'],
    ['a.jpeg', 'jpeg'],
    ['a.png', 'png'],
    ['a.webp', 'webp'],
    ['IMG_1.HEIC', 'heic'],
    ['a.heif', 'heic'],
  ])('names %s with no type by its extension as %s', (name, format) => {
    expect(photoFormat(file(name, ''))).toBe(format);
  });

  it.each([
    ['image/jpg', 'jpeg'],
    ['image/pjpeg', 'jpeg'],
    ['image/x-png', 'png'],
    ['image/heic-sequence', 'heic'],
    ['image/heif-sequence', 'heic'],
  ])('names the synonym %s as %s', (type, format) => {
    expect(photoFormat(file('a.bin', type))).toBe(format);
  });

  it('lower-cases the type', () => {
    expect(photoFormat(file('a.bin', 'IMAGE/HEIC'))).toBe('heic');
    expect(photoFormat(file('a.bin', 'Image/Jpeg'))).toBe('jpeg');
  });

  it('trusts a known type over the extension', () => {
    expect(photoFormat(file('a.heic', 'image/png'))).toBe('png');
  });

  it.each([
    ['x.heic', 'application/octet-stream', 'heic'],
    ['x.HEIF', 'application/octet-stream', 'heic'],
    ['x.jpg', 'application/octet-stream', 'jpeg'],
    ['x.png', 'binary/octet-stream', 'png'],
    ['a.heic.png', '', 'png'],
    ['a.heic', 'image/jpeg', 'jpeg'],
  ])('falls back to the extension of %s typed "%s": %s', (name, type, format) => {
    expect(photoFormat(file(name, type))).toBe(format);
  });

  it.each([
    ['a.gif', 'image/gif'],
    ['a.pdf', 'application/pdf'],
    ['noext', ''],
    ['noext', 'application/octet-stream'],
    ['a.gif', ''],
    ['a.gif', 'application/octet-stream'],
  ])('gives nothing for %s of type "%s"', (name, type) => {
    expect(photoFormat(file(name, type))).toBeUndefined();
  });
});

describe('texts', () => {
  it('names HEIC among the types and the failed conversion', () => {
    expect(WRONG_TYPE_TEXT).toBe('Нужно изображение JPG, PNG, WebP или HEIC');
    expect(HEIC_FAILED_TEXT).toBe('Не удалось прочитать HEIC — попробуйте JPG');
  });
});

describe('MAX_PHOTO_BYTES', () => {
  it('is 20 MiB less 64 KiB for the multipart body, under the api and nginx limits', () => {
    expect(MAX_PHOTO_BYTES).toBe(20 * 1024 * 1024 - 64 * 1024);
    expect(MAX_PHOTO_BYTES).toBeLessThan(20 * 1024 * 1024);
  });
});
