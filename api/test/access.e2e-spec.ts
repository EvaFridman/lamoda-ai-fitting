import { Controller, Get, type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { LoggerModule } from 'nestjs-pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AdminOnly, Public } from '../src/common/auth/access.decorators.js';
import { AccessGuard } from '../src/common/auth/access.guard.js';
import { AppExceptionFilter } from '../src/common/filters/app-exception.filter.js';
import { createHttpApp } from '../src/common/http/http-app.js';
import { validateEnv } from '../src/config/env.js';

@Controller('secured')
class SecuredController {
  @Get()
  @AdminOnly()
  read(): { ok: boolean } {
    return { ok: true };
  }
}

@Controller('open')
class OpenController {
  @Get()
  @Public()
  read(): { ok: boolean } {
    return { ok: true };
  }
}

// A route someone forgot to mark.
@Controller('forgotten')
class ForgottenController {
  @Get()
  read(): { ok: boolean } {
    return { ok: true };
  }
}

// The access guard registered globally, as AppModule does (spec 0006 F3).
describe('access over HTTP', () => {
  let app: INestApplication;
  const adminToken = process.env.ADMIN_API_TOKEN ?? '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateEnv }),
        LoggerModule.forRoot({ pinoHttp: { level: 'silent' } }),
      ],
      controllers: [SecuredController, OpenController, ForgottenController],
      providers: [
        { provide: APP_FILTER, useClass: AppExceptionFilter },
        { provide: APP_GUARD, useClass: AccessGuard },
      ],
    }).compile();
    app = await createHttpApp(
      (adapter, options) =>
        moduleRef.createNestApplication<NestExpressApplication>(adapter, options),
      { logger: false },
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('@AdminOnly()', () => {
    it('answers 200 with the right token', async () => {
      const response = await request(app.getHttpServer())
        .get('/secured')
        .set('X-Admin-Token', adminToken);

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

  describe('@Public()', () => {
    it('answers 200 without a token, with a wrong one and with the right one', async () => {
      await request(app.getHttpServer()).get('/open').expect(200, { ok: true });
      await request(app.getHttpServer())
        .get('/open')
        .set('X-Admin-Token', 'wrong')
        .expect(200, { ok: true });
      await request(app.getHttpServer())
        .get('/open')
        .set('X-Admin-Token', adminToken)
        .expect(200, { ok: true });
    });
  });

  describe('a route with neither marker', () => {
    it('answers 401 to every request, the right token included', async () => {
      for (const token of [undefined, 'wrong', adminToken]) {
        const call = request(app.getHttpServer()).get('/forgotten');
        const response = await (token === undefined ? call : call.set('X-Admin-Token', token));

        expect(response.status).toBe(401);
        expect(response.body).toMatchObject({ error: { code: 'UNAUTHORIZED', details: [] } });
      }
    });
  });
});
