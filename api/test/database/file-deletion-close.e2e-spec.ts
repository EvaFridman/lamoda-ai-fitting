import { randomUUID } from 'node:crypto';

import type { S3Client } from '@aws-sdk/client-s3';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { generationFolder } from '../../src/storage/keys.js';
import { START_TIMEOUT_MS } from '../../src/temporal/workflow-starter.js';
import { createTestApp, type TestApp } from '../support/test-app.js';
import { createTestS3Client } from '../support/test-storage.js';

const ADMIN = { 'X-Admin-Token': process.env['ADMIN_API_TOKEN'] ?? '' };

describe('closing the app after a successful start', () => {
  let testApp: TestApp;
  let s3: S3Client;

  beforeAll(async () => {
    s3 = createTestS3Client();
    testApp = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    s3.destroy();
    await testApp.close().catch(() => undefined);
  });

  it('raises nothing, not even once the start bound has passed', async () => {
    const { prisma } = testApp;
    const digits = String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
    const user = await prisma.user.create({
      data: { phone: `+79${digits}`, email: `${randomUUID()}@example.test`, firstName: 'Test' },
    });
    const session = await prisma.fittingSession.create({ data: { userId: user.id } });
    const generation = await prisma.aiGeneration.create({
      data: {
        sessionId: session.id,
        userImageKey: `${generationFolder(user.id, randomUUID())}input.webp`,
        status: 'pending',
        aiProvider: 'test',
        aiModel: 'test',
      },
    });
    const raised: unknown[] = [];
    const onError = (error: unknown) => raised.push(error);
    process.on('uncaughtException', onError);
    process.on('unhandledRejection', onError);
    try {
      await request(testApp.app.getHttpServer())
        .delete(`/ai-generations/${generation.id}`)
        .set(ADMIN)
        .expect(204);
      await testApp.app.close();
      // A timer of the start that outlived it would fire inside this window.
      await new Promise((resolve) => setTimeout(resolve, START_TIMEOUT_MS + 1000));
    } finally {
      process.off('uncaughtException', onError);
      process.off('unhandledRejection', onError);
    }

    expect(raised).toEqual([]);
  }, 30_000);
});
