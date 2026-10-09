import { Controller, Get } from '@nestjs/common';
import { ApiProperty, DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { ApiPaginatedResponse } from './paginated.js';

class ItemDto {
  @ApiProperty()
  name!: string;
}

@Controller('items')
class ItemsController {
  @Get()
  @ApiPaginatedResponse(ItemDto)
  list(): void {}
}

describe('ApiPaginatedResponse', () => {
  it('documents items as an array of the DTO and an integer total', async () => {
    const moduleRef = await Test.createTestingModule({ controllers: [ItemsController] }).compile();
    const app = moduleRef.createNestApplication({ logger: false });
    await app.init();

    const document = SwaggerModule.createDocument(app, new DocumentBuilder().build());
    await app.close();

    const response = document.paths['/items']?.get?.responses['200'];
    expect(response).toMatchObject({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['items', 'total'],
            properties: {
              items: { type: 'array', items: { $ref: '#/components/schemas/ItemDto' } },
              total: { type: 'integer' },
            },
          },
        },
      },
    });
    expect(document.components?.schemas).toHaveProperty('ItemDto');
  });
});
