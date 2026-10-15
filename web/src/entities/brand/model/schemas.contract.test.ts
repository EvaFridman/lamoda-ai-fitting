import { describe, expect, it } from 'vitest';

import { contractDiff, openApiDocument, type ContractCheck } from '@/shared/contract';

import { brandListSchema, brandSchema } from './schemas';

const checks: ContractCheck[] = [
  { name: 'brandSchema', schema: brandSchema, component: 'BrandResponseDto' },
  {
    name: 'brandListSchema',
    schema: brandListSchema,
    response: { method: 'get', path: '/brands', status: '200' },
  },
  {
    name: 'brandSchema (route)',
    schema: brandSchema,
    response: { method: 'get', path: '/brands/{id}', status: '200' },
  },
];

describe('brand schemas match the api', () => {
  it.each(checks)('$name', (check) => {
    expect(contractDiff(openApiDocument(), check)).toEqual([]);
  });
});
