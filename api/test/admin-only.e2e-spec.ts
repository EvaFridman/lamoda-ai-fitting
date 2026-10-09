import { Controller, Get, type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { LoggerModule } from 'nestjs-pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { validateEnv } from '../src/config/env.js';
import { AppExceptionFilter } from '../src/common/filters/app-exception.filter.js';
import { AdminOnly } from '../src/common/guards/admin.guard.js';
import { AppExpressAdapter } from '../src/common/http/app-express.adapter.js';
import { createValidationPipe } from '../src/common/validation/validation-pipe.js';

@Controller('secured')
class SecuredController {
  @Get()
  @AdminOnly()
  read(): { ok: boolean } {
    return { ok: true };
  }
}

describe('@AdminOnly() over HTTP', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateEnv }),
        LoggerModule.forRoot({ pinoHttp: { level: 'silent' } }),
      ],
      controllers: [SecuredController],
      providers: [{ provide: APP_FILTER, useClass: AppExceptionFilter }],
    }).compile();
    app = moduleRef.createNestApplication(new AppExpressAdapter(), { logger: false });
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers 200 with the right token', async () => {
    const response = await request(app.getHttpServer())
      .get('/secured')
      .set('X-Admin-Token', process.env.ADMIN_API_TOKEN ?? '');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  it('answers 401 in the error format with a wrong token', async () => {
    const response = await request(app.getHttpServer())
      .get('/secured')
      .set('X-Admin-Token', 'wrong');

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ error: { code: 'UNAUTHORIZED', details: [] } });
  });

  it('answers 401 without the header', async () => {
    const response = await request(app.getHttpServer()).get('/secured');

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ error: { code: 'UNAUTHORIZED' } });
  });
});
