import * as Sentry from '@sentry/nextjs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { beforeSend } from '../../../sentry.options';

import { ApiError } from './api-error';
import { reportApiError } from './report';

// The real SDK, with a fake DSN and a transport that sends nothing: checks what the unit tests with
// a mocked `captureException` cannot, that the hint's fingerprint reaches `beforeSend` as
// `event.fingerprint`. No default integrations and only the events of the test's own errors are
// counted, so nothing else in the environment (global handlers, other tests' errors) can change
// the numbers.
const seen = vi.fn<(error: unknown, fingerprint: string[] | undefined) => void>();
const sent = vi.fn<(envelope: unknown) => void>();

function seenFor(error: unknown) {
  return seen.mock.calls.filter(([original]) => original === error);
}

function sentFor(template: string) {
  return sent.mock.calls.filter(([envelope]) => JSON.stringify(envelope).includes(template));
}

beforeAll(() => {
  Sentry.init({
    dsn: 'https://public@example.invalid/1',
    defaultIntegrations: false,
    integrations: [],
    transport: () => ({
      send: (envelope: unknown) => {
        sent(envelope);
        return Promise.resolve({});
      },
      flush: () => Promise.resolve(true),
    }),
    beforeSend: (event, hint) => {
      seen(hint.originalException, event.fingerprint);
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
    expect(seenFor(error)).toHaveLength(1);
    expect(seenFor(error)[0]?.[1]).toContain('api-failure');
    expect(sentFor('/sdk-test')).toHaveLength(1);

    Sentry.captureException(error);
    await Sentry.flush(100);
    // Either the SDK skips an error object it has captured already or `beforeSend` drops it: one
    // envelope in all.
    expect(sentFor('/sdk-test')).toHaveLength(1);
  });

  it('drops an unreported ApiError captured directly', async () => {
    const error = new ApiError('api answered 404: /sdk-404', {
      kind: 'http',
      template: '/sdk-404',
      status: 404,
    });
    Sentry.captureException(error);
    await Sentry.flush(100);
    expect(sentFor('/sdk-404')).toHaveLength(0);
  });
});
