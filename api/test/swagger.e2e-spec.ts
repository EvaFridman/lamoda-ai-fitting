import { Controller, Get, type INestApplication, type Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ApiQuery, ApiResponse, type OpenAPIObject, type OperationObject } from '@nestjs/swagger';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { ERROR_CODES, ERROR_STATUS, type ErrorCode } from '../src/common/errors/error-codes.js';
import { createHttpApp } from '../src/common/http/http-app.js';
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

function hasNonUuidPathParam(operation: OperationObject): boolean {
  return (operation.parameters ?? []).some(
    (parameter) =>
      'in' in parameter &&
      parameter.in === 'path' &&
      !(
        parameter.schema !== undefined &&
        'format' in parameter.schema &&
        parameter.schema.format === 'uuid'
      ),
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
  // A 404 for such a param comes from the route's @ApiErrors('NOT_FOUND'), not from the shape.
  if (hasNonUuidPathParam(operation)) {
    codes.add('VALIDATION_FAILED');
  }
  if (operation.security?.some((requirement) => 'session' in requirement) === true) {
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
    app = await createHttpApp(
      (adapter, options) =>
        moduleRef.createNestApplication<NestExpressApplication>(adapter, options),
      { logger: false },
    );
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

  it('lists VALIDATION_FAILED and NOT_FOUND, not INVALID_ID, on GET /categories/by-slug/{slug}', () => {
    const named = codesOf('get', '/categories/by-slug/{slug}');

    expect(named['400']).toContain('VALIDATION_FAILED');
    expect(named['400']).not.toContain('INVALID_ID');
    expect(named['404']).toContain('NOT_FOUND');
    expect(Object.values(named).flat()).not.toContain('INVALID_ID');
  });

  it('gives operations with no request body, query, path param no validation or id answers', () => {
    const plain = ops.filter(
      (op) =>
        !op.path.startsWith('/health/') &&
        op.operation.requestBody === undefined &&
        !hasQueryParam(op.operation) &&
        !hasUuidPathParam(op.operation) &&
        !hasNonUuidPathParam(op.operation),
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

  it('lists ALREADY_EXISTS (409) on POST /fitting-sessions but not RELATED_NOT_FOUND (no userId)', () => {
    const named = codesOf('post', '/fitting-sessions');
    expect(named['409']).toEqual(['ALREADY_EXISTS']);
    expect(named['400']).not.toContain('RELATED_NOT_FOUND');
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

  it('gives @SignedIn() operations the session security and a 401', () => {
    const signedInOps = ops.filter(
      (op) => op.operation.security?.some((r) => 'session' in r) === true,
    );
    expect(signedInOps.map((op) => `${op.method} ${op.path}`).sort()).toEqual(
      expect.arrayContaining([
        'get /fitting-sessions',
        'post /fitting-sessions',
        'delete /fitting-sessions/{id}',
        'get /ai-generations',
        'get /ai-generations/{id}',
        'delete /ai-generations/{id}',
        'get /me',
        'delete /me',
      ]),
    );
    for (const { method, path, operation } of signedInOps) {
      expect(namedCodes(operation)['401'], `${method} ${path}`).toEqual(['UNAUTHORIZED']);
    }
  });

  it('gives @Closed() operations a 401 too, with no security and no x-closed left', () => {
    for (const [method, path] of [
      ['post', '/brands'],
      ['patch', '/categories/{id}'],
      ['delete', '/products/{id}'],
      ['get', '/users'],
      ['post', '/ai-generations'],
      ['patch', '/ai-generations/{id}'],
    ] as const) {
      const operation = find(method, path);
      expect(namedCodes(operation)['401'], `${method} ${path}`).toEqual(['UNAUTHORIZED']);
      expect(operation.security, `${method} ${path}`).toBeUndefined();
      expect(operation, `${method} ${path}`).not.toHaveProperty('x-closed');
    }
    expect(JSON.stringify(document)).not.toContain('x-closed');
  });

  // The public operations are named by shape, not read from the document's own 401s (that would be
  // circular): every GET outside /health and the resources whose reads are closed or signed-in
  // only (access-markers.e2e-spec.ts pins that split). The rest must all carry a 401.
  const NOT_PUBLIC_PREFIXES = [
    '/users',
    '/ai-generations',
    '/fitting-sessions',
    '/fittings',
    '/me',
    // The signed-in user's last fitting of a product (spec 0019 AC24), under a public prefix.
    '/products/{id}/fittings',
  ];
  const isHealth = (op: Op): boolean => op.path.startsWith('/health/');
  const isPublic = (op: Op): boolean =>
    op.method === 'get' &&
    !NOT_PUBLIC_PREFIXES.some((prefix) => op.path === prefix || op.path.startsWith(`${prefix}/`));

  it('gives public reads no 401 and no security', () => {
    const publicOps = ops.filter((op) => !isHealth(op) && isPublic(op));
    expect(publicOps.length).toBeGreaterThan(10);
    for (const { method, path, operation } of publicOps) {
      expect(errorStatuses(operation), `${method} ${path}`).not.toContain('401');
      expect(operation.security, `${method} ${path}`).toBeUndefined();
    }
  });

  it('gives every other non-health operation a 401', () => {
    const others = ops.filter((op) => !isHealth(op) && !isPublic(op));
    expect(others.length).toBeGreaterThan(30);
    for (const { method, path, operation } of others) {
      expect(errorStatuses(operation), `${method} ${path}`).toContain('401');
    }
  });

  it('describes the session cookie as the only security scheme, with no admin token anywhere', () => {
    expect(document.components?.securitySchemes).toEqual({
      session: {
        type: 'apiKey',
        in: 'cookie',
        name: 'lamoda.session_token',
        description: expect.stringContaining('__Secure-lamoda.session_token'),
      },
    });
    expect(JSON.stringify(document).toLowerCase()).not.toContain('admin');
  });
});
