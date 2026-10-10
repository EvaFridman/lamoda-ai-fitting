import {
  type ArgumentMetadata,
  HttpStatus,
  Injectable,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiParam } from '@nestjs/swagger';

import { AppException } from '../errors/app.exception.js';

// An id in the path: `@UuidParam('id') id: string`. Checked by UuidPipe and documented in Swagger
// with the uuid format (a bare @Param shows a plain string there).
export function UuidParam(name: string): ParameterDecorator {
  return (target, key, index) => {
    Param(name, UuidPipe)(target, key, index);
    const descriptor = key === undefined ? undefined : Object.getOwnPropertyDescriptor(target, key);
    if (key === undefined || descriptor === undefined) {
      throw new Error('UuidParam is for route handler parameters');
    }
    ApiParam({ name, type: String, format: 'uuid' })(target, key, descriptor);
  };
}

// Not a UUID → 400 INVALID_ID naming the parameter, before any database call.
@Injectable()
export class UuidPipe extends ParseUUIDPipe {
  override async transform(value: string, metadata: ArgumentMetadata): Promise<string> {
    try {
      await super.transform(value, metadata);
      return value;
    } catch {
      const field = metadata.data ?? 'id';
      throw new AppException(HttpStatus.BAD_REQUEST, 'INVALID_ID', `${field} must be a UUID`, [
        { field, code: 'INVALID_ID', message: `${field} must be a UUID` },
      ]);
    }
  }
}
