import { Controller, Get, type INestApplication, type Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ApiQuery, ApiResponse, type OpenAPIObject, type OperationObject } from '@nestjs/swagger';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { ERROR_CODES, ERROR_STATUS, type ErrorCode } from '../src/common/errors/error-codes.js';
import { createOpenApiDocument } from '../src/swagger.js';

const METHODS = ['get', 'put', 'post', 'delete', 'patch'] as const;
const ERROR_SCHEMA = { $ref: '#/components/schemas/ErrorResponseDto' };

interface Op {
  method: (typeof METHODS)[number];
  path: string;
  operation: OperationObject;
}

function operationsOf(document: OpenAPIObject): Op[] {
  return Object.entries(document.paths).flatMap(([path, item]) =>
    METHODS.flatMap((method) => {
      const operation = item[method];
      return operation === undefined ? [] : [{ method, path, operation }];
    }),
  );
}

function errorStatuses(operation: OperationObject): string[] {
  return Object.keys(operation.responses).filter((status) => Number(status) >= 400);
}

// Codes named in the descriptions of the error responses added by swagger.ts, by status.
function namedCodes(operation: OperationObject): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const status of errorStatuses(operation)) {
    const response = operation.responses[status] as { description: string };
    const match = /^Error codes: (.*)$/.exec(response.description);
    result[status] =
      match === null ? [] : [...(match[1] ?? '').matchAll(/`([A-Z_]+)`/g)].map((m) => m[1] ?? '');
  }
  return result;
}

function hasUuidPathParam(operation: OperationObject): boolean {
  return (operation.parameters ?? []).some(
    (parameter) =>
      'in' in parameter &&
      parameter.in === 'path' &&
      parameter.schema !== undefined &&
      'format' in parameter.schema &&
      parameter.schema.format === 'uuid',
  );
}

function hasQueryParam(operation: OperationObject): boolean {
  return (operation.parameters ?? []).some(
    (parameter) => 'in' in parameter && parameter.in === 'query',
  );
}

function shapeCodes(operation: OperationObject): Set<ErrorCode> {
  const codes = new Set<ErrorCode>(['TOO_MANY_REQUESTS', 'INTERNAL_ERROR', 'SERVICE_UNAVAILABLE']);
  if (operation.requestBody !== undefined) {
    for (const code of ['VALIDATION_FAILED', 'BAD_JSON', 'PAYLOAD_TOO_LARGE'] as const) {
      codes.add(code);
    }
  }
  if (hasQueryParam(operation)) {
    codes.add('VALIDATION_FAILED');
  }
  if (hasUuidPathParam(operation)) {
    codes.add('INVALID_ID');
    codes.add('NOT_FOUND');
  }
  if (operation.security?.some((requirement) => 'admin' in requirement) === true) {
    codes.add('UNAUTHORIZED');
  }
  return codes;
}

// What the operation must list: its shape plus the codes its controller names (the spot checks
// below pin those), grouped by status.
function groupByStatus(codes: string[]): Record<string, ErrorCode[]> {
  const result: Record<string, ErrorCode[]> = {};
  for (const code of ERROR_CODES) {
    if (!codes.includes(code)) {
      continue;
    }
    (result[String(ERROR_STATUS[code])] ??= []).push(code);
  }
  return result;
}

describe('OpenAPI document with a controller declaring its own error response (e2e)', () => {
  @Controller('own-429')
  class Own429Controller {
    @Get()
    @ApiResponse({ status: 429, description: 'custom' })
    list(): string[] {
      return [];
    }
  }

  @Controller('own-400')
  class Own400Controller {
    @Get()
    @ApiQuery({ name: 'q', required: false })
    @ApiResponse({ status: 400, description: 'custom' })
    list(): string[] {
      return [];
    }
  }

  @Controller('health')
  class OwnHealthController {
    @Get('ready')
    @ApiResponse({ status: 503, description: 'custom' })
    ready(): string {
      return 'ok';
    }
  }

  async function documentOf(controller: Type<unknown>): Promise<() => OpenAPIObject> {
    const moduleRef = await Test.createTestingModule({ controllers: [controller] }).compile();
    const app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    apps.push(app);
    return () => createOpenApiDocument(app, 'test');
  }

  const apps: INestApplication[] = [];

  afterAll(async () => {
    await Promise.all(apps.map((app) => app.close()));
  });

  it('throws naming the route when it declares its own 429', async () => {
    const build = await documentOf(Own429Controller);
    expect(build).toThrow('GET /own-429 declares its own 429 response');
  });

  it('throws naming the route when it declares its own 400 and its shape implies a 400', async () => {
    const build = await documentOf(Own400Controller);
    expect(build).toThrow('GET /own-400 declares its own 400 response');
  });

  it('does not throw for a /health route with its own 503', async () => {
    const build = await documentOf(OwnHealthController);
    const document = build();
    expect(document.paths['/health/ready']?.get?.responses['503']).toMatchObject({
      description: 'custom',
    });
  });
});

