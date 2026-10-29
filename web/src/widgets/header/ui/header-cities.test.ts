import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Store } from '@/entities/store';
import { getStores } from '@/entities/store/server';
import { ApiError, reportFailure } from '@/shared/api';

import { loadHeaderCities } from './header-cities';

vi.mock('server-only', () => ({}));
vi.mock('@/entities/store/server', () => ({ getStores: vi.fn() }));
vi.mock('@/shared/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/api')>()),
  reportFailure: vi.fn(),
}));

const getStoresMock = vi.mocked(getStores);
const reportFailureMock = vi.mocked(reportFailure);

function store(id: string, city: string, longitude: number, latitude: number): Store {
  return {
    id: `00000000-0000-4000-8000-00000000000${id}`,
    name: `Магазин ${id}`,
    type: 'sport',
    city,
    street: 'Секретная улица',
    house: '1',
    mall: 'ТЦ Секрет',
    latitude,
    longitude,
    metroStations: ['Станция'],
    workTime: '10-22',
    description: 'Описание магазина',
    phones: ['+7 000 000-00-00'],
  };
}

describe('loadHeaderCities', () => {
  beforeEach(() => {
    getStoresMock.mockReset();
    reportFailureMock.mockReset();
  });

  it('returns the cities with their names and points only', async () => {
    getStoresMock.mockResolvedValue([
      store('1', 'г. Казань', 49.1, 55.79),
      store('2', 'г. Москва', 37.62, 55.75),
      store('3', 'г. Москва', 37.5, 55.7),
    ]);

    const cities = await loadHeaderCities();

    expect(cities).toEqual([
      {
        name: 'Москва',
        points: [
          [37.62, 55.75],
          [37.5, 55.7],
        ],
      },
      { name: 'Казань', points: [[49.1, 55.79]] },
    ]);
    expect(JSON.stringify(cities)).not.toContain('Секрет');
    expect(reportFailureMock).not.toHaveBeenCalled();
  });

  it.each([
    ['an ApiError', new ApiError('down', { kind: 'http', template: '/stores', status: 503 })],
    ['a plain error', new Error('boom')],
  ])('reports %s once and returns null', async (_name, error) => {
    getStoresMock.mockRejectedValue(error);

    expect(await loadHeaderCities()).toBeNull();
    expect(reportFailureMock).toHaveBeenCalledTimes(1);
    expect(reportFailureMock).toHaveBeenCalledWith(error);
  });
});
