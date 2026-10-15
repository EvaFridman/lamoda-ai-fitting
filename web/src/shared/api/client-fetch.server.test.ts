// @vitest-environment node
import * as Sentry from '@sentry/nextjs';
import { dehydrate, QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

vi.mock('server-only', () => ({}));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

import { productOptions } from '@/entities/product';

import { ApiError, buildPath, clientFetch } from './index';
import { prefetch } from './prefetch';

const ID = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';
const fetchMock = vi.fn();
const capture = vi.mocked(Sentry.captureException);

beforeEach(() => {
  capture.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('clientFetch on the server', () => {
  it('rejects with a plain Error that names the template, before any request', async () => {
    expect(typeof globalThis.location).toBe('undefined');
    const error: unknown = await clientFetch(
      buildPath('/things/:id', { id: ID }),
      z.unknown(),
    ).then(
      () => undefined,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ApiError);
    const message = (error as Error).message;
    expect((error as Error).name).toBe('ClientFetchOnServer');
    expect(message).toContain('only in the browser');
    expect(message).toContain('/things/:id');
    expect(message).not.toContain(ID);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
  });
});

describe('prefetch with a browser slice option', () => {
  it('returns that Error, not an ApiError, and dehydrates nothing', async () => {
    const client = new QueryClient();
    const result = await prefetch(client, productOptions(ID));
    expect(result).toBeInstanceOf(Error);
    expect(result).not.toBeInstanceOf(ApiError);
    expect((result as Error).name).toBe('ClientFetchOnServer');
    expect((result as Error).message).toContain('only in the browser');
    expect(dehydrate(client).queries).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
  });
});
