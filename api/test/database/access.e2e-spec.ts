import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type TestApp } from '../support/test-app.js';

const publicReads = [
  '/categories',
  '/brands',
  '/attributes',
  '/products',
  '/products/facets',
  '/health/live',
];
const adminReads = ['/users', '/fitting-sessions', '/ai-generations'];

// The whole app with the global access guard (spec 0006 F3, AC2, AC3).
describe('access through the whole app (database e2e)', () => {
  let testApp: TestApp;
  const adminToken = process.env.ADMIN_API_TOKEN ?? '';

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  it.each(publicReads)(
    'serves GET %s with no token, a wrong one and the right one',
    async (path) => {
      const server = testApp.app.getHttpServer();

      await request(server).get(path).expect(200);
      await request(server).get(path).set('X-Admin-Token', 'wrong').expect(200);
      await request(server).get(path).set('X-Admin-Token', adminToken).expect(200);
    },
  );

  it.each(adminReads)(
    'answers GET %s 401 with no token or a wrong one, 200 with the right one',
    async (path) => {
      const server = testApp.app.getHttpServer();

      const missing = await request(server).get(path);
      const wrong = await request(server).get(path).set('X-Admin-Token', 'wrong');
      for (const response of [missing, wrong]) {
        expect(response.status).toBe(401);
        expect(response.body).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
      }
      await request(server).get(path).set('X-Admin-Token', adminToken).expect(200);
    },
  );

  it('answers a catalog write 401 without the right token, and creates with it', async () => {
    const server = testApp.app.getHttpServer();
    const body = { name: `Access brand ${crypto.randomUUID()}` };

    await request(server).post('/brands').send(body).expect(401);
    await request(server).post('/brands').set('X-Admin-Token', 'wrong').send(body).expect(401);
    await request(server).post('/brands').set('X-Admin-Token', adminToken).send(body).expect(201);
  });

  it.each(['/nope', '/nope/users', '/users/a/b/c'])(
    'answers GET %s 404 in the error format, not 401',
    async (path) => {
      const response = await request(testApp.app.getHttpServer()).get(path);

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({ error: { code: 'ROUTE_NOT_FOUND' } });
    },
  );

  it('answers HEAD 401 on an admin route and 200 on a public one', async () => {
    const server = testApp.app.getHttpServer();

    await request(server).head('/users').expect(401);
    await request(server).head('/users').set('X-Admin-Token', 'wrong').expect(401);
    await request(server).head('/brands').expect(200);
  });

  it('treats an empty X-Admin-Token as no token', async () => {
    const server = testApp.app.getHttpServer();

    await request(server).get('/brands').set('X-Admin-Token', '').expect(200);
    const response = await request(server).get('/users').set('X-Admin-Token', '');
    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
  });

  const nestedWrites: [string, string, string][] = [
    ['PATCH', 'variations', 'variationId'],
    ['DELETE', 'variations', 'variationId'],
    ['PATCH', 'images', 'imageId'],
    ['DELETE', 'images', 'imageId'],
    ['DELETE', 'attribute-values', 'attributeValueId'],
  ];

  it.each(nestedWrites)(
    'answers %s on products/:id/%s/:%s 401 without the right token',
    async (method, part) => {
      const server = testApp.app.getHttpServer();
      const path = `/products/${crypto.randomUUID()}/${part}/${crypto.randomUUID()}`;
      const send = (token?: string) => {
        const call =
          method === 'PATCH' ? request(server).patch(path).send({}) : request(server).delete(path);
        return token === undefined ? call : call.set('X-Admin-Token', token);
      };

      for (const response of [await send(), await send('wrong')]) {
        expect(response.status).toBe(401);
        expect(response.body).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
      }
    },
  );

  it.each(['PATCH', 'DELETE'])(
    'answers %s on attributes/:id/values/:valueId 401 without the right token',
    async (method) => {
      const server = testApp.app.getHttpServer();
      const path = `/attributes/${crypto.randomUUID()}/values/${crypto.randomUUID()}`;
      const send = (token?: string) => {
        const call =
          method === 'PATCH' ? request(server).patch(path).send({}) : request(server).delete(path);
        return token === undefined ? call : call.set('X-Admin-Token', token);
      };

      for (const response of [await send(), await send('wrong')]) {
        expect(response.status).toBe(401);
        expect(response.body).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
      }
    },
  );

  it.each([
    `/products/${crypto.randomUUID()}/variations/${crypto.randomUUID()}`,
    `/products/${crypto.randomUUID()}/images/${crypto.randomUUID()}`,
    `/products/${crypto.randomUUID()}/attribute-values/${crypto.randomUUID()}`,
    `/attributes/${crypto.randomUUID()}/values/${crypto.randomUUID()}`,
  ])('lets GET %s through without a token (404 for an unknown id)', async (path) => {
    const response = await request(testApp.app.getHttpServer()).get(path);

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });
});
