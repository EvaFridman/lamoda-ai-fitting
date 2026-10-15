import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { createOpenApiDocument } from '../src/swagger.js';

// The committed OpenAPI document (spec 0007 H12): web's contract tests compare its schemas with
// it. A change to the api's routes or DTOs fails this test until the snapshot is rewritten with
// `npm --prefix api test -- -u` and committed with the change.
describe('OpenAPI snapshot (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('matches api/openapi.json', async () => {
    // A fixed version: the snapshot must not change with the release.
    const document = createOpenApiDocument(app, 'snapshot');
    await expect(`${JSON.stringify(document, null, 2)}\n`).toMatchFileSnapshot('../openapi.json');
  });
});
