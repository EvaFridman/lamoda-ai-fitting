import { HttpException, HttpStatus } from '@nestjs/common';

import type { ErrorCode } from './error-codes.js';

// One problem with one field of the request (spec 0004 E21): `field` is the dotted path in the
// body or query (`sizes.0.stock`), `code` names the rule, `message` is English, for developers.
export interface ErrorDetail {
  field: string;
  code: string;
  message: string;
}

// The body of every error response (spec 0004 E19); successful responses are the data itself.
export interface ErrorBody {
  error: { code: ErrorCode; message: string; details: ErrorDetail[] };
}

// An error the api answers on purpose. AppExceptionFilter sends `body` as is; anything else thrown
// is mapped to one of these first (app-exception.filter.ts).
export class AppException extends HttpException {
  readonly body: ErrorBody;

  constructor(status: HttpStatus, code: ErrorCode, message: string, details: ErrorDetail[] = []) {
    const body: ErrorBody = { error: { code, message, details } };
    super(body, status);
    this.body = body;
    // HttpException takes the message from a `message` field of the body, else the class name.
    this.message = message;
  }

  get code(): ErrorCode {
    return this.body.error.code;
  }
}

export class NotFoundError extends AppException {
  constructor(message = 'Record not found') {
    super(HttpStatus.NOT_FOUND, 'NOT_FOUND', message);
  }
}

// A unique value is taken; `details` names the fields.
export class ConflictError extends AppException {
  constructor(message = 'A record with these values already exists', details: ErrorDetail[] = []) {
    super(HttpStatus.CONFLICT, 'ALREADY_EXISTS', message, details);
  }
}

// The record cannot be deleted while other records refer to it.
export class InUseError extends AppException {
  constructor(message = 'The record is in use by other records') {
    super(HttpStatus.CONFLICT, 'IN_USE', message);
  }
}

export class ValidationError extends AppException {
  constructor(details: ErrorDetail[], message = 'Validation failed') {
    super(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', message, details);
  }
}

export class UnauthorizedError extends AppException {
  constructor(message = 'Missing or invalid admin token') {
    super(HttpStatus.UNAUTHORIZED, 'UNAUTHORIZED', message);
  }
}