describe('OpenAPI document (e2e)', () => {
  let app: INestApplication;
  let document: OpenAPIObject;
  let ops: Op[];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    document = createOpenApiDocument(app, 'test');
    ops = operationsOf(document);
  });

  afterAll(async () => {
    await app.close();
  });

  function find(method: Op['method'], path: string): OperationObject {
    const op = ops.find((item) => item.method === method && item.path === path);
    if (op === undefined) {
      throw new Error(`No ${method} ${path} in the document`);
    }
    return op.operation;
  }

  function codesOf(method: Op['method'], path: string): Record<string, string[]> {
    return namedCodes(find(method, path));
  }

  it('lists every route of the app', () => {
    const router = (
      app.getHttpAdapter().getInstance() as {
        router: { stack: { route?: { path: string; methods: Record<string, boolean> } }[] };
      }
    ).router;
    // The catch-all `/*splat` is the ROUTE_NOT_FOUND handler, not an operation.
    const routes = router.stack.flatMap((layer) =>
      layer.route === undefined || layer.route.path.includes('*')
        ? []
        : Object.keys(layer.route.methods).map(
            (method) => `${method} ${layer.route?.path.replace(/:(\w+)/g, '{$1}')}`,
          ),
    );
    const documented = ops.map((op) => `${op.method} ${op.path}`);
    expect(routes.length).toBeGreaterThan(20);
    expect([...new Set(routes)].sort()).toEqual([...documented].sort());
  });

  it('gives every non-health operation exactly the error answers its shape implies', () => {
    const checked = ops.filter((op) => !op.path.startsWith('/health/'));
    expect(checked.length).toBeGreaterThan(20);
    for (const { method, path, operation } of checked) {
      const label = `${method} ${path}`;
      const named = namedCodes(operation);
      const listed = Object.values(named).flat();
      // Every shape code is present; extras are exactly the codes the controller names.
      for (const code of shapeCodes(operation)) {
        expect(listed, label).toContain(code);
      }
      expect(Object.keys(named).sort(), label).toEqual(Object.keys(groupByStatus(listed)).sort());
      expect(named, label).toEqual(groupByStatus(listed));
      expect(new Set(listed).size, label).toBe(listed.length);
      for (const status of errorStatuses(operation)) {
        expect(operation.responses[status], label).toMatchObject({
          content: { 'application/json': { schema: ERROR_SCHEMA } },
        });
      }
    }
  });

  it('gives operations with no request body, query or uuid id no validation or id answers', () => {
    const plain = ops.filter(
      (op) =>
        !op.path.startsWith('/health/') &&
        op.operation.requestBody === undefined &&
        !hasQueryParam(op.operation) &&
        !hasUuidPathParam(op.operation),
    );
    for (const { method, path, operation } of plain) {
      const listed = Object.values(namedCodes(operation)).flat();
      expect(listed, `${method} ${path}`).not.toContain('VALIDATION_FAILED');
      expect(listed, `${method} ${path}`).not.toContain('INVALID_ID');
    }
  });

  it('gives health operations no error responses of the envelope', () => {
    const health = ops.filter((op) => op.path.startsWith('/health/'));
    expect(health.length).toBeGreaterThan(0);
    for (const { method, path, operation } of health) {
      const responses = JSON.stringify(operation.responses);
      expect(responses, `${method} ${path}`).not.toContain('ErrorResponseDto');
      for (const status of ['400', '401', '404', '409', '413', '429', '500']) {
        expect(operation.responses, `${method} ${path}`).not.toHaveProperty(status);
      }
    }
  });

  it('keeps the answers /health/ready already has', () => {
    expect(find('get', '/health/ready').responses).toHaveProperty('503');
  });

  it('leaves no x-error-codes in the document', () => {
    expect(JSON.stringify(document)).not.toContain('x-error-codes');
  });

  it('describes the error envelope and the ErrorCode enum', () => {
    const schemas = document.components?.schemas ?? {};
    expect(schemas).toHaveProperty('ErrorResponseDto');
    expect(schemas).toHaveProperty('ErrorDto');
    expect(schemas).toHaveProperty('ErrorDetailDto');
    expect(schemas['ErrorResponseDto']).toMatchObject({
      required: ['error'],
      properties: { error: { $ref: '#/components/schemas/ErrorDto' } },
    });
    const errorDto = schemas['ErrorDto'] as { properties: Record<string, unknown> };
    expect(JSON.stringify(errorDto.properties['code'])).toContain('#/components/schemas/ErrorCode');
    expect(errorDto.properties['details']).toMatchObject({
      type: 'array',
      items: { $ref: '#/components/schemas/ErrorDetailDto' },
    });
    expect((schemas['ErrorCode'] as { enum: string[] }).enum).toEqual([...ERROR_CODES]);
  });

  it('names the codes in the order of ERROR_CODES', () => {
    const named = codesOf('post', '/users');
    for (const codes of Object.values(named)) {
      const indexes = codes.map((code) => ERROR_CODES.indexOf(code as ErrorCode));
      expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
    }
  });

  it('lists ALREADY_EXISTS (409) on POST /users and PATCH /users/{id}', () => {
    expect(codesOf('post', '/users')['409']).toEqual(['ALREADY_EXISTS']);
    expect(codesOf('patch', '/users/{id}')['409']).toEqual(['ALREADY_EXISTS']);
  });

  it('lists IN_USE (409) on DELETE /brands/{id}, and 404 NOT_FOUND', () => {
    const named = codesOf('delete', '/brands/{id}');
    expect(named['409']).toEqual(['IN_USE']);
    expect(named['404']).toEqual(['NOT_FOUND']);
  });

  it('lists RELATED_NOT_FOUND and CONSTRAINT_VIOLATION with the 400 codes of PATCH /ai-generations/{id}', () => {
    const named = codesOf('patch', '/ai-generations/{id}');
    expect(named['400']).toEqual(
      expect.arrayContaining([
        'VALIDATION_FAILED',
        'BAD_JSON',
        'INVALID_ID',
        'RELATED_NOT_FOUND',
        'CONSTRAINT_VIOLATION',
      ]),
    );
    expect(named['400']).toHaveLength(5);
    expect(named['401']).toEqual(['UNAUTHORIZED']);
  });

  it('lists ALREADY_EXISTS (409) and RELATED_NOT_FOUND (400) on POST /fitting-sessions', () => {
    const named = codesOf('post', '/fitting-sessions');
    expect(named['409']).toEqual(['ALREADY_EXISTS']);
    expect(named['400']).toContain('RELATED_NOT_FOUND');
  });

  it('lists ALREADY_EXISTS on PATCH /fitting-sessions/{id} but not RELATED_NOT_FOUND', () => {
    const named = codesOf('patch', '/fitting-sessions/{id}');
    expect(named['409']).toEqual(['ALREADY_EXISTS']);
    expect(named['400']).not.toContain('RELATED_NOT_FOUND');
  });

  it('lists RELATED_NOT_FOUND on POST /ai-generations without a 409', () => {
    const named = codesOf('post', '/ai-generations');
    expect(named['400']).toContain('RELATED_NOT_FOUND');
    expect(named).not.toHaveProperty('409');
  });

  it('gives a public catalog read no 401 and no 409', () => {
    const named = codesOf('get', '/brands/{id}');
    expect(named).not.toHaveProperty('401');
    expect(named).not.toHaveProperty('409');
    expect(named['404']).toEqual(['NOT_FOUND']);
    expect(named['400']).toEqual(['INVALID_ID']);
    expect(named['429']).toEqual(['TOO_MANY_REQUESTS']);
    expect(named['500']).toEqual(['INTERNAL_ERROR']);
    expect(named['503']).toEqual(['SERVICE_UNAVAILABLE']);
  });

  it('gives admin operations a 401 and public catalog reads none', () => {
    const adminOps = ops.filter((op) => op.operation.security?.some((r) => 'admin' in r) === true);
    expect(adminOps.length).toBeGreaterThan(0);
    for (const { method, path, operation } of adminOps) {
      expect(namedCodes(operation)['401'], `${method} ${path}`).toEqual(['UNAUTHORIZED']);
    }
    const publicOps = ops.filter((op) => !op.path.startsWith('/health/') && !adminOps.includes(op));
    expect(publicOps.length).toBeGreaterThan(0);
    for (const { method, path, operation } of publicOps) {
      expect(errorStatuses(operation), `${method} ${path}`).not.toContain('401');
    }
  });
});
