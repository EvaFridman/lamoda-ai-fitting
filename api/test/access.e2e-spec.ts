import { Controller, Get, type INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { LoggerModule } from 'nestjs-pino';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Closed, Public, SignedIn } from '../src/common/auth/access.decorators.js';
import { AccessGuard } from '../src/common/auth/access.guard.js';
import { AppExceptionFilter } from '../src/common/filters/app-exception.filter.js';
import { createHttpApp } from '../src/common/http/http-app.js';
import { validateEnv } from '../src/config/env.js';

@Controller('own')
class OwnController {
  @Get()
  @SignedIn()
  read(): { ok: boolean } {
    return { ok: true };
  }
}

@Controller('shut')
class ShutController {
  @Get()
  @Closed()
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

// The access guard registered globally, as AppModule does (spec 0006 F3). This app has no
// AuthModule, so no request has a session: the signed-in case is in test/database/access.e2e-spec.ts.
describe('access over HTTP', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, validate: validateEnv }),
        LoggerModule.forRoot({ pinoHttp: { level: 'silent' } }),
      ],
      controllers: [OwnController, ShutController, OpenController, ForgottenController],
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

  describe('@SignedIn()', () => {
    it('answers 401 in the error format without a session', async () => {
      const response = await request(app.getHttpServer()).get('/own');

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        error: { code: 'UNAUTHORIZED', message: 'Sign-in required', details: [] },
      });
    });

    it('answers 401 with a cookie that is no session', async () => {
      const response = await request(app.getHttpServer())
        .get('/own')
        .set('Cookie', 'lamoda.session_token=garbage');

      expect(response.status).toBe(401);
    });
  });

  describe('@Closed()', () => {
    it('answers 401 in the error format', async () => {
      const response = await request(app.getHttpServer()).get('/shut');

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        error: { code: 'UNAUTHORIZED', message: 'The route is closed', details: [] },
      });
    });
  });

  describe('@Public()', () => {
    it('answers 200 with no cookie and with a garbage one', async () => {
      await request(app.getHttpServer()).get('/open').expect(200, { ok: true });
      await request(app.getHttpServer())
        .get('/open')
        .set('Cookie', 'lamoda.session_token=garbage')
        .expect(200, { ok: true });
    });

    it('ignores the retired X-Admin-Token header on every route', async () => {
      await request(app.getHttpServer()).get('/open').set('X-Admin-Token', 'x').expect(200);
      await request(app.getHttpServer()).get('/shut').set('X-Admin-Token', 'x').expect(401);
      await request(app.getHttpServer()).get('/own').set('X-Admin-Token', 'x').expect(401);
    });
  });

  describe('a route with no marker', () => {
    it('answers 401 in the error format', async () => {
      const response = await request(app.getHttpServer()).get('/forgotten');

      expect(response.status).toBe(401);
      expect(response.body).toMatchObject({
        error: { code: 'UNAUTHORIZED', message: 'The route is closed', details: [] },
      });
    });
  });
});
