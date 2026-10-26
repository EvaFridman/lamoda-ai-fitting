import { describe, expect, it } from 'vitest';

import { contractDiff, openApiDocument, type ContractCheck } from '@/shared/contract';

import { storeListSchema, storeSchema } from './schemas';

const checks: ContractCheck[] = [
  { name: 'storeSchema', schema: storeSchema, component: 'StoreResponseDto' },
  {
    name: 'storeListSchema',
    schema: storeListSchema,
    response: { method: 'get', path: '/stores', status: '200' },
  },
];

describe('store schemas match the api', () => {
  it.each(checks)('$name', (check) => {
    expect(contractDiff(openApiDocument(), check)).toEqual([]);
  });
});
