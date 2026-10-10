import {
  type ArgumentsHost,
  Catch,
  Controller,
  type ExceptionFilter,
  type INestApplication,
  Get,
} from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import type { Response } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppException } from '../errors/app.exception.js';
import { UuidParam, UuidPipe } from './uuid.pipe.js';

describe('UuidPipe', () => {
  const pipe = new UuidPipe();
  const valid = '3f2b8c1e-5d4a-4b6e-9a7c-1d2e3f4a5b6c';

  it('returns a valid UUID unchanged', async () => {
    await expect(pipe.transform(valid, { type: 'param', data: 'id' })).resolves.toBe(valid);
  });

  it('refuses a bad id with 400 INVALID_ID naming the parameter', async () => {
    const error = await pipe
      .transform('not-a-uuid', { type: 'param', data: 'brandId' })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AppException);
    const exception = error as AppException;
    expect(exception.getStatus()).toBe(400);
    expect(exception.body).toEqual({
      error: {
        code: 'INVALID_ID',
        message: 'brandId must be a UUID',
        details: [{ field: 'brandId', code: 'INVALID_ID', message: 'brandId must be a UUID' }],
      },
    });
  });

  it('names the parameter "id" when the decorator gave no name', async () => {
    const error = (await pipe
      .transform('x', { type: 'param' })
      .catch((e: unknown) => e)) as AppException;
    expect(error.body.error.details[0]?.field).toBe('id');
  });

  it('refuses an empty string', async () => {
    await expect(pipe.transform('', { type: 'param', data: 'id' })).rejects.toMatchObject({
      body: { error: { code: 'INVALID_ID' } },
    });
  });
});

@Catch(AppException)
class TestFilter implements ExceptionFilter {
  catch(exception: AppException, host: ArgumentsHost): void {
    host.switchToHttp().getResponse<Response>().status(exception.getStatus()).json(exception.body);
  }
}

@Controller('things')
class ThingsController {
  @Get(':id')
  one(@UuidParam('id') id: string): { id: string } {
    return { id };
  }

  @Get(':id/values/:valueId')
  value(
    @UuidParam('id') id: string,
    @UuidParam('valueId') valueId: string,
  ): { id: string; valueId: string } {
    return { id, valueId };
  }
}

describe('UuidParam', () => {
  const valid = '3f2b8c1e-5d4a-4b6e-9a7c-1d2e3f4a5b6c';
  const other = '9b1d4e7a-2c3f-4a8b-8d6e-0f1a2b3c4d5e';
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ThingsController],
      providers: [{ provide: APP_FILTER, useClass: TestFilter }],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('documents one required uuid path parameter', () => {
    const document = SwaggerModule.createDocument(app, new DocumentBuilder().build());

    expect(document.paths['/things/{id}']?.get?.parameters).toEqual([
      { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
    ]);
  });

  it('documents each of two path parameters once', () => {
    const document = SwaggerModule.createDocument(app, new DocumentBuilder().build());

    expect(document.paths['/things/{id}/values/{valueId}']?.get?.parameters).toEqual(
      expect.arrayContaining([
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        { name: 'valueId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ]),
    );
    expect(document.paths['/things/{id}/values/{valueId}']?.get?.parameters).toHaveLength(2);
  });

  it('passes a valid uuid to the handler as the same string', async () => {
    const response = await request(app.getHttpServer()).get(`/things/${valid}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: valid });
  });

  it('passes both ids of a two-parameter route', async () => {
    const response = await request(app.getHttpServer()).get(`/things/${valid}/values/${other}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: valid, valueId: other });
  });

  it('answers 400 INVALID_ID naming the parameter for a bad id', async () => {
    const response = await request(app.getHttpServer()).get('/things/not-a-uuid');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: 'INVALID_ID',
        message: 'id must be a UUID',
        details: [{ field: 'id', code: 'INVALID_ID', message: 'id must be a UUID' }],
      },
    });
  });

  it('names the second parameter when only it is bad', async () => {
    const response = await request(app.getHttpServer()).get(`/things/${valid}/values/nope`);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: { code: 'INVALID_ID', details: [{ field: 'valueId' }] },
    });
  });
});
