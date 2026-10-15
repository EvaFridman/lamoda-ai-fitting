import * as Sentry from '@sentry/nextjs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { beforeSend } from '../../../sentry.options';

import { ApiError } from './api-error';
import { reportApiError } from './report';

// The real SDK, with a fake DSN and a transport that sends nothing: checks what the unit tests with
// a mocked `captureException` cannot, that the hint's fingerprint reaches `beforeSend` as
// `event.fingerprint`.
const seen = vi.fn();
const sent = vi.fn();

beforeAll(() => {
  Sentry.init({
    dsn: 'https://public@example.invalid/1',
    transport: () => ({
      send: (envelope: unknown) => {
        sent(envelope);
        return Promise.resolve({});
      },
      flush: () => Promise.resolve(true),
    }),
    beforeSend: (event, hint) => {
      seen(event.fingerprint);
      return beforeSend(event, hint);
    },
  });
});

afterAll(async () => {
  await Sentry.close();
});

describe('beforeSend with the real SDK', () => {
  it('lets a reported ApiError through once and drops its second capture', async () => {
    const error = new ApiError('down', { kind: 'timeout', template: '/sdk-test', method: 'GET' });
    reportApiError(error);
    await Sentry.flush(100);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen.mock.calls[0]?.[0]).toContain('api-failure');
    expect(sent).toHaveBeenCalledTimes(1);

    Sentry.captureException(error);
    await Sentry.flush(100);
    // The SDK itself skips an error object it has captured, so `beforeSend` is not even reached.
    expect(seen).toHaveBeenCalledTimes(1);
    expect(sent).toHaveBeenCalledTimes(1);
  });

  it('drops an unreported ApiError captured directly', async () => {
    sent.mockClear();
    const error = new ApiError('missing', { kind: 'http', template: '/x', status: 404 });
    Sentry.captureException(error);
    await Sentry.flush(100);
    expect(sent).not.toHaveBeenCalled();
  });
});
