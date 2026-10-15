import { describe, expect, it } from 'vitest';

import { ApiError } from './api-error';
import { DETAIL_TEXTS, ERROR_TEXTS, GENERAL_TEXT, detailText, errorText } from './error-text';

function httpError(status: number | undefined, code?: string): ApiError {
  return new ApiError('m', { kind: 'http', template: '/t', status, code });
}

const PROTOTYPE_KEYS = ['constructor', '__proto__', 'toString', 'hasOwnProperty'];

describe('errorText', () => {
  it.each(Object.entries(ERROR_TEXTS))('gives the text of %s', (code, text) => {
    // 429 is answered by status, so its status is the matching one.
    const status = code === 'TOO_MANY_REQUESTS' ? 429 : 400;
    const result = errorText(httpError(status, code));
    expect(result).toBe(text);
    expect(result).not.toBe('');
    expect(result).toMatch(/[а-яё]/i);
  });

  it('gives the general text for UNAUTHORIZED', () => {
    expect(errorText(httpError(401, 'UNAUTHORIZED'))).toBe(GENERAL_TEXT);
  });

  it('gives the general text for ROUTE_NOT_FOUND', () => {
    expect(errorText(httpError(404, 'ROUTE_NOT_FOUND'))).toBe(GENERAL_TEXT);
  });

  it.each([undefined, 'NOT_FOUND', 'SOMETHING_ELSE'])(
    'gives the 429 text by status with code %s',
    (code) => {
      expect(errorText(httpError(429, code))).toBe(ERROR_TEXTS.TOO_MANY_REQUESTS);
    },
  );

  it('gives the general text for an unknown code', () => {
    expect(errorText(httpError(400, 'NEW_CODE'))).toBe(GENERAL_TEXT);
  });

  it.each([500, 404, 400, undefined])(
    'gives the general text for status %s with no code',
    (status) => {
      expect(errorText(httpError(status))).toBe(GENERAL_TEXT);
    },
  );

  it.each([
    [413, ERROR_TEXTS.PAYLOAD_TOO_LARGE],
    [429, ERROR_TEXTS.TOO_MANY_REQUESTS],
    [502, ERROR_TEXTS.SERVICE_UNAVAILABLE],
    [503, ERROR_TEXTS.SERVICE_UNAVAILABLE],
    [504, ERROR_TEXTS.SERVICE_UNAVAILABLE],
  ])('gives the text its status stands for when status %s has no code', (status, text) => {
    expect(errorText(httpError(status))).toBe(text);
  });

  it.each([
    [502, 'INTERNAL_ERROR', ERROR_TEXTS.INTERNAL_ERROR],
    [413, 'NOT_FOUND', ERROR_TEXTS.NOT_FOUND],
    [503, 'NEW_CODE', GENERAL_TEXT],
    [504, 'UNAUTHORIZED', GENERAL_TEXT],
    [502, 'constructor', GENERAL_TEXT],
  ])('keeps the code text over the status: %s with %s', (status, code, text) => {
    expect(errorText(httpError(status, code))).toBe(text);
  });

  it('has own texts for network and timeout, distinct from the general one', () => {
    const network = errorText(new ApiError('m', { kind: 'network', template: '/t' }));
    const timeout = errorText(new ApiError('m', { kind: 'timeout', template: '/t' }));
    expect(network).not.toBe(GENERAL_TEXT);
    expect(timeout).not.toBe(GENERAL_TEXT);
    expect(network).not.toBe(timeout);
    expect(network).toMatch(/[а-яё]/i);
    expect(timeout).toMatch(/[а-яё]/i);
  });

  it.each(['schema', 'path'] as const)('gives the general text for kind %s', (kind) => {
    expect(errorText(new ApiError('m', { kind, template: '/t' }))).toBe(GENERAL_TEXT);
  });

  it.each([new Error('boom'), 'boom', undefined, null, { code: 'NOT_FOUND' }])(
    'gives the general text for a non-ApiError value %#',
    (value) => {
      expect(errorText(value)).toBe(GENERAL_TEXT);
    },
  );

  it.each(PROTOTYPE_KEYS)('gives the general text for the code %s', (code) => {
    expect(errorText(httpError(400, code))).toBe(GENERAL_TEXT);
  });
});

describe('detailText', () => {
  it.each(Object.entries(DETAIL_TEXTS))('gives the text of %s', (code, text) => {
    const result = detailText({ field: 'f', code, message: 'english' });
    expect(result).toBe(text);
    expect(result).toMatch(/[а-яё]/i);
  });

  it('has a text for MATCHES_STATUS', () => {
    expect(detailText({ field: 'status', code: 'MATCHES_STATUS', message: 'english' })).toBe(
      DETAIL_TEXTS.MATCHES_STATUS,
    );
    expect(DETAIL_TEXTS.MATCHES_STATUS).toMatch(/[а-яё]/i);
  });

  it('has a text for TOO_MANY_ERRORS with an empty field', () => {
    expect(detailText({ field: '', code: 'TOO_MANY_ERRORS', message: '3 more' })).toBe(
      DETAIL_TEXTS.TOO_MANY_ERRORS,
    );
  });

  it.each(['SOME_NEW_RULE', ...PROTOTYPE_KEYS])('gives a general text for the code %s', (code) => {
    const result = detailText({ field: 'f', code, message: 'english' });
    expect(result).toMatch(/[а-яё]/i);
    expect(Object.values(DETAIL_TEXTS)).not.toContain(result);
  });
});
