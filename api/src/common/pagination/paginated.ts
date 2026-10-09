import { applyDecorators, type Type } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, getSchemaPath } from '@nestjs/swagger';

// One page of a list (spec 0004 AC3): the items of the page and how many match in all.
export interface Paginated<T> {
  items: T[];
  total: number;
}

// Swagger for a route that answers Paginated<Dto>: Swagger cannot read a generic type.
export function ApiPaginatedResponse(dto: Type): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiExtraModels(dto),
    ApiOkResponse({
      schema: {
        type: 'object',
        required: ['items', 'total'],
        properties: {
          items: { type: 'array', items: { $ref: getSchemaPath(dto) } },
          total: { type: 'integer', minimum: 0 },
        },
      },
    }),
  );
}
