import { describe, expect, it } from 'vitest';

import { contractDiff, openApiDocument, type ContractCheck } from '@/shared/contract';

import { userPhotoListSchema, userPhotoSchema } from './schemas';

const checks: ContractCheck[] = [
  { name: 'userPhotoSchema', schema: userPhotoSchema, component: 'UserPhotoDto' },
  {
    name: 'userPhotoListSchema',
    schema: userPhotoListSchema,
    response: { method: 'get', path: '/me/photos', status: '200' },
  },
  {
    name: 'userPhotoSchema (upload)',
    schema: userPhotoSchema,
    response: { method: 'post', path: '/me/photos', status: '201' },
  },
  {
    name: 'userPhotoSchema (default)',
    schema: userPhotoSchema,
    response: { method: 'patch', path: '/me/photos/{id}', status: '200' },
  },
];

describe('user photo schemas match the api', () => {
  it.each(checks)('$name', (check) => {
    expect(contractDiff(openApiDocument(), check)).toEqual([]);
  });
});
