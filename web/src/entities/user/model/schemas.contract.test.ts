import { describe, expect, it } from 'vitest';

import { contractDiff, openApiDocument, type ContractCheck } from '@/shared/contract';

import { userListSchema, userSchema } from './schemas';

const checks: ContractCheck[] = [
  { name: 'userSchema', schema: userSchema, component: 'UserResponseDto' },
  {
    name: 'userListSchema',
    schema: userListSchema,
    response: { method: 'get', path: '/users', status: '200' },
  },
  {
    name: 'userSchema (route)',
    schema: userSchema,
    response: { method: 'get', path: '/users/{id}', status: '200' },
  },
  {
    name: 'userSchema (current user)',
    schema: userSchema,
    response: { method: 'get', path: '/me', status: '200' },
  },
];

describe('user schemas match the api', () => {
  it.each(checks)('$name', (check) => {
    expect(contractDiff(openApiDocument(), check)).toEqual([]);
  });
});
