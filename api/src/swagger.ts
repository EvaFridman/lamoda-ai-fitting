import type { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  getSchemaPath,
  type OpenAPIObject,
  type OperationObject,
  SwaggerModule,
} from '@nestjs/swagger';

import { SESSION_COOKIE } from './auth/auth.js';
import { CLOSED_EXTENSION, SESSION_SECURITY } from './common/auth/access.decorators.js';
import { ERROR_CODES_EXTENSION } from './common/errors/api-errors.decorator.js';
import { ERROR_CODES, ERROR_STATUS, type ErrorCode } from './common/errors/error-codes.js';
import { ErrorResponseDto } from './common/errors/error-response.dto.js';

// API documentation at /docs. Off in production: there the api is reached only through nginx,
// and the public site has no reason to publish its internal API map.
export function setupSwagger(app: INestApplication, version: string): void {
  SwaggerModule.setup('docs', app, createOpenApiDocument(app, version));
}

export function createOpenApiDocument(app: INestApplication, version: string): OpenAPIObject {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('lamoda-ai-fitting api')
      .setVersion(version)
      // Routes under @SignedIn() send Better Auth's session cookie (spec 0013 plan §4).
      .addCookieAuth(
        SESSION_COOKIE,
        {
          type: 'apiKey',
          in: 'cookie',
          description: `Set by /api/auth sign-in; named \`__Secure-${SESSION_COOKIE}\` on https.`,
        },
        SESSION_SECURITY,
      )
      .build(),
    { extraModels: [ErrorResponseDto] },
  );
  addErrorResponses(document);
  return document;
}

const METHODS = ['get', 'put', 'post', 'delete', 'patch'] as const;

// Every operation lists the error answers it can give (spec 0004 E50), all with the error envelope
// as the schema. Those its shape implies are added here, so no controller can forget them; those
// from its logic come from ApiErrors(...). One status with several codes is one response naming
// them. /health/* keep their own format and skip the rate limit, so they get none (E56).
function addErrorResponses(document: OpenAPIObject): void {
  for (const [path, item] of Object.entries(document.paths)) {
    for (const method of METHODS) {
      const operation = item[method];
      if (operation === undefined) {
        continue;
      }
      const decorated = takeDecoratedCodes(operation);
      const closed = takeClosed(operation);
      if (path.startsWith('/health/')) {
        continue;
      }
      const codes = new Set<ErrorCode>([
        ...shapeCodes(operation),
        ...decorated,
        ...(closed ? (['UNAUTHORIZED'] as const) : []),
      ]);
      for (const status of new Set([...codes].map((code) => ERROR_STATUS[code]))) {
        // A controller's own response here would be lost: declare its codes with ApiErrors instead.
        if (operation.responses[status] !== undefined) {
          throw new Error(`${method.toUpperCase()} ${path} declares its own ${status} response`);
        }
        const named = ERROR_CODES.filter(
          (code) => codes.has(code) && ERROR_STATUS[code] === status,
        );
        operation.responses[status] = {
          description: `Error codes: ${named.map((code) => `\`${code}\``).join(', ')}`,
          content: { 'application/json': { schema: { $ref: getSchemaPath(ErrorResponseDto) } } },
        };
      }
    }
  }
}

function shapeCodes(operation: OperationObject): ErrorCode[] {
  const codes: ErrorCode[] = ['TOO_MANY_REQUESTS', 'INTERNAL_ERROR', 'SERVICE_UNAVAILABLE'];
  if (operation.requestBody !== undefined) {
    codes.push('VALIDATION_FAILED', 'BAD_JSON', 'PAYLOAD_TOO_LARGE');
  }
  const parameters = (operation.parameters ?? []).filter((parameter) => 'in' in parameter);
  if (parameters.some((parameter) => parameter.in === 'query')) {
    codes.push('VALIDATION_FAILED');
  }
  // @UuidParam: a malformed id, and a well-formed one with no record (or no parent record).
  if (
    parameters.some(
      (parameter) =>
        parameter.in === 'path' &&
        parameter.schema !== undefined &&
        'format' in parameter.schema &&
        parameter.schema.format === 'uuid',
    )
  ) {
    codes.push('INVALID_ID', 'NOT_FOUND');
  }
  if (operation.security?.some((requirement) => SESSION_SECURITY in requirement) === true) {
    codes.push('UNAUTHORIZED');
  }
  return codes;
}

// Whether @Closed() marked the operation (it answers 401 to everyone); the extension is removed.
function takeClosed(operation: OperationObject): boolean {
  const extended = operation as OperationObject & { [CLOSED_EXTENSION]?: boolean };
  const closed = extended[CLOSED_EXTENSION] === true;
  delete extended[CLOSED_EXTENSION];
  return closed;
}

// The codes ApiErrors(...) put on the operation; the extension is removed from the document.
function takeDecoratedCodes(operation: OperationObject): ErrorCode[] {
  const extended = operation as OperationObject & { [ERROR_CODES_EXTENSION]?: ErrorCode[] };
  const codes = extended[ERROR_CODES_EXTENSION] ?? [];
  delete extended[ERROR_CODES_EXTENSION];
  return codes;
}
