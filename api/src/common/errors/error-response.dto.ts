import { ApiProperty } from '@nestjs/swagger';

import type { ErrorBody, ErrorDetail } from './app.exception.js';
import { ERROR_CODES, type ErrorCode } from './error-codes.js';

// Swagger's view of ErrorBody (spec 0004 E19, E21): the schema of every error response (E50). No
// examples (E58): the code enum and the codes in each response's description say enough.
export class ErrorDetailDto implements ErrorDetail {
  @ApiProperty({ description: 'Dotted path in the body or query, e.g. `sizes.0.stock`' })
  field: string;

  @ApiProperty({ description: 'The rule the field broke' })
  code: string;

  @ApiProperty()
  message: string;
}

export class ErrorDto {
  @ApiProperty({ enum: ERROR_CODES, enumName: 'ErrorCode' })
  code: ErrorCode;

  @ApiProperty({ description: 'English, for developers' })
  message: string;

  @ApiProperty({ type: [ErrorDetailDto] })
  details: ErrorDetailDto[];
}

export class ErrorResponseDto implements ErrorBody {
  @ApiProperty({ type: ErrorDto })
  error: ErrorDto;
}
