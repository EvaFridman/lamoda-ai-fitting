import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../../src/prisma/prisma.service.js';
import { createTestApp, type TestApp } from '../support/test-app.js';

describe('createTestApp()', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('gives the app the same client as the returned prisma', () => {
    expect(testApp.app.get(PrismaService)).toBe(testApp.prisma);
  });

  it('queries the test database through the app PrismaService', async () => {
    const name = `brand-${randomUUID()}`;
    await testApp.prisma.brand.create({ data: { name } });

    const count = await testApp.app.get(PrismaService).brand.count({ where: { name } });

    expect(count).toBe(1);
  });

  it('answers an unknown route with 404 ROUTE_NOT_FOUND in the error format', async () => {
    const response = await request(testApp.app.getHttpServer()).get(`/no-such-${randomUUID()}`);

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toMatchObject({ error: { code: 'ROUTE_NOT_FOUND', details: [] } });
  });

  it('answers /health/live with 200', async () => {
    const response = await request(testApp.app.getHttpServer()).get('/health/live');

    expect(response.status).toBe(200);
  });
});
