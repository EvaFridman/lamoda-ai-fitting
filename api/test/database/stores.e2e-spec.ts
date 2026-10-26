import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { SeedService } from '../../src/seed/seed.service.js';
import { STORES } from '../../src/seed/stores.data.js';
import type { StorageService } from '../../src/storage/storage.service.js';
import { createTestApp, type TestApp } from '../support/test-app.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const ANSWER_KEYS = [
  'city',
  'description',
  'house',
  'id',
  'latitude',
  'longitude',
  'mall',
  'metroStations',
  'name',
  'phones',
  'street',
  'type',
  'workTime',
];

interface StoreAnswer {
  id: string;
  name: string;
  type: string;
  city: string;
  street: string;
  house: string;
  mall: string;
  latitude: number;
  longitude: number;
  metroStations: string[];
  workTime: string;
  description: string;
  phones: string[];
}

let testApp: TestApp;

beforeAll(async () => {
  testApp = await createTestApp();
  // Only the stores are seeded, so the storage is never touched.
  const seed = new SeedService(testApp.prisma, {} as unknown as StorageService);
  await seed.seedStores();
});

afterAll(async () => {
  await testApp.close();
});

describe('GET /stores (spec 0022 AC1)', () => {
  it('answers every store as a plain array in the order of the list, with no cookie', async () => {
    const response = await request(testApp.app.getHttpServer()).get('/stores').expect(200);

    const body = response.body as StoreAnswer[];
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(STORES.length);
    body.forEach((item, index) => {
      const expected = STORES[index];
      if (expected === undefined) throw new Error(`no store at ${index}`);
      const { code: _code, ...rest } = expected;
      expect(item).toEqual({ id: expect.stringMatching(UUID), ...rest });
    });
  });

  it('gives each store exactly the public keys, without code, position or dates', async () => {
    const response = await request(testApp.app.getHttpServer()).get('/stores').expect(200);

    for (const item of response.body as StoreAnswer[]) {
      expect(Object.keys(item).sort()).toEqual(ANSWER_KEYS);
    }
  });

  it('still answers 200 to a cookie that is no session', async () => {
    const response = await request(testApp.app.getHttpServer())
      .get('/stores')
      .set('Cookie', 'lamoda.session_token=garbage')
      .expect(200);

    expect(response.body).toHaveLength(STORES.length);
  });

  it('answers empty arrays, not null, for a store with no station and no phone', async () => {
    const { code: _code, ...source } = STORES[0]!;
    const name = `Empty ${randomUUID()}`;
    await testApp.prisma.store.create({
      data: {
        ...source,
        name,
        code: 'czzz',
        position: 100_000,
        metroStations: [],
        phones: [],
      },
    });

    const response = await request(testApp.app.getHttpServer()).get('/stores').expect(200);

    const body = response.body as StoreAnswer[];
    expect(body.at(-1)).toMatchObject({ name, metroStations: [], phones: [] });
  });
});
