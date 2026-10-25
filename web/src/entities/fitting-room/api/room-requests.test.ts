import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/shared/api';

import { clearRoom, putRoomItem, removeRoomItem } from './room-requests';

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

const DATE = '2026-10-01T12:00:00.000Z';
const ID = '3f2b8c1e-5a4d-4e6f-8a9b-0c1d2e3f4a5b';
const fetchMock = vi.fn();

const product = {
  id: ID,
  article: 'A-1',
  name: 'Рубашка',
  brand: { id: ID, name: 'Annen' },
  category: { id: ID, name: 'Рубашки', slug: 'shirts' },
  image: null,
  price: 5000,
  discount: 0,
  finalPrice: 5000,
  rating: null,
  createdAt: DATE,
  updatedAt: DATE,
};
const room = {
  items: [{ slot: 'top', product, attributeValueId: null, colour: null }],
  count: 1,
  sum: 5000,
};

function lastCall() {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return { path: new URL(String(url)).pathname, init };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('putRoomItem', () => {
  it('puts the product to the slot as JSON and reads the change', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ room, replaced: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const change = await putRoomItem('top', { productId: ID, attributeValueId: ID });

    expect(change.room.count).toBe(1);
    expect(change.replaced).toBeNull();
    const { path, init } = lastCall();
    expect(path).toBe('/api/me/fitting-room/top');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(String(init.body))).toEqual({ productId: ID, attributeValueId: ID });
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
  });

  it('turns an answer of another shape into a schema error', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ room: { items: [] } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(putRoomItem('top', { productId: ID })).rejects.toMatchObject({
      name: 'ApiError',
      kind: 'schema',
    });
  });

  it('throws the api error of a refusal', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'RELATED_NOT_FOUND',
            message: 'm',
            details: [{ field: 'productId', code: 'HAS_SLOT', message: 'm' }],
          },
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const failure = await putRoomItem('accessory', { productId: ID }).catch(
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({ kind: 'http', status: 400 });
  });
});

describe('removeRoomItem', () => {
  it('deletes the slot and resolves with nothing on a 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(removeRoomItem('shoes')).resolves.toBeUndefined();

    const { path, init } = lastCall();
    expect(path).toBe('/api/me/fitting-room/shoes');
    expect(init.method).toBe('DELETE');
  });
});

describe('clearRoom', () => {
  it('deletes the whole room', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(clearRoom()).resolves.toBeUndefined();

    const { path, init } = lastCall();
    expect(path).toBe('/api/me/fitting-room');
    expect(init.method).toBe('DELETE');
  });

  it('throws a failure of the api', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'm', details: [] } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(clearRoom()).rejects.toMatchObject({ kind: 'http', status: 401 });
  });
});
