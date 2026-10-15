import { describe, expect, it } from 'vitest';

import { contractDiff, openApiDocument, type ContractCheck } from '@/shared/contract';

import { categoryListSchema, categorySchema } from './schemas';

const checks: ContractCheck[] = [
  { name: 'categorySchema', schema: categorySchema, component: 'CategoryResponseDto' },
  {
    name: 'categoryListSchema',
    schema: categoryListSchema,
    response: { method: 'get', path: '/categories', status: '200' },
  },
  {
    name: 'categorySchema (route)',
    schema: categorySchema,
    response: { method: 'get', path: '/categories/{id}', status: '200' },
  },
];

describe('category schemas match the api', () => {
  it.each(checks)('$name', (check) => {
    expect(contractDiff(openApiDocument(), check)).toEqual([]);
  });
});
