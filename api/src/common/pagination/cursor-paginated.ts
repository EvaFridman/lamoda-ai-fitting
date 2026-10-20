import { applyDecorators, type Type } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';

// One batch of a list paged by cursor (spec 0014 O11, O44): the items, the cursor of the next
// batch (null on the last) and the total, counted only for a request without a cursor.
export interface CursorPaginated<T> {
  items: T[];
  total: number | null;
  nextCursor: string | null;
}

// Swagger for a route that answers CursorPaginated<Dto>: Swagger cannot read a generic type.
export function ApiCursorPaginatedResponse(dto: Type): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiExtraModels(dto),
    ApiOkResponse({
      schema: {
        type: 'object',
        required: ['items', 'total', 'nextCursor'],
        properties: {
          items: { type: 'array', items: { $ref: getSchemaPath(dto) } },
          total: {
            type: 'integer',
            minimum: 0,
            nullable: true,
            description: 'How many match in all; null for a request with a cursor.',
          },
          nextCursor: {
            type: 'string',
            nullable: true,
            description: 'The `cursor` of the next batch; null on the last.',
          },
        },
      },
    }),
  );
}
