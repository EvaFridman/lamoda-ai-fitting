import { type ArgumentMetadata, HttpStatus, Injectable, ParseUUIDPipe } from '@nestjs/common';

import { AppException } from '../errors/app.exception.js';

// For ids in the path: `@Param('id', UuidPipe) id: string`. Not a UUID → 400 INVALID_ID naming
// the parameter, before any database call.
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
